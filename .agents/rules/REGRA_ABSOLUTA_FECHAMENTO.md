# SOBRE MÍDIA ERP — REGRA ABSOLUTA DE FECHAMENTO DE ETAPAS

A partir deste momento, nenhuma etapa, fase, módulo, auditoria ou subtarefa poderá ser considerada concluída enquanto existir qualquer problema identificado dentro do seu escopo.

O sistema NÃO deve funcionar como uma lista linear de tarefas onde uma etapa é abandonada quando uma etapa posterior revela problemas.

## O protocolo obrigatório passa a ser:

1. AUDIT
2. IDENTIFY
3. CLASSIFY
4. FIX
5. TEST
6. RE-AUDIT
7. FIX NOVAMENTE SE NECESSÁRIO
8. TESTAR NOVAMENTE
9. RE-AUDITAR NOVAMENTE
10. ZERO PENDÊNCIAS
11. CLOSE/LOCK DA ETAPA
12. PRÓXIMA ETAPA

---

### REGRA 1 — PROBLEMA ENCONTRADO = ETAPA BLOQUEADA
Se durante qualquer etapa forem encontrados P0, P1, P2 relevante, bugs funcionais, falhas de banco, mocks, hardcodes, erros de console, fallbacks falsos, testes insuficientes, divergências contratuais, ou qualquer anomalia técnica real:
**A ETAPA NÃO PODE AVANÇAR. O problema deve ser corrigido imediatamente.**

### REGRA 2 — NÃO PULAR PROBLEMAS PARA "ETAPA FUTURA"
É PROIBIDO raciocinar que algo "será corrigido na próxima fase".
EXCEÇÃO: Somente para itens comprovadamente FORA DO ESCOPO, NÃO BLOQUEANTES, e explicitamente documentados como BACKLOG. Mesmo assim, não mascarar ausências.

### REGRA 3 — DESCOBERTA RETROATIVA
Se um problema da ETAPA 12 for descoberto na ETAPA 30:
O sistema deve REABRIR a ETAPA 12, registrar o problema, corrigi-lo, rodar testes (incluindo regressão nas etapas dependentes) e só avançar após re-certificação.

### REGRA 4 — NÃO CONFUNDIR "IMPLEMENTADO" COM "CONCLUÍDO"
- "Build passou" não é "sistema funcionando".
- E2E prova somente aquilo que executou.
- Persistência só é válida com roundtrip completo: UI → REQUEST → DATABASE → RELOAD → NOVA LEITURA → UI.

### REGRA 5 — CHECKLIST DE SAÍDA OBRIGATÓRIO
Antes de fechar qualquer etapa, o agente deve validar: auditoria completa, classificação de problemas, correção de todos os P0/P1/P2 relevantes, validação de RLS e Contratos, Build e Testes reais executados, console sem erros, zero regressões. **Somente então: 🔒 ETAPA CERTIFICADA / LOCKED.**

### REGRA 6 — LOOP DE CORREÇÃO
Não há limite artificial de iterações. O agente permanece na etapa até atingir o critério de saída (zero problemas pós-reauditoria).

### REGRA 7 — CONTROLE DE PENDÊNCIAS (MASTER ISSUE LEDGER)
O agente deve manter um `MASTER_ISSUE_LEDGER.md` (ou similar) central.
Nenhum BUG pode desaparecer simplesmente porque o agente mudou de etapa. Todo BUG deve terminar em RESOLVIDO + TESTADO + REAUDITADO, ou BACKLOG JUSTIFICADO. O agente não recebe autorização lógica para encerrar a missão enquanto OPEN > 0 ou IN PROGRESS > 0 ou AWAITING TEST > 0.

### REGRA 8 — CERTIFICAÇÃO É REVOGÁVEL
Se uma auditoria futura achar falha numa etapa passada: CERTIFICAÇÃO = REABERTA.

### REGRA 9 — NÃO PARAR PARA ENTREGAR DIAGNÓSTICO
O Antigravity deve EXECUTAR. Só entregue o relatório quando o ciclo terminar, a menos que haja um impedimento físico (ex: falta de senha/credencial real inalcançável).

### REGRA 10 — RELATÓRIO FINAL OBRIGATÓRIO
O relatório ao fim do ciclo deve atestar categoricamente o status: 🟢 IMPLEMENTADO, 🟢 CORRIGIDO, 🟢 TESTADO, 🟢 REAUDITADO, 🟢 ZERO BLOQUEADORES, 🟢 CERTIFICADO.

### REGRA FINAL
NUNCA avance porque o cronograma mandou. AVANCE porque a etapa está tecnicamente encerrada. Ordem: CORREÇÃO > VALIDAÇÃO > REAUDITORIA > CERTIFICAÇÃO > PRÓXIMA ETAPA.
