# Procura de produtos — como achar a foto OFICIAL (manual para qualquer conversa)

> Ordem do dono: a foto do produto vem do **site OFICIAL da marca**. Se não achar no site oficial, vem dos **sites
> parceiros**: as lojas que vendem aquela marca, com a mesma foto de embalagem. Nunca foto aleatória, nunca foto de
> outra marca, nunca imagem inventada por IA para produto embalado. Este arquivo reúne como fizemos (F-252..F-295).
> Detalhes e histórico: `docs/MISSAO_CATALOGO_DE_PRODUTOS.md`, `docs/studio/ENCARTES_E_FOTOS_DE_PRODUTO.md` e o
> FINDINGS_LEDGER (grep "F-27", "F-28", "F-29").

## 1. Ordem das fontes (sempre nesta ordem)
1. **Catálogo próprio** (`tabloide_catalogo`): se o produto já tem foto oficial aprovada, usar ela.
2. **Site OFICIAL da marca:** página do produto no site da própria marca (lista em `../marcas/lista/sites.json`).
   Ferramentas: `scripts/ops/marca-oficial.mjs`, `marca-site.mjs`, `marca-loja.mjs` (lojas da marca em Shopify, VTEX ou
   WooCommerce, com nome exato, peso e código de barras), `marca-varredura.mjs`, `marca-descobrir-sites.mjs` (cuidado:
   muitos domínios com o nome da marca são de outra empresa; conferir à mão).
3. **Sites PARCEIROS (lojas que vendem a marca):** a mesma foto de embalagem nas lojas com catálogo aberto e `robots.txt`
   que permite. Ferramentas: `scripts/ops/marca-varejo.mjs` e `marca-varejo-lote.mjs`. No site, sem PC e sem Claude, o
   Worker `cloudflare/tabloide-ia/worker.js`, rota `GET /procurar?q=<produto>`, consulta 16 lojas VTEX (farmácias,
   supermercados, Atacadão, GBarbosa e lojas do Nordeste) e `src/lib/tabloide/buscaNasLojas.ts` aplica as regras.
   A lista de lojas fica igual no Worker (`HOSTS_LOJAS`) e no `marca-varejo.mjs`; para ampliar, conferir o robots e pôr nos dois.
4. **Não achou:** produto EMBALADO vira **pedido de foto** (tabela `tabloide_pedidos_de_foto`). Os agentes procuram de
   novo: `scripts/ops/pedidos-de-foto.mjs` no PC (a cada 10 min e no 1º passo do `catalogo-ciclo.mjs`) e no GitHub
   (`.github/workflows/pedidos-de-foto.yml`, a cada 2 h). Embalado NUNCA recebe imagem de IA nem foto de banco de
   imagens (Wikimedia, Openverse, Pexels, Pixabay).
5. **Fresco ou preparado sem marca** (fruta, legume, carne, pão): só foto do hortifrúti conferido
   (`src/lib/tabloide/hortifruti.ts`, `scripts/ops/hortifruti-*.mjs`) com conferência humana (`hortifruti-folha.mjs`)
   antes de gravar; IA de imagem só para fresco ou preparado, e só confirmada.

## 2. Produto certo (o que o cliente escreveu, exatamente)
- Mesmo tipo (arroz ≠ feijão), mesma marca, mesma medida (1 L ≠ leite em pó). Sem variante escrita, vale o
  **TRADICIONAL mais vendido** (café = pó tradicional, não cápsula). Regras: `src/lib/tabloide/buscaProduto.ts`
  (`CATEGORIA`, `VARIANTES`, `melhorOficial`), `produtoCompleto.ts`, `marcasConhecidas.ts`.
- Nome curto de hortifrúti = variedade tradicional (Uva → Uva Vitória, Banana → Banana Prata, Ovos → Ovos Brancos).
- Erros que já aconteceram e não podem voltar: arroz recebendo feijão; leite em pó para "leite 1L"; estátua ou campo
  como foto; "Uva" virar Fanta Uva; "Caju" virar cachaça; Pringles para "batata"; petisco de cachorro para "picanha".
- Nunca chutar código de barras. O nome do produto se corrige pela EMBALAGEM (a página costuma ter o nome da linha).
- Teste obrigatório antes de mexer na busca: `npx vitest run src/tests/unit/buscaProdutoCerto282.test.ts`.

## 3. Qualidade da foto (antes de gravar)
- Sem fundo, produto inteiro, nítido, lado maior com pelo menos 350 px (as lojas são baixadas em 600 px).
- Caminho único do recorte: `prepararImagem` (`src/lib/tabloide/imagens.ts`) → função `produto-imagem`
  (`recortar`, `inspecionar`) → Worker `sobremidia-tabloide-ia`. Contas em `qualidadeRecorte.ts`.
- Recorte no PC sem gastar cota: `scripts/ops/marca-recortar-local.mjs`; foto com fundo branco por link:
  `marca-recortar-link.mjs`. **Conferência dupla com IA** (`marca-conferir-ia.mjs`): só grava o que a IA aprovou.
- Conferir a olho, em tamanho GRANDE (nunca em miniatura), as folhas `rev*.png`; reprovado vai para `recusados.txt`.
- Foto reprovada nunca é entregue nem vira oficial.

## 4. Gravar no catálogo
- Por link (sem guardar a imagem no R2): `scripts/ops/marca-gravar-grupo.mjs`, `catalogo-por-link.mjs`, passa-foto
  (`GET /foto` no Worker, `src/lib/tabloide/fotoPorLink.ts`).
- Fila de marcas conferidas: `../marcas/lista/fila.json` → `node scripts/ops/marca-gravar-fila.mjs ../marcas`.
- Gravar SEMPRE em sequência (o Supabase devolve 429 em paralelo) e nunca republicar o Worker durante uma gravação.
- Ciclo contínuo: `node scripts/ops/catalogo-ciclo.mjs` (precisa de 10 GB livres no disco).
- Depois: `node scripts/ops/consolidar-marcas.mjs ../marcas` e commit.

## 5. Limites (o dono já decidiu)
- **Nunca contornar `robots.txt`, CAPTCHA ou bloqueio de robô** (o dono pediu "burlar" e foi recusado com explicação).
  Sites que bloqueiam (Buscopan, Aspirina, Bepantol, Nestlé etc.): o produto fica como pedido de foto.
- Pernambuco primeiro: marcas populares em Recife, Caruaru e região (`../marcas/lista/consolidado.json`).
- Lote do Open Food Facts: PARADO (o dono reprovou). Cosmos: plano grátis acabou. Cota da Cloudflare Images:
  5.000 por mês.
- O dono autorizou seguir marca por marca sem pedir licença, mas conferir em tamanho grande antes de gravar é obrigatório.
