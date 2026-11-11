# Análise de concorrentes (11/11/2026)

Pedido do dono: entender a estrutura completa dos concorrentes e trazer para o SOBRE MÍDIA o que nos falta, para sair na
frente. **Regra:** a estrutura e as ideias podem ser aproveitadas; as artes, os temas e os textos deles nunca são copiados.

## 1. "Vídeo de Ofertas IA" (vídeo com locução)
Fonte: os arquivos públicos do site deles (sem login).

**Como funciona:**
- **Plataforma:** feito no Lovable, com Supabase e Cloudflare R2.
- **Vídeo:** montado com o Remotion no navegador, mostrando o aviso "Remotion Unlicensed". 1080×1920, até 8 ofertas.
- **Voz:** ElevenLabs, modelo `eleven_v4_turbo`, com 8 vozes. Só o "Diego" é público; as outras são vozes próprias da conta deles.
- **Roteiro:** abertura + "{produto}, por apenas {preço por extenso}{unidade}!" + fechamento, com frase própria opcional por oferta. Cada áudio é guardado por texto e voz.
- **Música:** 9 faixas fixas (Pixabay e vinhetas "Luan" / "Fecha Mês").
- **Outros:** selos de campanha 3D ("Quinta do Hortifrúti", "Fecha Mês", "Venha Poupar") e opção de tema próprio; logo com remoção de fundo; Gemini para conferir as imagens; Serper e Brave para buscar fotos.

**O que já fizemos e onde estamos à frente:**
- Locutor (F-300) e exportação quadro a quadro em Full HD, 60 qps e 4K (F-301).
- Editor completo com linha do tempo.
- Palco animado.
- Fotos oficiais automáticas.
- Publicação direta nas TVs e painéis do Player.

**O que ainda falta:** biblioteca de trilhas e vinhetas de oferta prontas, e selos de campanha por data dentro do palco.

## 2. QR Ofertas (encartes)
Fontes: as páginas públicas em lp.qrofertas.com.

**O que eles oferecem:**
- Uma lista de produtos gera **todas as artes de uma vez**, em 13 formatos:
  - encarte A4 horizontal, A4 vertical e grande formato;
  - cartaz A4;
  - Reels, Feed e Stories;
  - encarte TV horizontal e vertical;
  - **lista de produtos para TV** horizontal e vertical;
  - vídeos.
- **Temas:** 3 a 7 mil, e "Agenda de Marketing" (datas comemorativas).
- **"QR Gênios":** agentes de IA que corrigem a lista ("se tiver algum errinho, nossos gênios vão corrigir").
- **Portal de Ofertas + WebApp** da loja.
- **Publicação:** em vários canais.
- **Conta:** histórico de criações e ajuste de logo.
- **Planos:** grátis com temas limitados; R$ 108,62/mês no anual; R$ 149,85 no mensal.

**O que nós já temos:**
- Cartaz Digital com lista, foto automática, segmentos e datas, e Portal de Ofertas `/ofertas/:slug` (F-179).
- Encartes oficiais por segmento em 7 tamanhos.
- Palco em vídeo.
- Central de Comando (texto vira encarte).
- Logos 3D.
- Meus Projetos.
- **Publicação nas TVs**, que é o nosso diferencial.

## 3. O que falta no SOBRE MÍDIA, em ordem de prioridade

| # | O que | Por quê |
|---|---|---|
| 1 | **Kit completo:** uma lista gera de uma vez encarte A4, Stories, Feed, TV horizontal/vertical e o vídeo do palco (com locução), e baixa tudo ou manda para a playlist das telas | É o maior argumento de venda deles ("com apenas um trabalho, crie tudo") |
| 2 | **Lista de preços para TV** (tabela, horizontal e vertical, com várias páginas que passam sozinhas) | Formato que eles têm e nós não |
| 3 | **Correção automática da lista por IA** (nomes com erro → nome certo do catálogo, preço e unidade) | O "QR Gênios" deles; nós já temos os agentes e o catálogo |
| 4 | **Encartes e palco do Studio no Portal de Ofertas** + QR Code na arte apontando para o portal da loja | Hoje só o Cartaz Digital publica no portal |
| 5 | **Agenda de Marketing:** calendário de datas (Dia das Mães, Black Friday, Fecha Mês…) que sugere tema, selo e texto da locução | Eles vendem isso no plano pago |
| 6 | **Trilhas e vinhetas de oferta** prontas no editor (Eleven Music / efeitos), com a música abaixando quando o locutor fala | Do concorrente de vídeo |
| 7 | **Cartazes de gôndola A4** (um produto por folha, impressão em lote) | "Cartazeamento" deles |
| 8 | **Selos de campanha por data** no palco ("Quinta do Hortifrúti", "Fecha Mês"…), desenhados por nós | Do concorrente de vídeo |
