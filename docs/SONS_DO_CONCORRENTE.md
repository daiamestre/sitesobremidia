# Os sons dos vídeos de impacto do concorrente: como foram identificados (F-320, 16/11/2026)

O dono pediu os mesmos efeitos sonoros do concorrente:
- a sirene;
- o som da logo batendo no centro;
- o som de "bater numa parede de concreto" quando entra um texto importante;
- e o locutor.

**Fonte:** o áudio público de 4 reels de @propaganda_de_supermercados (De9VSh8TJrR, DdjNSqvRZUB, DbGDXHkxVWP, DeURYQHxNYA), baixado do mesmo endereço que o Instagram usa para tocar, sem login. Os arquivos ficam fora do repositório. Nada do áudio deles entra no sistema.

## O método (o que permite "ouvir" sem ouvidos)
1. **Separar os efeitos da voz.** O locutor fica no centro do estéreo, e os efeitos e a música ficam nas laterais. O canal lateral (L−R) apaga a voz e deixa os efeitos sozinhos (`pan=mono|c0=0.5*c0-0.5*c1`).
2. **Achar as batidas:** os saltos de energia no grave (`analisar-som.mjs` na pasta de trabalho).
3. **Agrupar as batidas pela impressão digital.** A impressão digital é o envelope de 8 faixas de frequência em 1,1 s. O mesmo arquivo de efeito repetido dá 70–82% de semelhança.
4. **Olhar a imagem de cada grupo** (o quadro do vídeo no instante da batida).
5. **Comparar** 68 efeitos gratuitos do Pixabay com cada grupo e montar o nosso som com os mais parecidos.

## O que foi encontrado
| Som do concorrente | Quando toca | Assinatura medida | O nosso (semelhança) |
|---|---|---|---|
| **Sirene** | os 3,5 s do começo, sob o "ATENÇÃO!" | um único tom quase puro: sobe de 600 a 2.230 Hz em 1,5 s e desce até 620 Hz em 1,75 s (harmônicos −20 a −35 dB) | `sirene.mp3`, sintetizada com a mesma curva |
| **Parede de concreto** | cada texto importante ("VEM AÍ!", "TODOS OS SETORES…") e a logo atravessando o concreto | estrondo grave + estalo largo nos agudos (−12 dB) que some em 0,4 s + entulho | `concreto.mp3` (69–72%) |
| **Logo batendo no centro** | a logo Fecha Mês explodindo em pedras | estouro brilhante (agudos no máximo) + entulho caindo por 1 s | `impacto.mp3` (62%; as batidas deles nesse grupo se parecem só 53–55% entre si) |
| **Explosão (bola de fogo)** | "MAS ATENÇÃO", "VOCÊ NÃO PRECISA ESPERAR" | médios longos, sem agudo no ataque | ainda sem som próprio (nenhum candidato passou de 44%) |
| **Riser** | antes da logo cair do céu | dois tons subindo de 1.600 a 2.200 Hz em 2 s | `subida.mp3`, sintetizada |

O concorrente usa **o mesmo arquivo** de concreto para os textos e para a logo atravessando o concreto (72–78% iguais entre si).

Nenhum dos 68 efeitos gratuitos testados é o mesmo arquivo deles. O mais parecido sozinho chegou a 74%. Por isso as nossas batidas são montadas em camadas (gravações reais + o nosso grave), com os agudos reforçados até a curva deles.

## O locutor
- Masculino, de varejo, quase gritado: a voz sobe a ~300 Hz no "ATENÇÃO!".
- Uma frase a cada 1,5–2,5 s, sempre na frente da música e dos efeitos.
- No SOBRE MÍDIA:
  - o estilo **impacto** gera a voz mais solta e expressiva, um pouco mais rápida (`AJUSTE_IMPACTO` em `studio-locucao`);
  - o motor passa toda locução pela **voz de rádio** (`vozDeRadio`): corte de grave, presença em 3 kHz, brilho e compressão 4:1;
  - a música desce para 30% sob a voz.

## Locutor e origem dos sons (pesquisa de 16/11/2026, noite)

Fonte: os arquivos JavaScript públicos do app "Vídeo de Ofertas IA" do concorrente (sem login).

- **Vozes:** o app oferece 8 vozes da ElevenLabs: Diego, Pingão, Letícia, Maurinho, Brunão, Peet, Ivan e Luan ("locutor convidado").
  - Foram varridas 14.240 vozes da biblioteca pública da ElevenLabs. **Só o Diego é público**, e ele já é uma das vozes da SOBRE MÍDIA.
  - As outras 7 são vozes **privadas da conta deles**, clones ou vozes criadas. Nenhuma outra conta consegue usá-las.
  - Clonar a voz de uma pessoa (o "Luan" é um locutor real) só com a autorização escrita dela.
- **Efeitos:** o app deles só tem um "whoosh" sintetizado.
  - Os vídeos "Fecha Mês" usam **trilhas completas feitas sob encomenda**, com os efeitos já misturados: `FECHA_MES_DE_JULHO.mp3`, `FECHA_MES_DE_AGOSTO.mp3`, `SUSPENSE_FECHA_MES_DE_JULHO_2026.mp3` e `fundo_fecha_mes_de_outubro.mp3`.
  - Por isso nenhum efeito avulso de biblioteca bate 100%: o arquivo exato não está à venda nem é gratuito.
  - Essas trilhas são material deles e **não entram** no sistema.
- **Caminhos legítimos para ficar igual:**
  - encomendar a um produtor de áudio as vinhetas e batidas no mesmo estilo;
  - contratar um locutor de varejo, com autorização escrita para o clone;
  - imitar a cadência pelo roteiro (pausas, gritos, frases curtas).
