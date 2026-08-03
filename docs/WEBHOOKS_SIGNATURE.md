# 🔄 SOBRE MÍDIA ERP v2.0 — MANUAL DE WEBHOOKS DE ASSINATURA DIGITAL

**Segurança e Idempotência de Webhooks**

- **Verificação HMAC**: Todos os webhooks recebidos de Clicksign, DocuSign, Adobe Sign, ZapSign, Assinafy possuem validação de chave secreta no header.
- **Idempotência**: Requisições repetidas com o mesmo `envelope_id` e `timestamp` são descartadas sem duplicar eventos.
- **Liberação Automática de PI**: Quando o payload confirma `evento: ASSINADO`, o sistema atualiza `public.contratos` para `ASSINADO` e desativa o bloqueio do Pedido de Inserção (`public.pedidos_insercao.status = LIBERADO`).
