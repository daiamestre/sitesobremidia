# 💾 SOBRE MÍDIA ERP v2.0 — ARQUITETURA OFFLINE-FIRST & PERSISTÊNCIA LOCAL

**Persistência Offline Garantida (`offlineStorage.service.ts`)**

- **Fila Local**: Mutações executadas em áreas sem conectividade de rede (check-ins, visitas, relatórios de vistoria) são enfileiradas imediatamente na memória local.
- **Resiliência a Falhas**: Nenhuma operação é perdida; quando a conexão é restabelecida, o `mobileSyncService` descarrega a fila com resolução de conflitos.
