# 📺 Player de Mídia Digital Signage - Documentação Técnica

## 🎯 Visão Geral

Este documento descreve a arquitetura e implementação de um **Player de Mídia profissional** para Digital Signage, projetado para operação contínua 24/7 em TVs, painéis LED e dispositivos dedicados.

---

## 1. 🔐 AUTENTICAÇÃO E CONEXÃO COM O DASHBOARD

### 1.1 Fluxo de Autenticação

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Player Init   │───▶│   Tela Login     │───▶│   Supabase Auth │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                              ┌─────────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │   JWT Token      │
                    │   Refresh Token  │
                    └──────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
┌──────────────────┐                     ┌──────────────────┐
│  Associar Tela   │                     │  Carregar Config │
│  (screen_id)     │                     │  - Resolução     │
└──────────────────┘                     │  - Proporção     │
                                         │  - Playlists     │
                                         │  - Widgets       │
                                         └──────────────────┘
```

### 1.2 Checklist de Autenticação

- [x] Login com email/senha via Supabase Auth
- [x] Armazenamento seguro de tokens (localStorage com refresh automático)
- [x] Associação do player a uma tela específica (screen_id)
- [x] Recebimento automático de configurações
- [x] Ping periódico para status online/offline
- [x] Reconexão automática em caso de falha

### 1.3 Por que essas decisões são importantes

| Decisão | Motivo | Impacto na Estabilidade |
|---------|--------|-------------------------|
| JWT + Refresh Token | Evita reautenticação constante | Player não precisa de intervenção manual |
| Associação por screen_id | Permite configuração individualizada | Cada tela opera independentemente |
| Ping periódico | Dashboard monitora status em tempo real | Alertas de offline automáticos |

---

## 2. 🔄 SINCRONIZAÇÃO E ATUALIZAÇÃO AUTOMÁTICA

### 2.1 Arquitetura de Sincronização

```
┌─────────────────────────────────────────────────────────────────┐
│                         DASHBOARD                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Mídias    │  │  Playlists  │  │  Schedules  │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE REALTIME                             │
│         (WebSocket - Postgres Changes)                           │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         PLAYER                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Listener de Tempo Real                                  │    │
│  │  - Atualização instantânea de playlists                 │    │
│  │  - Mudança de schedule em tempo real                    │    │
│  │  - Atualização de configurações de widgets              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Fallback: Polling (se WebSocket falhar)                │    │
│  │  - Verificação a cada 60 segundos                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Eventos Monitorados

| Evento | Ação do Player |
|--------|----------------|
| playlist_items INSERT/UPDATE/DELETE | Recarrega itens da playlist |
| screen_schedules UPDATE | Verifica e troca playlist se necessário |
| screens UPDATE | Atualiza configurações (widgets, proporção) |
| media UPDATE | Atualiza URL da mídia se alterada |

### 2.3 Checklist de Sincronização

- [x] Sincronização inicial ao carregar
- [x] Supabase Realtime para atualizações instantâneas
- [x] Fallback para polling em conexões instáveis
- [x] Verificação de schedules a cada minuto
- [x] Cache local de mídias para operação offline

---

## 3. ▶️ EXECUÇÃO DAS MÍDIAS

### 3.1 Algoritmo de Execução da Playlist

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOOP DE REPRODUÇÃO                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  1. Obter item atual (índice N) │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  2. Pré-carregar item N+1       │
            │     (em paralelo, background)   │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  3. Identificar tipo de mídia   │
            │     - Imagem → Timer (duration) │
            │     - Vídeo → onEnded event     │
            └─────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌──────────────────┐            ┌──────────────────┐
    │     IMAGEM       │            │      VÍDEO       │
    │ setTimeout()     │            │ onEnded()        │
    │ duration * 1000  │            │ autoPlay=true    │
    └──────────────────┘            └──────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
            ┌─────────────────────────────────┐
            │  4. Aplicar transição           │
            │     (fade, slide, zoom, etc.)   │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  5. Incrementar índice          │
            │     N = (N + 1) % total_items   │
            └─────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────┐
            │  6. Liberar memória do item N-1 │
            │     (cleanup de referências)    │
            └─────────────────────────────────┘
                              │
                              └──────────────▶ Repetir
```

### 3.2 Transições Suportadas

| Transição | CSS Animation | Performance |
|-----------|---------------|-------------|
| fade | opacity 0→1 | ⭐⭐⭐⭐⭐ Leve |
| zoom-in | scale 0.8→1 | ⭐⭐⭐⭐ Leve |
| zoom-out | scale 1.2→1 | ⭐⭐⭐⭐ Leve |
| slide-left | translateX 100%→0 | ⭐⭐⭐⭐ Leve |
| slide-right | translateX -100%→0 | ⭐⭐⭐⭐ Leve |
| slide-up | translateY 100%→0 | ⭐⭐⭐⭐ Leve |
| slide-down | translateY -100%→0 | ⭐⭐⭐⭐ Leve |
| blur | blur 20px→0 | ⭐⭐⭐ Moderado |
| rotate | rotate 5deg→0 | ⭐⭐⭐ Moderado |

### 3.3 Proporção e Escala

O player respeita 3 modos de exibição:

1. **Contain (padrão)**: Mantém proporção, pode ter letterbox
2. **Cover**: Preenche tela, pode cortar bordas
3. **Fill**: Estica para preencher (distorce imagem)

---

## 4. 💾 CACHE, OFFLINE E PERFORMANCE

### 4.1 Estratégias de Cache

```
┌─────────────────────────────────────────────────────────────────┐
│                      ESTRATÉGIA DE CACHE                         │
└─────────────────────────────────────────────────────────────────┘

1. CACHE DE MÍDIA (IndexedDB/Cache API)
   ├── Imagens: Cache no Service Worker
   ├── Vídeos: Download em background para blob
   └── Limite: 500MB (configurável)

2. GERENCIAMENTO INTELIGENTE
   ├── LRU (Least Recently Used) para limpeza
   ├── Prioridade: Playlist atual > Próxima > Outras
   └── Pré-download da próxima mídia

3. OPERAÇÃO OFFLINE
   ├── Playlist completa em cache local
   ├── Configurações salvas em localStorage
   └── Reconexão automática quando online
```

### 4.2 Prevenção de Vazamento de Memória

| Problema | Causa | Solução |
|----------|-------|---------|
| Acúmulo de elementos | Não remover DOM antigo | Usar key única, cleanup em useEffect |
| Listeners órfãos | Não remover event listeners | return () => cleanup no useEffect |
| Timers vazados | setTimeout não limpo | clearTimeout no cleanup |
| Vídeos em buffer | Vídeo antigo ainda carregando | video.src = '' antes de trocar |
| URLs não revogados | createObjectURL sem revogar | URL.revokeObjectURL() |

### 4.3 Código de Cleanup (Anti-vazamento)

```typescript
// Exemplo de cleanup correto
useEffect(() => {
  const timer = setTimeout(/* ... */);
  const videoElement = document.getElementById('video');
  
  return () => {
    // 1. Limpar timers
    clearTimeout(timer);
    
    // 2. Pausar e limpar vídeo
    if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement.load(); // Força liberação de buffer
    }
    
    // 3. Revogar URLs
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  };
}, [dependency]);
```

---

## 5. ⚙️ CONFIGURAÇÕES DO PLAYER

### 5.1 Modos de Operação

| Modo | Descrição | Uso |
|------|-----------|-----|
| Kiosk | Interface bloqueada, sem controles | Produção |
| Debug | Mostra info de debug | Desenvolvimento |
| Preview | Permite navegação manual | Teste |

### 5.2 Configurações de Tela

```json
{
  "screen": {
    "id": "uuid",
    "name": "TV Recepção",
    "orientation": "landscape",
    "resolution": "1920x1080",
    "aspect_ratio": "16:9",
    "object_fit": "contain"
  },
  "widgets": {
    "clock": { "enabled": true, "position": "bottom-left" },
    "weather": { "enabled": true, "position": "bottom-right" },
    "rss": { "enabled": false }
  },
  "behavior": {
    "auto_fullscreen": true,
    "hide_cursor": true,
    "prevent_sleep": true
  }
}
```

---

## 6. 🧱 STACK TECNOLÓGICA

### 6.1 Tecnologia Atual (Web)

| Componente | Tecnologia | Justificativa |
|------------|------------|---------------|
| Framework | React + Vite | SPA leve, hot reload, build otimizado |
| Estilização | Tailwind CSS | Animações CSS puras, sem JS overhead |
| Estado | React Hooks | Simples, sem biblioteca externa |
| Backend | Supabase | Auth + Realtime + Storage integrados |
| Transições | CSS Animations | GPU-accelerated, 60fps |

### 6.2 Player Nativo (Futuro)

Para dispositivos como **Android TV, Fire TV**:

| Tecnologia | Prós | Contras |
|------------|------|---------|
| **React Native + Expo** | Reutiliza código React | Performance moderada |
| **Flutter** | Alto desempenho | Curva de aprendizado |
| **Kotlin/Java (Nativo)** | Melhor performance | Código específico Android |
| **Electron** | Web para Desktop | Consumo de memória alto |

**Recomendação**: Para TVs, usar **WebView otimizada** ou **React Native for TV**.

---

## 7. ⚠️ LIMITAÇÕES E SOLUÇÕES

### 7.1 Problemas Reais

| Limitação | Impacto | Solução |
|-----------|---------|---------|
| **Codecs de vídeo** | Alguns MP4 não rodam | Converter para H.264 baseline |
| **4K em hardware limitado** | Travamentos | Transcodar para 1080p |
| **WebView vs Nativo** | Performance inferior | Usar flags de GPU |
| **Memória em TVs baratas** | Crashes após horas | Reload periódico programado |
| **Conexão instável** | Tela preta | Cache offline robusto |

### 7.2 Configurações de Hardware

```javascript
// Para TV com hardware limitado:
const VIDEO_CONFIG = {
  maxResolution: '1080p', // Não usar 4K
  preloadNext: 1,         // Apenas próximo item
  cacheSize: 200,         // MB máximo
  reloadInterval: 6,      // Horas até reload preventivo
};
```

---

## 8. 📋 CHECKLIST COMPLETO DE IMPLEMENTAÇÃO

### Fase 1: Core (Implementado ✅)
- [x] Autenticação via Supabase
- [x] Carregamento de playlist
- [x] Reprodução de imagens e vídeos
- [x] Transições animadas
- [x] Fullscreen automático
- [x] Ping de status

### Fase 2: Sincronização (Implementar 🔄)
- [x] Polling para schedules
- [ ] Supabase Realtime para updates instantâneos
- [ ] Cache offline com Service Worker
- [ ] Pré-carregamento de mídias

### Fase 3: Robustez (Implementar 🔄)
- [ ] Reconexão automática
- [ ] Reload preventivo (a cada X horas)
- [ ] Logs de erros para dashboard
- [ ] Modo fallback (imagem padrão)

### Fase 4: Avançado (Futuro 📅)
- [ ] Suporte a playlists por zona
- [ ] Picture-in-picture
- [ ] Integração com sensores
- [ ] Player nativo para Android TV

---

## 9. 📌 COMANDOS DO PLAYER

| Tecla | Ação |
|-------|------|
| F | Toggle fullscreen |
| ESC | Sair do fullscreen |
| ← → | Navegar manualmente |
| T | Trocar transição |
| W | Toggle widgets |

---

## 10. 🔗 URLs do Player

```
/player/:screenId
```

Exemplo: `/player/a1b2c3d4-e5f6-7890-abcd-ef1234567890`

---

*Documentação atualizada em: Janeiro 2025*
*Versão: 1.0*
