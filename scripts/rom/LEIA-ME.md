# Kit da ROM Sobre Mídia (F-201) — separado do sistema

Este kit é **à parte** do Player e do painel. O Player com a launcher continua igual em qualquer aparelho (instala pela
loja/APK, pergunta "Usar a launcher Sobre Mídia?" ao abrir e ao sair). A ROM é só para quando o dono quiser gravar o
aparelho pelo PC (como a Selenga), já com o Player como app de sistema, root e a launcher Sobre Mídia como tela inicial.

ROM base conferida: **Selenga R4 2+16G (ROOT), Rockchip RK3228A/RK3229, Android 7.1.2**, placas MXQ 5G / MXQ Pro 5G /
MX9 5G (R329Q V8.0), Wi-Fi 8189ES, 8189FS, 9012P, SV6051, SV6x5x. Arquivos em `Downloads/ROM TV BOX/Rom MXQ 5G R329Q V8.0/`.
As 3 TV Box do Hotel Maxsuel informam "rockchip R4, Android 7.1.2" — muito provavelmente a mesma ROM.

## Scripts (nenhum grava no aparelho)

| Script | O que faz |
|---|---|
| `ler-firmware-rockchip.mjs <update.img>` | Lê o cabeçalho: chip, partições, tabela de partições (parameter). Só leitura. |
| `sparse.mjs abrir/fechar` | Tira o system.img de dentro do update.img (sparse → imagem comum) e fecha de volta (todos os blocos como dados — seguro). |
| `montar-system.py` (Ubuntu do WSL, como root) | Altera SÓ a partição system: Player em `priv-app` + português/São Paulo + `ro.sobremidia.rom=1`. |
| `montar-update-img.mjs <original> <saida> --system <novo>` | Remonta o update.img trocando só o system; recalcula CRC da Rockchip e MD5. Sem `--system` sai idêntico ao original (provado: mesmo SHA-256). |
| `conferir-rom.mjs <original> <gerado>` | Prova antes de gravar: carregador, parameter, trust, uboot, misc, kernel, resource, boot e recovery idênticos; CRC e MD5 corretos; system cabe na partição. |
| `copia-do-aparelho.mjs [--so-informacoes]` | Cópia completa do firmware de uma TV Box ligada por USB/ADB (lê as partições com root e confere o SHA-256 dos dois lados). |

## Passo a passo (cada passo só segue com o anterior OK)

1. **Cópia do aparelho** (TV Box ligada no PC por USB, depuração USB ligada):
   `node scripts/rom/copia-do-aparelho.mjs --so-informacoes` (identifica) e depois sem a opção (copia).
2. **Montar a ROM**:
   ```
   node scripts/rom/sparse.mjs abrir "<update.img Selenga>" "<trabalho>/system.raw" --posicao 26315188
   wsl -u root python3 montar-system.py "<trabalho>/system.raw" "<SobreMidiaPlayer.apk>" "1.0-rk3228a"
   node scripts/rom/sparse.mjs fechar "<trabalho>/system.raw" "<trabalho>/system.img"
   node scripts/rom/montar-update-img.mjs "<update.img Selenga>" "<saida>/SobreMidia-ROM-RK3228A.img" --system "<trabalho>/system.img"
   node scripts/rom/conferir-rom.mjs "<update.img Selenga>" "<saida>/SobreMidia-ROM-RK3228A.img"
   ```
   (posição do system dentro do update.img Selenga = 197044 + 26118144 = 26315188)
3. **Bancada**: uma TV Box separada, com o modo de recuperação testado ANTES (MaskROM: botão de reset/clipe + cabo
   USB macho-macho + FactoryTool com a ROM Selenga original). Gravar a ROM Sobre Mídia com o mesmo FactoryTool v1.64.
   Conferir: liga, Wi-Fi, HDMI, controle, launcher Sobre Mídia ao ligar, login do Player, comandos, atualização silenciosa.
4. **Lote pequeno** (2–3 aparelhos) por uma semana. 5. **Resto**.

## Uma ROM para todos os aparelhos?
Não existe uma ROM que sirva em chips diferentes: carregador, kernel e árvore do aparelho são do chip. O que existe (e
esta ROM faz) é **uma ROM por família de chip** com vários drivers de Wi-Fi. Famílias comuns de TV Box: Rockchip
RK3228A/RK3229 (MXQ 5G, MX9) — esta; Rockchip RK3318/RK3328 (H96 Max, X88); Allwinner H3/H313/H616 (algumas MXQ Pro 4K,
Tanix); Amlogic S905W/S905X (TX3 mini, X96 mini). Para cada família nova: a ROM que já funciona nela + este mesmo kit.
O Player (APK) funciona em todas, com ou sem ROM.
