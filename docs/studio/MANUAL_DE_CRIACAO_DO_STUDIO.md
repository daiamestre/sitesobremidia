# Manual de criação do SOBRE MÍDIA Studio: imagem, vídeo e áudio

> **Ordem do dono (24/11/2026, muito bravo):** "não tem nada escrito como devem ser as edições das imagens e vídeos? Adicione
> todos os detalhes de criação do Studio, da edição de áudio e de vídeos". Toda conversa ou IA que for CRIAR, EDITAR ou
> MOSTRAR uma arte, um vídeo ou um áudio do Studio lê este arquivo ANTES. O que está aqui é regra do dono: não se pergunta de novo.
> Detalhes de cada tema estão nos manuais citados. Histórico técnico: `docs/engineering/FINDINGS_LEDGER.md` (grep F-NNN).

---

## 0. As regras de ouro (quebrar qualquer uma = o dono reprova na hora)

1. **Produto NUNCA tem fundo.** Nem branco, nem cinza, nem quadrado em volta, em nenhum lugar: arte final, vídeo, prévia,
   capa, miniatura da lista, galeria. Detalhes na seção 2. Foi a bronca de 20/11 (F-351) e de 24/11 (F-359).
2. **Nunca desenhar "na unha" uma prévia, maquete ou exemplo** (Photoshop, sharp, canvas solto, HTML inventado). Toda imagem
   mostrada ao dono sai do **desenhista real** do sistema: `palcoDoProduto` / encarte oficial → `prepararDocumento` →
   `desenharDocumento` (`src/lib/studio/desenhar.ts`). Foi assim que, em 24/11, uma conversa mostrou um balão inventado e um
   produto com fundo: o dono reprovou com raiva.
3. **Balão de preço e botão:** texto e valor sempre CENTRALIZADOS; balão só por `ESTILOS_DE_BALAO` (`src/lib/studio/palco.ts`)
   e `seloDoPreco`/`balaoDePreco`. Nunca posicionar texto de preço à mão (seção 3).
4. **Tudo editável ao toque:** produto, nome, balão, botão, logo, faixa e fundo. Mover, aumentar, girar, trocar, texto, fonte,
   cor e movimento (repete 2 vezes). Base: `components/studio/editor` (Palco + Paineis), com a edição na LATERAL DIREITA (seção 4).
5. **Logo nunca gravada no fundo:** é sempre camada trocável (pasta Logos). As logos do dono entram IGUAIS à original
   (`docs/studio/LOGOS_E_FUNDOS_DO_DONO.md`).
6. **Modelo existente não se redesenha sem pedido.** Desenho novo é um modelo A MAIS, com id novo (`<seg>-em-oferta-<estilo>`).
7. **Foto do produto certo:** a oficial da marca, a da loja parceira ou o pedido de foto. Nunca foto aleatória e nunca IA em
   produto embalado (`docs/studio/PROCURA_DE_PRODUTOS.md`).
8. **Vídeo no padrão do dono:** 4 etapas, a logo cai e bate, sem fogo no fundo e no preço, o mesmo som de impacto (seção 6).
9. **ElevenLabs: proibido gastar créditos** sem ordem do dono naquele pedido. Trilhas e efeitos só gratuitos com licença (seção 7).
10. **Voz gravada é tratada ANTES** de clonar ou converter: limpar e encurtar pausas longas, sem acelerar e sem cortar palavra (seção 7).
11. **Fluido no tablet simples (M10):** toda animação passa pelo regente; as capas são vídeos gravados (seção 8).
12. **Testar ANTES de responder**, no navegador e ampliado, e mandar o ANTES e DEPOIS. Dizer o que não deu para testar.
13. **Checar o que o sistema JÁ TEM e PERGUNTAR antes de agir** (dono, 24/11/2026, muito bravo). Todo pedido começa olhando o que existe (catálogo, produtos já recortados em `../marcas-v3/*/pronto|oficial`, fundos, logos, código real, manuais), sem nunca recriar em paralelo. Antes de criar, trocar ou publicar, perguntar o rumo e esperar o "pode". A autorização total vale para não travar em licença técnica, NÃO para decidir o rumo sozinho.
14. **Conferir e corrigir ANTES de entregar** (24–25/11): olhar a arte ampliada e corrigir qualquer erro visível antes de mostrar. Ao mover um elemento, conferir que ele não empurrou outro para o lugar errado.
    **O NOME do produto fica SEMPRE ACIMA do produto, nunca por cima**, a uma distância MÉDIA (F-362, 25/11: "muito perto não"; 40% da altura do nome, de 30 a 72 px), e ACOMPANHA o topo real da foto: produto menor = nome mais baixo, colado no topo. FEITO (F-361, 25/11): `nomeAcimaDoProduto` (`desenhar.ts`, chamado por `prepararDocumento`) põe o nome colado no topo REAL da foto (sem a margem transparente): produto baixo → o nome desce; produto alto/aumentado → o nome sobe até o fim da logo (logo visível, logo pintada no fundo ou em peças) e, se não couber, diminui até 60%. O nome nunca encosta no balão da mesma linha. Deitado, com o nome ao lado, não muda. O palco marca o nome (`acimaDoProduto`, em `comAjustes`); nome arrastado à mão pelo cliente não é mexido. Teste: `nomeAcimaDoProduto361.test.ts`.
15. **Produto no TAMANHO PADRÃO** (dono, 25/11/2026, F-362): todo produto, no palco e nos encartes, tem a mesma área visível dentro da sua caixa, medida pelo DESENHO da foto (sem a margem transparente), nunca passando da caixa e com o pé no tampo. Foto pequena ou grande, produto largo (bolo), alto (garrafa) ou quadrado: todos no tamanho de um produto normal. A conta fica em `geometriaDaImagem` (`desenhar.ts`, `AREA_PADRAO_DO_PRODUTO` = 0,42 da caixa); o zoom do cliente continua valendo por cima. Teste: `nomeAcimaDoProduto361.test.ts`.

---

## 1. Como trabalhar num pedido de criação (passo a passo)

1. Ler a linha do assunto em `docs/MAPA_DO_PROJETO.md` e a seção deste manual.
2. Achar o código REAL que faz aquilo. Nunca recriar em paralelo. Pontos de entrada:
   - palco (1 produto por vez, carrossel, vídeo): `src/lib/studio/palco.ts` → `palcoDoProduto(produto, formato, { fundo })`;
   - encarte oficial (grade de produtos): `src/lib/studio/encartesOficiais.ts`;
   - desenho de qualquer documento: `src/lib/studio/desenhar.ts` (`prepararDocumento` + `desenharDocumento`);
   - documento e camadas: `src/lib/studio/documento.ts` (`TAMANHO_DOC`, tipos `imagem`, `texto`, `selo`, `forma`, `vaga`, `redes`, `efeito`);
   - vídeo: `src/lib/studio/video/` (motor, linha, edição) e `src/lib/studio/impacto.ts`, `efeitosDeImpacto.ts`, `efeitosReais.ts`;
   - áudio: `src/lib/studio/audio/` e `components/studio/audio/EditorDeAudio.tsx`.
3. Prévia para o dono = rodar o código real no navegador (servidor `vite-dev` de `.claude/launch.json`):
   ```js
   const P = await import('/src/lib/studio/palco.ts'); const D = await import('/src/lib/studio/desenhar.ts');
   const doc = P.palcoDoProduto(produto, '9:16', { fundo: P.FUNDOS_DO_PALCO.find(f => f.id === '<id>') });
   const imgs = await D.prepararDocumento(doc); const c = document.createElement('canvas');
   // tamanho real em TAMANHO_DOC (documento.ts); depois D.desenharDocumento(c.getContext('2d'), doc, imgs)
   ```
   O produto vem do catálogo (`tabloide_catalogo`, campo `imagem_url`), e o recorte acontece sozinho.
4. Conferir AMPLIADO: produto sem fundo, balão centralizado, nada cortado, texto dentro das faixas, logo inteira.
5. Rodar os testes da seção 10, fazer o commit e publicar (`node scripts/ops/publicar-main.mjs`, grátis, 12 por dia).
6. Responder em pt-BR com tabela e imagem do antes e depois.

---

## 2. Produto: foto e fundo

**Regra:** produto entra SEM FUNDO e INTEIRO em TODA tela.

| Onde aparece | Como o sistema garante |
|---|---|
| Arte, prévia, capa, palco, encarte, vídeo exportado | `prepararDocumento` → toda camada chamada "Produto"/"Produto N" passa por `carregarImagemDoProduto`. Se a borda for opaca, o fundo sai no aparelho (`produtoSemFundo` → `semFundoNoNavegador` + `finalizarRecorte`, a mesma inspeção da nuvem; o resultado fica guardado no Cache Storage) |
| Miniaturas nas telas de criação (lista do Palco, Produtos com Fotos, Galeria de Produtos) | componente `src/components/studio/FotoDoProduto.tsx`, que usa o MESMO recorte. Nunca `<img src={produto.url}>` direto. Nunca caixinha `bg-white` atrás do produto |
| Capas das pastas (vídeos gravados) | gravadas com o desenhista real. Depois de qualquer mudança: `node scripts/studio/gravar-capas.mjs --so=<ids>` |

- **Por que ainda aparecia fundo branco (24/11, F-359):** no catálogo, as fotos ficam com `recortada=true`, mas muitas apontam
  para o PNG/JPG da marca SEM o pedido `s=1` no link do passa-foto. Antes, a arte só recortava quando o link tinha `s=1`. Agora
  toda camada de produto é conferida. As capas tinham sido gravadas em 12/11, antes do recorte no aparelho, e foram regravadas.
- **Fundo que não é liso** (foto de loja com cenário) não sai no recorte do aparelho. A inspeção reprova e o produto fica com a
  foto original: tem de virar pedido de foto ou receber recorte definitivo (`scripts/ops/refazer-recortes-catalogo.mjs`).
- Foto CERTA (tipo, marca, medida, tradicional), ordem das fontes e qualidade: `docs/studio/PROCURA_DE_PRODUTOS.md` e
  `docs/studio/ENCARTES_E_FOTOS_DE_PRODUTO.md`. Teste da busca: `buscaProdutoCerto282.test.ts`.
- Produto embalado nunca recebe imagem de IA nem foto de banco de imagens. Hortifrúti sem marca: só a foto conferida (`hortifruti.ts`).
- Farmácia: só remédio isento de prescrição e sempre o aviso "A PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO"
  (`AVISO_DE_REMEDIO`). Adega: "BEBA COM MODERAÇÃO. VENDA PROIBIDA PARA MENORES DE 18 ANOS".

---

## 3. Balões de preço e botões

- Balão = camada `selo` (UM objeto: move e gira junto). O estilo vem de `ESTILOS_DE_BALAO` (`palco.ts`, linha ~320):
  `seloDoPreco(produto, x, y, d, estilo)`. O desenho fica em `balaoDePreco`, e o arranjo em `src/lib/studio/balao.ts` (`arranjoDoBalao`).
- Conteúdo: "DE x POR" em vermelho / "POR APENAS" em verde em cima, depois **R$ + valor + centavos centralizados** no meio e a
  unidade embaixo. Valor branco ou com contorno para ler no amarelo. Sem sombra borrada no texto. Tamanho NORMAL, proporcional ao produto.
- O balão realista amarelo pulsa na lateral do produto. Variações: estrela "OFERTA!!!" (preço num oval) e o estilo de cada encarte.
- Botão = texto com `fundo.cheio` (OFERTAS / IMPERDÍVEL…), centralizado. Texto longo ("BLACK FRIDAY") falhou no botão padrão, por isso o padrão é OFERTAS.
- Referência nova de balão do dono = estilo NOVO em `ESTILOS_DE_BALAO`, nunca um desenho solto.
- Teste obrigatório: `src/tests/unit/regraBaloesCentralizados.test.ts`. Olhar o balão AMPLIADO na imagem final.

---

## 4. Edição (encarte, palco, modelo)

- Edição na LATERAL DIREITA, também no tablet em pé (a partir de 540 px). Tocar num elemento abre a edição dele.
- Tudo é trocável, inclusive o FUNDO (outro da galeria, imagem do aparelho ou cor, com movimento): `editor/PainelDoFundo.tsx`.
- Trocar produto: lista, galeria ou IA (IA só para fresco ou preparado). A foto escolhida fica no catálogo.
- Trocar logo: pasta Logos. A logo criada por nós é 100% editável (textos, ícones, círculo).
- "SUA LOGO AQUI" = camada `vaga` (botão que abre Logos). Redes sociais = camada `redes`. Nada gravado no fundo.
- Cada segmento é UMA pasta (`/studio/pasta/ofertas-<seg>`) com "Encartes" e "Palco de Ofertas". Primeiro vem a escolha do
  modelo e depois a edição. Cada modelo tem "Passo a passo" e "Editar direto", e os dois levam à mesma edição. Edição limpa: sem dicas e sem galeria dentro.
- O que é do mercado nunca aparece na edição de outro segmento. Flash, luz e brilho sempre na cor do documento.
- Encarte: o cliente escolhe quantos produtos (padrão 16, até 20). A grade fica sempre completa, e o encarte sai em todos os tamanhos sem deformar.
- Teste: `studioEdicaoCompleta249.test.ts`. Conferir em 430 px e 390 px de largura (`scrollWidth > clientWidth` = falha).
- Composição detalhada de encarte e palco e as receitas de fundo e segmento novo: `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md`.
- Logos e fundos que o dono manda: `docs/studio/LOGOS_E_FUNDOS_DO_DONO.md` (logo igual à original; faixa em branco e "your…"
  viram texto editável centralizado; mesma frase em outra cor entra separada; cor nunca "lota").

---

## 5. Palco de Ofertas (um produto por vez)

- Fundos oficiais = artes do dono (`public/studio/palco/<id>-{v,h}.webp` + `FUNDOS_DO_PALCO` com as caixas medidas). Fundo novo
  do dono é ADICIONADO como oficial; não se cria outro palco.
- O produto fica inteiro, com o pé no tampo do palco. O nome fica em branco: em pé, por cima do produto; deitado, colado ao lado, com o balão do outro lado.
- 8 s por produto. A pessoa escolhe o lado da entrada e da troca. Nome + marca + medida + preço obrigatórios (perguntar se é promoção).
- Vira carrossel e vídeo pela mesa de edição: UMA visualização só, a lateral na altura da arte e a linha do tempo inteira embaixo.

---

## 6. Vídeo

**Padrão do dono (F-353, 20/11).** O passo a passo tem 4 etapas e depois "Criar vídeo". NÃO existe etapa de edição do vídeo:
1. logo da promoção e fundo (com balão, começo do vídeo e frases);
2. loja: nome e logo DA EMPRESA (fecha o vídeo; nunca a logo da promoção);
3. produtos;
4. locutor e música, na mesma etapa.

O vídeo sai pronto, e depois o cliente muda qualquer coisa (efeitos, sons, produtos, fundo, posição das logos e balões).

- **Abertura:** a logo da promoção (ou a do cliente) CAI e BATE no fundo, sempre com o MESMO som de impacto.
- **Proibido:** fogo no fundo e nos preços (`FOGO_PROIBIDO` em `desenhar.ts`). O fogo na logo fica desligado por padrão.
- **Opcionais:** som de dinheiro a cada troca de produto (ligado por padrão) e frases do início e do fim em letra 3D.
- **Efeitos:** efeito novo é OPÇÃO do padrão (liga/desliga no `PainelDeImpacto`), desenhado em `desenharDocumento`, nunca uma etapa nova.
  Efeitos reais (filmagens) em `public/studio/efeitos/`: H.264 sem quadros B; se o arquivo mudar, subir `VERSAO` em `efeitosReais.ts`.
- **Trilhas:** só gratuitas com licença (Pixabay, em `public/studio/trilhas`, −14 LUFS; licença em `docs/licencas/TRILHAS_PIXABAY.md`).
  A trilha abaixa para 30% sob a voz. Nunca usar músicas do concorrente.
- **Exportação:** MP4 no navegador. Muitos tablets só gravam H.264 deitado: `escolherCodificacao` tenta outros perfis e cai para WebM.
- **iPhone:** todo `<video>` desenhado com mistura passa pela "ponte" de canvas (fundo preto no Safari, F-350). Antes de dizer
  "testado": `node scripts/ops/testar-fundo-do-video.mjs` e também com `SIMULAR_IPHONE=1`.
- **Locução:** 6 vozes ElevenLabs (inclusive a voz do dono por conversão). Roteiro: abertura + "{produto}, por apenas {preço}" + fechamento.
- **Concorrente de referência** (vídeo com IA): `docs/ANALISE_DE_CONCORRENTES.md`, `docs/CATALOGO_IMPACTO_CONCORRENTE.md`,
  `docs/SONS_DO_CONCORRENTE.md`. Copiar o FUNCIONAMENTO, nunca a arte, a música ou a voz deles.
- Testes: `padraoDeVideo353`, `blindagemFundoDoVideo350`, `videoSemCenaVazia352`, `produtoSemFundo351` (todos na trava do `publicar-main`).

---

## 7. Áudio (Editor de Áudio e vozes)

- `/studio/editor-de-audio`, SÓ owner/ADM. Tudo roda no navegador: MP3 pelo lamejs, projeto no IndexedDB, microfone liberado em `vercel.json`.
- Botões SEMPRE com NOME escrito (o dono não reconhece ícone sozinho): Voltar/Avançar, "Cortes" com Tesoura, "Enviar áudio do
  aparelho", "Baixar áudio editado", "Salvar", "Pasta de Áudios". Quando ele fala "cordões", quer dizer "cortes".
- Celular (até 767 px): doca fixa embaixo e folhas que sobem. Regras FIXAS de toque:
  - tocar no clipe escolhe e mostra a linha amarela;
  - passar o dedo ROLA; segurar e arrastar move;
  - puxar a borda apara;
  - tocar fora desmarca;
  - "Marcar trecho" / "Desmarcar".
- Arquivo baixado leva a marca verdadeira "Editado no SOBRE MÍDIA Studio". NUNCA "camuflar" áudio de terceiros nem chamá-lo de original (recusado em 18/11).
- **Antes de publicar qualquer mudança no editor:** `node scripts/ops/testar-editor-audio.mjs` (18 passos no celular). Se falhar, não publica.
- **Voz do dono:** tratar ANTES de clonar ou converter. Limpar barulho, estalos e respiro, e encurtar só as pausas longas
  (0,30/0,20/0,18 s). NUNCA acelerar e NUNCA cortar palavra (F-348). Fora do editor: `scripts/studio/tratar-voz.mjs`. No
  editor: botão "Clonar voz" (`src/lib/studio/audio/clonarVoz.ts`).
- **ElevenLabs:** proibido gastar créditos para criar material do sistema sem ordem do dono naquele pedido. Consultar o saldo não gasta.

---

## 8. Capas, prévias e desempenho

- Capas das pastas e da escolha de modelo = VÍDEOS GRAVADOS (`public/studio/capas/<id>.mp4` + `.jpg`, índice
  `src/lib/studio/capasEmVideo.json`). Modelo, fundo, balão ou produto mudou → `node scripts/studio/gravar-capas.mjs --so=<id>`
  (ou todas as existentes). Nunca voltar a desenhar capa ao vivo. As capas giram e passam todas as mídias da pasta, 8 s cada.
- Toda animação em canvas usa o regente (`src/lib/studio/regente.ts`, `registrarAnimacao`). Nada de `backdrop-blur` sobre arte animada.
  O modo leve é automático no aparelho fraco.
- Prévia de widget do painel = a tela do Player, só que menor (`cqmin`; teste `widgetProporcao`).

---

## 9. Erros que já aconteceram e não podem voltar

| Erro | Data | Certo |
|---|---|---|
| Maquete feita à mão: balão inventado e produto com fundo, mostrada ao dono | 24/11 | Só o desenhista real (regra 2) |
| Produto com fundo branco nas capas (Whisky, Caixa de som, Bolo) | 24/11 | F-359 + regravar capas |
| Link do catálogo sem `s=1` passava sem recorte | 24/11 | Toda camada "Produto" é conferida |
| Redesenhar os modelos de todos os segmentos sem pedido | 10/11 | Modelo novo = id novo, os antigos ficam |
| Logo recortada por IA / "melhorada" | 20/11 | Logo igual à original, byte a byte |
| Arroz recebendo feijão, leite em pó para "leite 1L", Uva virando Fanta | 07–09/11 | `buscaProduto.ts` e hortifrúti conferido |
| Fogo no fundo e no preço | 20/11 | `FOGO_PROIBIDO` |
| Fundo PRETO no iPhone | 20/11 | Ponte de canvas e teste com `SIMULAR_IPHONE=1` |
| Voz acelerada ×1,5 e cortada colada | 19/11 | Só encurtar pausas longas |
| 6.100 créditos ElevenLabs gastos em trilhas sem pedir | 16/11 | Proibido; só material gratuito |
| Tablet M10 travando com 22 prévias animadas | 11/11 | Regente + capas em vídeo |
| Edição com galeria de modelos e dicas ocupando a tela | 11/11 | Edição limpa, lateral direita |

---

## 10. Testes e comandos antes de entregar

- `npx vitest run src/tests/unit/studio src/tests/unit/regra src/tests/unit/produtoSemFundo351.test.ts src/tests/unit/padraoDeVideo353.test.ts`
- `node scripts/ops/testar-fundo-do-video.mjs` (e `SIMULAR_IPHONE=1`): para mudanças em vídeo.
- `node scripts/ops/testar-editor-audio.mjs`: para mudanças no Editor de Áudio.
- `node scripts/studio/gravar-capas.mjs --so=<ids>`: depois de mudar modelo, fundo, balão ou produto de capa.
- Navegador: skill `conferir-painel` (conta de teste `e2e-owner@sobremidia.com.br`, sem senha), em 1440, 430 e 390 px.
- Publicar: `node scripts/ops/publicar-main.mjs` (roda `TESTES_DO_VIDEO` sozinho quando mexe no Studio).

## 11. Onde está cada coisa (resumo)

| Assunto | Arquivo |
|---|---|
| Palco, fundos oficiais, balões | `src/lib/studio/palco.ts` (`FUNDOS_DO_PALCO`, `ESTILOS_DE_BALAO`, `palcoDoProduto`, `seloDoPreco`) |
| Encartes oficiais | `src/lib/studio/encartesOficiais.ts`, `public/studio/encartes-oficiais/`, `scripts/studio/adaptar-encartes.mjs` |
| Segmentos e cestas de exemplo | `src/lib/studio/segmentosDeOferta.ts`, `src/lib/tabloide/encartes.ts` (`CESTA_*`) |
| Desenho de tudo + produto sem fundo | `src/lib/studio/desenhar.ts` (`prepararDocumento`, `carregarImagemDoProduto`, `desenharDocumento`) |
| Miniatura de produto nas telas | `src/components/studio/FotoDoProduto.tsx` |
| Editor (lateral, painéis) | `src/components/studio/editor/` |
| Vídeo, efeitos, impacto | `src/lib/studio/video/`, `impacto.ts`, `efeitosDeImpacto.ts`, `efeitosReais.ts`, `logo3d.ts` |
| Áudio | `src/lib/studio/audio/`, `src/components/studio/audio/EditorDeAudio.tsx` |
| Logos de promoção | `src/lib/studio/logosDePromocao.ts`, `logoPersonalizada.ts`, `pastasDeLogos.ts` |
| Capas | `scripts/studio/gravar-capas.mjs`, `public/studio/capas/`, `capasEmVideo.json` |
| Fotos do catálogo | `tabloide_catalogo`, `src/lib/tabloide/imagens.ts`, `fotoPorLink.ts`, `recorte.ts` |
