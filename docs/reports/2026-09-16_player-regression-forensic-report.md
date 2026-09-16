# RELATÓRIO FORENSE DE CAUSA-RAIZ: REGRESSÃO DO PLAYER ANDROID

> **Data:** 2026-09-16  
> **Sistema:** SOBRE MÍDIA Platform  
> **Componente:** Native Android Player & Hardware Binding RPC  
> **Status:** INVESTIGADO, REPRODUZIDO, CORRIGIDO E HOMOLOGADO

---

### 1. O QUE QUEBROU?
O Player Android nativo falhava ao carregar a playlist após a inicialização e não conseguia reproduzir o conteúdo programado para a tela do cliente, permanecendo bloqueado com a notificação: *"Esta tela já está em uso por outro aparelho."*

### 2. POR QUE QUEBROU?
O sistema possui uma regra estrita de exclusividade de hardware no backend: a coluna `screens.bound_device_id` só pode estar vinculada a um único `device_id` por vez. Quando um novo dispositivo Android ou ambiente de teste tentava reivindicar uma tela previamente associada a outro identificador de hardware, a RPC `get_player_playlist_for_screen` retornava `status = "DEVICE_ALREADY_BOUND"`. No aplicativo Android, a tela de seleção não oferecia opção para o operador autenticado reatribuir ou desvincular o aparelho anterior, gerando um impasse operacional irreversível no cliente.

### 3. QUAL ALTERAÇÃO INTRODUZIU A REGRESSÃO?
A introdução do isolamento estrito de hardware na migração da RPC `get_player_playlist_for_screen` (para evitar colisão de múltiplos dispositivos na mesma tela comercial) foi concluída sem o correspondente fluxo de desvinculação/transferência na interface de pareamento do Player Android nativo.

### 4. QUAL CONTRATO FOI QUEBRADO?
O contrato de governança de ciclo de vida de telas: embora existisse a RPC administrativa `admin_unpair_screen(p_screen_id)` no banco, o aplicativo Android nativo (`RemoteDataSource.kt`) não consumia essa RPC e a interface (`ScreenSelectionActivity.kt`) tratava a colisão de forma puramente impeditiva (Toast de erro), em vez de acionar a autoridade de transferência para o usuário autenticado.

### 5. QUAL COMPONENTE FALHOU?
- `native-android-player/app/src/main/java/com/antigravity/player/ui/ScreenSelectionActivity.kt`
- `native-android-player/sync-network/src/main/java/com/antigravity/sync/service/RemoteDataSource.kt`

### 6. COMO FOI CORRIGIDO?
1. Em `RemoteDataSource.kt`, foi implementado o método `adminUnpairScreen(screenId: String): Boolean`, que invoca com sucesso a RPC `admin_unpair_screen(p_screen_id)`.
2. Em `ScreenSelectionActivity.kt`, quando uma tela selecionada já possui outro `boundDeviceId` vinculado, o sistema exibe um diálogo de confirmação ("Transferir Tela") que realiza a desvinculação prévia via `adminUnpairScreen` e, em seguida, efetua o binding legítimo para o novo hardware.

### 7. COMO O TESTE PROVA?
O teste de homologação cruzada (`scratch/test_complete_microgate_player.mjs` e suite de homologação) comprovou:
- Teste 1: Hardware inicial realiza o claim da tela e recebe playlist (`PASS`).
- Teste 7: Dispositivo concorrente é inicialmente rejeitado com `DEVICE_ALREADY_BOUND` (`PASS`).
- Teste de transferência: Após desvinculação via `admin_unpair_screen`, o novo hardware consegue assumir a tela e carregar a playlist instantaneamente (`PASS`).

### 8. COMO EVITAR NOVAMENTE?
Com a ativação permanente do **Dependency Impact Gate (Regras 13 e 14 de `AGENTS.md`)**: qualquer alteração em RPCs de telas, dispositivos ou playlists obriga o mapeamento e validação de todos os consumidores Android antes que a alteração seja considerada concluída.
