# SOBRE MÍDIA — PLAYER & BACKEND CONTRACT SPECIFICATION

> **Status:** CANONICAL CONTRACT  
> **Última Atualização:** 2026-09-16  
> **Governança:** `AGENTS.md` (Regras 5, 9, 13 e 14)  
> **Objetivo:** Definir o contrato formal de dados, interfaces RPC, DTOs e semântica de comunicação entre o Backend Supabase e o Android Player Nativo.

---

## 1. ENDPOINTS E RPCs CANÔNICAS

### 1.1 `get_player_playlist_for_screen`
- **Assinatura:** `public.get_player_playlist_for_screen(p_identifier TEXT, p_device_id TEXT) RETURNS JSONB`
- **Permissão:** `SECURITY DEFINER` (Acesso autenticado via token de dispositivo ou sessão).
- **Parâmetros:**
  - `p_identifier`: UUID da tela ou `custom_id` cadastrado no CRM (ex: `TEL-E2E-A-1789577447633`).
  - `p_device_id`: Hash imutável de identificação do hardware do cliente (ex: SHA-256 do Android ID / Serial).
- **Contrato de Resposta (JSON):**
```json
{
  "status": "SUCCESS | DEVICE_ALREADY_BOUND | SCREEN_NOT_FOUND | PLAYLIST_NOT_FOUND",
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

#### Semântica de Retorno:
- `SUCCESS`: A tela foi identificada. Se `bound_device_id` era `NULL`, foi amarrada automaticamente a `p_device_id`. A playlist e os itens são retornados.
- `DEVICE_ALREADY_BOUND`: A tela já está vinculada a outro aparelho (`screens.bound_device_id != p_device_id`). O Player bloqueia o playback até desvinculação autorizada.
- `SCREEN_NOT_FOUND`: Nenhum registro de tela encontrado para `p_identifier`.
- `PLAYLIST_NOT_FOUND`: Tela encontrada, mas sem nenhuma playlist ativa associada.

---

### 1.2 `admin_unpair_screen`
- **Assinatura:** `public.admin_unpair_screen(p_screen_id UUID) RETURNS JSONB`
- **Permissão:** Exige usuário autenticado com permissão de gestão da tela (`auth.uid() = owner_id` ou cargo administrativo).
- **Ação:** Define `screens.bound_device_id = NULL` e registra evento de auditoria.
- **Retorno:** `{"status": "SUCCESS"}`

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
