/// <reference types="vite/client" />
import type { NativePlayerBridge } from './types/native-bridge';

// virtual:pwa-register/react é declarado em src/types/virtual-pwa.d.ts

declare global {
  interface Window {
    // Single source of truth: src/types/native-bridge.d.ts (matches WebAppInterface.kt)
    NativePlayer?: NativePlayerBridge;
    onScreenshotReady?: (base64: string | null) => void;
  }
}
