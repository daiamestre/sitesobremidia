# SOBRE MÍDIA AUTÔNOMA — Relatório Final da Execução (F-263 a F-270)

> **Data:** 08/11/2026 · **Ramo:** `release/player-5.2.4` · Base: `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md` (F-262).
>
> Toda conclusão abaixo tem prova executada nesta missão. O que não foi provado está marcado como PARCIAL ou BLOQUEADO.

## A. Resumo executivo

**O que foi realmente concluído:**

- **Segurança P0 corrigida em produção:**
  - os códigos de pareamento estavam abertos a qualquer pessoa logada; um anunciante conseguia **apagar todos**;
  - a ligação de um aparelho a uma tela não conferia o dono da tela.
  - A correção foi **aplicada e provada no banco real** (22/22). O pareamento por código, que nunca tinha funcionado (gravava uma coluna que não existe), **passou a funcionar**, com prova no navegador.
- **Assinatura antiga insegura removida** do repositório; nunca tinha sido publicada.
- **Pesquisa de marcas protegida:** os 723 arquivos de dados (2.483 marcas e 398 sites) estão **íntegros no R2 privado**, conferidos por tamanho, MD5 e SHA-256. As imagens ficaram de fora por orçamento.
- **Arquitetura dos agentes formalizada:**
  - registro central de 12 agentes reais, conferido contra o código por teste;
  - provedores de IA numa **fonte única** com a política FREE-FIRST testada.
- **Central de Comando** (`/dashboard/ia`, a evolução do "Trabalhar com IA"), funcionando de verdade na **função local ligada ao banco real**:
  - cria produções do Studio pela conversa;
  - acompanha o estado real;
  - monta o **encarte ou palco oficial** com os preços que a pessoa escreveu;
  - **transforma uma arte em vídeo** (MP4 1920×1080).
- **Memória de estilo por cliente com consentimento:** código pronto e ensaio 14/14; a aplicação em produção foi barrada pela trava.
- **Ataques à Central:** 7 de 7 rejeitados. Isso revelou e corrigiu um defeito real do Studio: campanha com nome em maiúscula caía em erro.

**O que NÃO está no ar** (a missão não autorizou publicar):
- as funções `agente-ia` e `studio-orquestrador` com estas mudanças;
- o site com a Central nova;
- a migração da memória.

Para publicar, siga a pendência P-26 em `docs/ESTADO_DO_SISTEMA.md`. **Por isso a missão NÃO está "100% concluída"**: está concluída no código e provada localmente contra o banco real, aguardando a publicação.

## B. Situação de cada Micro-Gate

| Micro-Gate | Situação | Evidência | Testes | Pendências |
|---|---|---|---|---|
| MG-AUT-09a A1 pareamento | **CONCLUÍDO** (aplicado) | migração `20261361`; antes 12 falhas, depois 22/22 | `teste-pareamento.sql`, `segurancaPareamento263.test.ts` | — |
| MG-AUT-09a A2 Player | **CONCLUÍDO** | contrato 5.7.10 íntegro; telas idênticas; 364 testes Android; pareamento web provado no navegador | gradle `testDebugUnitTest` | emulador não usado: o Player Android pareia por login, não por código |
| MG-AUT-09a A3 assinatura | **CONCLUÍDO** | função removida; o fluxo `fn_assinar_contrato` continua (18 assinaturas) | 57 testes de assinatura e contratos | — |
| MG-AUT-09a A4 backup | **PARCIAL** | 723/723 dados ÍNTEGROS no R2 privado; 7/7 SHA-256 | `backup-pesquisa-marcas.mjs verificar` | imagens (8,49 GB) bloqueadas por orçamento (P-27) |
| MG-AUT-03/04 agentes | **CONCLUÍDO** | `_shared/agentes/registro.ts` | `registroDeAgentes265.test.ts` | versão dos agentes ainda não é gravada em toda etapa |
| MG-AUT-05 provedores | **CONCLUÍDO** (código) | `_shared/ia/provedores.ts` | `provedoresUnicos265.test.ts` | publicar (P-26); Qwen, Wan, Higgsfield e Runway não avaliados |
| MG-AUT-07 Central | **CONCLUÍDO no código / PARCIAL no ar** | produção 96f99a50 criada pela conversa; cartão do estado real no navegador | `centralDeComando266.test.ts`, `testar-central.mjs` | publicar (P-26); anexos na conversa não implementados |
| MG-AUT-08 encarte e arte → vídeo | **CONCLUÍDO no código / PARCIAL no ar** | encarte Mega Oferta com 4 preços exatos; MP4 1920×1080 15 s | `encarteDoAgente267.test.ts` | publicar (P-26); encarte sem renderização no servidor |
| MG-AUT-12 memória | **BLOQUEADO** (aplicação) | ensaio 14/14 no banco real (desfeito) | `teste-preferencias.sql`, `estiloDoCliente268.test.ts` | aplicar `20261362` (P-24); tela própria no Studio |
| MG-AUT-09 segurança avançada | **CONCLUÍDO** (escopo testado) | 7/7 ataques rejeitados; trava contra laço | `testar-injecao.mjs` | injeção por imagem ou anexo não testada |
| MG-AUT-10 JARVIS | **BLOQUEADO** (JARVIS não existe) | contrato técnico completo | — | implementar quando o JARVIS existir |
| MG-AUT-11 homologação | **CONCLUÍDO** (local + banco) | seção K | seção K | homologação no ar depois do P-26 |

## C. Segurança

- **Pareamento:**
  - a tabela não tem acesso direto (0 regras, permissões retiradas);
  - o vínculo exige a regra de "alterar tela";
  - recusas vão para `ACCESS_DENIED` e vínculos para `DEVICE_PAIRED` em `security_logs`.
- **Assinatura:** o caminho com a chave mestra e sem login foi removido.
- **RLS:** 238/238 tabelas; **nenhuma regra aberta de escrita** (as únicas eram as do pareamento); 373 funções privilegiadas, todas com `search_path`.
- **Isolamento:** 8 perfis com login simulado, **0 vazamentos** de mídias, telas, contratos, produções e memória.
- **Memória:** 14/14 no ensaio (outro cliente não vê nem apaga; outra empresa não vê nem grava; gestor não grava; tabela fechada).
- **Injeção de instruções (7/7 rejeitados):**
  - revelar chaves;
  - marcar pago;
  - aprovar e publicar sozinho;
  - preço inventado;
  - instrução escondida no produto;
  - outra empresa;
  - laço de criação.
- **Ferramentas:**
  - todas as novas usam o **login da pessoa**; a chave de serviço da Central ficou só no registro de perguntas e nas propostas, como já era;
  - preço só entra se a pessoa escreveu;
  - no máximo 2 criações por pergunta, 6 rodadas, 60 perguntas/hora.
- **Segredos:** nenhum no site; nenhum nos commits (verificado a cada commit); a chave de serviço da função local é lida na hora, só na memória do processo.
- **Custos:**
  - texto automático só grátis;
  - imagem paga só com `STUDIO_PERMITIR_IMAGEM_PAGA=1`;
  - sem fallback pago;
  - estimativa de custo antes de gerar.
- **Riscos residuais:**
  - injeção por imagem ou anexo não testada;
  - 146 funções privilegiadas executáveis por anônimo (amostras conferidas; a maioria é do Player ou de páginas públicas), sem varredura uma por uma;
  - os buckets `screenshots` e `proof_of_play` são públicos (avaliar).

## D. Backup

| Item | Valor |
|---|---|
| Origem | `../marcas` (10.188 arquivos) + `../marcas-v2` (4.531) = **14.719 arquivos**, 13.996 imagens, 8,49 GB; conteúdos únicos: 10.234 (6,49 GB) |
| Destino | bucket **`sobremidia-assets`** (privado: sem r2.dev e sem domínio), pasta `backups/pesquisa-marcas/` |
| Enviados | **723 arquivos de dados** (12 MB): listas, índices, lotes, comparações, filas, relatórios |
| Integridade | 723/723 · 0 ausentes · 0 divergentes · **ÍNTEGRO** (tamanho + MD5/ETag; SHA-256 no inventário e no metadado); 7/7 amostras baixadas com SHA-256 igual |
| Privacidade | o mesmo caminho pelo endereço público dá 404 |
| Retomada | a 2ª rodada enviou 0 |
| Bloqueado | 13.996 imagens: o R2 já usa 5,40 GB de 10 GB grátis; a cópia completa passaria para a faixa paga (≈ US$ 0,06/mês) |
| Originais | intactos (nada movido nem apagado) |

## E. Arquitetura final

```
Pessoa ──► /dashboard/ia  (Central de Comando, login dela)
             │  supabase.functions.invoke('agente-ia')
             ▼
        agente-ia  ──(IA grátis: _shared/ia/provedores.ts)──► Groq / Gemini / OpenRouter
             │  ferramentas COM O LOGIN da pessoa (RLS decide):
             ├─ consultas: telas, cobranças, clientes, oportunidades
             ├─ propor_cobranca ──► agente_ia_acoes ──[Confirmar]──► contas_receber
             ├─ criar_producao ──► studio_criar_producao ──► studio-orquestrador (cron 1 min)
             │                                    ├─ Creative Core + agentes (plano)   [aprovação humana]
             │                                    ├─ cenários FLUX grátis              [aprovação humana]
             │                                    └─ montagem GitHub Actions (FFmpeg) → MP4 conferido
             ├─ montar_encarte ──► link /studio/pasta/<encarte|palco>?produtos= ──► motor OFICIAL do Studio
             ├─ animar_arte ──► link /studio/video?midia= ──► editor de vídeo ──► MP4 ──► process-media (H.264)
             └─ estilo_do_cliente / guardar_estilo / apagar_estilo ──► studio_conhecimento (cliente, consentimento)
JARVIS (futuro) ──► sobremidia-api /v1 (token com escopo) ──► as MESMAS funções (contrato pronto; não implementado)
```

## F. Agentes

- **Implementados** (fonte: `supabase/functions/_shared/agentes/registro.ts`):
  - Central (`agente-ia`, 15 ferramentas);
  - Creative Core e Core local;
  - produtos (visão);
  - diretor;
  - roteirista;
  - fotografia;
  - prompts;
  - gerador de cenários (FLUX);
  - montagem (Actions);
  - controle de qualidade;
  - analista de referências.
- Cada um tem versão, escopo, ferramentas, proibições, limites, nível de aprovação e política de falha.
- **Planejados (não implementados):** personagens, marketing/calendário, logos 3D por agente, operações com escrita, JARVIS.

## G. Central de Comando

**Funcionalidades reais:**
- consultas;
- cobrança com Confirmar;
- criar, listar e acompanhar produções;
- encarte e palco oficial;
- arte em vídeo;
- estilo do cliente (depende do P-24);
- cartões com o estado real que se atualizam;
- botão "Abrir no Studio";
- perguntas quando falta dado.

**Cenários testados:**
- vídeo de farmácia com preço exato (96f99a50);
- "como está essa produção?" (estado real);
- encarte com 4 produtos e preço "de/por";
- arte em vídeo, com a pergunta "qual das duas artes?";
- 7 ataques.

**Não implementado:** anexar arquivo ou referência na conversa.

## H. Studio autônomo

| Capacidade | Resultado |
|---|---|
| Artes e vídeos pelos agentes | plano → cenários → montagem → qualidade (provado na F-261, MP4 H.264) |
| Encartes | composição oficial com preços exatos, balões centralizados e fotos do catálogo; a pessoa confere e salva |
| Arte → vídeo | MP4 1920×1080 15 s exportado; ao salvar, convertido para H.264 pelo `process-media` |
| Controle de qualidade | conferência do MP4; `validarPlano` (corrigido: não reprova palavras da própria pessoa) |
| Biblioteca | artes listadas com o login da pessoa; o vídeo salvo vai para as mídias pelo fluxo existente |

## I. Memória por cliente

- **Consentimento:** obrigatório, com registro de quem, quando e termo `preferencias.v1`. Os campos permitidos são tom, loja, público, formato, até 6 cores e observações.
- **Isolamento:** pela regra de acesso que já existe; 14/14 no ensaio.
- **Uso:** a Central aplica o estilo sem sobrepor o pedido, **diz o que usou** e aceita "ignorar".
- **Controle:** revogar ou apagar de vez.
- **Estado:** a migração NÃO está aplicada (P-24).

## J. JARVIS

- **Contrato técnico concluído** (`docs/autonomia/JARVIS_INTEGRACAO.md` §§1–6).
- **Integração executada: nenhuma**, porque o JARVIS não existe.
- O TESTE 10 não foi executado. A camada que ele usará (isolamento, criação com o login de quem pede, recusa de injeção) já tem prova.

## K. Testes

| Comando | Resultado |
|---|---|
| `npx vitest run src/tests/unit` | **232 arquivos · 2.296 testes · 0 falhas** (a 1ª rodada achou 4 falhas causadas por esta missão na `PastaPage`; corrigidas sem mexer nos testes) |
| `npx tsc --noEmit -p tsconfig.app.json` | 176 erros = linha de base (nenhum novo) |
| `npx vite build` | OK |
| `deno check agente-ia studio-orquestrador` | 0 erros (eram 6 antigos) |
| `teste-pareamento.sql` | 22 OK · 0 FALHA (no ar) |
| `teste-preferencias.sql` (ensaio) | 14 OK · 0 FALHA |
| `teste-isolamento.sql` | 8 perfis · 0 vazamentos |
| `testar-injecao.mjs` | 7 rejeitados · 0 passaram |
| `contrato-player.mjs` / `comparar-telas.mjs` | íntegro / idênticas |
| `./gradlew :app:testDebugUnitTest` | 364 testes · 0 falhas |
| `backup-pesquisa-marcas.mjs verificar --somente-dados` | ÍNTEGRO 723/723 |

## L. Arquivos principais

- **Criados:**
  - `supabase/migrations/20261361_pareamento_seguro.sql`, `20261362_preferencias_do_cliente.sql`;
  - `supabase/functions/_shared/agentes/registro.ts`, `_shared/ia/provedores.ts` (movido do Studio), `_shared/agente/studio.ts`;
  - `scripts/ops/{teste-pareamento.sql, teste-preferencias.sql, resultado-sql.mjs, backup-pesquisa-marcas.mjs, funcao-local.mjs, testar-central.mjs, testar-injecao.mjs}`;
  - testes `segurancaPareamento263`, `provedoresUnicos265`, `registroDeAgentes265`, `centralDeComando266`, `encarteDoAgente267`, `estiloDoCliente268`.
- **Alterados:**
  - `supabase/functions/agente-ia/index.ts`, `_shared/agente/ferramentas.ts`, `_shared/studio/contrato.ts`, `studio-orquestrador/index.ts` (tipos);
  - `src/pages/dashboard/TrabalharComIA.tsx`, `src/pages/studioai/PastaPage.tsx`, `src/pages/studioai/VideoEditorPage.tsx`;
  - documentos de memória.
- **Removido:** a função `contract-signature-flow`.

## M. Migrações

| Migração | Estado |
|---|---|
| `20261361_pareamento_seguro.sql` | **APLICADA** em produção (ensaio 22/22 antes; 22/22 depois; Player íntegro) |
| `20261362_preferencias_do_cliente.sql` | **NÃO aplicada**: ensaiada 14/14; aguarda autorização (P-24) |

## N. Publicação

- **Banco:** só a `20261361` foi aplicada.
- **Funções do servidor:** nenhuma publicada nesta missão; `agente-ia` e `studio-orquestrador` no ar são as versões anteriores.
- **Site:** não publicado.
- **R2:** cópia privada dos dados da pesquisa.
- **Git:** commits **locais**, ainda não enviados ao GitHub.

## O. Pendências residuais

| Pendência | Motivo | Impacto | Dependência | Próxima ação |
|---|---|---|---|---|
| P-26 publicar | missão sem autorização de publicação | a Central nova e a correção do `validarPlano` não estão no ar | dono | enviar os commits; publicar `agente-ia` e `studio-orquestrador`; `publicar-main.mjs`; rodar `testar-injecao.mjs` contra o ar |
| P-24 memória | trava "Production Deploy" | estilo do cliente não pode ser guardado | dono | `node scripts/ops/sql.mjs @supabase/migrations/20261362_preferencias_do_cliente.sql` e o teste 14/14 |
| P-27 imagens da pesquisa | passa da cota grátis do R2 | 13.996 imagens só neste PC | orçamento do dono | `backup-pesquisa-marcas.mjs enviar` + `verificar` |
| Anexos na Central | não implementado | não dá para mandar referência pela conversa | — | usar o upload existente do Studio |
| Encarte no servidor | motor do encarte é código do site | a arte só existe depois que a pessoa abre e salva | — | renderizar no Actions (como o `montar.mjs`) se for preciso automação total |
| Injeção por imagem ou anexo | não testada | risco residual | anexos | testar quando houver anexos |
| JARVIS | não existe | TESTE 10 pendente | JARVIS | implementar a `sobremidia-api` pelo contrato |
| Provedores novos (Qwen, Wan, Higgsfield, Runway) | não avaliados na fonte oficial | — | decisão e orçamento | avaliar preço, API e licença |
