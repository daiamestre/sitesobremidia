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


---

# Como o concorrente cria os vídeos (16/11/2026)

Pedido do dono: entender como os vídeos do concorrente são criados, com quais ferramentas, e como trazer isso para o SOBRE MÍDIA.

**Fonte:** os arquivos públicos do app "Vídeo de Ofertas IA" (64 arquivos JavaScript da página, sem login). O app mudou desde 11/11: saiu de Lovable para TanStack Start e trocou a gravação pelo Remotion por um motor próprio.

**Regra:** usar só a ideia e a técnica. As artes, os selos, os textos e as músicas deles nunca são copiados.

## 1. As ferramentas que eles usam

| Parte | Ferramenta | Para quê |
|---|---|---|
| Desenho das cenas | **Konva** (canvas 2D) | Cada cena é um "palco" com camadas: fundo, produto, nome, etiqueta, preço, logo, selo, rodapé |
| Prévia no editor | **Remotion Player** (só a prévia) | Mostra o vídeo tocando; tocar no vídeo pausa para editar |
| Montar o MP4 | **Mediabunny** + WebCodecs | Grava quadro a quadro em H.264 + AAC dentro do navegador |
| Som em AAC em qualquer aparelho | **Codificador AAC em WebAssembly** (do Mediabunny) | Aparelho sem AAC continua gerando MP4; sem ele, usa Opus |
| Voz | **ElevenLabs** (`eleven_v4_turbo` e `eleven_multilingual_v2`) | Locutor masculino e feminino brasileiros + "locutor convidado" |
| Tirar o fundo de selos e fotos | **@imgly/background-removal** (modelo ISNet em ONNX, roda no aparelho) | "Remover fundo com IA" sem servidor |
| Áudio para carro de som | **lamejs** (MP3 no navegador) | Exporta só a locução + música em MP3 ("Locução para carro de som e porta de loja") |
| Fotos e conferência | Serper, Brave e Gemini | Busca de foto e conferência com IA (já visto em 11/11) |
| Biblioteca | Supabase Storage (`promotional-seals`, `video-backgrounds`) | Selos 3D e fundos, com busca por sinônimos e erros de digitação |

## 2. Como um vídeo é montado (a receita)

**Roteiro em cenas** (`buildTimeline`): abertura → até 8 ofertas → fechamento.
- Sem voz, cada oferta dura 3,2 s, e a abertura e o fechamento 2,8 s.
- Com voz, cada oferta dura 0,55 s + a fala + 0,7 s. O silêncio do começo e do fim do áudio é cortado antes (`voiceTrim`).

**Animações de cada oferta** (todas calculadas por fórmula, quadro a quadro):
1. **Produto:** entra de lado com **mola** (amortecimento 0,6), alternando esquerda e direita a cada oferta, e cresce de 72% para 100%. Sai deslizando nos últimos 0,4 s.
2. **Nome do produto:** desce 40 px e aparece entre 0,15 s e 0,55 s.
3. **Etiqueta, preço, unidade e "R$":** "estouram" com **passar do ponto e voltar** (curva *back*) entre 0,35 s e 0,8 s. O preço ganha um **soco extra de 18%** em 0,62 s e depois fica "respirando" (±2,5%).
4. **Estrela atrás do preço:** estrela amarela de 16 pontas com borda vermelha, que gira e estoura junto com o preço.
5. **Faíscas:** 16 partículas amarelas e brancas saem do preço em 0,55 s e somem em 0,85 s.
6. **Brilho que passa no preço:** uma faixa de luz atravessa a etiqueta entre 0,85 s e 1,6 s.
7. **Logo e selo** (na 1ª oferta): a logo entra da direita e o selo cresce de 30% com passar do ponto. Depois o selo pulsa (±3%).
8. **Selo da abertura:** começa em 220% e assenta com mola.
9. **Frases da abertura e do fechamento:** letra Impact/Anton branca com borda vermelha, em maiúsculas, que estoura.

**Efeitos do vídeo inteiro** (o cliente liga e desliga):
- **Troca de cena em faixa diagonal:** uma faixa vermelha com bordas amarelas, inclinada 14°, varre a tela no começo de cada cena.
- **"Câmera na mão":** o fundo balança de leve (±22 px, 0,55°, zoom de 1,2%) enquanto produto e preço ficam firmes.
- **Brasas:** 22 a 34 pontinhos laranja e amarelos sobem pelo fundo.
- **Sombra do produto:** desfoque 34, deslocamento 22 px e 50% de opacidade, guardada pronta para não pesar.

**Som** (`mixAudio`, mistura fora do tempo real, 44,1 kHz):
- **A música abaixa sozinha para 30%** quando há locução; sem locução fica em 90%. Some devagar no último 1,2 s.
- **"Whoosh"** sintetizado (ruído filtrado de 0,5 s) 0,12 s antes de cada troca de cena.
- **Limitador** no fim (compressor: −2 dB, razão 20) para o som nunca estourar.
- **Falas com entrada e saída de 6 ms**, para não estalar.

**Gravação** (`exportMp4`):
- **720p por padrão.** O Full HD só existe com uma chave escondida (`vo-render-fullhd`). Taxa de 3 Mbps (5,6 Mbps no Full HD), quadro-chave a cada 2 s.
- **No computador**, divide o vídeo em 2 partes e grava as duas ao mesmo tempo, com 2 codificadores (GPU ou CPU). Antes testa o chip com um quadro de prova. Se der erro, usa o motor simples.
- **No celular e tablet**, usa sempre o motor simples, com "prefer-hardware" quando o aparelho aceita.
- **O vídeo pronto fica disponível para baixar por 48 h.** O limite é de 8 produtos por vídeo, com cota diária de vídeos.

**O fluxo do cliente** (5 etapas):
1. Tema/modelo: selo 3D da abertura + fundo.
2. Loja: logo PNG, com "remover fundo".
3. Ofertas: até 8, com foto, nome, preço e unidade.
4. Locução e música: voz, roteiro editável e volume da música.
5. Exportar: MP4, ou MP3 para carro de som.

Há também um **editor de posição**: arrastar e redimensionar cada elemento, alinhar e centralizar.

## 3. O 2º concorrente de vídeo: "Adega Vídeo Promo"

Ele não tem gerador. Vende **mais de 150 vídeos prontos para editar no Canva** (adega, tabacaria, Black Friday): a pessoa troca texto, preço e logo no Canva, baixa e coloca no pendrive ou na Smart TV. O argumento é "sem precisar saber editar vídeo". Nós já fazemos tudo dentro do sistema e publicamos direto na TV.

## 4. Onde estamos à frente e o que falta

**Já temos e eles não:**
- Editor com linha do tempo.
- Movimento por elemento (entrada, 2 movimentos e saída).
- Troca de fundo.
- Full HD, 60 quadros/s e 4K.
- Publicação direta nas TVs do Player.
- Passo a passo em 4 etapas.
- Código de barras.
- Acervo.
- 9 segmentos.
- Exportação que se adapta ao aparelho (F-315).

**Falta, comparando efeito por efeito:**

| # | Recurso deles | Nós hoje | Como trazer (onde mexer) | Custo |
|---|---|---|---|---|
| 1 | Música abaixa sozinha com a locução + limitador | Não abaixa | `mixarOffline` em `video/motor.ts` e a prévia: ganho da música a 30% enquanto há fala, `DynamicsCompressor` no fim | Grátis |
| 2 | "Whoosh" em cada troca de produto | Não tem | Ruído filtrado sintetizado (sem arquivo e sem licença), no `mixarOffline` e na prévia, com liga/desliga | Grátis |
| 3 | Preço que "estoura" (passar do ponto + soco + respirar) | Temos `quicar`/`pulsar`, sem o soco | Entrada nova `estourar` em `animacao.ts` (curva *back* + pico) como padrão do preço no palco | Grátis |
| 4 | Estrela + faíscas + brilho atrás do preço | Não tem | Camadas de efeito do palco (`palco.ts`) desenhadas pelo regente, na cor do encarte (regra F-296) | Grátis |
| 5 | Produto entra com mola, alternando lados | Entradas fixas | Movimento `mola-alternada` para o Produto (um objeto só, regra F-249) | Grátis |
| 6 | Troca de cena em faixa diagonal | Temos flash, luz, brilho, girar, desfocar… | Transição nova `faixa` em `TRANSICOES_DO_CARROSSEL`, nas cores do modelo | Grátis |
| 7 | "Câmera na mão" + brasas no fundo | Fundo com 4 movimentos (F-308) | `fundo-camera` e partículas `brasas` em `MOVIMENTOS_DO_FUNDO`, liga/desliga | Grátis |
| 8 | Cortar o silêncio da fala | Não corta | Aparar o começo e o fim do áudio em `locucao.ts` antes de medir a duração (o vídeo fica mais ágil) | Grátis |
| 9 | AAC em qualquer aparelho (WebAssembly) | Sem AAC, cai para WebM (F-315) | Adotar o **Mediabunny** com o codificador AAC em WebAssembly no lugar do `mp4-muxer`; o tablet sem AAC continua em MP4 | Grátis (licença MPL-2.0) |
| 10 | Gravação 2× mais rápida no PC (2 partes em paralelo) | Uma parte só | Duas telas e dois codificadores, juntando as partes (como o deles, com o teste de quadro de prova) | Grátis |
| 11 | MP3 da locução para carro de som | Não tem | Exportar só o áudio (locução + música) com **lamejs**; é um produto novo para vender | Grátis |
| 12 | Remover fundo no próprio aparelho (ISNet) | Já tiramos fundo (Cloudflare/navegador, F-252) | Só se o custo da Cloudflare subir | — |
| 13 | Selos 3D de campanha com busca por sinônimo | Selos por data ainda pendentes (item 8 da lista de 11/11) | Selos **desenhados por nós** + busca por sinônimo e erro de digitação (`açougue` → carne, churrasco…) | Grátis |

**O que NÃO copiar:**
- 720p como padrão: nossas telas são TV e painel de LED, e o F-315 já adapta ao aparelho.
- Limite de 8 produtos.
- Vídeo que some em 48 h: o nosso fica em Meus Projetos.

## 5. Ordem sugerida

1. **"Pacote impacto" no palco** (itens 1 a 8): som profissional e animação de preço. É o que mais aparece na TV, e tudo é grátis, sem API nova. Cada efeito nasce **com liga/desliga** e editável ao toque (regras F-249 e F-308). Nenhum modelo existente muda sozinho (regra F-296): os efeitos entram como opção e como padrão só nos modelos novos.
2. **Mediabunny + AAC em WebAssembly + gravação em 2 partes no PC** (itens 9 e 10).
3. **MP3 para carro de som** (item 11) e **selos de campanha nossos com busca** (item 13).


---

# Os "vídeos de impacto" do Instagram do concorrente (16/11/2026)

**Fonte:** os 16 vídeos públicos de @propaganda_de_supermercados, vistos sem login, quadro a quadro.
**Regra:** usar só a estrutura e a técnica. Nada de copiar arte, frase exata, selo ou áudio deles.

## O que são
- **Nenhum dos 16 mostra produto.** São CHAMADAS DE CAMPANHA, todas em pé (9:16), de 26 a 37 s: Fecha Mês, Black Friday ("Antecipa", "Esquenta"), Fim de Semana da Economia, Mega Saldão.
- O texto que aparece na tela é o mesmo que o locutor fala: as frases entram no ritmo da voz.
- Em 3 vídeos aparece o próprio locutor deles, com microfone na mão. É o locutor da produtora, e não um locutor de TV. O estilo é o de "locutor de varejo/carro de som": grave, rápido, com ênfase no fim das frases.
- Eles fazem o vídeo "com sua logo, com seu tema e com o locutor falando o nome da sua loja", ou seja, um modelo pronto em que só trocam a loja.

## A estrutura (a mesma em todos)
| Tempo | Bloco | Como aparece |
|---|---|---|
| 0–3 s | **Gancho** | "ATENÇÃO!", "SE PREPARE!", "O DIA MAIS BARATO DO MÊS ESTÁ CHEGANDO": cena de impacto (multidão, explosão, apresentadora de telejornal, helicóptero) |
| 3–9 s | **Promessa** | 2–3 frases curtas, uma por vez: a última palavra GRANDE, amarela/dourada, em selo 3D |
| ~9 s | **Selo da campanha** | o selo 3D ("FECHA MÊS DE OUTUBRO", "BLACK FRIDAY") chega com clarão e a logo da loja entra embaixo |
| 9–20 s | **Urgência e data** | "SOMENTE NESTE SÁBADO, DIA 31!", "ANOTE NA SUA AGENDA", contagem "3" |
| 20–28 s | **Argumentos** | "PODE RODAR A CIDADE INTEIRA… MAS PREÇO BAIXO É AQUI!", "SE QUISER PAGAR CARO, VAI NA CONCORRÊNCIA", "AQUI NÃO TEM MIMIMI", "É PREÇO NO CHÃO!" |
| últimos 3–4 s | **Assinatura** | o selo da campanha e a logo da loja, parados e brilhando |

## A linguagem visual
- **Cenários escuros:** portas de aço, parede de tijolo, arena com luzes, cidade em chamas, com moldura de fita zebrada amarela e preta.
- **Partículas:** faíscas e brasas subindo, fumaça embaixo, estilhaços e vidro quebrando nas explosões.
- **Letras:** fonte condensada e grossa (tipo Anton/Bebas), branca. A palavra-chave vai em amarelo/dourado com relevo 3D, e as frases quebram em 2 a 4 linhas.
- **Trocas de cena:**
  - palavra GIGANTE atravessando a tela (as letras enchem o quadro e passam);
  - clarão branco ou amarelo;
  - nuvem de fumaça;
  - faixa vermelha ou amarela.
- **Ritmo:** uma frase a cada 1,5–2,5 s, e uma troca forte a cada 2 ou 3 frases.

## Como fica no SOBRE MÍDIA (proposta: "Chamada de Impacto", P-35)
1. **A pessoa escolhe** a campanha (Fecha Mês, Black Friday, Fim de Semana, Saldão, Aniversário, Inauguração ou outra), a data ("somente sábado, dia 31") e a loja (nome e logo).
2. **O sistema monta sozinho** o roteiro de 8 a 12 frases nos 6 blocos acima, a partir de um banco de frases NOSSO por campanha, e cada frase vira uma cena com:
   - letra condensada;
   - palavra-chave dourada;
   - entrada que estoura;
   - troca forte a cada 2 frases (palavra gigante, clarão, fumaça).
3. **Cenários nossos** (portas, arena, tijolo, cidade), com as partículas que já temos (F-316: brasas, estrelas, câmera na mão) e a trilha gratuita.
4. **Locutor:** cada frase vira uma fala no estilo varejo, e a cena dura o tempo da fala (como no F-300). Mesma voz em todo o vídeo.
5. **Opcional:** de 1 a 8 produtos com preço depois dos argumentos, usando o palco de ofertas que já existe.
6. **Tudo editável depois de criado:** cada frase, a ordem, a cor, a fonte, os movimentos, o cenário, a trilha e os efeitos.

**O locutor:** não dá para usar a voz de um locutor conhecido sem a autorização dele. O estilo se consegue com:
- uma voz de varejo da biblioteca da ElevenLabs, liberada pelo dono da voz; ou
- um locutor contratado que autorize a clonagem.

Além disso, o roteiro no estilo deles ("SÓ ESSA SEMANA!", "PREÇO BAIXO É AQUI!") entra no agente locutor, sem custo.
