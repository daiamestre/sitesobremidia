# Missão: catálogo de produtos do Brasil

Plano definido em 01/11/2026, a partir de três pesquisas e da medição do sistema. Os segmentos estão em `docs/catalogo/segmentos-de-produtos.md`.

## Regra do dono: a imagem vem da marca (02/11/2026)

Padrão: embalagem oficial publicada pela própria marca, em PNG sem fundo, sem recorte nosso, sem IA e sem filtro. Só se corta a sobra transparente.

Método, marca por marca:

1. `node scripts/ops/marca-site.mjs <dominio> ../marcas/<marca>`: lê a lista de produtos do site oficial e baixa cada imagem no tamanho original. Respeita o robots.txt e não contorna bloqueio.
2. `node scripts/ops/marca-codigos.mjs ../marcas/<marca> <Marca>`: liga código de barras só com nome, sabor e peso exatos.
3. `node scripts/ops/marca-oficial.mjs preparar ../marcas/<marca> <Marca>`, e conferir cada imagem sobre magenta. Logotipo e página que não é produto vão em `recusados.txt`.
4. `node scripts/ops/marca-oficial.mjs gravar ../marcas/<marca> <Marca>`: a foto da marca substitui a anterior no catálogo.

O código de barras fica no nome do arquivo, nos dados internos da imagem e no catálogo. Nunca é desenhado na embalagem.

| Marca | Dono | Produtos no catálogo | Com código seguro |
|---|---|---|---|
| Vitarella | M. Dias Branco | 152 | 10 |
| Piraquê | M. Dias Branco | 69 | 3 |
| Isabela | M. Dias Branco | 93 | 7 |
| Richester | M. Dias Branco | 68 | 1 |
| Turquesa | Pernambuco | 24 | 0 |
| São Braz | Paraíba e Pernambuco | 15 (imagens pequenas, cerca de 440 px) | 0 |
| Pitú | Pernambuco | 4 de 21 páginas | 0 |

Próximas: Adria, Fortaleza e demais marcas do grupo; Bauducco, Camil e Yoki exigem outro caminho, porque a lista não veio do mesmo jeito. A base de produtos por marca e segmento está em `docs/catalogo/segmentos-de-produtos.md`.

Falta: código de barras dos demais produtos (bases grátis não têm; caminho é GS1 Brasil ou Cosmos pago). Imagens têm lado entre 430 e 1.110 px; cartaz grande pede o arquivo em alta da marca. Direitos: imagem usada sem autorização formal, por decisão do dono; a coluna `licenca` registra isso.

## Situação em 02/11/2026: lotes do Open Food Facts PARADOS

O dono reprovou o primeiro lote. Os 38 produtos saíram do catálogo, o lote 2 foi interrompido e 22 das 71 fotos gravadas antes voltaram à versão anterior.

- A causa principal é a origem: o Open Food Facts traz fotos de celular de colaboradores, com reflexo, etiqueta de preço, amassado e borda cortada. Nenhum recorte corrige isso.
- A conferência em miniatura escondeu os defeitos. Lote só é conferido com cada produto em tamanho grande (mais de 450 px na tela), sobre magenta.
- A base abriu números reais: 37.769 produtos do Brasil, 25.030 com foto. Dos 196 testados no lote 1, 38 passaram numa conferência que depois foi reprovada.
- Não rodar novos lotes do Open Food Facts como fonte de imagem. O inventário continua útil para código, nome e marca.
- A Fase 3 (foto oficial da marca, com autorização) passa a ser o caminho principal.

## Ponto de partida

- Catálogo: 210 linhas e 128 imagens. Nenhuma por código de barras. 35 sem fundo.
- 143 linhas têm foto nova aprovada, aguardando a gravação pelo dono (`scripts/ops/refazer-recortes-catalogo.mjs`).
- Cosmos: a chave responde 429. O plano grátis acabou em 01/10/2026.
- Tudo é entregue por `pub-*.r2.dev`, que a Cloudflare define como não destinado a produção.

## Tamanho real da missão

- A GS1 Brasil cita mais de 50 milhões de produtos cadastrados, em material sem data, que pode incluir inativos. O total de GTINs ativos não foi encontrado.
- Open Food Facts tem cerca de 37,6 mil produtos do Brasil: menos de 0,1% daquele número.
- Nenhuma fonte encontrada cobre tudo com foto licenciada. "Todos os produtos" é a direção, não uma entrega com fim.
- A métrica da missão é a **cobertura**: de cada 100 produtos que os clientes digitam ou bipam, quantos têm foto aprovada. Medir por segmento.

## Regras

1. O sistema guarda de cada foto: origem, licença, autor e data da aprovação.
2. Nada entra sem passar pela inspeção de recorte (F-253). Lote novo é conferido por amostra a olho.
3. Foto copiada de site de terceiro, sem autorização, não entra: fotografia é obra protegida (Lei 9.610, arts. 7º e 29). A Lei 9.279, art. 132, protege o uso da marca na revenda, mas não licencia a foto.
4. Não raspar Mercado Livre, Amazon, Google nem sites de marcas contra os termos de uso.
5. Foto do Open Food Facts mantém o crédito visível e a licença CC BY-SA.
6. Itens com promoção proibida ficam classificados e bloqueados para encarte: cigarros, fórmulas infantis, mamadeiras e chupetas. Confirmar com advogado.

## Fases

### Fase 0: arrumar a base (dono)

1. Rodar `gravar` e `retocar` do catálogo.
2. Definir um domínio exclusivo para mídia, ativá-lo na conta Cloudflare e ligar ao bucket. Manter o `r2.dev` ligado até nenhum Player depender dele (conferir com `contrato-player.mjs`).
3. Enviar a consulta à GS1 Brasil (api@gs1br.org), perguntando por escrito se a imagem pode ser usada em material publicitário, e se empresa de software pode contratar.
4. Levar a um advogado: foto do lojista, recorte de foto CC BY-SA (art. 79, §2º), termo de autorização das marcas e cláusula de direitos no contrato do anunciante.

### Fase 1: base aberta (Claude)

1. Colunas de origem, licença e segmento no catálogo (migração segura).
2. Importar o dump do Open Food Facts e irmãs, em vez de consultas em massa.
3. Processar em lotes, começando pelos segmentos de prioridade 1 que têm GTIN.
4. Medir a cobertura por segmento com 50 a 100 GTINs.

Limite: a Cloudflare dá 5.000 transformações únicas por mês no plano grátis, ou seja, cerca de 7 meses e meio para 37,6 mil produtos. O plano pago custa US$ 0,50 por mil acima de 5.000; a página de preços não menciona a remoção de fundo, então confirmar antes.

### Fase 2: produtos sem código de barras (Claude + dono)

São 68 subcategorias: frutas, legumes, açougue, padaria, rotisseria, a granel, lanches, pizzas. Banco próprio de fotos genéricas, com o dono aprovando cada lote.

### Fase 3: fotos da fonte oficial (dono + Claude)

1. Comprar a API da GS1 se a resposta permitir o uso da imagem. Associado: 5.000 consultas/dia sem custo informado; não associado: 300/dia, a confirmar.
2. Programa de marcas: pedir por escrito o banco de imagens oficial às maiores marcas de cada segmento. Claude prepara o modelo do pedido e a lista.
3. Lojistas: foto enviada pelo cliente, com declaração de direitos, alimenta o catálogo (já no ar, F-252) e tem remoção rápida.

### Fase 4: bases pagas (só com prova)

Testar 500 GTINs brasileiros em Go-UPC e Barcode Lookup antes de assinar, e ler os termos. Cosmos só depois de ler os termos: R$ 499,99 por 100 consultas/dia.

### Fase 5: Google Drive como curadoria

O Drive é a pasta de entrada e de aprovação. As telas e os sites nunca buscam nele: a entrega é sempre pelo R2.

- O Google diz que o Drive não deve substituir uma CDN, os links públicos não têm garantia, e download pela API tem limite por projeto.
- Pastas num Shared Drive: `Entrada`, `Aprovados/<segmento>`, `Rejeitados`.
- Um processo copia só `Aprovados` para o R2, com `rclone copy` (nunca `sync`), e registra no catálogo.
- Fonte da verdade: o painel do sistema. Shared Drive comporta 500 mil itens.
- Requer Workspace Business Standard (R$ 81,80 por usuário, mais impostos), projeto no Google Cloud, conta de serviço como Leitor e chave JSON no cofre.
- Imagem de cliente: envio direto ao R2 pelo painel, em caminho por conta. Importar do Drive do cliente só pelo Google Picker.

## Evitar

Scrapers de terceiros, foto de marketplace sem autorização, Google Custom Search (fechada a novos clientes) e Bing Search (aposentada), coleta de certificado de clientes para consultar a SEFAZ.

## Fontes principais

- Open Food Facts: https://world.openfoodfacts.org/data
- Cosmos: https://cosmos.bluesoft.com.br/api-pricings
- GS1 Brasil: https://www.gs1br.org/consulta-gtin e https://apicnp.gs1br.org/api-portal/content/condi%C3%A7%C3%B5es-de-consulta
- Lei 9.610: https://www.planalto.gov.br/ccivil_03/leis/l9610.htm
- Lei 9.279: https://www.planalto.gov.br/ccivil_03/leis/l9279.htm
- Drive: https://support.google.com/docs/answer/148505 e https://developers.google.com/workspace/drive/api/guides/limits
- R2: https://developers.cloudflare.com/r2/buckets/public-buckets/ e https://developers.cloudflare.com/r2/pricing/
- Cloudflare Images: https://developers.cloudflare.com/images/pricing/index.md
- rclone: https://rclone.org/drive/
- GPC: https://gpc-browser.gs1.org/
