# ⚡ SOBRE MÍDIA ERP v2.0 — MANUAL DE OPERAÇÃO OLAP & CACHE

**Estratégia de Performance OLAP**

- **Fontes Exclusivas**: As consultas OLAP e BI utilizam estritamente o Data Warehouse (Migration `022`) e as tabelas analíticas da Migration `023`, sem tocar as tabelas operacionais em produção.
- **Cache & Materialização**: As views analíticas de agregação (`mv_receita_mensal`, `mv_player_health`) possuem atualização incremental concorrente.
- **Rastreabilidade**: Todas as consultas são auditadas com medição de tempo de execução em milissegundos na tabela `public.bi_consultas`.
