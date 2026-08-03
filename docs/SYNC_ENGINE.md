# 🔄 SOBRE MÍDIA ERP v2.0 — MOTOR DE SINCRONIZAÇÃO INCREMENTAL

**Sincronização Delta (`mobileSync.service.ts`)**

- **Processamento em Lote**: O motor de sincronização envia mutações pendentes em lote com controle de tentativas (*retry*).
- **Rastreabilidade**: Cada ciclo gera um log em `public.mobile_sincronizacao` registrando total de registros enviados, recebidos e eventuais conflitos resolvidos.
