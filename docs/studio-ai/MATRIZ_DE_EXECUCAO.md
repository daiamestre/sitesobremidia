# Matriz de execução — Studio de IA Cinematográfica

Data: 30/10/2026. Base: os 5 documentos da MG00.

## Diagnóstico (30/10/2026)

- **Branch e commit:** `release/player-5.2.4` em `0f022ac` (igual ao `origin/main`).
- **Alterações preexistentes preservadas:** `src/lib/biblioteca.ts` e `supabase/.temp/cli-latest` (nunca entram em commit), mais 425 arquivos não rastreados.
- **Tabelas parecidas no banco:**
  - `ordens_producao`, `producao_midia`, `producao_versoes`, `producao_historico`, `producao_auditoria`, `tarefas_producao`. São o fluxo **manual** de ordem de produção, ligado a contrato e designer (1 linha), e nenhum código usa além de `types.ts`. **Não servem** para produção por IA: não têm briefing, agentes, etapas, custo nem cota. Ficam intocadas.
  - `artes`/`campanha_arte_versoes`: 0 linhas e exigem campanha. Ficam intocadas.
  - Nenhuma tabela `studio_*`.
- **Modelos de IA conferidos no esquema oficial da Cloudflare** (`/ai/models/schema`) e na página de preços:

| Modelo | Esquema de entrada | Custo |
|---|---|---|
| `@cf/black-forest-labs/flux-1-schnell` | `prompt` e `steps` ≤ 8; saída 1024×1024 | 4,8 neurons por bloco de 512² + 9,6 por passo ≈ **96 neurons por imagem** (grátis na cota diária de 10.000) |
| `@cf/leonardo/lucid-origin` | `width`/`height` até 2500, `seed` e `steps` | 636 neurons por bloco + 12 por passo ≈ **7.900 neurons por imagem 1920×1080 (≈ US$ 0,087)**: **pago**, só com confirmação |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | `messages` (texto e imagem) e `response_format` `json_schema` | 24.545 neurons por milhão de tokens de entrada, 77.273 por milhão de saída |
| `flux-2-klein-4b` | entrada multipart sem campos documentados | **não usado** |

- **Ferramentas locais para testar** (já declaradas no `package.json`, nada instalado): `@ffmpeg-installer/ffmpeg`, `playwright` (Chromium), `tesseract.js`, `@aws-sdk/client-s3`, Node 24.

## Matriz

Situação: **L** = liberado · **A** = depende de autorização para aplicar ou publicar (o código pode ser feito e testado localmente) · **B** = bloqueado por recurso externo.

| Gate | Funcionalidade | Reaproveita | Cria / modifica | Dependências | Riscos | Testes | Aceite | Situação |
|---|---|---|---|---|---|---|---|---|
| MG01 | Pedido (briefing em etapas), estados, cota | `get-upload-url`, recorte do Cartaz, `get_user_tenant_id`, `fn_biblioteca_admin`, `usuarios.cliente_id` | migração `studio_producoes`/`studio_etapas`/`studio_uso` + RPCs; `_shared/studio/contrato.ts`; páginas do Studio; rotas `/portal/criar-midia/*` e `/dashboard/studio/*` | Aplicar a migração no banco = **A** | R-04 (regra própria, sem `is_central_privileged`) | unitários + RLS numa transação desfeita, com 2 anunciantes + FINANCEIRO + owner | preços exatos gravados; isolamento comprovado | Código **L** · aplicar **A** |
| MG02 | Diretor Criativo, Roteirista, Diretor de Fotografia, Especialista em Produtos, Especialista em Prompts | Worker de IA (padrão `x-segredo`), `pg_cron`/`pg_net` | `_shared/studio/agentes.ts`, `_shared/studio/provedores.ts`, `supabase/functions/studio-orquestrador`, rota genérica no Worker | Publicar o Worker e a Edge Function = **A** | invenção de dados (o validador recusa) | unitários do validador + execução real dos agentes (API da Cloudflare com a chave do cofre) | plano válido, sem preço, loja ou marca inventados | Código **L** · publicar **A** |
| MG02b | Biblioteca privada de referências | — | conhecimento em texto versionado (`docs/studio-ai/biblia/*`, usado pelos agentes) | **bucket privado** | R-01, R-02, R-03 | — | — | Bíblia em texto **L** · arquivos **B** |
| MG03 | Imagens de cena + aprovar, rejeitar, gerar de novo, comparar, principal | Worker de IA | adaptador de imagem; RPCs de decisão por cena | Publicar = **A** | produto deformado → produto **real recortado** sobre o cenário gerado | execução real do FLUX; testes de cota | imagens por cena e versões registradas | Código **L** · publicar **A** |
| MG04 | Montagem MP4 (FFmpeg) com textos e preços por código | padrão `compress-video` (H.264 High 4.1) e Playwright do robô | `scripts/studio/montar.mjs`, `_shared/studio/layout.ts`, `.github/workflows/studio-montar.yml` | Commit do workflow = **A** | — | montagem real local 16:9 e 9:16 | MP4 com a duração certa, preço legível | Código **L** · CI **A** |
| MG05 | Qualidade (ffprobe, OCR do preço) + entrega | `cliente_assets` + `analisar-midia` (quadros), `media`, padrão de envio do Cartaz | QC dentro de `montar.mjs`; RPC `studio_entregar` | — | preço errado → reprovado | OCR real; teste do preço trocado | reprovação comprovada | **L** |
| MG06 | Editor interno (texto, preço, cores, fontes, posição, tamanho, fundo, ordem e duração das cenas, versões) | fontes do Cartaz | `src/components/studio/EditorCena.tsx` (mesmo layout HTML da montagem) | — | — | navegador | prévia igual à montagem | **L** |
| MG07 | Canva | — | só documentação e adaptador **desligado** | integração Canva do dono, plano Pro/Teams | R-08 | — | — | **B** |
| MG08 | Vídeo por IA | — | interface de adaptador **desligada** | provedor, orçamento, chave | R-11 | — | — | **B** |
| MG09 | Voz e música | — | interface de adaptador **desligada** | provedor e licença | — | — | — | **B** |
| MG10 | Automação e homologação | tudo acima | documentação de operação | depende de A e B | — | ponta a ponta após publicar | — | Docs **L** · homologação **A** |
