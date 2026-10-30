# Roteiro de micro-gates

Data: 30/10/2026. Cada gate é pequeno, verificável e só começa com autorização.

**Regras de todo gate:**
- `git status` antes de começar.
- Nada de `git add -A`, `reset --hard` ou `clean -fd`.
- Commit e publicação só com autorização.
- Banco: skill `migracao-segura`.
- Rodar `node scripts/ops/contrato-player.mjs`.
- Conferir no navegador com a conta de teste.

| Gate | Entrega | Teste de aceite | Custo | Bloqueio |
|---|---|---|---|---|
| **MG00** | Esta auditoria (5 documentos) | Revisão do dono | R$ 0 | — |
| **MG01** Pedido e estados | Migração: `studio_producoes`, `studio_etapas`, `studio_uso`, com regras próprias. Tela `/portal/studio` (e `/dashboard/studio` para owner/ADM) com: ideia, fotos (envio que já existe), produtos e preços, loja, formato 16:9/9:16, duração, tipo de saída e "Criar com IA". Lista de produções com estados reais. **Sem IA ainda** | 1) Pedido com 2 produtos gravado como "recebido", com os preços exatos. 2) Outro anunciante **não** vê o pedido (teste de RLS com 2 contas de teste). 3) FINANCEIRO não vê o pedido. 4) `contrato-player.mjs` sem diferença | R$ 0 | Aprovação da arquitetura |
| **MG02** Diretor Criativo + Especialista de Cena | Edge Function `studio-orquestrador` + `pg_cron` de 1 min. Diretriz `agentes/diretor.v1.md`. Plano JSON validado por esquema: cenas, tempos, câmera, luz, prompts. Estado "aguardando aprovação do plano" | 1) Pedido de 15 s → cenas que somam 15 s. 2) Os preços R$ 19,90 e R$ 26,46 aparecem só por `id` do produto e ficam intactos. 3) Sem loja informada, nenhum nome de loja ou marca inventado (o validador recusa). 4) Custo registrado em `studio_etapas` | ≈ US$ 0,003 por plano (cota grátis) | Publicar o Worker (rota de texto) |
| **MG02b** Biblioteca de Referências | `studio_referencias` + `studio_prompts`, envio privado, Analista de Referências (quadros por FFmpeg + visão), ficha aprovada pelo dono, busca por segmento e tags | 1) 1 foto e 1 vídeo enviados → fichas geradas e aprovadas. 2) O Diretor cita fichas no plano. 3) Nenhuma referência aparece no seletor da playlist nem na Biblioteca. 4) O link assinado expira. 5) Anunciante não acessa | Centavos (cota grátis) | **Bucket privado** (R-03) |
| **MG03** Imagens | Imagem por cena: FLUX com a foto do cliente como referência, ou produto recortado sobre um cenário gerado. Arquivos em `tenants/{empresa}/studio/<id>/…`. Rótulo "Imagem gerada por IA" | 1) Uma imagem por cena no R2, listada na produção. 2) Cota estourada → mensagem clara, sem cobrança. 3) Sem marca ou texto inventado na imagem (o OCR não acha texto) | ≈ 125 neurons por imagem (cota grátis) | Publicar o Worker (rota de imagem) |
| **MG04** Montagem | Workflow `studio-montar` (`repository_dispatch`): Playwright desenha textos e preços; FFmpeg monta movimento, transições e MP4 no perfil do `compress-video` (H.264 High 4.1); PNG final; miniatura | 1) MP4 de 15,0 s ±0,2 em 1920×1080 **e** 1080×1920. 2) Preços legíveis. 3) Rótulo "Vídeo montado a partir de imagens". 4) Toca no emulador do Player (TV e TV Box API 25) sem mudar o Player | R$ 0 (Actions) | — |
| **MG05** Qualidade + Bibliotecário + entrega | Conferência: ffprobe + OCR do preço + visão. Cliente → `cliente_assets` (moderação de sempre). Owner/ADM → `media` + pasta do segmento. "Ver, baixar, adicionar às mídias" | 1) Preço trocado de propósito → **reprovado**. 2) Aprovado → aparece em Minhas Mídias e entra numa playlist do próprio cliente. 3) Não entra em tela de outro cliente | Centavos | — |
| **MG06** Edição rápida interna | Camadas editáveis (texto, preço, logo, foto) sobre o resultado, com o motor de `ArteModelo.tsx`. Nova versão = nova etapa | Trocar o preço gera a versão 2 com o OCR correto. A versão 1 continua disponível | R$ 0 | — |
| **MG07** Canva (equipe do dono) | OAuth em Edge Function, modelos mestres com campos, autofill → `edit_url` → volta → exportação → R2 | Modelo preenchido com o preço exato, aberto e editado no Canva, voltou e foi exportado em MP4 1080p para a Biblioteca | R$ 0 + plano Canva do dono | Integração criada pelo dono; plano Pro/Teams; confirmar se o autofill é *preview* |
| **MG08** Vídeo por IA | Adaptador do provedor escolhido, webhook ou consulta periódica, teto de gasto | Vídeo de 5 s gerado, com o rótulo "Vídeo gerado por IA", custo registrado e preço desenhado por cima | Pago | Provedor, orçamento e chave |
| **MG09** Voz e trilha | Narração pt-BR e trilha licenciada | Locução sem erro de pronúncia nos preços (lida do número exato) | R$ 0 (Piper) ou US$ 6/mês | Escolher o provedor |
| **MG10** Catálogo automático + homologação | Galeria por segmento a partir das produções aprovadas (filtros de `catalogo.ts`). Lote de modelos por segmento feito pelo dono | Contagens da galeria = registros reais. Homologação de ponta a ponta com 3 segmentos | Conforme os provedores | Todos os anteriores |

## Recomendação do primeiro gate de implementação

**MG01 (Pedido e estados)**, porque:
- custa R$ 0 e não depende de provedor, bucket nem Canva;
- cria a base de dados e de permissões que todos os outros gates usam;
- prova cedo o isolamento entre clientes (o risco R-04 não se repete);
- não toca no Player, no login, nas finanças nem na Vercel além das rotas novas da página.

**Em paralelo, decisões do dono que destravam os gates seguintes:**
1. Origem dos 52 vídeos "VIDEOS EM PE" da Biblioteca (R-02).
2. Bucket privado para referências (R-03), antes do MG02b.
3. Autorização para publicar o Worker de IA atualizado, antes do MG02.
4. Provedores de vídeo e voz, e orçamento, antes do MG08/MG09.
5. Integração Canva e plano Pro/Teams, antes do MG07.
