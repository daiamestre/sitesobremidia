# Encartes de mercado no Studio e fotos reais de produto (F-231)

Data: 31/10/2026.

## 1. Encartes de mercado

O Studio tem a seção **"Encartes de mercado"** no início, com 12 modelos:

- Quinzena da Economia, Dia do Comerciante, Semana do Consumidor, Promoção de Inverno;
- Aniversário do Mercado, Feirão de Ofertas, Black Friday, Natal, Arraiá, Páscoa;
- Festival da Carne (açougue) e Quarta Verde (hortifruti).

**Estrutura de cada encarte** (igual à dos encartes de referência que o dono mandou):
- folha **A4 em pé**;
- **faixa de tema no topo**, com o **título 3D** desenhado pelo sistema e a caixa **"Sua logo aqui"** (some quando a loja envia a logo);
- **3 produtos grandes com "de/por"**;
- grade **4 × 3**, totalizando 15 produtos;
- rodapé com a validade e "Imagens meramente ilustrativas".

A arte é **própria da SOBRE MÍDIA**: nada das artes, temas ou textos da QR Ofertas foi copiado (regra do dono de 09/10/2026).

**Como se edita:** "Editar encarte" abre `/studio/encarte/<id>`. Ali está o **mesmo editor do Cartaz Digital**, já montado com o modelo, com todas as opções:
- **Produtos:** trocar nome e preço, "de/por", unidade, foto;
- **Temas, Datas, Sua Logo, Empresa, Fontes, Postar, Encarte, Portal**;
- **Meus cartazes**: salvar, baixar e imprimir.

O anunciante usa as regras do portal; a equipe, as do painel.

**Arte da faixa** (`scripts/studio/gerar-artes-encartes.mjs`):
1. Os **agentes do Creative Core** planejam cada arte (segmento, direção, prompt e conferência de qualidade). Só segue o plano aprovado.
2. A **IA da Cloudflare** cria a imagem: Lucid Origin em 1536 × 512 e, se ele falhar, FLUX.
3. **Cota acabou** → o encarte segue com a faixa nas cores do tema, desenhada pelo sistema, sem IA. O robô `studio-fotos.yml` tenta de novo a cada 3 h.

Outras IAs de imagem grátis foram testadas em 31/10:
- Gemini: cota de imagem zero na conta grátis;
- Pollinations: imagem fraca, com marca d'água e letras falsas.

Nenhuma das duas serve como reserva.

## 2. Fotos reais do produto: o que mudou

Quando o cliente escreve "Arroz Camil 5kg 25,90", a busca (função `produto-imagem`, regras em `regras.ts`) segue três regras:

- **Medida é regra:**
  - 5 kg nunca vira o pacote de 1 kg;
  - 1 L = 1000 ml;
  - leite 1 L não vira leite em pó 800 g.
- **Marca é regra:** se a palavra digitada é a marca de algum produto achado ("Camil", "Liza", "Heinz"), só ficam os dessa marca.
- **O tipo do produto é regra:** "Óleo de **Soja** Liza" nunca vira "Óleo de Algodão Liza". Se nenhuma embalagem tem todas as palavras, a busca passa para a fonte seguinte em vez de mostrar o produto errado.

Prova real, depois de publicada:

| Digitado | Resultado |
|---|---|
| Arroz Camil 5kg | Arroz Tipo 1 Camil 5kg |
| Feijão Carioca Camil 1kg | Feijão Carioca Tipo 1 Camil 1kg |
| Leite Integral Piracanjuba 1L | Leite UHT Integral Piracanjuba 1L |
| Coca-Cola 2L | Refrigerante Coca-Cola 2L |
| Café Pilão 500g | Café Torrado e Moído Pilão 500g |

O que continua igual:
- a foto achada é recortada e guardada no **catálogo compartilhado da empresa**;
- o cliente troca a foto com um toque, entre as opções achadas.

## 3. Leitor de código de barras: as 3 possibilidades

**Funcionando agora:**
- **Pistola USB ou Bluetooth:** ela "digita" o código e aperta Enter. O campo **"Código de barras"** do Cartaz Digital e dos Encartes recebe o código. Também dá para digitar o código direto na lista ("7894900027013 9,99").
- **Câmera do tablet ou celular:** o botão "Câmera" usa o leitor nativo do navegador (Chrome no Android).
- **Conferência:** o código é conferido pelo dígito verificador.

**Prova:** o código 7891000100103 trouxe **"Leite Condensado Integral Moça Nestlé 395g"** com a foto. Ficou guardado no catálogo pelo código e pelo nome.

| # | Possibilidade | Cobertura | Custo | Situação |
|---|---|---|---|---|
| 1 | **Bases abertas Open Food Facts** (alimentos, beleza, pet e produtos em geral), consultadas pelo código | boa em mercado; parcial em limpeza e higiene | grátis | **NO AR** |
| 2 | **Cosmos (Bluesoft)**: a maior base brasileira de GTIN, com nome, marca, medida, NCM e foto | quase todo produto com código brasileiro | plano pago (a conta da SOBRE MÍDIA tem **0 consultas/dia**; testado em 31/10) | **pronta no código**: basta contratar um plano e pôr o segredo `COSMOS_TOKEN` na função |
| 3 | **Catálogo próprio pelo código** (o que um cliente bipa vale para todos) + **foto pela câmera** quando a base não tem | cresce com o uso; cobre produto regional/sem cadastro | grátis | **guardar pelo código: NO AR**; foto pela câmera do produto sem cadastro: próxima etapa (hoje o cliente usa "Trocar a foto" → enviar) |

**Recomendação:** 1 + 3 já resolvem a maior parte sem custo. A Cosmos (2) fecha os casos difíceis quando houver orçamento.

**Para usar a foto da Cosmos no catálogo** é preciso uma migração: liberar a fonte `COSMOS` na regra de fontes do `tabloide_catalogo`. Até lá a foto dela vale no cartaz, mas não fica guardada.
