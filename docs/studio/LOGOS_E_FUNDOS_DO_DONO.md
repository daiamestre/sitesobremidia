# Logos e fundos do dono — manual completo (F-355 / F-357 / F-358)

> **Para qualquer IA ou conversa nova:** este arquivo diz COMO o dono trabalha com as logos de promoção e os fundos,
> o que já foi feito, o que está na fila e como continuar sem perguntar de novo. Leia inteiro antes de mexer em logo ou fundo.
> Atualizado em 23/11/2026.

## 1. Como o dono trabalha (o fluxo da conversa)

1. O dono manda imagens de logos no chat (uma ou várias por mensagem).
2. A cada logo recebida, a IA:
   - confere se não repete outra (já publicada ou na fila) e se tem fundo transparente;
   - **guarda** na fila (seção 6), sem publicar;
   - responde em pt-BR com: nome e pasta de cada logo, o que vai virar editável (faixa, placa, "your logo"), **quanto falta em cada pasta para a meta** e **qual é a próxima pasta** da meta;
   - pergunta só o que for realmente dúvida (ex.: texto errado na arte, logo que serve para duas pastas).
3. Só quando o dono disser **"adicione as logos"** (ou "publique"), tudo entra **numa publicação só** (Vercel é plano grátis; nunca uma publicação por logo).
4. Quando TODAS as pastas baterem a meta → **lembrar o dono de mandar os FUNDOS**, para combinar fundos com as logos. O objetivo dele: **ficar melhor que o concorrente**.

## 2. Regras do dono (obrigatórias, não perguntar de novo)

| Regra | Desde |
|---|---|
| **A logo entra IGUAL à que ele mandou, byte a byte.** Nada de IA de recorte, tirar fundo, mexer em cor, cortar sobras ou "melhorar". Ele reclamou 4 vezes, muito irritado. | 20/11 |
| **Exceção:** dizeres de modelo saem: "YOUR LOGO HERE", "SUA LOGO", "ALPHA BACKGROUND", "YOUR TEXT HERE", xadrez pintado. SÓ os dizeres; aro, disco, pano, fita ficam. | 22/11 |
| **Toda faixa, placa ou espaço vazio vira TEXTO EDITÁVEL**, que começa com o **nome da empresa**, preso na logo (mover/aumentar/girar leva junto), seguindo o formato (reto ou em arco) e o estilo da faixa. Vale para TODAS as logos, inclusive as já publicadas. **23/11:** na leva da fila o dono escolheu só as placas em branco das Liquidação verde/preta; as fitas vazias da Ano Novo (estrela) e da Feliz Ano Novo ficam como estão. Na dúvida, pergunte qual faixa vira editável. | 22/11 |
| **Só os dizeres de MODELO saem das faixas** ("YOUR TEXT HERE", "YOUR LOGO", "SUA LOGO"…): TODA logo que vier com "your logo"/"your text" é editada. **Faixa que completa a frase da logo NUNCA muda** ("DE OFERTAS", "DA SEMANA", "IMBATÍVEL", "DE DEZEMBRO", "SALDÃO DE", "DIA DOS", "Tudo para seu Pet", "DA CIDADE"…): faz parte do nome da promoção. Resposta do dono em 23/11. | 23/11 |
| Onde houver "your logo", o usuário pode pôr a logo dele, **OPCIONAL**: sem ela o espaço NÃO existe (nada de buraco, círculo vazio ou xadrez); a logo funciona completa sozinha. | 22/11 |
| **NUNCA recortar o desenho.** Nenhum ponto da logo pode ficar transparente (teste "furos"). A 1ª versão da Black Friday ficou "toda recortada" e o dono reprovou. | 22/11 |
| **REGRA DE TRABALHO:** comparar SEMPRE a original com a corrigida, lado a lado, de perto (cada zona + mapa do que mudou), e repetir até não sobrar NENHUMA falha, antes de publicar e de responder. Mostrar o antes e depois ao dono. | 22/11 |
| Texto errado na arte só é corrigido quando o dono manda (ex.: "Año" → "Ano", pedido em 23/11). Se algo parecer estranho, PERGUNTE. | 23/11 |
| **Pastas:** por segmento (mercado, açougue, farmácia, padaria, Black Friday…) e por data (Natal, Fim de Ano, Dia das Mães, Dia dos Pais, São João, Carnaval…). Cada pasta tem capa que gira com o nome dela. | 22/11 |
| **Logo genérica** (não fala de segmento: Oferta do Dia, Mega Oferta, Show de Ofertas…) aparece em todas as pastas de segmento que combinam com a **COR** dela (`PASTAS_DA_COR`). | 23/11 |
| **Meta: 15 logos por pasta** (era 8; depois talvez 20). A página Logos mostra a meta só para dono e ADM. | 23/11 |
| Fundos do dono entram inteiros, sem recorte, com a logo como camada trocável; o usuário escolhe na criação de vídeo. Texto quebrado na arte do fundo só é refeito quando o dono pede, sem mudar mais nada. | 23/11 |

Restrições gerais: senha nunca; segredos só em `~/.sobremidia-secrets/tokens.env`; navegador só com a conta de teste `e2e-owner@sobremidia.com.br`; ElevenLabs proibido gastar.

## 3. Onde fica cada coisa

| O quê | Onde |
|---|---|
| Logos publicadas (arquivo `<id>-<hash8>.png`, miniatura `-mini.webp`, máscara `-vaga.png`) | `public/studio/logos/promocao/` + `lista.json` |
| Lista gerada para o app (pasta, cores, espaços) | `src/lib/studio/logosDePromocao.ts` (NÃO editar à mão) |
| Pasta de cada logo | `scripts/studio/pastas-das-logos.json` (genéricas vão em `mercado`) |
| Cores medidas das genéricas | `scripts/studio/cores-das-logos.json` (`cores-das-logos.mjs` mede) |
| Limpeza dos dizeres (zonas e modos) | `scripts/studio/espaco-da-logo.json` + `espaco-da-logo.mjs` |
| Faixas editáveis e lugar da logo do usuário | `scripts/studio/espacos-das-logos.json` |
| Pastas, regra de cor, meta e ordem da meta | `src/lib/studio/pastasDeLogos.ts` (`PASTAS_DE_LOGOS`, `PASTAS_DA_COR`, `META_DE_LOGOS_POR_PASTA`, `ORDEM_DA_META`) |
| Desenho do texto em arco e da logo do usuário recortada pela vaga | `src/lib/studio/logoPersonalizada.ts` |
| Telas: pastas com capa que gira, personalizar, escolher logo | `src/components/studio/PastaDeLogos.tsx` |
| Teste (está na trava do `publicar-main`) | `src/tests/unit/logosDePromocao355.test.ts` |
| **Originais do dono e versões limpas (FORA do repositório, só no PC)** | `../logos-de-promocao-originais/` (`<id>.png`, `<id>-limpa-<hash>.png`, `<id>-vaga-<hash>.png`) |
| **Fila das logos recebidas e ainda não publicadas** | `../logos-de-promocao-originais/_fila-para-publicar.txt` + imagens em `../logos-de-promocao-originais/fila/<id>.png` |
| Fundos do palco | `public/studio/palco/<id>-{v,h}(-st).webp`, entradas em `FUNDOS_DO_PALCO` (`src/lib/studio/palco.ts`) |
| Originais dos fundos | `../fundos-do-dono-originais/` |

## 4. Receitas (comandos)

**Publicar logos (quando o dono disser "adicione as logos"):**
1. Para cada logo com dizeres de modelo ou correção pedida: zona em `espaco-da-logo.json` → copie o original para `../logos-de-promocao-originais/<id>.png` → `node scripts/studio/espaco-da-logo.mjs <id>` → **confira** (abaixo) até ficar sem falha.
2. Para cada faixa/placa vazia ou de texto apagado: entrada em `espacos-das-logos.json` (`textos[]` com `caixa`, `arco`, cor, degradê, contorno, sombra, fonte; `logo` com `circulo` quando houver lugar para a logo do usuário).
3. Pasta de cada uma em `pastas-das-logos.json`.
4. `node scripts/studio/logos-de-promocao.mjs "<imagem>" <id> "<Nome>"` para cada logo (copia byte a byte, ou a versão limpa; miniatura; mede cores das genéricas; refaz a lista). `--lista` só refaz a lista.
5. Conferir no navegador (skill `conferir-painel`): página Logos, pastas, personalizar (texto e logo opcional) e o "Trocar logo" do vídeo.
6. `npx vitest run src/tests/unit/logosDePromocao355.test.ts src/tests/unit/studio src/tests/unit/regra` → commit → `node scripts/ops/publicar-main.mjs --forcar` → conferir no ar que o arquivo publicado é igual ao local (download + comparação de bytes).
7. Atualizar este arquivo (fila vazia, contagem), `ESTADO_DO_SISTEMA`, `DECISOES_DO_DONO` e `FINDINGS_LEDGER`.

**Conferir (REGRA DE TRABALHO):**
- `node scripts/studio/conferir-logo.mjs zonas <id> <saida.png>`: original | corrigida | mudou (magenta), por zona; "furos" tem de ser 0.
- `node scripts/studio/conferir-logo.mjs grade <imagem> <saida.png> [x y w h]` (`PASSO=10`): medir coordenadas para os `limites`, curvas e centros.
- `node scripts/studio/conferir-logo.mjs lado <a> <b> <saida.png> [x y w h] [zoom]`: antes e depois para mandar ao dono (SendUserFile).
- `DEPURAR=<png> node scripts/studio/espaco-da-logo.mjs <id>` grava a máscara do que foi mexido.

**Modos de limpeza (`espaco-da-logo.mjs`):** fora dos `limites` a logo fica idêntica (o teste confere pixel a pixel) e o alfa nunca diminui.
- `aro`: letras sobre aro/alça; cada ponto recebe a cor do próprio aro (`centro`, `raios`, `angulos`, `letra`, `fonte`, `faixaInteira`, `beirada`, `crescer*`, `proteger`).
- `xadrez`: xadrez pintado → branco + vira a VAGA da logo do usuário (`tons`, `neutro`, `janela`, `expandir`, `rosado`…).
- `colunas`: letras sobre tábuas; os veios continuam (`face`, `caixaLetras`, `veioMax`, `alcance`).
- `liso`: letras em pano liso → Laplace.
- `acento` (23/11): tira acento/enfeite que está em cima de uma letra, sobre fundo escovado (`curva` = contorno de cima da letra que fica, `base`, `outraLetra`). Usado no "Año" da Feliz Ano Novo (fita).

**Fundo do dono no palco:** `node scripts/studio/fundo-do-dono-palco.mjs <em pé> <id> [deitada]` → entrada em `FUNDOS_DO_PALCO` com as caixas medidas, `segmento`, `botoes` e `logoPadrao` → teste `studioFarmacia259` (lista do mercado). Texto quebrado na arte: `scripts/studio/corrigir-texto-das-fitas.mjs` + `fitas-black-friday.json`.

## 5. Situação em 23/11/2026

- **No ar:** 68 logos de promoção, das quais 6 com espaços editáveis (Quarta das Carnes, Sexta da Carne brasa, Ofertas de Natal faixa, Natal de Ofertas gorro, Esquenta Black Friday laranja, Black Friday dados). 4 de 21 pastas com 15 ou mais.
- **Fundos no ar (F-357):** `black-friday-fita` e `black-friday-fita-selos` (texto BLACK FRIDAY das plaquinhas refeito, fitas intactas). O deitado é a arte no centro com laterais desfocadas, até o dono mandar a versão deitada.
- **Pronto e não publicado:** zona `acento` da `feliz-ano-novo-fita` (versão limpa gerada e conferida: só o til saiu).

## 6. Fila (recebidas, aguardando "adicione as logos") — 25 logos

Imagens em `../logos-de-promocao-originais/fila/<id>.png`. Caminho original de cada upload em `_fila-para-publicar.txt`.

| # | id | Nome | Pasta | O que fazer antes de publicar |
|---|---|---|---|---|
| 1 | ano-novo-preco-novo-vermelho | Ano Novo Preço Novo (vermelho) | fim-de-ano | — |
| 2 | fecha-mes-de-dezembro | Fecha Mês de Dezembro | fim-de-ano (dono confirmou) | — (faixa "DE DEZEMBRO" faz parte da frase: não muda) |
| 3 | saldao-de-ano-novo | Saldão de Ano Novo | fim-de-ano | — (faixa "SALDÃO DE" faz parte da frase: não muda) |
| 4 | feirao-do-paizao | Feirão do Paizão | dia-dos-pais | — |
| 5 | liquidacao-de-ano-novo-verde | Liquidação de Ano Novo (verde) | fim-de-ano | placa branca vazia → texto editável |
| 6 | ano-novo-preco-novo-dourado | Ano Novo Preço Novo (dourado) | fim-de-ano | — |
| 7 | liquidacao-de-ano-novo-preta | Liquidação de Ano Novo (preta) | fim-de-ano | placa branca vazia → texto editável |
| 8 | feliz-ano-novo-fita | Feliz Ano Novo (fita vermelha) | fim-de-ano | til do "Año" já tirado (zona `acento`, pronta); fita fica como está (dono, 23/11: nesta leva, só Liquidação verde/preta e Mega Oferta) |
| 9 | ano-novo-estrela | Ano Novo (estrela) | fim-de-ano | fita fica como está (dono, 23/11) |
| 10 | inauguracao-nova-loja | Inauguração Nova Loja | genérica (mercado + cor) | — |
| 11 | boas-festas | Boas Festas | **natal** (dono, 23/11) | — |
| 12 | dezembro-arrasador | Dezembro Arrasador | fim-de-ano | — |
| 13 | ano-novo-imbativel | Ano Novo Imbatível | fim-de-ano | — (faixa "IMBATÍVEL" faz parte da frase: não muda) |
| 14 | ano-novo-de-ofertas | Ano Novo de Ofertas | fim-de-ano | — (faixa "DE OFERTAS" faz parte da frase: não muda) |
| 15 | folia-de-ofertas | Folia de Ofertas | carnaval | — (pandeiro fica como está) |
| 16 | ofertas-dia-dos-pais | Ofertas Dia dos Pais | dia-dos-pais | — (faixa "DIA DOS" faz parte da frase: não muda) |
| 17 | mega-oferta-azul | Mega Oferta (azul) | genérica | "YOUR TEXT HERE" sai → base laranja vira texto editável |
| 18 | preco-baixo-pet | Preço Baixo – Tudo para seu Pet | pet | — (faixa "Tudo para seu Pet" faz parte da frase: não muda) |
| 19 | melhor-preco-da-cidade | Melhor Preço da Cidade | genérica | — (faixa "DA CIDADE" faz parte da frase: não muda) |
| 20 | mega-oferta-verde | Mega Oferta (verde) | genérica | "YOUR TEXT HERE" sai → texto editável |
| 21 | mega-oferta-vermelha | Mega Oferta (vermelha) | genérica | "YOUR TEXT HERE" sai → texto editável |
| 22 | mega-oferta-roxa | Mega Oferta (roxa) | genérica | "YOUR TEXT HERE" sai → texto editável |
| 23 | feliz-ano-novo-dourado | Feliz Ano Novo (dourado) | fim-de-ano | — |
| 24 | show-de-ofertas-luzes | Show de Ofertas (luzes) | genérica | diferente da "Show de Ofertas" já publicada |
| 25 | ofertas-da-semana-verde | Ofertas da Semana (verde) | genérica | — (faixa "DA SEMANA" faz parte da frase: não muda) |

**Editáveis nesta leva (resposta do dono, 23/11):** Liquidação de Ano Novo verde e preta (placa branca → texto) e as 4 Mega Oferta ("YOUR TEXT HERE" sai → texto). Nenhuma outra.

Contagem com a fila: Fim de Ano 13 (faltam 2), Natal 23 ✅, Açougue ✅, Dia dos Pais 2, Carnaval 1, **Dia das Mães 0 = próxima pasta da meta**. Pet, Beleza e Moda sobem com as genéricas (a conta exata sai ao medir as cores na publicação).

## 7. Lições (erros que não podem voltar)

- Tirar o círculo inteiro e "inventar" o fundo deixou a logo recortada → só os dizeres saem; trava de furos no teste.
- Ao comparar de perto apareceram: pontinhos e ilhas no miolo, riscos verticais (busca de ilhas interrompida), expansão invadindo letras vizinhas (use `limites`, `expandir` menor e `proteger`), letras fantasma no aro (faixa uniforme por raio, média só do aro), cantinho rosado, veios cortados, restos rosados no pano. Cada um só apareceu na comparação ampliada → nunca pular a conferência.
- Fundo escovado (listras horizontais): continuar cada listra da esquerda para a direita + correção de Poisson do brilho; Laplace puro ou cópia de outras linhas deixam borrão e emenda (lição do til, 23/11).
- O contorno da letra embaixo do enfeite precisa ser uma curva suave medida dos lados visíveis; corte reto achata a letra.
- Botão padrão de palco com texto longo ("BLACK FRIDAY") falhou no teste de botão centralizado → o padrão é OFERTAS.
- O service worker guarda imagens 30 dias → o nome do arquivo sempre leva o hash do conteúdo.

## 8. Dúvidas abertas com o dono

1. ✅ RESOLVIDA (23/11): faixas que completam a frase NÃO mudam; só "your logo/your text" e faixas em branco das Liquidação verde/preta viram editáveis nesta leva.
2. Botão da Saldão de Natal (já no ar): lugar da logo do usuário ou enfeite? (o pandeiro da Folia fica como está)
3. Círculo branco quando o usuário não põe logo: deixar ou sumir?
4. Versão deitada (16:9) dos dois fundos de Black Friday.
