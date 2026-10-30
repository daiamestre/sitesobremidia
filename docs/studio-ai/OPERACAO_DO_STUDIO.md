# Studio de IA Cinematográfica — arquitetura final, operação e manutenção

Data: 30/10/2026. Base: os 5 documentos da MG00 e `MATRIZ_DE_EXECUCAO.md`.

**Situação:**
- Código pronto e testado localmente.
- **Nada publicado e nada commitado:** falta a autorização do dono (veja §10).

## 1. Arquitetura final

```
NAVEGADOR (React)                                  SUPABASE                                    FORA
/portal/criar-midia[/novo|/:id]  (anunciante)      studio_producoes / studio_etapas / studio_uso
/dashboard/studio[/novo|/:id]    (owner/ADM)        RLS própria + funções studio_* (estado, cota)
  │ fotos → uploadToR2 ({uid}/studio/…) + recorte do Cartaz Digital
  │ studio_criar_producao (empresa/cliente/usuário tirados da sessão)
  ▼
pg_cron (1 min) ──► Edge Function studio-orquestrador ──► Worker Cloudflare (ação studio-modelo, lista fechada de modelos)
                     │ 1 Especialista em Produtos (visão)      llama-4-scout · flux-1-schnell · [lucid-origin pago, desligado]
                     │ 2 Diretor Criativo  3 Roteirista
                     │ 4 Diretor de Fotografia  5 Especialista em Prompts
                     │ validação (nada de preço/loja/marca inventados)
                     │ 6 Gerador de Imagens → R2 tenants/{empresa}/studio/{id}/cena-N-vK.jpg
                     │ 7 Montador → repository_dispatch "studio_montar" ──► GitHub Actions studio-montar.yml
                     │                                                      Playwright desenha cada quadro (layout.ts)
                     │                                                      FFmpeg: MP4 H.264 High 4.1 / PNG
                     │ 8 Qualidade ◄── montagem_concluida ◄──────────────── ffprobe + preço (pixels + OCR) → R2
                     ▼
9 Distribuição (studio_entregar): anunciante → cliente_assets (análise de conteúdo de sempre) → playlists → Player
                                  owner/ADM → media (+ pasta da Biblioteca opcional) → playlists → Player
```

**Regras que o código garante:**

1. **Preço:**
   - O preço é gravado em centavos inteiros (o banco recusa 6.99).
   - O preço é escrito só por `layout.ts`.
   - Ele é conferido no **vídeo final**:
     - por **pixels** (SSIM ≥ 0,9 contra a arte feita com o preço gravado): **bloqueia**;
     - por **OCR**: informativo.
   - Os agentes **nunca recebem os valores**.
2. **Nada inventado:** `validarPlano` recusa:
   - preço, R$ ou % no texto;
   - palavra com maiúscula que não veio do pedido (marca ou loja inventada);
   - cenário que peça texto ou logo;
   - produto inexistente;
   - soma de durações errada.
3. **Produto real:**
   - O produto é a foto do cliente, recortada pelo código do Cartaz Digital ou, sem fundo liso, em moldura.
   - A IA gera só o cenário, sem produto, pessoas ou texto.
4. **Rótulo honesto na tela e no arquivo:**
   - "Vídeo montado a partir de imagens · cenário criado por IA";
   - "Imagem gerada por IA com o produto real".
   - "Vídeo gerado por IA" só existirá com um provedor real.
5. **Player intocado:** recebe MP4/PNG comuns por `cliente_assets`/`media` → playlists.

## 2. Arquivos

| Tipo | Arquivo | Papel |
|---|---|---|
| Migração | `supabase/migrations/20261349_studio_ia_producoes.sql` | Tabelas, RLS, estados, cota, ações do usuário, entrega. Aditiva, com bloco ROLLBACK |
| Migração | `supabase/migrations/20261350_studio_ia_cron.sql` | Tarefa do cron (aplicar **depois** de publicar a função) |
| Edge Function | `supabase/functions/studio-orquestrador/index.ts` | Orquestrador: tick, cutucar, provedores, dados/retorno da montagem |
| Compartilhado | `supabase/functions/_shared/studio/contrato.ts` | Tipos, estados, transições, validações, preço, cotas, custos |
| Compartilhado | `…/_shared/studio/agentes.ts` | Os 5 agentes de planejamento + ajuste de prompt |
| Compartilhado | `…/_shared/studio/pipeline.ts` | Sequência retomável dos agentes |
| Compartilhado | `…/_shared/studio/biblia.ts` | **Bíblia visual v1** (estilos por categoria, princípios, diretrizes por agente) |
| Compartilhado | `…/_shared/studio/provedores.ts` | Lista de provedores, bloqueios, adaptador Cloudflare, geração de cenário |
| Compartilhado | `…/_shared/studio/layout.ts` | HTML determinístico da cena (prévia = vídeo), `dadosDaCena` |
| Compartilhado | `…/_shared/studio/r2.ts` | Envio do servidor ao R2 (SigV4), só em `tenants/{empresa}/studio/{id}/` |
| Worker | `cloudflare/tabloide-ia/worker.js` (+ ação `studio-modelo`) | Executa só os modelos da lista. O pago exige `STUDIO_PERMITIR_IMAGEM_PAGA=1` |
| Actions | `.github/workflows/studio-montar.yml`, `scripts/studio/montar.mjs`, `scripts/studio/montagem.mjs`, `scripts/studio/package.json` | Montagem e conferência |
| Ensaio/teste | `scripts/studio/ensaio-local.mjs`, `scripts/studio/testar-banco.mjs`, `src/tests/unit/studioIA.test.ts` | Evidências (§7) |
| Telas | `src/components/studio/{comum,StudioCentral,BriefingWizard,ProducaoView,EditorCena,PreviaCena}.tsx`, `src/pages/studio/StudioPaginas.tsx`, `src/lib/studio/api.ts` | Studio |
| Alterados (pouco) | `src/App.tsx` (+6 rotas), `src/components/dashboard/Sidebar.tsx` (item "Studio IA" só para owner/ADM), `src/modules/crm/pages/portal/CriarMidiaPage.tsx` (o espaço reservado F-107 vira o Studio), `supabase/config.toml` (verify_jwt da função nova) | — |
| Supersedidos (sem apagar) | `src/components/studio/ArteModelo.tsx`, `src/lib/studio/{catalogo,modelos}.ts`, `public/studio/fotos/*` | Protótipo anterior. **Sugestão:** apagar com a autorização do dono |

**Não foram tocados:**
- login, RBAC, `portalAccess`, `CustomerPortalLayout`;
- financeiro, contratos;
- Player, ROM, OTA;
- o validador R2 (`fn_r2_validate_object_scope`), `get-upload-url`, `get-download-url`, `compress-video.yml`.

## 3. Banco e regras de acesso (RLS)

- `studio_producoes`, `studio_etapas`, `studio_uso`: RLS ligada; **só SELECT** para `authenticated`.
- Quem vê o quê:
  - anunciante: o próprio `cliente_id`;
  - owner/ADMIN: toda a empresa;
  - FINANCEIRO, GERENTE, GESTOR, REPRESENTANTE: nada.
- A regra NÃO usa `is_central_privileged()`.
- Toda alteração passa por funções `SECURITY DEFINER`:

  | Função | Ação |
  |---|---|
  | `studio_criar_producao` | Criar |
  | `studio_aprovar_plano` | Aprovar o plano |
  | `studio_pedir_replanejar` | Pedir ajuste do plano |
  | `studio_decidir_imagem` | Aprovar ou rejeitar uma versão de cena |
  | `studio_pedir_imagem` | Gerar uma nova versão de cena |
  | `studio_salvar_edicao` | Salvar uma versão da edição |
  | `studio_pedir_montagem` | Montar |
  | `studio_entregar` | Enviar para as mídias |
  | `studio_cancelar` | Cancelar |
  | `studio_tentar_de_novo` | Retomar após erro |

  Todas tiram empresa, cliente e usuário de `auth.uid()`.
- Funções só do orquestrador (sem acesso para usuários):
  - `studio_mudar_estado`: transição validada e protegida contra corrida;
  - `studio_reservar`: lease de 4 min, `SKIP LOCKED`;
  - `studio_consumir_cota`.
- **Idempotência:**
  - `unique(user_id, chave_idempotencia)`: o clique duplo devolve a mesma produção;
  - `studio_etapas.idempotencia`: um agente concluído nunca roda de novo;
  - `montagem.chave`: o retorno de uma montagem antiga é recusado.
- **Cota diária:**

  | Modalidade | Por pessoa | Por empresa |
  |---|---|---|
  | Plano | 10 | 60 |
  | Imagem | 40 | 200 |
  | Montagem | 10 | 60 |
  | Pagas | 0 | 0 |

  Também há limite de 3 produções em andamento por pessoa.
- **Auditoria:** toda ação do usuário vira uma etapa `usuario:*`.

## 4. Provedores

| Tipo | Provedor | Situação |
|---|---|---|
| Texto e visão | Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct` (esquema conferido na API oficial) | **Testado de verdade** (ensaio local). Grátis na cota |
| Imagem | Workers AI `@cf/black-forest-labs/flux-1-schnell` (≈ 96 neurons) | **Testado de verdade**. Grátis na cota |
| Imagem paga | Workers AI `@cf/leonardo/lucid-origin` (≈ US$ 0,087 por imagem 1920×1080) | Adaptador pronto, **desligado** |
| Montagem | GitHub Actions + FFmpeg + Playwright | Testada localmente com o mesmo código. Falta rodar no Actions |
| Vídeo por IA | Kling, Seedance ou Gemini | **Bloqueado:** sem provedor, orçamento nem chave. Nada simulado |
| Voz e música | — | **Bloqueados:** os vídeos saem com trilha muda (faixa de áudio silenciosa, por compatibilidade) |
| Canva | Connect API | **Bloqueado:** integração do dono. Passos em `ARQUITETURA_PROPOSTA.md` §7 |

**Para adicionar um provedor:**
1. Registre em `PROVEDORES` (`provedores.ts`), com `requer` e `bloqueio`.
2. Escreva o adaptador com a interface `Executar` (ou uma função como `gerarCenario`).
3. Coloque a chave **só** em segredo do Supabase ou do Worker.
4. Crie um teste em `studioIA.test.ts`.
5. Se for pago: crie uma modalidade em `COTA_DIARIA` **e** em `studio_consumir_cota` (o teste confere que as duas listas são iguais), mais a confirmação na tela.

## 5. Agentes, estilos e prompts

- **Novo agente:**
  1. Escreva a função em `agentes.ts`, usando `chamar()`, com esquema JSON e validador.
  2. Acrescente a diretriz em `biblia.ts` (`DIRETRIZ`).
  3. Encaixe em `pipeline.ts`, com uma chave de etapa única para a retomada.
  4. Dê o nome na tela em `AGENTES` (`ProducaoView.tsx`).
- **Novo estilo ou categoria:**
  1. Acrescente em `ESTILOS` (`biblia.ts`) e em `CATEGORIAS` (`contrato.ts`).
  2. Suba `VERSAO_BIBLIA`, porque cada etapa grava a versão usada.
- **Conhecimento aprovado (vindo do NotebookLM):** o dono revisa e o texto entra em `biblia.ts`. Nada em produção depende do NotebookLM.
- **Referências privadas (arquivos):** aguardam o bucket privado (MG02b). Os vídeos de terceiros da pasta local **não** foram importados.

## 6. Custos

- Cada etapa grava os neurons consumidos e o valor em dólar (`studio_etapas.neurons`, `custo_usd`). A produção acumula em `custo_neurons`.
- Consultas:
  - consumo do dia por empresa: `select modalidade, sum(quantidade), sum(neurons) from studio_uso where dia = current_date group by 1`;
  - por produção: a soma de `studio_etapas.neurons`.
- Ensaio real de 30/10/2026:
  - 6 chamadas de agentes, ≈ 360 neurons;
  - 4 cenários + 2 fotos de teste, ≈ 576 neurons;
  - total < 1.000 neurons, cerca de 10% da cota grátis diária, ou US$ 0 dentro dela.

## 7. Testes executados (evidências)

| Teste | Comando | Resultado |
|---|---|---|
| Unitários (contrato, preço, validadores, layout, provedores, retomada, SQL × código) | `npx vitest run src/tests/unit/studioIA.test.ts` | **23/23** |
| Banco real numa transação desfeita: migração + 29 casos (2 anunciantes de clientes diferentes, FINANCEIRO, GESTOR, ADMIN, OWNER, ADMIN de outra empresa, INSERT/UPDATE diretos, preço quebrado, promoção maior, vídeo IA bloqueado, função interna bloqueada, limite de andamento, transições, corrida, lease, entrega em `cliente_assets` PENDENTE, isolamento da mídia entregue) | `node scripts/studio/testar-banco.mjs` | **29/29**, e o banco conferido depois: 0 tabelas e 0 funções `studio_*`, `cliente_assets` inalterado |
| Agentes e imagens reais + montagem + conferência (16:9 e 9:16) | `node scripts/studio/ensaio-local.mjs <pasta> 16:9` | Plano válido (o Roteirista corrigiu sozinho em 3 tentativas). MP4 H.264 High, 1920×1080 / 1080×1920, 15,02 s, yuv420p, 5,6–6,1 MB. **Aprovado**. Preço no vídeo: SSIM 0,978–0,989 |
| Reprovação de preço trocado | (dentro do ensaio) | Gravado 19,90 × tela 6,99 → SSIM 0,46–0,54 → **reprovado** |
| Tipos estritos (código compartilhado) e sintaxe (orquestrador, scripts, Worker) | `tsc --strict`, `esbuild`, `node --check` | Sem erros |
| Build de produção | `vite build` | OK (`StudioPaginas`, `CriarMidiaPage`) |
| Navegador (conta de teste e2e-owner) | skill `conferir-painel` | Antes da migração mostra "Studio em ativação". Briefing completo, promoção maior recusada, revisão com o preço exato, 9:16 escolhido, celular 375 px sem rolagem lateral (dois defeitos achados e corrigidos) |

**Ainda NÃO testado (depende de publicar):**
- o orquestrador rodando no Supabase;
- o Worker com a ação nova;
- o workflow no Actions;
- o envio do servidor ao R2 (`r2.ts`);
- o fluxo completo na tela com dados reais;
- o vídeo tocando no emulador do Player.

## 8. Variáveis e segredos (nomes, sem valores)

| Onde | Nomes | Situação |
|---|---|---|
| Supabase (Edge) | `TABLOIDE_IA_URL`, `TABLOIDE_IA_SEGREDO`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`, `GITHUB_TOKEN`, `GITHUB_REPO` | Já existem (usados por outras funções) |
| Supabase (Edge) | **`STUDIO_SEGREDO`** | **Novo** |
| Supabase (Edge), opcional | `STUDIO_PERMITIR_IMAGEM_PAGA` | Só com autorização de gasto |
| GitHub Actions | `SUPABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Já existem (robô de conteúdo) |
| GitHub Actions | **`STUDIO_SEGREDO`** | **Novo**, o mesmo valor do Supabase |
| Worker Cloudflare | `SEGREDO` | Já existe |
| Worker Cloudflare, opcional | `STUDIO_PERMITIR_IMAGEM_PAGA` | Só com autorização de gasto |

## 9. Como operar

**Ativar (com autorização):**
1. Aplicar `20261349_studio_ia_producoes.sql` com `node scripts/ops/sql.mjs @…`.
2. Criar o segredo `STUDIO_SEGREDO` no Supabase e no GitHub.
3. Publicar o Worker: `node scripts/ops/publicar-worker-ia.mjs`.
4. Publicar a função: `supabase functions deploy studio-orquestrador`.
5. Aplicar `20261350_studio_ia_cron.sql`.
6. Commit e envio pelo `publicar-main.mjs` (o workflow só passa a existir no GitHub com o commit).
7. `node scripts/ops/contrato-player.mjs`.

**Homologar a distribuição para o Player:**
1. Produção de teste com a conta de teste até "Pronto".
2. Enviar para as mídias.
3. Pôr numa playlist de tela de teste.
4. Conferir a reprodução no emulador `TVBox_API25` e numa TV 16:9.
5. Repetir em 9:16 (TV em pé).

**Problemas comuns:**
- "cota diária gratuita de IA acabou": espere o dia seguinte e use "Tentar de novo", que é gratuito.
- Montagem sem resposta por 40 min: a produção vira erro; use "Tentar de novo".

**Retenção:** as versões rejeitadas ficam em `tenants/{empresa}/studio/{id}/`. A limpeza automática depende de uma regra de ciclo de vida no R2 (configuração da conta Cloudflare, com autorização).

## 10. O que depende de decisão ou autorização do dono

1. **Publicar.** Aplicar a migração, criar o segredo, publicar o Worker e a função, o cron, o commit e o envio (Vercel). Sem isso, o Studio mostra "em ativação".
2. **Menu do portal do anunciante.** Pôr "Studio IA" no menu do `CustomerPortalLayout`, que é arquivo protegido. Hoje a entrada é `/portal/criar-midia` e os botões "Crie sua mídia" dos pontos parceiros.
3. **Bucket privado** para a Biblioteca de Referências (MG02b).
4. **Origem dos 52 vídeos "VIDEOS EM PE"** da Biblioteca (R-02).
5. **Provedores de vídeo por IA, voz e música, e orçamento** (MG08/MG09).
6. **Integração Canva** (MG07).
7. **Imagem paga 1920×1080** (`lucid-origin`): autorizar gasto?
8. **Apagar o protótipo anterior** (`ArteModelo.tsx`, `catalogo.ts`, `modelos.ts`, `public/studio/fotos`).

## 11. Riscos restantes

- **R-03:** bucket R2 público com contratos (fora do Studio; o Studio não mexe).
- **R-04:** `is_central_privileged()` largo nas tabelas antigas (o Studio não usa).
- **Texto falso em cenário.** O gerador às vezes desenha "rótulos" ilegíveis em garrafas desfocadas do fundo, apesar do prompt. Mitigação: o cliente rejeita ou gera de novo a cena. Próximo passo sugerido: OCR do cenário para avisar.
- **OCR do preço:** o Tesseract erra dígitos grandes estilizados em alguns casos. Ele fica informativo; o bloqueio é por pixels, determinístico. Ver o relatório de qualidade de cada produção.
- **Resolução dos cenários grátis:** 1024×1024 ampliados para 1920. Fica aceitável em fundos desfocados (bokeh); o produto e o texto continuam nítidos. A opção nativa em 1920 é paga.
