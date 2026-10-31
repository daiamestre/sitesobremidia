# Biblioteca de referências e auditoria das fotos do Studio

Data: 31/10/2026.

## 1. Referências visuais do dono

Nenhuma cópia fica no repositório. Os direitos de uso não estão confirmados e as URLs da OpenAI são temporárias. A análise das 6 referências abertas está em `../MG_STUDIO_01_AUDITORIA_CREATIVE_CORE.md` §4.

| # | Categoria | Situação | Lição para o Core |
|---|---|---|---|
| 3.1 | Studio de Criação | analisada | prompt + propriedades + histórico + fila num só espaço |
| 3.2 | Artes Comerciais | analisada | data → título → cena → selo; produto em pedestal; cor de fundo única |
| 3.3 | Logos e Elementos 3D | analisada | materiais (dourado/cromo/letreiro). **O quadriculado da referência é falso**: exigir alfa real |
| 3.4 | Redes Sociais | analisada (produto pago de terceiros) | continuidade de carrossel; não reproduzir os layouts |
| 3.5 | Personagens — **Buratino Lemonade** | **PENDENTE**: o link da imagem da OpenAI devolve erro 400 nas duas versões enviadas | ver abaixo |
| 3.6 | Fotografia de Produtos | analisada | luz difusa de estúdio, pedestal limpo, produto herói |
| 3.7 | Animação e Vídeos | analisada | linha do tempo com faixas, como o editor F-227 |

### 3.5 — Buratino Lemonade (pendente da imagem)

- **Fonte indicada pelo dono:** https://www.behance.net/search/projects/buratino%20lemonade. A busca abre em 31/10/2026 com mais de 6.000 resultados.
- **Projetos com esse nome:**
  - "Buratino Lemonade" (vários proprietários);
  - "LEMONADE BURATINO" (Viktor Kharchenko).
- **Imagens enviadas:** as duas URLs `images.openai.com/static-rsc-4/BCJlJECA…` dão erro 400.

**Descrição de referência**, para guiar o Core sem copiar:
- O mascote é um **personagem de madeira estilizado (marionete de nariz comprido)** que funciona como embaixador da marca de limonada.
- Aparece **igual** na embalagem, no material de ponto de venda e no anúncio.
- Interage com o produto (segura a garrafa, aponta, reage) em cenários coloridos.
- O estilo é ilustrado/3D amigável.

**O que aprender:**
- o mascote como "rosto" recorrente da campanha;
- a ficha do personagem (aparência, roupa, cores, expressões, poses) usada em todas as peças;
- a interação com o produto real.

**Direitos:** "Buratino" é personagem e marca de terceiros (refrigerante tradicional russo e projetos de autores do Behance). **Não copiar o personagem, a marca nem as embalagens**; usar só o conceito de "mascote embaixador com ficha permanente".

## 2. Auditoria das 62 fotos novas (geradas pelo robô `studio-fotos` em 31/10/2026)

- **Origem:** FLUX.1 schnell (Black Forest Labs), pela conta Cloudflare da SOBRE MÍDIA (Worker `sobremidia-tabloide-ia`).
  - Instrução com "no text, no logo, no brand".
  - Licença do modelo: Apache-2.0, uso comercial permitido.
  - Nenhuma pessoa real.
- **Formato:** todas em 1024×1024 WebP, no mesmo padrão das demais. Miniaturas prontas 560×315 e 315×560 refeitas: 145 modelos e 290 arquivos.
- **Categorias:** cada foto pertence à variação da pasta que a pediu (`src/lib/studio/pastas.ts`). Nenhuma está em pasta errada.

**Revisão visual** (folhas de contato, uma por uma):

| Achado | Fotos | Ação |
|---|---|---|
| **Percentual inventado** numa placa ("-29%"), que fere "nunca inventar desconto" | `clinica-exames` | **retirada**; instrução corrigida; o robô regera |
| **Emblema de montadora** no carro | `oficina-funilaria` | **retirada**; instrução "unbranded, sem emblema" |
| Letras falsas em embalagem/rótulo em destaque | `assist-pelicula`, `oficina-oleo` | **retiradas**; instruções "sem impressão/sem rótulo" |
| Letras falsas pequenas em placas de rua ao fundo | `moda-inverno`, `moda-masculina`, `liquida-infantil` | mantidas (fundo desfocado, sem marca legível); trocar se o dono preferir |
| Controle parecido com um modelo comercial | `tec-games` | mantida (sem logotipo); trocar se o dono preferir |
| **Crianças com rosto realista** (geradas, não são pessoas reais) | `barba-infantil`, `clinica-pediatria`, `escola-infantil`, `escola-reforco`, `idiomas-kids`, `odonto-infantil`, `odonto-aparelho` | **decisão do dono**: o DNA v2 recomenda crianças em ilustração estilizada (segmento Educação). Ficam no ar até a decisão |

Sem as 4 retiradas, as variações delas ficam ocultas no catálogo até a nova foto chegar. O robô tenta a cada 3 h, quando a cota grátis da Cloudflare libera.
