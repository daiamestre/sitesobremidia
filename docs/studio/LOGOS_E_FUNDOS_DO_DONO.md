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
| **Toda faixa, placa ou espaço vazio vira TEXTO EDITÁVEL**, que começa com o **nome da empresa**, preso na logo (mover/aumentar/girar leva junto), seguindo o formato (reto ou em arco) e o estilo da faixa. Vale para TODAS as logos, inclusive as já publicadas. **NÃO PERGUNTAR (dono, 23/11, irritado):** toda faixa/placa EM BRANCO é SEMPRE editável, sem exceção, nas logos já adicionadas e nas que vierem. O texto segue o estilo e o formato da logo (reto ou em arco, cor, contorno, sombra). | 22/11 |
| **Faixa com "YOUR LOGO"/"YOUR TEXT HERE"/"SUA LOGO": SEMPRE apagar o dizer e deixar a faixa em branco EDITÁVEL** (o dizer "your…" já significa que a logo tem a opção de editar texto). Só os dizeres de MODELO saem. **Faixa que completa a frase da logo NUNCA muda** ("DE OFERTAS", "DA SEMANA", "IMBATÍVEL", "DE DEZEMBRO", "SALDÃO DE", "DIA DOS", "Tudo para seu Pet", "DA CIDADE"…): faz parte do nome da promoção. Resposta do dono em 23/11. | 23/11 |
| Onde houver "your logo", o usuário pode pôr a logo dele, **OPCIONAL**: sem ela o espaço NÃO existe (nada de buraco, círculo vazio ou xadrez); a logo funciona completa sozinha. | 22/11 |
| **NUNCA recortar o desenho.** Nenhum ponto da logo pode ficar transparente (teste "furos"). A 1ª versão da Black Friday ficou "toda recortada" e o dono reprovou. | 22/11 |
| **REGRA DE TRABALHO:** comparar SEMPRE a original com a corrigida, lado a lado, de perto (cada zona + mapa do que mudou), e repetir até não sobrar NENHUMA falha, antes de publicar e de responder. Mostrar o antes e depois ao dono. | 22/11 |
| Texto errado na arte só é corrigido quando o dono manda (ex.: "Año" → "Ano", pedido em 23/11). Se algo parecer estranho, PERGUNTE. | 23/11 |
| **Pastas:** por segmento (mercado, açougue, farmácia, padaria, Black Friday…) e por data (Natal, Fim de Ano, Dia das Mães, Dia dos Pais, São João, Carnaval…). Cada pasta tem capa que gira com o nome dela. | 22/11 |
| **Logo genérica** (não fala de segmento: Oferta do Dia, Mega Oferta, Show de Ofertas…) aparece em todas as pastas de segmento que combinam com a **COR** dela (`PASTAS_DA_COR`). | 23/11 |
| **Meta: 15 logos por pasta** (era 8; depois talvez 20). A página Logos mostra a meta só para dono e ADM. | 23/11 |
| Fundos do dono entram inteiros, sem recorte, com a logo como camada trocável; o usuário escolhe na criação de vídeo. Texto quebrado na arte do fundo só é refeito quando o dono pede, sem mudar mais nada. | 23/11 |
| **Texto na faixa (23/11):** nada passa das listras/frisos da faixa (acento em cima e Ç embaixo incluídos). Nome comprido quebra em duas linhas COMPACTAS: próximas, sem colar (folga mínima de 8% entre o Ç de cima e a linha de baixo), e o bloco inteiro cabe na faixa. Faixa em curva medida leva `alturaUtil` (altura entre os frisos − 24 px) e `entreLinhas` 0,42 em `espacos-das-logos.json`; faixa reta usa a mesma regra dentro da `caixa`. **CENTRALIZADO (dono, bravo, 23/11):** o centro é o do CORPO das letras (sem acento nem cedilha) no meio entre os frisos; `baixar` (px) acerta o olho (Mega Oferta: 2). Conferir medindo o centro das letras contra o meio dos frisos. | 23/11 |

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
- `liso`: letras em pano liso → Laplace. Letra branca: `letra.branco` + `neutro`; `letra.espessura` descarta brilho fino. **Faixa com brilho e frisos (Mega Oferta) → `aoLongo`** (REGRA do dono 23/11: a faixa fica EXATAMENTE igual à original, só sem os dizeres): a faixa é refeita AO LONGO da curva dela, entre o friso de cima e o de baixo (`frisos` medidos com `conferir-logo.mjs grade`, um ponto a cada 74 px); o topo da área limpa segue o topo das letras (`topoPelasLetras`, o brilho abaixo do friso de cima fica intacto) e embaixo vai até o friso (`uMax` 0,985; verde 0,955 porque o friso é mais grosso); correção de Poisson nas bordas.
- `acento` (23/11): tira acento/enfeite que está em cima de uma letra, sobre fundo escovado (`curva` = contorno de cima da letra que fica, `base`, `outraLetra`). Usado no "Año" da Feliz Ano Novo (fita).

**Fundo do dono no palco:** `node scripts/studio/fundo-do-dono-palco.mjs <em pé> <id> [deitada]` → entrada em `FUNDOS_DO_PALCO` com as caixas medidas, `segmento`, `botoes` e `logoPadrao` → teste `studioFarmacia259` (lista do mercado). Texto quebrado na arte: `scripts/studio/corrigir-texto-das-fitas.mjs` + `fitas-black-friday.json`.

## 5. Situação em 23/11/2026

- **No ar:** 68 logos de promoção, das quais 6 com espaços editáveis (Quarta das Carnes, Sexta da Carne brasa, Ofertas de Natal faixa, Natal de Ofertas gorro, Esquenta Black Friday laranja, Black Friday dados). 4 de 21 pastas com 15 ou mais.
- **Fundos no ar (F-357):** `black-friday-fita` e `black-friday-fita-selos` (texto BLACK FRIDAY das plaquinhas refeito, fitas intactas). O deitado é a arte no centro com laterais desfocadas, até o dono mandar a versão deitada.
- **Revisão das 68 no ar (23/11):** conferidas uma a uma; só as 6 já editáveis têm faixa em branco ou dizer "your…". As outras faixas trazem palavras da frase (DE OFERTAS, VARIADOS, DESCONTOS IMPERDÍVEIS…) e ficam como estão.
- **Pronto e não publicado (23/11):** as 4 Mega Oferta já passaram pela receita no PC (estão na lista local, com texto editável na faixa, conferidas no navegador com nomes de exemplo); falta só o commit + publicar junto com as outras.
- **Pronto e não publicado:** zona `acento` da `feliz-ano-novo-fita` (versão limpa gerada e conferida: só o til saiu).

## 6. Fila — 32 logos PRONTAS no projeto (commit), esperando publicar

Situação em 23/11/2026: as 32 recebidas já passaram pela receita (estão em `public/studio/logos/promocao/` e na lista local, commitadas), com pasta, cores e as faixas editáveis prontas. **Falta só publicar** (`node scripts/ops/publicar-main.mjs --forcar`) quando o dono pedir ("publique"). O dono disse que vai continuar mandando: cada logo nova entra na fila (`_fila-para-publicar.txt` + `fila/<id>.png`) e passa pela receita do mesmo jeito.

- Editáveis da leva: Mega Oferta azul/verde/vermelha/roxa ("YOUR TEXT HERE" tirado), Liquidação de Ano Novo verde e preta (placa), Ano Novo (estrela) (fita branca), Feliz Ano Novo (fita vermelha, e o til do "Año" tirado).
- Novas (23/11): Ofertas Ano Novo (balões), Réveillon de Ofertas (garrafas), Ofertas de Ano Novo (verde) → fim-de-ano; **Réveillon de Ofertas (relógio)**: o xadrez pintado do relógio saiu (modo `xadrez` com `forcar` no círculo e `vagaNeutro` 40) e virou o lugar OPCIONAL da logo do usuário (`alvo` = maior retângulo que cabe inteiro no círculo branco).
- Pastas: Boas Festas → natal; Fecha Mês de Dezembro, 2027 (dourado), Esquenta Ano Novo → fim-de-ano; Folia de Ofertas e Folia da Economia → carnaval; Feirão do Paizão e Ofertas Dia dos Pais → dia-dos-pais; Preço Baixo Pet → pet; genéricas (Inauguração Nova Loja, Melhor Preço da Cidade, Show de Ofertas luzes, Ofertas da Semana verde, 4 Mega Oferta) → mercado + pastas da cor.
- Lista completa: `../logos-de-promocao-originais/_fila-para-publicar.txt`.

**Meta (contagem com a fila, 23/11):** 10 de 21 pastas com 15+. Fim de Ano 19 ✅. Faltam: **Dia das Mães 0 (próxima)**, Dia dos Pais 2, São João 1, Carnaval 2, Beleza 2, Eletrônicos 5, Moda 3, Pet 13, Páscoa 0, Dia dos Namorados 0, Dia das Crianças 0.

## 7. Lições (erros que não podem voltar)

- Tirar o círculo inteiro e "inventar" o fundo deixou a logo recortada → só os dizeres saem; trava de furos no teste.
- Ao comparar de perto apareceram: pontinhos e ilhas no miolo, riscos verticais (busca de ilhas interrompida), expansão invadindo letras vizinhas (use `limites`, `expandir` menor e `proteger`), letras fantasma no aro (faixa uniforme por raio, média só do aro), cantinho rosado, veios cortados, restos rosados no pano. Cada um só apareceu na comparação ampliada → nunca pular a conferência.
- Faixa brilhante (Mega Oferta, 23/11): Laplace deixa a faixa lisa e sem brilho (o dono recusou: "não aceito faixas com falhas"); área reta corta o brilho curvo (linha, degrau, emenda); área encostada no friso escurece; achar friso sozinho pega o disco colorido de cima. Solução: frisos medidos + topo pelas letras + até o friso de baixo. Conferir SEMPRE ampliado 2x as 4 cores.
- Fundo escovado (listras horizontais): continuar cada listra da esquerda para a direita + correção de Poisson do brilho; Laplace puro ou cópia de outras linhas deixam borrão e emenda (lição do til, 23/11).
- O contorno da letra embaixo do enfeite precisa ser uma curva suave medida dos lados visíveis; corte reto achata a letra.
- Botão padrão de palco com texto longo ("BLACK FRIDAY") falhou no teste de botão centralizado → o padrão é OFERTAS.
- O service worker guarda imagens 30 dias → o nome do arquivo sempre leva o hash do conteúdo.

## 8. Dúvidas abertas com o dono

1. ✅ RESOLVIDA (23/11): faixa em branco → SEMPRE editável; "your logo/your text" → SEMPRE apagado e editável; faixa com palavras da frase → não muda.
2. Botão da Saldão de Natal (já no ar): lugar da logo do usuário ou enfeite? (o pandeiro da Folia fica como está)
3. Círculo branco quando o usuário não põe logo: deixar ou sumir?
4. Versão deitada (16:9) dos dois fundos de Black Friday.
