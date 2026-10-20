# SOBRE MÍDIA — Operação do sistema (versão comercial)

Documento formal de como o sistema funciona e do que é **garantido** na versão comercial. Vale a partir de 18/10/2026 (F-198).
Toda mudança que afete o que está aqui exige atualizar este documento e o `scripts/ops/contrato-player.mjs`.

## 1. Versões

| Parte | Versão comercial | Como é atualizada |
|---|---|---|
| Player Android (TV Box, totem, TV, tablet) | **5.7.10** (código 567) — canal **estável** | Só pelo canal estável. Os aparelhos recebem sozinhos (OTA) apenas o que for **promovido** a estável. |
| Painel (site) e servidor (Supabase) | contínua | Visual e funcionalidades seguem com commit + deploy (`publicar-main.mjs`). Nunca podem quebrar o que o Player 5.7.10 usa (seção 4). |

### Regra do dono para o APK (18/10/2026)
1. Toda versão nova do Player sai como **TESTE**: `node scripts/ops/publicar-player.mjs "notas"` cria a release do GitHub como *pre-release* e registra em `app_releases` com `canal = 'teste'`. **Não vai aos aparelhos.**
2. O APK de teste é instalado **à mão** num aparelho de teste (link impresso pelo script). O Player só instala versão maior que a dele; aparelho de teste não é "rebaixado".
3. Só depois do teste aprovado pelo dono: `node scripts/ops/publicar-player.mjs --promover <codigo>` → vira estável e os aparelhos atualizam pelo OTA.
4. Funcionalidade nova que precise de APK novo vai para o APK de teste. O 5.7.10 continua recebendo os comandos que já existem.
5. `get_latest_app_release()` (o que o Player consulta) só devolve o canal estável.

Versão de teste atual: **5.8.4** (código 574) — launcher Sobre Mídia (seção 8), modo nitidez (seção 6) e comandos pela consulta mesmo sem o tempo real (F-199). Versões que funcionam guardadas em `native-android-player/app/build/outputs/apk/versoes-funcionando/` (5.7.10 e 5.7.12, com LEIA-ME).

## 2. Perfis e o que cada um vê

Regra permanente (F-190/F-195): **cada conta vê só o que é dela; só o dono (OWNER) e o ADM veem tudo.** A trava está no banco (regras restritivas `so_o_proprio` e `externo_so_o_permitido`), não só nas telas do painel.

| Perfil | Vê | Cria telas |
|---|---|---|
| Dono (OWNER) / ADM | Tudo da empresa; "Visão das Contas" conta por conta | Livre ("Telas de Anunciantes", "Telas de parceiros") |
| Gestor de mídia | Só as próprias telas, playlists, mídias, cobranças, contratos e dados pessoais; biblioteca de conteúdo da empresa (compartilhada) | Só pagando: "Nova Tela (R$ 22,99)" com Pix do Banco Inter (o banco recusa tela de gestor sem pagamento) |
| Representante | Só a própria carteira (clientes, propostas, contratos, comissões) + catálogo de telas dos pontos parceiros | — |
| Anunciante / Cliente / Parceiro | Só o próprio: telas do catálogo de parceiros, as próprias e as que exibiram sua mídia; exibições só das suas mídias | — |

O painel apaga a memória ao trocar de conta (ninguém vê dados da sessão anterior no mesmo navegador).

## 3. Comandos do painel → Player 5.7.10 (testados em 18/10/2026)

Chegam pelo canal em tempo real e, se ele falhar, por consulta a cada 10 s. No 5.7.10 a consulta só cobre `screenshot`, `reload`, `reboot`, `update_app`, `install_update` e só liga depois que o tempo real conecta; em TV Box onde o tempo real não conecta, nenhum comando chega (F-199). A partir do 5.7.12 a consulta liga primeiro e traz todos os comandos.

| Ação no painel | Comando / caminho | Tempo medido |
|---|---|---|
| Solicitar Screenshot | `screenshot` | 1,8 s (hora gravada pelo servidor) |
| Atualizar Player | `reload` | 0,9–1,1 s |
| Sincronizar | `sync` | 0,7 s |
| Reiniciar Player | `reboot` (reinicia o aplicativo) | 0,3–0,7 s, volta a tocar sozinho |
| Reiniciar o aparelho | `reboot_device` | só com Device Owner; senão responde "falhou" com o motivo em 0,4 s |
| Procurar / instalar atualização | `update_app` / `install_update` | 0,2–0,3 s (instalador só abre a pedido do painel) |
| Modo manutenção | `maintenance_open` / `maintenance_close` | 0,2–0,7 s |
| Girar (legado) | `rotate_portrait` / `rotate_landscape` | 0,3–0,5 s |
| Desvincular aparelho | `admin_unpair_screen` → `unpair` | 1 s; a TV volta à escolha de tela |
| Ativar / desativar tela | `screens.is_active` (tempo real) | ~1–2 s |
| Rotação da tela (4 posições) | `screens.rotacao_tela` + `reload` automático | 2–5 s; vale ao religar sem internet |
| Som das mídias, Rádio, playlist, formato | campo da tela + `reload` automático (gatilho `trg_screens_aplica_na_hora`) | ~3 s (antes: até 1 min) |
| Itens da playlist (adicionar/tirar/duração) | tempo real | ~2 s |

Toda resposta do Player fora de "executado/falhou" é convertida em "falhou" com o motivo em `payload.error_message` (o painel mostra).

## 4. Contrato do Player 5.7.10 com o servidor (não pode quebrar)

Conferido por `node scripts/ops/contrato-player.mjs` (rodar antes e depois de toda migração):
- 16 funções: `admin_unpair_screen`, `fn_device_attest`, `fn_device_bind`, `fn_device_heartbeat_v2`, `fn_device_register_extended`, `fn_device_telemetry_batch`, `fn_player_minha_marca`, `fn_player_registrar_desempenho_video`, `fn_player_registrar_exibicoes`, `fn_player_report_telemetry`, `get_authorized_screens_for_player`, `get_latest_app_release`, `get_player_layout_for_screen`, `get_player_playlist_for_screen`, `get_player_radio_for_screen`, `player_unpair_screen`.
- Tabelas/colunas: `screens`, `remote_commands`, `devices`, `device_health`, `playback_logs`, `device_logs`, `app_releases`.
- Os 17 comandos aceitos pelo banco; gatilhos de resposta e de "aplica na hora".
- Campos da resposta da playlist: `id`, `is_active`, `orientation`, `resolution`, `giro_quadro`, `rotacao_tela`, `playlists`.
- OTA entregando o canal estável.

O que o aparelho manda ao servidor: sinal da tela (a cada ~1 min), saúde do aparelho (CPU, memória, temperatura, rede), exibições (`playback_logs`), fluidez dos vídeos, capturas de tela, erros (`device_logs`, sem login/chaves).

## 5. Reprodução e qualidade de vídeo

- **Conversão de todo vídeo enviado** (`compress-video.yml`, F-198): H.264 High 4.1, lado maior até 1920 (nunca aumenta), fps do original até 30, qualidade constante CRF 19 com teto de 8 Mbps, áudio AAC 160k. Vídeo que já está bom fica como está. Os originais ficam guardados; dá para refazer a conversão a partir deles (`reprocessar`).
- O Player usa o decodificador de **hardware** da TV Box (Rockchip `OMX.rk…`); downloads um por vez e em segundo plano para não travar o vídeo (F-189); vigia da imagem refaz o motor se a tela ficar preta (F-187).
- Imagens: cores completas; tamanho até o da tela.

## 6. Nitidez em TV grande — versão de TESTE 5.7.11

Nas TV Box a tela do Android trabalha em 1280x720 mesmo com a saída HDMI em 1080p/4K; o vídeo desenhado nessa tela fica borrado em TV de 50". O 5.7.11 (teste) mede a saída HDMI e, quando ela é maior que a tela e o quadro não é girado, coloca o vídeo no **plano de vídeo do hardware** (resolução da saída). A medição vai para o painel (`device_logs`, tipo `TELA_FISICA`). Troca entre dois vídeos vira corte; tela girada continua como no 5.7.10. Precisa ser aprovado num aparelho de teste antes de promover.

## 7. Atualização do Player nos aparelhos

Silenciosa com root ou Device Owner; nos demais aparelhos a versão nova fica baixada e o instalador do Android só abre quando o painel pede ("Instalar atualização agora"), com alguém ao lado da TV. Nada aparece por cima das mídias.

## 8. Launcher Sobre Mídia — versão de TESTE 5.8.4 (F-200)

O Player pode ser também a **tela inicial** do aparelho (como as launchers de TV Box, Samsung, Motorola).
- **Mostra:** logo do gestor (Minha Marca) maior, hora e data, temperatura, Wi-Fi, o cartão "Destaques Sobre Mídia" com 2 TVs 16:9 e 2 totens 9:16, cada um com as mídias escolhidas pelo dono/ADM (vídeos um de cada vez) e 4 cartões: Player Sobre Mídia, Aplicativos (painel com os apps instalados — **sem YouTube, Netflix e apps de TV** (continuam na launcher original). Botões: Ajustes, Wi-Fi, Launcher original.
- **Não libera o Player:** a launcher é só a tela inicial. Sem login o cartão do Player leva ao login e à escolha da tela; a contagem "abre sozinho" só existe com login feito e tela escolhida.
- **Ao ligar o aparelho** (launcher escolhida): aparece a launcher Sobre Mídia; depois de N segundos sem ninguém mexer abre o Player (padrão 30 s).
- **Quem não quiser:** responde "Agora não" e usa o Player pelo ícone na launcher original, como sempre.
- **Virar tela inicial:** Device Owner ou root = automático; senão o Android pergunta uma vez (Sobre Mídia → "Sempre"); aparelho que não deixa = modo forçado ("Acesso ao uso").
- **Uso livre:** abrir um app, Ajustes ou a launcher original pela launcher (ou pelos comandos do painel) faz o Player não puxar a tela de volta durante N minutos (padrão 30).
- **Voltar para a original:** botão "Launcher original" (abrir agora ou usar como padrão) e comando "Launcher original" na página da tela.
- **Painel:** `/workspace/launcher` (menu "Launcher", só dono/ADM). O banco recusa os comandos de launcher de quem não é dono/ADM.
