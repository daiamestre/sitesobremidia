# SOBRE MÍDIA — PLAYER & BACKEND CONTRACT SPECIFICATION

> **Status:** CANONICAL CONTRACT  
> **Última Atualização:** 2026-09-16  
> **Governança:** `AGENTS.md` (Regras 5, 9, 13 e 14)  
> **Objetivo:** Definir o contrato formal de dados, interfaces RPC, DTOs e semântica de comunicação entre o Backend Supabase e o Android Player Nativo.

---

## 1. ENDPOINTS E RPCs CANÔNICAS

### 1.1 `get_player_playlist_for_screen`
- **Assinatura:** `public.get_player_playlist_for_screen(p_identifier TEXT, p_device_id TEXT) RETURNS JSONB`
- **Permissão:** `SECURITY DEFINER` (Acesso autenticado via token de dispositivo ou sessão; concedido para `anon`, `authenticated`, `service_role`).
- **Parâmetros:**
  - `p_identifier`: UUID da tela ou `custom_id` cadastrado no CRM (ex: `TEL-E2E-A-1789577447633`).
  - `p_device_id`: Hash imutável de identificação do hardware do cliente (ex: SHA-256 do Android ID / Serial).
- **Contrato de Resposta (JSON):**
```json
{
  "status": "SUCCESS | DEVICE_ALREADY_BOUND | SCREEN_NOT_FOUND | SCREEN_SUSPENDED | SCREEN_ACCESS_DENIED | DEVICE_ACCESS_DENIED | DEVICE_REVOKED | NO_PLAYLIST_ASSIGNED | PLAYLIST_NOT_FOUND | PLAYLIST_EMPTY",
  "device": {
    "id": "uuid",
    "name": "string",
    "custom_id": "string | null",
    "orientation": "landscape | portrait",
    "resolution": "string (ex: 1920x1080)",
    "status": "active | maintenance | offline",
    "bound_device_id": "string | null"
  },
  "playlist": {
    "id": "uuid",
    "name": "string",
    "version": 1,
    "updated_at": "ISO8601 string",
    "items": [
      {
        "id": "uuid",
        "position": 1,
        "duration": 15,
        "media": {
          "id": "uuid",
          "title": "string",
          "type": "video | image | web",
          "url": "https://... (Cloudflare R2 / Supabase Storage)",
          "sha256": "string (64 hex) | null",
          "file_size": 10485760
        }
      }
    ]
  }
}
```

#### Semântica de Retorno Canônica:
- `SUCCESS`: A tela foi identificada e autorizada. Se `bound_device_id` era `NULL`, foi amarrada automaticamente a `p_device_id`. A playlist e os itens são retornados.
- `DEVICE_ALREADY_BOUND`: A tela já está vinculada a outro aparelho (`screens.bound_device_id != p_device_id`) ou o aparelho já está vinculado a outra tela. O Player reage exibindo o diálogo de transferência/desvinculação.
- `SCREEN_NOT_FOUND`: Nenhum registro de tela encontrado para `p_identifier`.
- `SCREEN_SUSPENDED`: Tela desativada (`is_active = false`), contrato sob suspensão financeira ou bloqueio de expansão pendente de pagamento.
- `SCREEN_ACCESS_DENIED`: Usuário ou dispositivo sem permissão de acesso à empresa/tenant da tela.
- `DEVICE_ACCESS_DENIED`: Identidade física de hardware inválida, vazia ou `UNKNOWN_DEVICE`.
- `DEVICE_REVOKED`: O vínculo deste aparelho foi revogado explicitamente pelo administrador.
- `NO_PLAYLIST_ASSIGNED`: Tela encontrada e ativa, porém sem nenhuma playlist associada (`playlist_id IS NULL`).
- `PLAYLIST_NOT_FOUND`: `playlist_id` associado não foi localizado na tabela `playlists`.
- `PLAYLIST_EMPTY`: Tela ativa com playlist existente, porém sem mídias ativas disponíveis para reprodução (`jsonb_array_length(items) = 0`). O Player entra no estado de espera correspondente à ausência de programação ("Aguardando programação de mídias no painel..."), preservando o comportamento já implementado no `PlayerRepositoryImpl`.

---

### 1.2 `admin_unpair_screen`
- **Assinatura:** `public.admin_unpair_screen(p_screen_id TEXT DEFAULT NULL) RETURNS JSONB`
- **Permissão:** `SECURITY DEFINER` (Exige usuário autenticado `auth.uid() IS NOT NULL` com perfil OWNER/ADMIN ou operador responsável).
- **Parâmetros:**
  - `p_screen_id`: Identificador textual da tela (aceita tanto formato UUID nativo quanto código legível `custom_id`).
- **Ação:** Remove o vínculo de hardware da tela (`screens.bound_device_id = NULL`), desassocia o dispositivo correspondente em `devices` e registra evento de auditoria.
- **Códigos de Retorno:**
  - `{"status": "SUCCESS", "message": "Tela desvinculada com sucesso.", "screen_id": "...", "previous_device_id": "..."}`
  - `{"status": "UNAUTHORIZED", "message": "Usuario nao autenticado."}`
  - `{"status": "INVALID_SCREEN_ID", "message": "ID da tela nao informado."}`
  - `{"status": "SCREEN_NOT_FOUND", "message": "Tela nao encontrada."}`
  - `{"status": "FORBIDDEN", "message": "Sem permissao para desvincular esta tela."}`

---

### 1.3 `app_releases` (Manifest OTA)
- **Tabela:** `public.app_releases`
- **Contrato:**
```sql
CREATE TABLE public.app_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_code INTEGER NOT NULL UNIQUE,
    version_name VARCHAR(50) NOT NULL,
    apk_url TEXT NOT NULL,
    sha256 VARCHAR(64),
    release_notes TEXT,
    is_mandatory BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

#### Regras de Validação do Manifest:
1. `version_code`: Monotônico crescente. Dispositivos ignoram releases com `version_code <= local_version_code`.
2. `apk_url`: Obrigatório protocolo `https://`.
3. `sha256`: Hash SHA-256 do arquivo APK (64 caracteres hexadecimais em lowercase). Se presente, a instalação SÓ é autorizada se o APK baixado produzir exatamente o mesmo hash.

---

## 2. MAPEAMENTO DE DTOs KOTLIN (Downstream Consumer)

```
Supabase JSON
    ↓
com.antigravity.sync.dto.RpcStatusResponse
com.antigravity.sync.dto.DeviceRemoteDTO
com.antigravity.sync.dto.PlaylistRemoteDTO
com.antigravity.sync.dto.PlaylistItemRemoteDTO
    ↓
Mapeamento de Domínio
    ↓
com.antigravity.core.domain.Playlist
com.antigravity.core.domain.PlaylistItem
com.antigravity.core.domain.Media
    ↓
Persistência Local (Room Database)
    ↓
ScreenEntity, PlaylistEntity, MediaItemEntity
    ↓
Handoff ao ExoPlayer
    ↓
androidx.media3.exoplayer.ExoPlayer.setMediaItems(...)
```

---

## 3. GARANTIAS DE COMPATIBILIDADE ADITIVA

1. **Campos Opcionais:** Qualquer nova propriedade adicionada aos objetos JSON (`device`, `playlist`, `items`) deve ser estritamente aditiva (`nullable` ou com default) no cliente Kotlin.
2. **Nenhuma Remoção de Campos Ativos:** Nenhum campo consumido pelo Player (`id`, `orientation`, `url`, `duration`, `position`) pode ser removido do backend enquanto houver Players em campo.
3. **Mapeamento Defensivo:** Desserializadores utilizam `ignoreUnknownKeys = true` no `kotlinx.serialization` para tolerar novos campos do backend sem quebrar a execução.
