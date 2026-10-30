# Mapa de reuso do que já existe

Data: 30/10/2026. Para cada necessidade do Studio, mostra o que reaproveitar, onde está e o que falta.
Legenda: ✅ funcional · 🟡 incompleto · ❌ não existe · 🔍 validar · 🔒 não alterar.

| Necessidade do Studio | Reaproveitar | Onde | Situação | O que falta |
|---|---|---|---|---|
| Enviar fotos do produto | Envio assinado ao R2 + regra de caminho | `get-upload-url`, `fn_r2_validate_object_scope`, `src/lib/r2Upload.ts` | ✅ (🔒 a função de caminho) | Prefixo `tenants/{empresa}/studio/...` (já permitido pela regra) |
| Guardar o resultado do cliente | `cliente_assets` + moderação | `AssetLibraryPage.tsx`, `analisar-midia`, `api/analise-visao.js`, cron de 10 min | ✅ | Coluna/tag de rótulo IA (decidir: `tags` já serve, ex.: `studio:ia-imagem`) |
| Guardar o modelo do dono por segmento | `media` + `biblioteca_itens` (com `tags`) | `src/pages/dashboard/Biblioteca.tsx`, `src/components/biblioteca/*` | ✅ | — |
| Publicar nas telas | Playlists → telas | `src/lib/adicionarNaPlaylist.ts`, `fn_save_playlist_items`, `PlaylistsClientePage.tsx` | ✅ 🔒 | — |
| Miniaturas | `media.thumbnail_url` (398 de 416) | pipeline atual | ✅ | Miniatura das produções = 1º quadro (FFmpeg no Actions) |
| Compressão/padronização do MP4 | `compress-video.yml` (H.264 High 4.1, CRF 19, ≤ 8 Mbps) | `.github/workflows/compress-video.yml` | ✅ 🔒 | Copiar **o padrão** (perfil FFmpeg) no `studio-montar`, sem mexer no original |
| Disparar trabalho pesado | `repository_dispatch` com segredo | `supabase/functions/process-media/index.ts:79-95` | ✅ | Novo evento `studio_montar` |
| Desenhar texto e preço exatos | HTML → Playwright no Actions | `scripts/conteudo/robo.mjs` | ✅ | Molde de arte do Studio |
| Layout 16:9/9:16 por camadas | `ArteModelo.tsx` (protótipo, sem commit) | `src/components/studio/ArteModelo.tsx` | 🟡 | Ligar a dados reais (sem os 24 modelos escritos à mão) |
| Segmentos, filtros e busca | `catalogo.ts` (protótipo, sem commit) | `src/lib/studio/catalogo.ts` | 🟡 | Ler da Biblioteca e das produções reais |
| Fontes | `carregarFonte`/`cssDaFonte` | `src/lib/tabloide/fontes.ts` | ✅ | — |
| Recorte do produto | Recorte no navegador | `src/lib/tabloide/recorte.ts` | 🟡 (só fundo liso) | Recorte melhor no Actions 🔍 (modelo aberto a testar) |
| Exportar PNG no navegador | html2canvas | `src/lib/tabloide/exportar.tsx` | ✅ | — |
| IA de imagem | Worker Cloudflare (FLUX) | `cloudflare/tabloide-ia/worker.js`, `scripts/ops/publicar-worker-ia.mjs` | ✅ | Rota nova no mesmo Worker (`flux-2-klein` com referência) e modelo de texto melhor (`gpt-oss-120b`/`llama-4-scout`) |
| Chamar IA pelo servidor | `TABLOIDE_IA_URL`/`TABLOIDE_IA_SEGREDO` | `supabase/functions/produto-imagem/index.ts:184-229` | ✅ | Os mesmos segredos no orquestrador |
| Cota e consumo | `tabloide_ia_registrar` + `tabloide_ia_uso` | banco (F-174) | ✅ | `studio_uso` no mesmo molde, com custo por tipo |
| Fotos de banco livre | Pexels, Pixabay, Openverse, Wikimedia | `produto-imagem/index.ts:128-204` | ✅ | Registrar a licença na referência |
| Fila periódica | `pg_cron` + `pg_net` | banco (11 tarefas) | ✅ | Tarefa de 1 min do orquestrador |
| Link privado e temporário | Assinatura SigV4 | `supabase/functions/get-download-url/index.ts` | 🟡 só contratos 🔒 | Copiar o padrão numa função do Studio |
| Rotas e menu do portal | `/portal/*`, `CustomerPortalLayout` | `src/App.tsx`, `src/modules/crm/layout/CustomerPortalLayout.tsx` | ✅ 🔒 | Acrescentar `/portal/studio` (e/ou trocar o placeholder `/portal/criar-midia`) |
| Área da equipe | `/dashboard/*` | `src/App.tsx` | ✅ | `/dashboard/studio` para o dono/ADM (modelos e referências) |
| Permissões por perfil | `useRbac`, `portalAccess` | `src/hooks/useRbac.ts`, `src/lib/portalAccess.ts` | ✅ 🔒 | Só consumir. Não alterar |
| Testes de tela | sessão de teste + navegador | `scripts/ops/sessao-teste.mjs`, skill `conferir-painel` | ✅ | — |
| Contrato do Player | Conferência automática | `scripts/ops/contrato-player.mjs` | ✅ | Rodar em todo gate |

## O que NÃO reaproveitar

| Peça | Motivo |
|---|---|
| `ai.service.ts` / `anuncianteAi.service.ts` / `BibliotecaIA.tsx` | IA **simulada**, com texto fixo. Não é base para nada. Corrigir à parte |
| `artes` / `campanha_arte_versoes` | Exigem `campanha_id`, 0 linhas, nenhum uso. Ligar a campanhas é outra decisão |
| `src/lib/studio/modelos.ts` + `public/studio/fotos/*` | 24 modelos escritos à mão: contraria a regra "o catálogo é consequência da produção". Descartar ou manter só como dado de teste |
| `is_central_privileged()` nas regras novas | Libera FINANCEIRO, GERENTE e SUPERVISOR para ver arquivos de todos os clientes. O Studio usa regras próprias |
| Biblioteca de Mídias para referências | Pasta inteira pode ir para playlist e o R2 é público |
