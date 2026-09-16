# Governança SOBRE MÍDIA — Regra Suprema do Agente

> **Este arquivo é a fonte canônica de governança operacional do agente para o projeto SOBRE MÍDIA.** Toda alteração deve respeitar as regras abaixo. Em caso de conflito com instruções pontuais, prevalece a preservação de estrutura funcionando e o ciclo obrigatório.

## 1. PRESERVAÇÃO POR PADRÃO

Tudo que já funciona é considerado **PROTEGIDO**. `src/contexts/AuthContext.tsx`, `RouteGuards.tsx`, `useRbac.ts`, `portalAccess.ts`, `App.tsx`, `CrmLayout.tsx`, `CustomerPortalLayout.tsx`, `DashboardSidebar`, `PlayerEngine.tsx`, `DevicePairing`, `Player Android`, `RLS`, `Supabase migrations`, `banco`, `perfil/role`, `Pontos de Exibição`, `Prospecção`, `Meu Perfil`, `Portal do Anunciante`, `painel Representante/Gestor`, `Owner/Workspace`, `Services/APIs/RPCs`, `Device Token`, `Pairing`, `Playlist`, `sincronização` — e qualquer módulo com comportamento validado — NÃO pode ser alterado por conveniência.

## 2. PROVA ANTES DE ALTERAÇÃO

O agente NÃO pode alterar algo porque:
- parece errado;
- parece antigo;
- parece mal estruturado;
- existe implementação aparentemente melhor;
- pode ser refatorado/otimizado;
- pode ser esteticamente melhorado.

Alteração exige **problema real comprovado**: comportamento atual identificado + teste que comprove funcionamento atual + causa raiz demonstrada com teste reproduzível.

## 3. CICLO OBRIGATÓRIO

```
AUDITAR → REPRODUZIR → IDENTIFICAR CAUSA RAIZ → PROPOR ALTERAÇÃO MÍNIMA → IMPLEMENTAR → TESTAR → REGREDIR → REAUDITAR → VALIDAR PRODUÇÃO
```

Se falhar: `ABORTAR → INVESTIGAR CAUSA RAIZ → CORRIGIR SOMENTE A CAUSA → TESTAR NOVAMENTE`.

É **proibido** compensar regressão de um módulo alterando outro módulo sem evidência de relação causal (Regra 4).

## 4. NÃO CORRIGIR UMA REGRESSÃO CRIANDO OUTRA

Regressão nunca é compensada sem prova causal. Se uma correção quebra um portal, a correção deve ser revertida/repensada na sua causa, não mascarada com alteração lateral em outro sistema.

## 5. VALIDAR CADEIA REAL (SOBRE MÍDIA)

Nenhuma feature é considerada concluída por existir UI. Validação exige cadeia real:

```
UI → COMPONENTE → SERVICE → API/RPC → BANCO → RLS → DADO REAL → PAINEL → CONFIGURAÇÃO → PLAYER ANDROID → SINCRONIZAÇÃO → REPRODUÇÃO → RETORNO DO ESTADO AO SISTEMA
```

Evidência exigida: `OWNER → Banco → Services/RPC → Painéis → Configuração → Player Android → Sincronização → Reprodução → retorno`.

## 6. DADOS REAIS

Nenhuma funcionalidade concluída apenas por existir cards/botões/gráficos/indicadores/tabelas/filtros. Cada função deve estar conectada à fonte real de dados. Mocks, hardcoded ou placeholders somente quando explicitamente identificados como teste/desenvolvimento e nunca como dado de produção.

## 7. ISOLAMENTO DOS PORTAIS

- **OWNER**: acesso total e autonomia preservados.
- **REPRESENTANTE**: somente estrutura e permissões de Representante.
- **ANUNCIANTE**: somente Portal do Anunciante isolado.
- **GESTOR / GESTOR_MIDIAS**: somente painel próprio.
- **ADMIN**: somente permissões correspondentes ao papel.
- **SUPERVISOR/FINANCEIRO**: somente respectivas áreas.
- **PLAYER**: somente dispositivos, playlists, mídias e configurações autorizadas.

Nenhum perfil pode ser promovido, rebaixado ou redirecionado por fallback indevido (ex.: `usuario?.role?.name` como fallback para `perfilNome`). Fonte oficial comprovada: `usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null)`.

## 8. PLAYER ANDROID — ESTRUTURA CRÍTICA

Não modificar `Player`, `Device Token`, `Pairing`, `screen_id`, `playlists`, `sincronização`, `cache`, `offline/online`, `overlay`, `launcher`, `boot` sem primeiro provar problema real e demonstrar causa raiz. Proibida limpeza/refatoração/atualização estrutural/melhoria estética sem necessidade comprovada.

## 9. BANCO / RLS / RBAC

Não alterar banco, migrations, RLS, RPCs, RBAC ou guards por melhoria estrutural. Qualquer alteração exige: causa comprovada + impacto analisado + testes antes/depois + teste de isolamento + regressão dos demais perfis.

## 10. DEPLOY

`Build PASS ≠ sistema PASS`. `Teste unitário PASS ≠ integração PASS`. `HTTP 200 / Deploy 200 OK ≠ funcionalidade PASS`. Deploy só validado com testes funcionais + regressão + reauditoria.

## 11. COMMIT / PUSH

Durante auditoria **nunca** executar automaticamente `git add -A`, `git commit`, `git push`. Nunca incluir `scratch`, artefatos, builds, arquivos temporários, alterações do Player não relacionadas ou modificações não auditadas. Governança ≠ alteração de produção.

## 12. REGRA SUPREMA

```
SE ESTÁ FUNCIONANDO, PRESERVE.
SE NÃO SABE SE ESTÁ FUNCIONANDO, TESTE.
SE ESTÁ FUNCIONANDO, NÃO MEXA.
SE ESTÁ QUEBRADO, REPRODUZA.
SE REPRODUZIU, DESCUBRA A CAUSA RAIZ.
SE DESCOBRIU A CAUSA, ALTERE O MÍNIMO POSSÍVEL.
SE ALTEROU, TESTE TUDO QUE PODE TER SIDO AFETADO.
SE HOUVE REGRESSÃO, ABORTE E INVESTIGUE.
NUNCA ALTERAR UMA ESTRUTURA FUNCIONAL APENAS POR PARECER MELHOR.
```

### Gate de impacto obrigatório

Se alteração puder afetar `Owner, Representante, Anunciante, Gestor, RLS, RBAC, autenticação, Player, Device Token, Pairing, Playlist ou sincronização`, o agente deve **parar, identificar impacto e testar a cadeia completa** antes de modificar. Não assumir que é seguro.

### Referência de validação por perfil

Ver Skill `sobremidia-governanca` em `.opencode/skills/sobremidia-governanca/SKILL.md` para checklist operacional e matriz de testes.

## 13. REGRA ARQUITETURAL PERMANENTE & DEPENDENCY IMPACT GATE

> **NENHUMA implementação pode ser considerada concluída isoladamente quando existir outro módulo, serviço, dispositivo, fluxo ou consumidor que dependa dela.**

Toda alteração deve passar por:

```
NOVA ALTERAÇÃO
      ↓
IDENTIFICAR DEPENDÊNCIAS
      ↓
IDENTIFICAR CONSUMIDORES
      ↓
IDENTIFICAR CONTRATOS/INTERFACES
      ↓
VALIDAR IMPACTO
      ↓
IMPLEMENTAR
      ↓
TESTAR PRODUTOR
      ↓
TESTAR CONSUMIDORES
      ↓
TESTAR INTEGRAÇÃO
      ↓
PRODUÇÃO
      ↓
HOMOLOGAÇÃO
```

O sistema não aceita:
- Backend funcionando MAS Player quebrado
- UI funcionando MAS RPC quebrada
- Banco funcionando MAS serviço consumidor incompatível
- API funcionando MAS Android não consegue consumir

### Matriz Obrigatória do Dependency Impact Gate:
Para cada alteração, mapear e provar antes da conclusão:
- **QUEM PRODUZ?** (Supabase, Edge Function, RPC, Migration, Service)
- **QUEM CONSOME?** (Web Dashboard, PWA, Android Player Native, ExoPlayer, Display Físico)
- **QUAL CONTRATO?** (Schema, Payload JSON, Tipos, Nullability, Versioning, RPC signature)
- **QUAL DEVICE/PLAYER?** (Native Android Kotlin, Capacitor/WebView, TV Box, Smart TV)
- **SEGURO OFFLINE/ONLINE?** (Cache Room/LocalStorage, Reconciliação, Heartbeat, Proof of Play)
- **COMPATIBILIDADE ADITIVA?** (Alterações devem ser aditivas; nunca quebrar consumidores downstream antes de migrá-los)

---
*Persistido em 2026-08-27 / Atualizado em 2026-09-16 — Autorização cirúrgica + governança SOBRE MÍDIA + Dependency Impact Gate.*
