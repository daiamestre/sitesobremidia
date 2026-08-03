# 🛡️ SOBRE MÍDIA ERP v2.0 — SEGURANÇA E AUDITORIA DE ASSINATURAS

**Segurança Legal & RLS**

- **Hashes SHA256**: O hash do documento original e assinado é gravado de forma imutável em `public.assinaturas`.
- **Armazenamento Seguro R2**: PDFs originais e assinados são salvos em `tenants/{tenant}/assinaturas/{envelope_id}_signed.pdf` com chave privada e suporte a auditoria por IP/User Agent.
