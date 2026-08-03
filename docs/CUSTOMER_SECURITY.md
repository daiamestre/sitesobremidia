# 🛡️ SOBRE MÍDIA ERP v2.0 — SEGURANÇA OWASP DO PORTAL DO CLIENTE

**Isolamento e Segurança Multi-Tenant**

- **RLS Rigoroso**: O cliente só possui visibilidade sobre os registros atrelados ao seu `cliente_id` e `empresa_operadora_id`.
- **Trilha de Auditoria**: Todas as ações de login, download de faturas, abertura de chamados e aprovação de artes são auditadas em `public.portal_auditoria`.
