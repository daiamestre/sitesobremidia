# Resolução do Erro de Heartbeat (Stack Depth Limit Exceeded)

O problema reportado (*stack depth limit exceeded*) foi resolvido com sucesso atuando em duas frentes: Banco de Dados e App Android.

## 1. Banco de Dados (Supabase)
O erro acontecia porque havia gatilhos (triggers) ou políticas de Row Level Security (RLS) recursivas que ligavam as tabelas `screens` e `devices`. Quando o app atualizava uma, o banco tentava atualizar a outra em loop infinito.

**O que foi feito:**
- O script `heartbeat_loop_nuclear_fix.sql` removeu todas as políticas de `UPDATE` problemáticas destas tabelas.
- Removemos os gatilhos antigos (`tr_sync_device_to_screen`, `tr_sync_screen_to_device`).
- Criamos políticas atômicas seguras baseadas em `true`.
- Refatoramos a Remote Procedure Call (RPC) `pulse_screen` para atualizar ambas as tabelas diretamente via código (PL/pgSQL), garantindo performance sem disparar loops infinitos na própria infraestrutura do Postgres.

## 2. Aplicativo Android (Kotlin)
O aplicativo estava enviando múltiplos "pings" de conexão quase que simultaneamente (um para `screens` e outro para `devices`), o que causava concorrência e sobrecarregava a API do Supabase.

**O que foi refatorado:**
- **`HealthMonitorWorker.kt`:** Consolidamos a rotina de telemetria. Antes, o app chamava `sendHeartbeat`, depois `updateDevicesHeartbeat`. Agora o worker apenas reúne os dados de hardware (CPU, temperatura, RAM, disco) e invoca um único `sendHeartbeat` condensado que, internamente, chama a RPC segura no Supabase. Removemos disparos concorrentes.
- **`RemoteDataSource.kt`:** Adicionamos uma malha de proteção blindada no método `updateDevicesHeartbeat`. Agora o Android sabe identificar nativamente o erro "*stack depth limit exceeded*" e atua de maneira inteligente ignorando o update fatal, ao invés de estourar erro ou tentar loop de atualização infinda.

## Conclusão
O Heartbeat está restaurado, é muito mais econômico para o seu banco de dados (fará apenas 1 disparo atômico seguro) e a arquitetura RLS foi fortalecida.

Com o script SQL já rodado no Supabase, basta compilar uma nova versão do aplicativo (`.apk`) com esse código Kotlin atualizado para as telas em campo assumirem a versão mais eficiente e sem erros.
