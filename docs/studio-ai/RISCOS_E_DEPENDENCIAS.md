# Riscos e dependências

Data: 30/10/2026. Riscos achados na auditoria, por gravidade. Nenhum foi corrigido aqui: a etapa é só leitura.

## Riscos

| # | Risco | Evidência | Gravidade | Tratamento proposto |
|---|---|---|---|---|
| R-01 | **Direito autoral do acervo de referência**: 25 vídeos do TikTok (`ssstik.io`), 3 do Pinterest (`PinDown.io`), páginas do Vimeo e imagens tiradas da página de referência | pasta local `01_REFERENCIAS_ORIGINAIS` | Alta | Licença "só estudo". Nunca publicar e nunca usar como imagem de entrada do gerador. Só fichas em texto |
| R-02 | 🔍 A Biblioteca de produção tem 7 pastas "VIDEOS EM PE …" com 52 vídeos, nas **mesmas quantidades** da pasta local de downloads. Os nomes foram trocados. 0 usos em playlist hoje | `biblioteca_pastas`/`biblioteca_itens`/`playlist_items` | Alta, se forem os mesmos arquivos | O dono confirma a origem. Se forem downloads de terceiros, tirar da Biblioteca publicável ou marcar como referência privada. **Não mexi em nada** |
| R-03 | 🔍 **Bucket R2 único com domínio público.** Contratos (`tenants/{empresa}/…`, 31 PDFs) ficam no mesmo bucket servido pelo `R2_PUBLIC_DOMAIN`. Se o domínio expõe o bucket inteiro, quem tiver a chave do objeto abre o PDF sem login. **Não testei** com chave real, para não acessar documento sensível | `get-upload-url:149-211`, `get-download-url`, `contratos.pdf_object_key` | Alta (fora do escopo do Studio) | Validar a configuração do domínio na conta Cloudflare. Para o Studio: **bucket privado separado** para referências e rascunhos (exige autorização do dono) |
| R-04 | `is_central_privileged()` inclui GESTOR, GERENTE, **FINANCEIRO** e SUPERVISOR. Esses perfis veem e apagam `cliente_assets` de todos os clientes da empresa | definição viva + `policy_*_cliente_assets` | Média | Nas tabelas do Studio, usar regra própria (cliente = o seu; owner/ADMIN = a empresa). Rever a regra atual é tarefa separada (Auth 🔒) |
| R-05 | Perfis `GESTOR_MIDIAS`/`GESTOR_TELAS` existem no código e **não** existem no banco | `portalAccess.ts:27` × `perfis` | Baixa | Definir com o dono quem é "Gestor de Mídias" no Studio (hoje = GESTOR) |
| R-06 | Regra de caminho do R2: uma chave na raiz que não esteja em `media` pode ser gravada por qualquer usuário logado | `fn_r2_validate_object_scope` (trecho "zonas legadas") | Baixa (o portal usa `{uid}/portal/…`) | O Studio grava só em `tenants/{empresa}/studio/…`. Revisão da regra fica à parte |
| R-07 | IA "simulada" mostrada a clientes como análise do Gemini | `ai.service.ts:24` | Média (reputação) | Corrigir à parte. Nunca reaproveitar |
| R-08 | **Canva:** a integração privada só serve ao time Canva do dono. A edição pelo cliente exige integração pública (revisão), e o autofill pode ser API *preview* (🔍), o que bloquearia a revisão. Designs e links ficam na conta conectada; `edit_url` vale 30 dias e o download, 24 h | canva.dev (ver MG00 §7) | Média | 1ª fase: só a equipe do dono edita no Canva; o cliente usa a edição rápida interna |
| R-09 | **Marcas de terceiros** no estilo da referência (Brahma, Itaipava…) | página de referência | Alta | O gerador nunca escreve marca nem rótulo. Produto de marca só pela foto enviada pelo cliente, com o texto desenhado por código |
| R-10 | **Preço errado** num anúncio | regra do dono | Alta | Preço só pelo Montador (código) + OCR comparando com o valor digitado. Divergência → reprovado |
| R-11 | Custo descontrolado de vídeo e imagem paga | sem provedor de vídeo hoje | Alta, quando ligado | Aprovação do plano antes, cota, idempotência, teto mensal por empresa, sem repetição automática paga |
| R-12 | Fidelidade do produto em "vários ângulos": a IA pode deformar o rótulo e o formato | limite conhecido dos geradores | Média | Opção "produto real recortado + cenário gerado" como padrão para embalagem com rótulo. Ângulos novos gerados por IA rotulados como tal |
| R-13 | Limites do plano grátis: Workers AI 10.000 neurons/dia; Actions grátis só porque o repositório é **público** | Cloudflare/GitHub | Média | Medir por produção em MG02. Se o repositório virar privado, a montagem passa a ter custo |
| R-14 | Vercel no limite (plano grátis, 10 GB de funções) | `CLAUDE.md` | Média | Nada do Studio roda na Vercel |
| R-15 | Pessoa real em imagem/vídeo (consentimento e uso de imagem) | — | Média | Confirmação do cliente no envio. Proibido gerar rosto de pessoa real identificável |

## Dependências e bloqueios

| Dependência | Bloqueia | Quem resolve |
|---|---|---|
| Aprovar a arquitetura e o primeiro gate | Tudo | Dono |
| Bucket R2 privado (ou validar o domínio público) | Referências (MG02b) e rascunhos privados | Dono autoriza; a criação é feita na conta Cloudflare dele |
| Atualizar o Worker de IA (rota nova, modelos `flux-2-klein`/`gpt-oss-120b`) | Imagens com referência e agentes melhores | Autorização para publicar o Worker (`publicar-worker-ia.mjs`) |
| Provedor de vídeo por IA (Kling, Seedance ou Gemini Omni) + orçamento + chave | "Vídeo gerado por IA" | Dono |
| Provedor de voz pt-BR (Piper aberto a testar ou ElevenLabs pago) | Narração | Dono |
| Integração Canva Developers + plano Pro/Teams do dono | Modelos editáveis no Canva | Dono cria a integração (não posso criar contas) |
| Origem dos 52 vídeos da Biblioteca (R-02) | Uso desses vídeos como modelo | Dono |
| Commit e publicação | Toda entrega | Só com autorização explícita do dono |
