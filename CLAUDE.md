# SOBRE MÍDIA — atalhos (curto de propósito: carrega em toda mensagem)

- Responder e explicar **sempre em português do Brasil**, inclusive nos avisos de progresso.
- Governança: `AGENTS.md`. Sempre corrigir, commitar e publicar (Vercel + Supabase; OTA quando for Player).
- **Vercel é plano GRÁTIS (limite de 10 GB de funções):** enviar sempre com `node scripts/ops/publicar-main.mjs` (trava de teto diário), juntar várias correções num envio só, nunca criar função nova em `api/`.
- **Onde mexer em cada pedido:** `docs/MAPA_DO_PROJETO.md`. Leia a linha do assunto, não o projeto inteiro.
- Comandos prontos (SQL, deploy, conferir site, comparar telas, sessão de teste, publicar Player): `scripts/ops/README.md`.
- Receitas (skills): `deploy-producao`, `release-player`, `migracao-segura`, `conteudo-automatico`, `conferir-painel`.
- **Player 5.7.10 = versão comercial (canal estável).** APK novo sai SEMPRE como teste (`publicar-player.mjs`), nunca vai sozinho aos aparelhos; só o dono aprova a promoção (`--promover`). Painel/servidor nunca quebram o 5.7.10: `node scripts/ops/contrato-player.mjs`. Funcionamento formal: `docs/OPERACAO_DO_SISTEMA.md`.
- Player Android: `docs/PLAYER_REFERENCIA.md`. Histórico de correções: `docs/engineering/FINDINGS_LEDGER.md` (buscar com grep, não ler inteiro).
