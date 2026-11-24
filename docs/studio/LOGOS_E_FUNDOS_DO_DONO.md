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

- **No ar:** 111 logos de promoção (as 43 da fila publicadas em 23/11; conferidas byte a byte contra o local). 10 de 22 pastas com 15 ou mais.
- **Fundos no ar (F-357):** `black-friday-fita` e `black-friday-fita-selos` (texto BLACK FRIDAY das plaquinhas refeito, fitas intactas). O deitado é a arte no centro com laterais desfocadas, até o dono mandar a versão deitada.
- **Revisão das 68 no ar (23/11):** conferidas uma a uma; só as 6 já editáveis têm faixa em branco ou dizer "your…". As outras faixas trazem palavras da frase (DE OFERTAS, VARIADOS, DESCONTOS IMPERDÍVEIS…) e ficam como estão.
- **Publicado em 23/11:** as 4 Mega Oferta (texto editável na faixa) e a zona `acento` da `feliz-ano-novo-fita` (só o til do "Año" saiu) entraram junto com o resto da fila.

## 6. Fila — 43 logos PUBLICADAS em 23/11/2026 (as próximas que chegarem entram aqui)

Situação em 23/11/2026: as 43 recebidas passaram pela receita, foram commitadas e **PUBLICADAS** (`node scripts/ops/publicar-main.mjs`) — 111 logos no ar, conferidas byte a byte contra o local. Fila vazia. O dono disse que vai continuar mandando: cada logo nova entra na fila (`_fila-para-publicar.txt` + `fila/<id>.png`), passa pela receita do mesmo jeito e espera o próximo "publique".

- Editáveis da leva: Mega Oferta azul/verde/vermelha/roxa ("YOUR TEXT HERE" tirado), Liquidação de Ano Novo verde e preta (placa), Ano Novo (estrela) (fita branca), Feliz Ano Novo (fita vermelha, e o til do "Año" tirado).
- Novas (23/11): Ofertas Ano Novo (balões), Réveillon de Ofertas (garrafas), Ofertas de Ano Novo (verde) → fim-de-ano; **Réveillon de Ofertas (relógio)**: o xadrez pintado do relógio saiu (modo `xadrez` com `forcar` no círculo e `vagaNeutro` 40) e virou o lugar OPCIONAL da logo do usuário (`alvo` = maior retângulo que cabe inteiro no círculo branco).
- Novas (23/11, 2ª leva): **pasta nova ☀️ Verão** (Saldão de Verão; Ofertas de Verão com o "SUA LOGO AQUI" tirado da faixa branca, modo `liso` com `letra.preto`, e texto editável reto INCLINADO, campo `giro` -7°); Ofertas de Ano Novo (Feliz 2027) → fim-de-ano.
- Novas (23/11, 3ª leva): **Ofertas Fim de Ano (balões)** — "ALPHA BACKGROUND" saiu do aro preto (modo `aro` com `beirada`) e o vidro de xadrez MEIO TRANSPARENTE virou branco (modo `xadrez` com `alfa`, `porAlfa` e `circulo` exato + `circuloTudo`; o balão da frente protegido pela borda medida) → lugar OPCIONAL da logo do usuário; Dia de Economizar Muito → genérica.
- Novas (23/11, 4ª leva): 4 Carnaval de Ofertas (pandeiro, azul, verde, vermelho) → carnaval; 2 Ofertas de Ano Novo (letreiro preto e vermelho) → fim-de-ano. Todas iguais às originais (sem faixa em branco nem "your…").
- Pastas: Boas Festas → natal; Fecha Mês de Dezembro, 2027 (dourado), Esquenta Ano Novo → fim-de-ano; Folia de Ofertas e Folia da Economia → carnaval; Feirão do Paizão e Ofertas Dia dos Pais → dia-dos-pais; Preço Baixo Pet → pet; genéricas (Inauguração Nova Loja, Melhor Preço da Cidade, Show de Ofertas luzes, Ofertas da Semana verde, 4 Mega Oferta) → mercado + pastas da cor.
- Lista completa: `../logos-de-promocao-originais/_fila-para-publicar.txt`.

**Meta (23/11, depois da publicação):** 10 de 22 pastas com 15+ (Verão é nova). Fim de Ano 23 ✅. Faltam: **Dia das Mães 0 (próxima)**, Dia dos Pais 2, São João 1, Carnaval 6, Verão 2, Beleza, Moda, Eletrônicos, Pet, Páscoa 0, Dia dos Namorados 0, Dia das Crianças 0. Conta exata: passo 9.7.

## 7. Lições (erros que não podem voltar)

- Tirar o círculo inteiro e "inventar" o fundo deixou a logo recortada → só os dizeres saem; trava de furos no teste.
- Ao comparar de perto apareceram: pontinhos e ilhas no miolo, riscos verticais (busca de ilhas interrompida), expansão invadindo letras vizinhas (use `limites`, `expandir` menor e `proteger`), letras fantasma no aro (faixa uniforme por raio, média só do aro), cantinho rosado, veios cortados, restos rosados no pano. Cada um só apareceu na comparação ampliada → nunca pular a conferência.
- Faixa brilhante (Mega Oferta, 23/11): Laplace deixa a faixa lisa e sem brilho (o dono recusou: "não aceito faixas com falhas"); área reta corta o brilho curvo (linha, degrau, emenda); área encostada no friso escurece; achar friso sozinho pega o disco colorido de cima. Solução: frisos medidos + topo pelas letras + até o friso de baixo. Conferir SEMPRE ampliado 2x as 4 cores.
- Xadrez meio transparente (vidro): a detecção padrão exige alfa > 240 e não acha nada; usar `alfa` [8, 238] + `porAlfa`. `faixaInteira` em aro preto liso deixa listras radiais e `liso` apaga o friso prateado: em aro preto use `aro` com `beirada` (23/11).
- Fundo escovado (listras horizontais): continuar cada listra da esquerda para a direita + correção de Poisson do brilho; Laplace puro ou cópia de outras linhas deixam borrão e emenda (lição do til, 23/11).
- O contorno da letra embaixo do enfeite precisa ser uma curva suave medida dos lados visíveis; corte reto achata a letra.
- Botão padrão de palco com texto longo ("BLACK FRIDAY") falhou no teste de botão centralizado → o padrão é OFERTAS.
- O service worker guarda imagens 30 dias → o nome do arquivo sempre leva o hash do conteúdo.

## 8. Dúvidas abertas com o dono

1. ✅ RESOLVIDA (23/11): faixa em branco → SEMPRE editável; "your logo/your text" → SEMPRE apagado e editável; faixa com palavras da frase → não muda.
2. Botão da Saldão de Natal (já no ar): lugar da logo do usuário ou enfeite? (o pandeiro da Folia fica como está)
3. Círculo branco quando o usuário não põe logo: deixar ou sumir?
4. Versão deitada (16:9) dos dois fundos de Black Friday.

## 9. PASSO A PASSO DE CADA LOGO (exatamente como fizemos na conversa de 20–23/11/2026)

> Siga na ordem, para CADA logo que o dono mandar. Não publique nada até ele dizer "publique" / "adicione as logos".

### 9.1 Receber e analisar (antes de qualquer coisa)
1. As imagens que o dono manda no chat ficam salvas em `C:\Users\Jairan Santos\.claude\uploads\<sessão>\<id>-image.png` (o caminho vem na mensagem).
2. Medir cada uma (tamanho e transparência), na raiz do projeto:
   ```
   node -e "const sharp=require('sharp');(async()=>{const p='<arquivo>';const m=await sharp(p).metadata();const {data}=await sharp(p).ensureAlpha().raw().toBuffer({resolveWithObject:true});let t=0;for(let i=3;i<data.length;i+=4)if(data[i]<20)t++;console.log(m.width,m.height,'transp',(t/(data.length/4)*100).toFixed(0)+'%')})()"
   ```
   - Transparência 0% = fundo pintado: avisar o dono (a logo entra igual, mas com fundo).
   - Ver se já existe: `ls public/studio/logos/promocao | grep -i <palavra>` e `grep -i <palavra> ../logos-de-promocao-originais/_fila-para-publicar.txt`.
3. Olhar a imagem e classificar CADA faixa, placa ou círculo:

   | O que tem | O que fazer |
   |---|---|
   | Faixa/placa EM BRANCO (vazia) | vira TEXTO EDITÁVEL (9.4), sempre, sem perguntar |
   | Faixa com "YOUR TEXT HERE", "YOUR LOGO", "SUA LOGO AQUI" | apagar SÓ o dizer (9.3) e a faixa vira TEXTO EDITÁVEL (9.4) |
   | Círculo com xadrez ou "ALPHA BACKGROUND" | apagar dizer e xadrez (9.3); o espaço vira LOGO DO CLIENTE OPCIONAL (9.5) |
   | Faixa com palavras da frase ("DE OFERTAS", "DA SEMANA", "FELIZ 2027") | NÃO MUDA |
   | Texto errado na arte (ex.: "Año") | só corrige se o dono mandar (modo `acento`) |

4. Escolher a pasta: segmento ou data pelo tema. Logo sem segmento = genérica, vai em `mercado` (o sistema põe nas pastas da cor sozinho). Tema sem pasta (ex.: Verão) = criar a pasta em `PASTAS_DE_LOGOS` e `ORDEM_DA_META` (`src/lib/studio/pastasDeLogos.ts`) e avisar o dono.

### 9.2 Guardar na fila
- Acrescentar a linha `<caminho do upload> | <id-kebab> | <Nome> | <pasta>[ | notas]` em `../logos-de-promocao-originais/_fila-para-publicar.txt`.
- Copiar o arquivo para `../logos-de-promocao-originais/fila/<id>.png`.
- Pôr o id no topo da pasta certa em `scripts/studio/pastas-das-logos.json`.

### 9.3 Apagar dizeres de modelo (só quando houver)
1. Copiar `fila/<id>.png` para `../logos-de-promocao-originais/<id>.png`.
2. Medir com grade: `PASSO=25 node scripts/studio/conferir-logo.mjs grade <arquivo> <saida.png> x y w h` e abrir a imagem.
3. Escrever a zona em `scripts/studio/espaco-da-logo.json`. Exemplos REAIS que funcionaram (copie a entrada da logo citada e ajuste):
   - Letras brancas numa faixa curva com brilho e frisos → `mega-oferta-azul` (modo `liso` com `aoLongo` e os `frisos` medidos).
   - Letras pretas numa faixa branca inclinada → `ofertas-de-verao` (modo `liso` com `letra.preto` e `proteger` nas bordas).
   - Letras num aro preto ("ALPHA BACKGROUND") → `ofertas-fim-de-ano-baloes`, 1ª zona (modo `aro` com `beirada`; NUNCA `faixaInteira` em aro preto).
   - Xadrez opaco num círculo → `reveillon-de-ofertas-relogio` (modo `xadrez` com `forcar` e `vagaNeutro`).
   - Xadrez MEIO TRANSPARENTE (vidro) → `ofertas-fim-de-ano-baloes`, 2ª zona (`alfa`, `porAlfa`, `circulo`, `circuloTudo` e `proteger` com a borda medida do balão da frente).
   - Acento a tirar → `feliz-ano-novo-fita` (modo `acento` com a `curva` de cima da letra).
   - Xadrez + letras em aro colorido → `sexta-da-carne-brasa` e `black-friday-dados`.
4. Rodar e conferir até não sobrar falha:
   - `node scripts/studio/espaco-da-logo.mjs <id>`
   - `node scripts/studio/conferir-logo.mjs zonas <id> <saida.png>` (original | limpa | o que mudou; "furos" TEM de ser 0)
   - `node scripts/studio/conferir-logo.mjs lado ../logos-de-promocao-originais/<id>.png ../logos-de-promocao-originais/<id>-limpa-<hash>.png <saida.png> x y w h 2`
   - Olhar AMPLIADO: faixa igual à original (mesma cor, brilho e frisos), sem sombra de letra, sem degrau, sem emenda, sem buraco. Repetir até ficar perfeito e mandar o antes e depois ao dono.
   - Medir frisos de faixa curva: para x = 280, 354, … 1020, listar os trechos vermelho-escuros (g < 75 e r − g > 60); o friso de cima e o de baixo são os trechos finos (≤ 7 px) logo acima e logo abaixo das letras.

### 9.4 Texto editável na faixa (`scripts/studio/espacos-das-logos.json`)
- Faixa curva: medir o meio da faixa em 3 pontos (esquerda, meio, direita) e calcular o círculo que passa por eles → `"arco": { "cx", "cy", "r", "de", "ate", "baixo": true }` (baixo = curva de sorriso), com ~1° de margem em cada ponta. Exemplos: `mega-oferta-*`, `ano-novo-estrela`, `feliz-ano-novo-fita`.
- Faixa reta inclinada: `"caixa": [x,y,w,h], "giro": -7`. Exemplo: `ofertas-de-verao`.
- Placa reta: só `"caixa"`. Exemplos: `liquidacao-de-ano-novo-verde` e `-preta`.
- Sempre: `"alturaUtil"` = altura entre as listras − 24 px (o texto, com acento e Ç, nunca passa das listras), `"entreLinhas": 0.42` (2 linhas compactas), `"baixar"` para acertar o centro (Mega Oferta: 2), e o estilo copiado da faixa original: `"cor"`, `"degrade"`, `"contorno"`, `"sombra"`, `"fonte"` (montserrat 900 na maioria), `"maxTamanho"`.
- O texto começa com o nome da empresa (automático). O centro é o do corpo das letras (sem acento nem cedilha).

### 9.5 Logo do cliente opcional (círculo ou vidro)
- `"logo": { "rotulo": "No círculo de cima", "circulo": [cx,cy,r], "alvo": [x,y,w,h] }`. O `alvo` é o MAIOR retângulo que cabe INTEIRO na vaga (medido na máscara `<id>-vaga-<hash>.png`), para a logo do cliente nunca sair cortada. Sem logo do cliente, o espaço fica branco e limpo.
- Logo só com lugar de logo e sem faixa: `"textos": []`.

### 9.6 Receita, teste no navegador e testes
1. `node scripts/studio/logos-de-promocao.mjs ../logos-de-promocao-originais/fila/<id>.png <id> "<Nome>"` (erro "UNKNOWN open lista.json" = trava do Windows: rode de novo).
2. Navegador (`preview_start` name `vite-dev`, porta 5199), em JavaScript na página:
   ```js
   const m = await import('/src/lib/studio/logoPersonalizada.ts?t='+Date.now()); const L = await import('/src/lib/studio/logosDePromocao.ts?t='+Date.now());
   const lista = Object.values(L).find(Array.isArray); const l = lista.find(x => x.id === 'promocao-<id>');
   const c = await m.desenharLogoPersonalizada(l, { textos: { faixa: 'SUPERMERCADO BOM PREÇO' }, logoUrl: null }); document.body.innerHTML=''; document.body.appendChild(c);
   ```
   Testar nome curto, nome comprido (2 linhas) e com Ç e acento; conferir centralizado e dentro das listras. Logo do cliente: passar `logoUrl` com uma imagem de teste.
3. Se a logo tem espaço editável, pôr `promocao-<id>` na lista do teste "faixas e espaços" em `src/tests/unit/logosDePromocao355.test.ts`.
4. `npx vitest run src/tests/unit/logosDePromocao355.test.ts src/tests/unit/studio src/tests/unit/regra` → commit (nunca `src/lib/biblioteca.ts`, `supabase/.temp/cli-latest`, `deno.lock`).

### 9.7 Responder ao dono (modelo)
- Tabela: logo | pasta | como ficou (igual à original / o que virou editável).
- Imagens de antes e depois quando houve edição.
- Contagem da meta e a PRÓXIMA pasta. Para contar, no navegador: `const P=await import('/src/lib/studio/pastasDeLogos.ts');const Lg=await import('/src/lib/studio/logos.ts');P.progressoDaMeta(Lg.LOGOS_OFICIAIS)`.
- Fechar com: "Pode continuar mandando, ou diga **publique**."
- Atualizar `docs/PONTO_DE_RETOMADA.md` e este manual (seção 6).

### 9.8 Publicar (quando o dono mandar)
`node scripts/ops/publicar-main.mjs --forcar` → esperar a Vercel (~3 a 5 min) → baixar 3 a 5 logos novas de `https://sitesobremidia.vercel.app/studio/logos/promocao/<arquivo>` e comparar os bytes com o local (`cmp`) → atualizar a retomada, o estado (P-36) e este manual.
