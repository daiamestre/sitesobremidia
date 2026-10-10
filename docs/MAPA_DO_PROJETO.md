# Mapa do projeto SOBRE MÍDIA

Serve para achar rápido **onde mexer** em cada pedido, sem varrer o projeto inteiro. Os caminhos são relativos à raiz.

## Pedido → onde mexer

| Pedido do tipo… | Onde fica | Receita (skill) |
|---|---|---|
| Menu lateral do painel | `src/modules/crm/components/Sidebar.tsx`, `src/modules/crm/layout/CrmLayout.tsx` | — |
| Rotas e páginas (qual URL abre o quê) | `src/App.tsx` (protegido) | — |
| Login, perfis, quem vê o quê | `src/contexts/AuthContext.tsx`, `src/components/auth/RouteGuards.tsx`, `src/hooks/useRbac.ts`, `src/lib/portalAccess.ts` (**todos protegidos**) | migracao-segura |
| Telas (cadastro, detalhes, pareamento) | `src/pages/dashboard/Screens.tsx`, `ScreenDetails.tsx`, `src/pages/DevicePairingScreen.tsx`, `src/hooks/useScreens.ts` | — |
| Playlists (itens, ordem, pasta na playlist) | `src/pages/dashboard/Playlists.tsx`, `src/components/playlists/*`, `src/lib/playlistItems.ts`, `src/lib/pastaNaPlaylist.ts`; banco: `fn_save_playlist_items`, `get_player_playlist_for_screen` | migracao-segura |
| Biblioteca, pastas, conteúdo automático (tela) | `src/pages/dashboard/Biblioteca.tsx`, `src/components/biblioteca/*`, `src/lib/biblioteca.ts` | conteudo-automatico |
| Robô que gera as artes e vídeos das pastas | `scripts/conteudo/robo.mjs`, `scripts/conteudo/produtores/*`, `.github/workflows/conteudo-automatico.yml`, `supabase/functions/conteudo-automatico` | conteudo-automatico |
| Widgets: cadastro e prévia | `src/pages/dashboard/Widgets.tsx`, `src/components/dashboard/widgets/*` (`WidgetForm`, `WidgetPreview`, `WidgetCatalog`), `src/lib/widgetCatalog.ts` | conferir-painel |
| Widgets: desenho na web | `src/components/player/*Widget*.tsx` (Clima, RSS, Esportes, Esportes News, Oferta, Social, Relógio, QR) | conferir-painel |
| Widgets: desenho no Player Android | `native-android-player/app/src/main/java/com/antigravity/player/widget/*` e `util/NativeWidgetEngine.kt` | release-player |
| Notícias, RSS e esportes (dados) | `supabase/functions/news-engine-sync`, `fetch-rss`, `sports-engine-sync`, `sports-escudos-sync`; `src/lib/esportes*.ts` | deploy-producao |
| Mídias (envio, R2, duração) | `src/pages/dashboard/Medias.tsx`, `src/lib/r2Upload.ts`, `r2Client.ts`, `mediaDuration.ts`; funções `get-upload-url`, `process-media`, `delete-media-object` | — |
| Agenda / programação | `src/pages/dashboard/Schedule.tsx`, `src/modules/crm/pages/Schedule*Page.tsx` | — |
| CRM: clientes, propostas, contratos, PI | `src/modules/crm/pages/Clientes*`, `Propostas*`, `Contrat*`, `PedidoInsercao*`; funções `generate-contract-pdf`, `generate-proposal-pdf`, `contract-signature-flow` | — |
| Financeiro, cobranças, PIX, comissões | `src/modules/crm/pages/Billing*`, `CashFlow*`, `Commission*`, `DREPage`, `InvoicesPage`; `src/pages/PaginaCobranca.tsx`; funções `billing-worker`, `inter-billing-engine`, `inter-pix-engine`, `payment-webhook` | — |
| Cartaz Digital (antigo Tabloide: cartaz com foto automática, menu lateral Produtos/Temas/Datas/Sua Logo/Empresa/Fontes/Postar/Encarte/Portal, Meus cartazes, portal público de ofertas) | `src/components/tabloide/*` (`TabloideEditor`, `PainelTemas`, `PaineisCartaz`, `MeusCartazes`, `TabloideCanvas`), `src/lib/tabloide/*` (`cartaz.ts` = modelo único do cartaz, `cartazes.ts` = salvos/publicar, `perfil.ts` = dados da loja e portal, `selos.ts` = biblioteca de logos/temas, `fontes.ts`, parse, temas, grade, imagens, exportar), páginas `portal/TabloidePage.tsx`, `pages/dashboard/Tabloide.tsx` e `pages/PortalOfertas.tsx` (`/ofertas/:slug`, sem login), função `supabase/functions/produto-imagem`, tabelas `tabloides`, `tabloide_catalogo`, `tabloide_selos`, `tabloide_perfil` e função `tabloide_portal` | deploy-producao |
| Portal do Anunciante / cliente | `src/modules/crm/layout/CustomerPortalLayout.tsx`, `src/modules/crm/pages/portal/*` (**protegido**) | — |
| Representantes | `src/pages/representantes/*`, `src/modules/crm/pages/Representante*`, `src/services/representative*.ts` | — |
| Prospecção e Pontos de Exibição | `src/modules/crm/pages/prospeccao/*`, `src/modules/crm/pages/NovaProspeccaoPage.tsx`, `src/services/prospeccao.service.ts`, `pontosRede.service.ts` (**protegido**) | — |
| Gestor de mídias | `src/modules/gestor/*`, `src/lib/dashboardResumoGestor.ts` | — |
| Meu Perfil (por papel) | `src/pages/perfil/MeuPerfil*Page.tsx`, `src/services/perfil.service.ts` (**protegido**) | — |
| Painel inicial (números) | `src/pages/dashboard/DashboardHome.tsx`, `src/lib/dashboardResumo*.ts` | — |
| BI e relatórios | `src/modules/crm/pages/*Analytics*`, `*Dashboard*`, `src/pages/dashboard/Reports.tsx` | — |
| Central de comunicação, e-mails, avisos | `src/pages/Central/CentralDashboard.tsx`, `src/services/central*.ts`; funções `communication-core`, `send-email`, `send-*-notification` | — |
| Usuários, senhas, solicitações de acesso | `src/pages/dashboard/AdminUsers.tsx`, `src/pages/admin/*`; funções `provision-user`, `create-corporate-user`, `handle-password-reset` | — |
| Player web (navegador/PWA) | `src/components/player/PlayerEngine.tsx` (**protegido**), `WebPlayer.tsx`, `src/pages/Player.tsx` | — |
| Player Android (tudo) | `native-android-player/` — ver `docs/PLAYER_REFERENCIA.md` | release-player |
| Banco (tabelas, funções, RLS) | `supabase/migrations/*.sql` (mais de 230; o último arquivo mostra o estado mais recente) | migracao-segura |
| Publicar / conferir no ar | `scripts/ops/*` — ver `scripts/ops/README.md` | deploy-producao |
| Histórico de correções (F-NN) | `docs/engineering/FINDINGS_LEDGER.md` (buscar por `F-NN` ou palavra-chave; não ler inteiro) | — |

## Busca rápida (poucos tokens)
- Texto que aparece na tela → `grep -rn "Texto exato" src --include=*.tsx`.
- Função do banco → `node scripts/ops/sql.mjs "select pg_get_functiondef('public.nome'::regproc)"`: é a definição **no ar**, mais confiável que o arquivo.
- Qual migração criou algo → `grep -ln "nome_da_funcao" supabase/migrations | tail -3`.
- Correção antiga → `grep -n "palavra" docs/engineering/FINDINGS_LEDGER.md | tail`.

## Constantes úteis
- Supabase: ref `bhwsybgsyvvhqtkdqozb`. Empresa principal (tenant): `7d62aaec-e24d-4273-b257-867183cf658c`.
- Site: `https://sitesobremidia.vercel.app`. Repositório: `daiamestre/sitesobremidia`. Branches `release/player-5.2.4` e `main`, sempre com o mesmo commit.
- Segredos: `~/.sobremidia-secrets/tokens.env`, nunca imprimir nem commitar.
- Conta de teste do painel: `e2e-owner@sobremidia.com.br` (via `scripts/ops/sessao-teste.mjs`).
