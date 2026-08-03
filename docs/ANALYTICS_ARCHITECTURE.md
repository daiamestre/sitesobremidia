# 🧠 SOBRE MÍDIA ERP v2.0 — ARQUITETURA DA CAMADA DE ANALYTICS

**Fase:** FASE 9.2 — Analytics & Data Warehouse  
**Data:** 31 de Julho de 2026

---

## 1. FLUXO DE EVENTOS ANALÍTICOS (EVENT-DRIVEN ARCHITECTURE)

A camada de Analytics consome assincronamente os eventos emitidos pelo `FinanceEventBus` e pelo NOC:
- `ContratoAssinado` ➔ Atualiza `dw_comercial` e `dw_receita`.
- `PagamentoRecebido` ➔ Atualiza `dw_financeiro` e recalcula liquidez.
- `ProofOfPlay` & `Heartbeat` ➔ Alimenta `dw_operacao` e `dw_ocupacao`.

---

## 2. ROADMAP DE PREPARAÇÃO PARA A FASE 9.3 (BUSINESS INTELLIGENCE)

Com o Data Warehouse Operacional (Fase 9.2) consolidado:
1. **Cubos Analíticos OLAP**: Agregações multidimensionais por tempo, região e tipo de tela.
2. **Consultas com Drill-down**: Navegação hierárquica (Estado ➔ Cidade ➔ Unidade ➔ Painel ➔ Mídia).
3. **Modelos Preditivos de IA**: Integração da Fase 9.7 para previsão de churn, ocupação da rede e faturamento futuro.
