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

Versão de teste atual: **5.8.22** (código 592) — launcher Sobre Mídia (seção 8), modo nitidez (seção 6), comandos pela consulta mesmo sem o tempo real (F-199) e desvincular/vincular outro aparelho (seção 9). Versões que funcionam guardadas em `native-android-player/app/build/outputs/apk/versoes-funcionando/` (5.7.10 e 5.7.12, com LEIA-ME).

## 2. Perfis e o que cada um vê

Regra permanente (F-190/F-195): **cada conta vê só o que é dela; só o dono (OWNER) e o ADM veem tudo.** A trava está no banco (regras restritivas `so_o_proprio` e `externo_so_o_permitido`), não só nas telas do painel.

| Perfil | Vê | Cria telas |
|---|---|---|
| Dono (OWNER) / ADM | Tudo da empresa; "Visão das Contas" conta por conta | Livre ("Telas de Anunciantes", "Telas de parceiros") |
| Gestor de mídia | Só as próprias telas, playlists, mídias, cobranças, contratos e dados pessoais; biblioteca de conteúdo da empresa (compartilhada) | Só pagando: "Nova Tela (R$ 22,99)" com Pix do Banco Inter (o banco recusa tela de gestor sem pagamento) |
| Representante | Só a própria carteira (clientes, propostas, contratos, comissões) + catálogo de telas dos pontos parceiros | — |
| Anunciante / Cliente / Parceiro | Só o próprio: telas do catálogo de parceiros, as próprias e as que exibiram sua mídia; exibições só das suas mídias | — |

O painel apaga a memória ao trocar de conta (ninguém vê dados da sessão anterior no mesmo navegador).

**Login por função (F-204):** cada perfil entra só pela porta e pela área dele — Anunciante/Cliente: Portal do Anunciante (`/portal`); Representante: Portal do Representante (`/representantes`); Gestor de mídia e a equipe dele (Funcionário, Operacional, Designer, Parceiro): Portal do Gestor (`/dashboard`); Financeiro, Gerente e Supervisor: Área Corporativa (`/workspace`); Dono e ADM: todas. Quem entra pela porta errada recebe o aviso "Esta conta entra pelo …" e é levado sozinho para a porta certa (já entrando na área dele); quem abre uma página de outra área volta para a própria. Regra única em `src/lib/portalAccess.ts`.

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

## 8. Launcher Sobre Mídia — versão de TESTE 5.8.22 (F-200..F-217)

- **ROM Sobre Mídia (F-214, ROM v1.14 com as logos nítidas do F-216):** ao ligar aparece sempre a tela Sobre Mídia (logo + "Sobre Mídia Player"), nunca "Selenga", até a launcher abrir. O Player vem instalado, mas só abre sozinho depois que a pessoa toca nele pela 1ª vez; depois disso abre ao ligar e segue a regra dos 3 Home.
- **Cor em tudo (F-215):** a cor escolhida também pinta o brilho da seleção, o selo "App Oficial" e as telas dos Destaques. "TV 16:9"/"TOTEM 9:16" aparecem só nos cartões de edição do painel.

- **Edição no painel (F-213):** mídias dos Destaques escolhidas por **pastas** (Enviadas: Vídeos e Fotos; Biblioteca: as pastas dela), cada uma identificada pelo nome, com prévia rápida (tocar/pausar e volume) e botão **Upload**. Cada tela (TV 1, TV 2, Totem 1, Totem 2) tem um cartão com a sua **lista de reprodução**, como a playlist das telas: quantas mídias quiser, arrastar para ordenar, duração, ligar/desligar, mudar de tela e remover. **Cor do app:** a cor escolhida pinta o fundo e o app inteiro no aparelho (Player 5.8.16+). Com imagem de capa, o app continua na cor. Trocar a cor tira a capa.

- **TV em pé / totem (F-212, 5.8.15):** a posição FÍSICA da TV é uma só para o aparelho inteiro, nesta ordem: **"Rotação da tela" do painel** (tela vinculada) → **"Posição da tela"** no Menu da launcher (aparelho ainda sem tela no painel) → **ROM de totem** (`ro.sobremidia.orientacao`) → sem nada, a orientação lógica do Android (TV = deitada). TV Box não tem sensor e informa sempre a saída de vídeo deitada (1280x720): a resolução NÃO prova a posição, por isso é configuração. Em pé (90°/270°) tudo gira por software e se arruma em 9:16: launcher (Destaques com a TV 1 em cima, a TV 2 embaixo dela e os 2 totens 9:16 lado a lado; Player e Menu dividindo a largura, um pouco acima do rodapé; selo "App Oficial" no canto inferior esquerdo; Menu em lista e apps em 3 colunas), abertura, login, escolha da tela, aparelho desvinculado, as perguntas (caixa desenhada dentro da tela girada) e o **teclado** (teclado próprio em pé, pelo controle remoto ou mouse — o do Android é do sistema e sairia deitado). As mídias continuam na orientação delas (a escala do palco decide o encaixe). Apps de terceiros (loja, Ajustes, apps instalados) abrem como o Android os desenha — o app não gira janelas de outros apps.

- **Visual (F-211, 5.8.14):** só a logo no topo (sem sombra); embaixo, centralizados, **Sobre Mídia Player** (abre já selecionado) e **Menu** (ícone + nome centralizados), os dois da mesma cor; o cartão selecionado ganha um brilho neon azul leve. No canto inferior esquerdo, o selo **"App Oficial"** (neon, verificado azul) — é o botão da launcher original. O Menu mostra também **Instalar APK** e **Arquivos** (os do próprio aparelho, quando existem) e, com pendrive plugado, aparece o ícone **Pendrive** no topo (abre os arquivos).
- **Launcher original (F-210, 5.8.14):** ao escolher a original o Player abre logo em seguida e segue a mesma regra dos 3 Home. No 3º Home aparece a pergunta "usar a launcher Sobre Mídia como padrão?" e o minuto fora do Player **só começa quando ela termina** (Sim/Agora não, ou 30 s sem resposta — ela some); depois de 60 s o Player volta.
- **Visual (F-209):** topo com a logo da empresa e o selo **"Oficial"** (é o botão que volta para a launcher original), clima, Wi-Fi e hora; no meio, **Destaques Sobre Mídia** grande e centralizado (2 TVs 16:9 e 2 totens 9:16, sem moldura); embaixo, centralizados, **Player** e **Menu** (Menu abre Loja de apps, Ajustes do aparelho e os aplicativos). Fundo: padrão Sobre Mídia, uma **cor** ou uma **imagem de capa** escolhidas no painel (chegam sozinhas, sem APK).

O Player pode ser também a **tela inicial** do aparelho (como as launchers de TV Box, Samsung, Motorola).
- **Mostra:** logo da empresa logada (Minha Marca ou, sem ela, a foto de perfil; sem nenhuma, a Sobre Mídia) no topo, no cartão do Player e nas telas vazias dos Destaques, hora e data, temperatura, Wi-Fi, o cartão "Destaques Sobre Mídia" com 2 TVs 16:9 e 2 totens 9:16, cada um com as mídias escolhidas pelo dono/ADM (vídeos um de cada vez) e 4 cartões: Player Sobre Mídia, Aplicativos (painel com os apps instalados — **sem YouTube, Netflix e apps de TV** (continuam na launcher original). Botões: Ajustes, Wi-Fi, Launcher original.
- **Não libera o Player:** a launcher é só a tela inicial. Sem login o cartão do Player leva ao login e à escolha da tela; a contagem "abre sozinho" só existe com login feito e tela escolhida.
- **Ao ligar o aparelho** (launcher escolhida): aparece a launcher Sobre Mídia; depois de N segundos sem ninguém mexer abre o Player (padrão 30 s).
- **Pergunta (F-204, 5.8.9):** "Usar a launcher Sobre Mídia?" ao abrir o app pelo ícone **só até a pessoa decidir**. "Usar" → a launcher vira a tela inicial, aparece e o Player abre logo em seguida (login → tela). "Agora não" → abre só o Player (login) e o ícone não pergunta mais. Para quem usa a launcher original, a pergunta volta a cada saída pelo **3º Home** e fica no máximo **30 s** (sem resposta some e a pessoa segue na original). Quem usa a launcher Sobre Mídia nunca vê a pergunta.
- **Painel sem APK novo:** o que o dono/ADM muda nos Destaques e a logo da empresa chegam sozinhos — a launcher confere a cada 1 minuto enquanto está na tela e o Player deixa tudo baixado a cada 5 minutos.
- **Virar tela inicial:** Device Owner ou root = automático; senão o Android pergunta uma vez (Sobre Mídia → "Sempre"); aparelho que não deixa = modo forçado ("Acesso ao uso").
- **Uso livre:** abrir um app, Ajustes ou a launcher original pela launcher (ou pelos comandos do painel) faz o Player não puxar a tela de volta durante N minutos (padrão 30).
- **Voltar para a original:** botão "Launcher original" (abrir agora ou usar como padrão) e comando "Launcher original" na página da tela.
- **Painel:** `/workspace/launcher` (menu "Launcher", só dono/ADM). O banco recusa os comandos de launcher de quem não é dono/ADM.
- **Home no Player (F-202, 5.8.7):** com a launcher Sobre Mídia como tela inicial, Home leva para ela (não aparece mais "Sincronizando mídias"); a contagem dela ou o cartão do Player trazem o Player de volta direto às mídias.
- **Regra do Home (F-208, 5.8.12 — regra do dono de 22/10/2026):** 1º e 2º Home seguidos = toque acidental → a launcher aparece e o Player volta em ~3 s; 3º Home seguido → a pessoa fica livre e o Player só volta em **1 minuto** (mexer na launcher não adianta nem atrasa). O Player volta já tocando (motor de vídeo recriado), sem "Sincronizando mídias". Tocar no cartão do Player volta na hora. Navegação com as setas sem animação (fluida na TV Box).

## 9. Desvincular e "Vincular outro aparelho" — versão de TESTE 5.8.9 (F-205)

- **Desvincular** (página da tela): o aparelho sai da tela e mostra a **tela de suporte** (logo, "Aparelho desvinculado", "Entre em contato com o suporte…"), mesmo depois de reiniciar. A tela e a playlist ficam preservadas e livres. (No 5.7.10 o aparelho vai para a escolha de tela, como antes.)
- **Vincular outro aparelho** (ao lado de "Desvincular Tela"): lista os aparelhos da **mesma conta** da tela (o Player só enxerga as telas da conta em que está logado), com o que cada um reproduz, online/offline e a versão. Escolhido um, ele sai da tela antiga (que fica livre), passa a reproduzir a nova, baixa as mídias dela e apaga sozinho as da playlist antiga. Se a tela nova tinha outro aparelho, esse vai para a tela de suporte. Aparelho na tela de suporte também pode ser escolhido (volta em até 15 s).
- **Segurança:** o Player sempre confere no servidor a qual tela está ligado antes de agir — comando velho ou repetido nunca tira do ar uma tela certa; aparelho que estava offline recebe a troca quando volta. Só funciona com o Player 5.8.9 ou mais novo (os antigos aparecem na lista como "precisa atualizar").
