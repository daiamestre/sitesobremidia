# SOBRE MÍDIA — atalhos (curto de propósito: carrega em toda mensagem)

- Responder e explicar **sempre em português do Brasil**, inclusive nos avisos de progresso.
- **Onde paramos / o que falta:** `node scripts/ops/onde-paramos.mjs` e `docs/ESTADO_DO_SISTEMA.md`; regras já decididas: `docs/DECISOES_DO_DONO.md`. Ao terminar, atualizar os dois e o FINDINGS_LEDGER (skill `retomar-trabalho`).
- Governança: `AGENTS.md`. Sempre corrigir, commitar e publicar (Vercel + Supabase; OTA quando for Player).
- **Vercel é plano GRÁTIS (limite de 10 GB de funções):** enviar sempre com `node scripts/ops/publicar-main.mjs` (trava de teto diário), juntar várias correções num envio só, nunca criar função nova em `api/`.
- **Onde mexer em cada pedido:** `docs/MAPA_DO_PROJETO.md`. Leia a linha do assunto, não o projeto inteiro.
- Comandos prontos (SQL, deploy, conferir site, comparar telas, sessão de teste, publicar Player): `scripts/ops/README.md`.
- Receitas (skills): `deploy-producao`, `release-player`, `migracao-segura`, `conteudo-automatico`, `conferir-painel`, `encartes-e-palcos`, `retomar-trabalho`.
- **Player 5.7.10 = versão comercial (canal estável).** APK novo sai SEMPRE como teste (`publicar-player.mjs`), nunca vai sozinho aos aparelhos; só o dono aprova a promoção (`--promover`). Painel/servidor nunca quebram o 5.7.10: `node scripts/ops/contrato-player.mjs`. Funcionamento formal: `docs/OPERACAO_DO_SISTEMA.md`.
- **REGRA do dono (obrigatória em todo encarte, atual ou novo):** todo balão de preço e todo botão com texto e valor organizados e CENTRALIZADOS. Balão só por `ESTILOS_DE_BALAO` (`src/lib/studio/palco.ts`); rodar `src/tests/unit/regraBaloesCentralizados.test.ts`.
- **REGRA do dono (toda tela de edição de encarte ou modelo, atual ou nova):** ferramentas completas por padrão, sem o dono precisar pedir: tocar em qualquer elemento (produto, nome, balão, botão, logo, faixa) e poder mover, aumentar, girar, trocar, mudar texto, fonte, cor e movimento (o movimento escolhido repete 2 vezes), trocar logo pela pasta Logos e trocar produto (lista, galeria ou IA). Base: `components/studio/editor` (Palco + Paineis); elemento novo é um objeto só. Teste: `src/tests/unit/studioEdicaoCompleta249.test.ts`.
- Player Android: `docs/PLAYER_REFERENCIA.md`. Histórico de correções: `docs/engineering/FINDINGS_LEDGER.md` (buscar com grep, não ler inteiro).
