# ROM Sobre Mídia para TV Box (MXQ 4K — Rockchip e Allwinner) — estudo e plano seguro

Pedido do dono (20/10/2026): uma ROM própria (como a "Selenga" que ele grava pelo PC), **com root**, que já venha com o
Sobre Mídia Player como launcher e que permita **atualizar o Player sozinho, em silêncio, sem sair das mídias**.
Status: **estudo/plano — nada gravado em aparelho.** Nenhuma ROM é feita sem o firmware original do modelo exato.

## 1. O que é uma "ROM" de TV Box

Arquivo único (`update.img` no Rockchip, `.img` da Allwinner/PhoenixSuit, `aml_upgrade_package.img` no Amlogic) com as
partições do aparelho:

| Parte | Função | Mexer? |
|---|---|---|
| Carregador (loader/u-boot/boot0) e tabela de partições (`parameter.txt` / `sys_partition`) | liga a memória (DDR) e acha o resto | **NUNCA** — é o que "brica" |
| Árvore do aparelho (DTB/resource) e kernel | Wi-Fi, HDMI, tensões, temperatura | **NUNCA** (DTB errado pode até esquentar o aparelho) |
| `boot` (ramdisk) | início do Android; onde o Magisk põe o root | só com Magisk, a partir do boot ORIGINAL |
| `system` (e `vendor`) | Android, apps de sistema, launcher | **sim — é aqui que entra a Sobre Mídia** |
| `misc`/`recovery` | recuperação | não |

Regra de ouro: a ROM Sobre Mídia = **firmware original do modelo exato** + mudanças só em `system` (e o root no `boot`).
Assim o aparelho liga do mesmo jeito que liga hoje; o risco que sobra é "não iniciar o Android" (recuperável), nunca o
"morto de vez".

## 2. Por que o aparelho não "queima" e como sempre volta

- Rockchip (RK3228A/RK3229/RK3318/RK3328): modo **MaskROM** (gravação de fábrica, fica no chip, não dá para apagar). Liga
  com o botão de reset/clipe ou encostando dois pontos da memória, cabo USB macho-macho, `RKDevTool` (Windows) grava o
  firmware original de volta.
- Allwinner (H3/H313/H616/H6): modo **FEL** (também no chip). `PhoenixSuit` grava o original pelo USB, ou `PhoenixCard`
  pelo cartão SD.
- Amlogic (muitas "MXQ Pro 4K" são S905W/S805): `USB Burning Tool`, modo de gravação pelo botão "upgrade".
- Por isso **antes de tudo** guardar o firmware original de cada modelo (cópia completa da memória). Com ele, qualquer
  erro é desfeito em minutos.
- "Queimar" de verdade só acontece mexendo em DTB/tensões/temperatura — que a ROM Sobre Mídia **não toca**.

## 3. Root e atualização silenciosa (o objetivo principal)

O Player já sabe instalar em silêncio quando há **root** ou **Device Owner** (F-194: `RootInstaller` faz `pm install -r` e
reabre o Player; Device Owner usa a sessão do PackageInstaller). Sem nenhum dos dois, o Android **exige** um toque em
"Instalar" — limite do Android, não do Player. A ROM resolve de três jeitos (do mais forte para o mais simples):

1. **Player como app de sistema privilegiado** (`/system/priv-app/SobreMidia/`), com a permissão `INSTALL_PACKAGES`.
   No Android 7 (as Rockchip/Allwinner do hotel) app privilegiado recebe a permissão sem lista extra; no Android 8+ vai
   junto um `privapp-permissions-sobremidia.xml`. Instala atualizações pelo PackageInstaller **sem root e sem toque**.
2. **Root (Magisk no boot original)** com permissão automática para o Player — o caminho que o Player já usa hoje.
3. **Device Owner** definido na primeira vez que o aparelho liga (antes de qualquer conta), por script da ROM.

### Dá para atualizar sem nenhuma pausa?
**Não 100%** — no Android, ao trocar a versão de um app o processo antigo é encerrado (vale para qualquer app, inclusive
os do Google). O que dá para garantir:
- baixar em segundo plano enquanto toca (já é assim);
- preparar/conferir o APK antes; a troca em si acontece no fim (o vídeo segue tocando até ela);
- trocar **entre duas mídias** (ou num horário sem movimento escolhido no painel, ex.: 03:00);
- o Player reabre sozinho e volta a tocar do que está guardado no aparelho: **pausa de ~3 a 6 s** (medir no aparelho).
"Dois Players revezando" (dois pacotes) eliminaria até isso, mas dobra espaço e complexidade — não recomendado.

## 4. O que a ROM Sobre Mídia muda (só em `system`)

- Sobre Mídia Player em `/system/priv-app` (+ permissões privilegiadas), como **launcher padrão** (a launcher original
  fica **desativada, não apagada** — dá para religar pelo painel/ADB).
- Root (Magisk) com autorização automática só para o Player.
- `build.prop`: idioma pt-BR, fuso America/Sao_Paulo, nome do aparelho; sem tela de boas-vindas.
- Opcional: animação de inicialização com a marca Sobre Mídia; tirar apps de fábrica inúteis (YouTube etc. **ficam**
  instalados, só não aparecem na launcher Sobre Mídia).
- Nada de carregador, partições, DTB, kernel.

## 5. Caminho sem gravar ROM (testar primeiro)

Muitas Rockchip já vêm com root. Nelas o Player 5.8.x já: vira tela inicial em silêncio (`pm set-home-activity`) e
atualiza em silêncio. Um passo seguinte possível, reversível e sem gravar firmware: o próprio Player, com root, se copiar
para `/system/priv-app` e desativar a launcher original ("modo sistema"). Desfazer = apagar a cópia e religar a original.

## 6. Plano em fases (cada uma só segue com a anterior aprovada)

1. **Levantamento** (dono): modelo, foto da placa (marca impressa, ex. "MXQ-4K-RK3229-V2.0" / "H313"), Ajustes → Sobre
   (Android, versão do firmware), se já tem root (o painel mostra o modo de atualização do aparelho), e o arquivo da ROM
   Selenga que ele usa (só para comparar o que ela muda).
2. **Cópia de segurança** do firmware original de cada modelo (RKDevTool "Exportar imagem" / dd das partições com root /
   PhoenixSuit). Guardar com SHA-256.
3. **Kit de montagem** no repositório (`scripts/rom/`): desmonta o firmware original, mexe só em `system` (+ Magisk no
   boot), remonta, confere tamanhos de partição e assinaturas, gera SHA-256 e um relatório do que mudou.
4. **Um aparelho de bancada** por modelo, com o modo de recuperação testado ANTES (MaskROM/FEL) e o original à mão.
   Conferir: liga, Wi-Fi, HDMI 1080p/4K, controle, launcher, Player, comandos, atualização silenciosa (medir a pausa),
   desliga/liga 10 vezes, 24 h ligado.
5. **Lote pequeno** (2–3 aparelhos) por 1 semana; depois o resto.

## 7. O que nunca fazer
- Gravar ROM de outro modelo/placa (mesmo nome "MXQ 4K" esconde chips diferentes).
- Gravar sem a cópia do original e sem ter testado o modo de recuperação daquele aparelho.
- Usar "apagar tudo/erase flash" sem necessidade; tirar o cabo/energia durante a gravação.
- Distribuir a ROM de terceiros (Selenga) — ela serve só de referência.

## 8. Situação em 20/10/2026 (F-201)

- **ROM base analisada:** `Downloads/ROM TV BOX/Rom MXQ 5G R329Q V8.0/update.img` — Selenga R4 2+16G ROOT (by Bruski), Rockchip
  RK3228A (chip "322A"), Android 7.1.2, modelo "R4" (o mesmo que as TV Box do Hotel Maxsuel informam), launcher MboxLauncher,
  root SuperSU no sistema (`xbin/su`, `daemonsu`), Wi-Fi 8189ES/8189FS/9012P/SV6051/SV6x5x, idioma russo/Moscou, system 2,5 GB
  aberto (1,5 GB usados) numa partição de 3 GB. MD5 do arquivo conferido.
- **Kit pronto** em `scripts/rom/` (ver `scripts/rom/LEIA-ME.md`): ler firmware, sparse abrir/fechar (todos os blocos como dados:
  a ROM base só usa RAW/DONT_CARE e marcar zeros como "não importa" pode corromper arquivos), alterar só o system,
  remontar o update.img (provado: remontagem do original sai byte a byte idêntica) e conferir antes de gravar (provado com
  um system sem alteração: 12 partes idênticas, CRC e MD5 corretos). Cópia do aparelho por ADB/root com SHA-256 dos dois lados.
- **Player pronto para a ROM (5.8.5/5.8.6, teste):** com `ro.sobremidia.rom=1` a launcher nasce escolhida; como app de sistema
  com INSTALL_PACKAGES atualiza em silêncio sem root (modo APP_DE_SISTEMA; root e Device Owner continuam).
- **Feito (autorizado pelo dono):** ROM v1.0 gerada em `Downloads/ROM TV BOX/ROM Sobre Midia RK3228A v1.0/` (ver FINDINGS F-201). Antes estava pendente: gravar o Player dentro do system exige montar a imagem como administrador do Ubuntu (WSL). O Claude Code bloqueou
  esse comando por segurança; precisa da autorização do dono (ou o dono roda o comando do LEIA-ME). Depois: fechar, remontar,
  conferir, e testar em bancada com MaskROM testado antes.
