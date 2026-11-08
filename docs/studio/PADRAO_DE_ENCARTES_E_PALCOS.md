# Padrão de encartes e palcos do SOBRE MÍDIA Studio

> Referência PERMANENTE para criar, evoluir ou copiar encartes, palcos (carrossel de produtos) e mídias com a mesma composição, formato e qualidade que o dono aprovou (F-240 a F-259).
>
> Vale para qualquer IA ou pessoa que mexa no sistema. A regra curta também está no DNA dos agentes do Studio (`supabase/functions/_shared/studio/core/dna.ts`: `PADRAO_DOS_OFICIAIS`, `REFERENCIA_MERCADO`, `REFERENCIA_FARMACIA`).

## 1. O que existe hoje

| Pasta no Studio (`/studio/pasta/<id>`) | O que é | Fundos/artes | Código |
|---|---|---|---|
| `encartes-de-mercado` | Encartes oficiais de mercado + 12 encartes A4 | Mega Oferta (vermelho e azul), Semana do Frango (azul e amarelo) | `ENCARTES_OFICIAIS` em `src/lib/studio/encartesOficiais.ts`; A4 em `src/lib/tabloide/encartes.ts` |
| `encartes-de-farmacia` | Encarte oficial de farmácia | Ofertas de Farmácia (verde e azul) | mesmo arquivo, `segmento: 'farmacia'` |
| `palco-de-ofertas` | Palco de Ofertas – Mercado (carrossel, 1 produto por vez) | Alerta de Oferta (sirene) | `FUNDOS_DO_PALCO` em `src/lib/studio/palco.ts` |
| `palco-de-ofertas-farmacia` | Palco de Ofertas – Farmácia | Ofertas de Farmácia (verde) | mesmo arquivo, `segmento: 'farmacia'` |
| `logos` | Logos oficiais + as do cliente | Mega Oferta, Semana do Frango, Alerta de Oferta, Ofertas de Farmácia | `LOGOS_OFICIAIS` em `src/lib/studio/logos.ts` |

Telas: `PastaDeEncartes.tsx`, `EncarteOficial.tsx`, `PalcoDeOfertas.tsx` (com a prop `segmento`), `ProdutosComFotos.tsx` e `NovoProduto.tsx` (a lista de produtos). As rotas ficam em `src/pages/studioai/PastaPage.tsx` e os cartões em `src/pages/studioai/CatalogoPage.tsx`.

## 2. Composição do ENCARTE oficial

```
┌──────────────────────────────┬─────────────────────┐
│ LOGO DO ENCARTE (camada 3D)  │ [ SUA LOGO AQUI ]   │  ← logo do cliente (PNG sem fundo fica solta;
│                              │  ícones das redes   │     com fundo vai num cartão)
├──────────────────────────────┤─────────────────────┤
│ ÁREA 1 (cor A)               │ ÁREA 2 (cor B)      │  ← produtos alternando entre as áreas,
│ grade completa e inteligente │ grade completa      │     grade sem fileira incompleta
├──────────────────────────────┴─────────────────────┤
│ RODAPÉ: ícone WhatsApp + telefone · ícone mapa + endereço (centralizados)
│ FAIXA DO AVISO (só farmácia): "A PERSISTIREM OS SINTOMAS..."
└────────────────────────────────────────────────────┘
```

- **Fundo:** é a arte pronta, sem texto de produto, em `public/studio/encartes-oficiais/<id>-{v,h}-st.webp`. A versão `-st-limpo` é a mesma arte sem a caixa "SUA LOGO AQUI". A logo do encarte NUNCA fica gravada no fundo: é uma camada trocável pela pasta Logos.
- **Caixas do layout:** as medidas são em pixels do documento (1080×1920 em pé e 1920×1080 deitado): `titulo`, `colunas[]` (cada uma com o seu estilo de balão), `logo`, `rodape`, `aviso` (farmácia) e `cartao` (proporção preferida do cartão). Meça na arte e anote no comentário onde passa a curva e onde começa o rodapé.
- **Produto (célula):** placa translúcida com borda clara, foto inteira (`ajuste: 'conter'`), nome em MAIÚSCULAS (Poppins 800) e balão de preço embaixo. Com poucos produtos os cartões ficam grandes; com muitos, menores (`gradeInteligente.ts`). O padrão é 16 produtos e o máximo é 20.
- **Tamanhos:** 9:16, 16:9, 1:1, 4:5, A4, A4 deitado e A3. Os outros tamanhos saem por `ADAPTACOES` + `scripts/studio/adaptar-encartes.mjs`: o topo e o rodapé só mudam de escala, e apenas a faixa dos produtos estica. A arte nunca é deformada.
- **Animação:** a placa surge, o produto entra com zoom, o nome sobe, o balão entra com zoom e a logo também. O encarte vira vídeo de 8 s.

## 3. Composição do PALCO (carrossel)

- Um produto por vez, **8 s cada** (`SEGUNDOS_POR_PRODUTO`), com transição deslizando (o lado é escolha do cliente).
- **Produto:** inteiro, com o pé encostado no tampo do pedestal (`focoY: 100`), entrando de baixo e depois flutuando.
- **Nome:** branco, em cima do produto (em pé) ou colado ao lado (deitado).
- **Balão:** amarelo, redondo e realista, pulsando na lateral, em tamanho proporcional ao produto (`seloDoPreco`). Tem "DE x POR" em vermelho na promoção e "POR APENAS" em verde fora dela. R$ e valor ficam em branco com contorno vermelho.
- **Botão:** pulsando no rodapé, um objeto só (texto com `fundo.cheio`). Mercado: OFERTAS/ALERTAS. Farmácia: FARMÁCIA/OFERTAS/SAÚDE.
- **Faixas com letreiro** (opcionais): fita com texto correndo, por exemplo "ALERTA DE OFERTA".
- **Fundo:** `public/studio/palco/<id>-{h,v}.webp` traz a logo gravada; `-st` é a mesma arte sem logo e só entra quando o cliente troca a logo.
- Os ajustes do cliente (posição, cor, texto) valem para todos os produtos. O carrossel exporta MP4 pelo editor de vídeo.

## 4. Regras obrigatórias (o dono cobrou cada uma)

1. **Balões e botões centralizados**, sempre: o balão sai só de `ESTILOS_DE_BALAO` (`palco.ts`). Teste: `src/tests/unit/regraBaloesCentralizados.test.ts`.
2. **Edição completa:** tocar em qualquer elemento e mover, girar, aumentar, trocar texto, fonte, cor e movimento (o movimento repete 2 vezes), trocar a logo e trocar o produto (lista, galeria ou IA). Cada elemento é UM objeto. Teste: `studioEdicaoCompleta249.test.ts`.
3. **Foto do produto:** oficial da marca, sem fundo, inteira e conferida em tamanho grande. Foto reprovada nunca é entregue (F-252/F-253/F-255).
4. **Produto completo:** nome + marca + medida + preço. O que falta aparece em vermelho pulsando (F-256). O campo guiado fica em `NovoProduto.tsx` (F-257).
5. **Farmácia:** aviso "A PERSISTIREM OS SINTOMAS, O MÉDICO DEVERÁ SER CONSULTADO" (`AVISO_DE_REMEDIO`) em todo encarte e palco. Só remédio isento de prescrição. Nunca remédio de receita, cigarro ou fórmula infantil.
6. **Arte própria:** nunca copiar arte, tema ou texto de concorrentes (QR Ofertas, Magnific). Pode recriar a estrutura e o estilo. Arte idêntica de terceiros só entra a partir de arquivo enviado pelo dono.
7. **Telas responsivas:** conferir em PC, tablet (800×1280) e celular (375×812).

## 5. Receitas

### Fundo novo do dono para ENCARTE (arquivo enviado por ele)
1. Tire o título gravado da arte: `scripts/studio/tirar-titulo-dos-fundos.mjs`. Gere `<id>-v-st.webp`, `<id>-h-st.webp` e as versões `-st-limpo`.
2. A logo do título vai para `public/studio/logos/` (`scripts/studio/preparar-logos.mjs`, ≥1400 px de largura, sem fundo) e entra em `LOGOS_OFICIAIS`.
3. Entrada nova em `BASES` (`encartesOficiais.ts`) com as caixas medidas, o estilo de balão de cada área e o `segmento`.
4. Entrada nova em `ADAPTACOES` (no `.ts` e no `scripts/studio/adaptar-encartes.mjs`) e depois `node scripts/studio/adaptar-encartes.mjs`.
5. Testes: `npx vitest run src/tests/unit/studio src/tests/unit/regra`. Confira no navegador e publique.

### Encarte ou palco NOVO criado pelo sistema (sem arte do dono)
Siga o modelo da farmácia: `scripts/studio/gerar-farmacia.mjs`.
- Desenha em HTML/SVG com as fontes do Studio (Anton e Poppins) e fotografa com o Chromium do Playwright.
- A logo é feita em texto 3D (extrusão em camadas, contorno e degradê).
- O fundo usa degradês, raios, textura leve e o elemento do segmento.
- As caixas do layout repetem as de um oficial que já funciona: Mega Oferta para encarte de duas áreas, Alerta de Oferta para palco.

Depois:
1. Rode o script e confira as imagens em tamanho grande.
2. Faça as mesmas entradas de `BASES`/`ADAPTACOES`/`FUNDOS_DO_PALCO`/`LOGOS_OFICIAIS`.
3. Faça os testes, como em `src/tests/unit/studioFarmacia259.test.ts`.

### Segmento novo (ex.: açougue, pet, padaria, material de construção)
1. Acrescente o valor em `SegmentoDoStudio` (`palco.ts`) e em `PASTAS_DE_ENCARTE` (`encartesOficiais.ts`).
2. Crie as pastas `encartes-de-<seg>` e `palco-de-ofertas-<seg>` em `PastaPage.tsx` e os cartões em `CatalogoPage.tsx`.
3. Crie a cesta de exemplo `CESTA_<SEG>` em `src/lib/tabloide/encartes.ts`, com nomes que batem com o catálogo. O teste confere com `chaveCanonica`.
4. A lista de produtos fica guardada à parte (`chave` em `useProdutosComFotos`) e as opções do palco também (`chaveOpcoes`).
5. **Vídeo por agentes (`/studio/agentes`):** se o segmento novo precisa de ambiente próprio, crie-o em `supabase/functions/_shared/studio/core/segmentos.ts` (ambientes, paleta do encarte, regras e termos proibidos em `FORA_DO_SEGMENTO` no `core.ts`). Siga o modelo de `farmacia` (F-261). Depois rode `node scripts/studio/semear-conhecimento.mjs`, publique o `studio-orquestrador` e faça o teste em `src/tests/unit/creativeCore.test.ts`.

### Balão novo
Crie um estilo novo em `ESTILOS_DE_BALAO` e use-o na coluna. Nunca posicione texto de preço à mão.

## 6. Conferência antes de entregar
- `npx vitest run src/tests/unit/studio src/tests/unit/regra src/tests/unit/novoProduto257.test.tsx`
- `npx tsc --noEmit -p tsconfig.app.json`: o número de erros não pode subir em relação à base.
- No navegador, com a conta de teste (skill `conferir-painel`): a capa da pasta, a tela da pasta, os formatos em pé e deitado e o balão ampliado.
- Publicar: `node scripts/ops/publicar-main.mjs` e `node scripts/ops/conferir-site.mjs "<texto novo>"`.
