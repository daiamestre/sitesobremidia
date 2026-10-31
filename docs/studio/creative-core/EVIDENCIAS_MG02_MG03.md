# Evidências — MG-STUDIO-02 + MG-STUDIO-03 (31/10/2026)

## Estado

| Item | Situação |
|---|---|
| DNA visual, manual e taxonomia no **Git** (versionados) | ✅ feito (`core/dna.ts`, `core/segmentos.ts`) |
| Creative Core (briefing → segmento → direção → roteamento → prompts → qualidade) | ✅ feito e testado (`core/core.ts`) |
| Agentes existentes recebendo o contexto do Core | ✅ feito e testado (executor espião) |
| Modo sem API externa (plano local) | ✅ feito e testado |
| Ligação com o editor de vídeo (plano → projeto editável) | ✅ feito e testado (`src/lib/studio/video/doCore.ts` + botão na tela da produção) |
| Migrações (`20261357_studio_conhecimento.sql` + `20261349` revisada) | ✅ **ensaiadas e desfeitas** · ⏳ **aguardando aprovação para aplicar** |
| Semente do conhecimento no banco | ✅ ensaiada (13 linhas, idempotente) · ⏳ aplicar junto com as migrações |
| Publicar a função `studio-orquestrador` e a rota do Studio por agentes | ⏳ depende das migrações |

## 1. Prova real com provedor (não simulada)

A prova usa o mesmo código do servidor, rodado no PC com as chaves do cofre (`scratchpad/core-real.mjs`).

**Cloudflare: cota diária esgotada** (`429 / 4006`; o robô de fotos usou os 10.000 neurons). O Core registrou `diretor:ia-indisponivel` e seguiu **local**, sem perder nada. É o Teste G na prática.

**Reserva grátis Groq (`openai/gpt-oss-120b`):**

| Pedido | Segmento | Direção (fonte) | Modo | Qualidade |
|---|---|---|---|---|
| "Campanha de depilação a laser da clínica" | Saúde / Estética clínica | IA: "Depilação a laser como solução premium, destacando tecnologia e conforto…" | imagem por IA (FLUX, disponível) | APROVADO, sem termos de roupa/cosmético |
| "Anúncio de matrícula para a academia, plano anual" | Academia e Fitness / Academias | IA: "Academia moderna como protagonista, convidando à matrícula anual." | imagem por IA | APROVADO |
| "Vídeo animado de 15 segundos do restaurante…" | Alimentação / Restaurantes | IA: "Restaurante como herói, destacando o prato do dia…" | **motion** (sem IA de vídeo); roteiro 0-3 zoom, 3-7 panorâmica, 7-11 subir, 11-15 pulsar | APROVADO |

Etapas registradas: `segmento(local) → briefing(local) → diretor(local) → diretor(ia:groq-texto) → roteamento → prompts → qualidade`.

## 2. Testes automáticos (`src/tests/unit/creativeCore.test.ts`, 15/15)

- **DNA:** versionado, com autoridade, proibições, as 8 modalidades e os roteiros de 15 s e 20 s.
- **Taxonomia:** 10 segmentos com todos os campos; um 11º segmento entra pelo banco sem mexer no núcleo.
- **Testes do pedido (nível de planejamento):**
  - **A:** supermercado com foto e preço vai para composição determinística, sem preço em nenhum prompt.
  - **B:** academia → fitness, ambiente de academia.
  - **C:** depilação a laser → Saúde/Estética clínica, sem roupa/cosmético, com as regras de saúde aplicadas.
  - **D:** restaurante em vídeo → motion, 15 s exatos.
  - **E:** mascote falando → vídeo IA **bloqueado**, com alternativa em motion e pedido da referência do personagem.
  - **F:** imagem vira vídeo de 20 s com 5 partes.
  - **G:** IA fora do ar → modo local.
- **A IA só refina:** uma resposta com preço ou com termos de outro segmento é **recusada**; uma resposta boa entra com a marca "fonte: ia".
- **Briefing:** aponta "oferta sem preço" e "preço só no texto livre".
- **Agentes existentes:** o sistema do Diretor e do Roteirista leva `dna.v2` + o segmento (executor espião); a versão gravada é `biblia.v1+dna.v2`.
- **Pipeline:** a etapa `core` é gravada primeiro. Sem IA, a etapa `core-local` gera um plano válido (4 cenas, 15 s), sem preço inventado.
- **Editor de vídeo:** o plano vira projeto (arte, imagem gerada com zoom, arte), com o **preço real R$ 69,90** por cima.

## 3. Banco: ensaio completo, desfeito no fim (nada ficou)

Migrações + semente + testes com logins de teste simulados, numa transação que termina em erro proposital:

```
semente global (linhas ativas) => 13
segmentos globais => alimentacao, automotivo, beleza, educacao, esportes, fitness, saude, servicos, tecnologia, varejo
ADMIN vê (global/empresa/cliente) => {"global":13,"empresa":2,"cliente":1}
versões da regra da empresa (versao, ativo) => [[1,false],[2,true]]
ANUNCIANTE A vê => {"global":13,"empresa":2,"cliente":1}
ANUNCIANTE A publicar => recusado: Só o proprietário/administrador da empresa altera a memória criativa.
ANUNCIANTE A grava direto => recusado: permission denied for table studio_conhecimento
ANUNCIANTE A cria produção (0 produto, vídeo) => true
ANUNCIANTE A cota do dia => {"plano":{"usado":1,"limite":10},"imagem":{"usado":0,…},"montagem":{"usado":0,…}}
ANUNCIANTE B vê => {"global":13,"empresa":2,"cliente":0}        ANUNCIANTE B vê produções de A => 0
FINANCEIRO vê => {"global":13,"empresa":2,"cliente":0}          FINANCEIRO vê produções de A => 0
OUTRA EMPRESA vê => {"global":13,"empresa":0,"cliente":0}       OUTRA EMPRESA vê produções de A => 0
ADMIN vê produções da empresa => 1
linhas globais antes/depois da 2ª semente => 13 / 13 (idempotente)
tabela studio_uso existe? => false
```

Depois do ensaio: `studio_conhecimento`, `studio_producoes` e `studio_etapas` **não existem** (banco intacto).
