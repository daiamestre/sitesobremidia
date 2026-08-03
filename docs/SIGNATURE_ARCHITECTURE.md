# 🏗️ SOBRE MÍDIA ERP v2.0 — ARQUITETURA DE EVENTOS DE ASSINATURA

**Eventos Publicados pelo Domínio de Assinatura**

- `ContratoEnviadoParaAssinatura`: Disparado quando o envelope é gerado no provedor.
- `ContratoAssinado`: Disparado no recebimento do Webhook de confirmação.
- `PILiberado`: Disparado logo em seguida, notificando a Produção e o NOC para veiculação da campanha.
