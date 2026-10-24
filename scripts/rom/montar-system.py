#!/usr/bin/env python3
"""F-201 — altera SÓ a partição system (imagem comum/raw) para a ROM Sobre Mídia. Roda no Ubuntu do WSL como root.

    python3 montar-system.py <system.raw> <SobreMidiaPlayer.apk> <versao-da-rom> [posicao] [bootanimation.zip]

[bootanimation.zip] (opcional, F-214) = a animação de inicialização do Android na marca Sobre Mídia (gerada por
montar-inicializacao.mjs) no lugar da da ROM base ("SELENGA"), em /system/media/bootanimation.zip.

[posicao] (opcional, F-212) = ROM para TOTEM: grava ro.sobremidia.orientacao (270 = em pé com a base à esquerda, padrão
9x16; 90 = em pé com a base à direita; 0 = deitada; 180 = de cabeça para baixo; "retrato"/"totem" = 270). O Player
5.8.15+ usa como posição da TV de fábrica: a launcher e o login já nascem em pé, antes de qualquer login. O painel
("Rotação da tela") e a "Posição da tela" do Menu continuam mandando quando definidos. Sem o argumento = ROM comum.

O que faz (e nada além disso):
  1. Sobre Mídia Player como app de sistema PRIVILEGIADO: /system/priv-app/SobreMidiaPlayer/SobreMidiaPlayer.apk
     (dono root, 755/644, mesma etiqueta SELinux dos outros priv-app). Com isso ele instala as próprias atualizações
     em silêncio (INSTALL_PACKAGES) e, por ser privilegiado, a prioridade da launcher dele vale: vira a tela inicial
     sozinho. A launcher original (MboxLauncher) CONTINUA instalada (botão "Launcher original").
  2. build.prop: português do Brasil, fuso America/Sao_Paulo e a marca ro.sobremidia.rom=1 (o Player reconhece a ROM).
     A edição é feita no próprio arquivo (mesmo dono, permissão e etiqueta SELinux).
Não toca em carregador, partições, kernel, árvore do aparelho, boot nem recovery (essas ficam iguais à ROM base).
"""
import os
import shutil
import subprocess
import sys

if not 4 <= len(sys.argv) <= 6:
    sys.exit("uso: montar-system.py <system.raw> <SobreMidiaPlayer.apk> <versao-da-rom> [posicao] [bootanimation.zip]")
imagem, apk, versao = sys.argv[1:4]
POSICOES = {"0": "0", "90": "90", "180": "180", "270": "270", "retrato": "270", "totem": "270", "paisagem": "0"}
posicao = None
animacao = None
for extra in sys.argv[4:]:
    if extra.lower().endswith(".zip"):
        animacao = extra
        continue
    posicao = POSICOES.get(extra.strip().lower())
    if posicao is None:
        sys.exit("posicao invalida: use 0, 90, 180, 270, retrato/totem ou paisagem")
ponto = "/mnt/sm_system_rw"
os.makedirs(ponto, exist_ok=True)
subprocess.run(["mount", "-o", "loop,rw", imagem, ponto], check=True)
relatorio = []
try:
    def contexto(caminho):
        try:
            return os.getxattr(caminho, "security.selinux")
        except OSError:
            return None

    def aplicar_contexto(caminho, ctx):
        if ctx:
            os.setxattr(caminho, "security.selinux", ctx)

    # 1) Player como priv-app
    modelo_dir = os.path.join(ponto, "priv-app", "Settings")
    modelo_apk = os.path.join(modelo_dir, "Settings.apk")
    ctx_dir, ctx_apk = contexto(modelo_dir), contexto(modelo_apk)
    destino_dir = os.path.join(ponto, "priv-app", "SobreMidiaPlayer")
    os.makedirs(destino_dir, exist_ok=True)
    destino_apk = os.path.join(destino_dir, "SobreMidiaPlayer.apk")
    shutil.copyfile(apk, destino_apk)
    for p, modo in ((destino_dir, 0o755), (destino_apk, 0o644)):
        os.chown(p, 0, 0)
        os.chmod(p, modo)
    aplicar_contexto(destino_dir, ctx_dir)
    aplicar_contexto(destino_apk, ctx_apk)
    relatorio.append(f"priv-app/SobreMidiaPlayer/SobreMidiaPlayer.apk ({os.path.getsize(destino_apk)} bytes, contexto {ctx_apk!r})")

    # 2) build.prop (edição no lugar: mantém dono, permissão e etiqueta)
    prop = os.path.join(ponto, "build.prop")
    with open(prop, "r+", encoding="latin-1") as f:
        linhas = f.read().split("\n")
        trocas = {"persist.sys.language": "pt", "persist.sys.country": "BR", "persist.sys.timezone": "America/Sao_Paulo"}
        novas = []
        for linha in linhas:
            chave = linha.split("=", 1)[0].strip()
            if chave in trocas:
                novas.append(f"{chave}={trocas[chave]}")
            elif chave.startswith("ro.sobremidia.") or chave == "ro.product.locale":
                continue  # remonta o bloco abaixo (rodar duas vezes não duplica)
            else:
                novas.append(linha)
        while novas and novas[-1] == "":
            novas.pop()
        novas += ["", "# SOBRE MIDIA (F-201)", "ro.sobremidia.rom=1", f"ro.sobremidia.rom.versao={versao}", "ro.product.locale=pt-BR"]
        if posicao is not None:
            novas.append(f"ro.sobremidia.orientacao={posicao}")  # F-212: ROM de totem (posição da TV de fábrica)
        novas.append("")
        f.seek(0)
        f.write("\n".join(novas))
        f.truncate()
    relatorio.append("build.prop: pt-BR, America/Sao_Paulo, ro.sobremidia.rom=1, versão " + versao
                     + (f", posição da TV {posicao}° (totem)" if posicao is not None else ""))
    # 3) F-214: animação de inicialização Sobre Mídia (escreve no próprio arquivo: mesmo dono, permissão e etiqueta)
    if animacao:
        destino = os.path.join(ponto, "media", "bootanimation.zip")
        ctx_anim = contexto(destino) if os.path.exists(destino) else ctx_apk
        shutil.copyfile(animacao, destino)
        os.chown(destino, 0, 0)
        os.chmod(destino, 0o644)
        aplicar_contexto(destino, ctx_anim)
        relatorio.append(f"media/bootanimation.zip Sobre Mídia ({os.path.getsize(destino)} bytes, contexto {ctx_anim!r})")
    subprocess.run(["sync"], check=True)
finally:
    subprocess.run(["umount", ponto], check=False)
print("ROM Sobre Mídia — system alterado:")
for r in relatorio:
    print("  -", r)
