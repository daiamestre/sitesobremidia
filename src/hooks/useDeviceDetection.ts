import { useState, useEffect, useMemo } from 'react';

// Tipos de dispositivo suportados
export type DeviceType = 
  | 'android-mobile'      // Celular Android
  | 'android-tablet'      // Tablet Android
  | 'android-tv'          // Android TV / TV Box
  | 'fire-tv'             // Amazon Fire TV
  | 'ios-mobile'          // iPhone
  | 'ios-tablet'          // iPad
  | 'smart-tv'            // Smart TV genérica
  | 'desktop-windows'     // Windows
  | 'desktop-macos'       // macOS
  | 'desktop-linux'       // Linux
  | 'desktop-chromeos'    // ChromeOS
  | 'unknown';

// Navegadores suportados
export type BrowserType = 
  | 'chrome'
  | 'safari'
  | 'firefox'
  | 'edge'
  | 'samsung-internet'
  | 'opera'
  | 'brave'
  | 'unknown';

export interface DeviceInfo {
  deviceType: DeviceType;
  browserType: BrowserType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTV: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  isChrome: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  isSamsungInternet: boolean;
  isInstalled: boolean;
  canInstall: boolean;
  installMethod: 'prompt' | 'manual-ios' | 'manual-tv' | 'none';
  deviceName: string;
  installInstructions: string;
}

// Função de detecção pura (sem hooks) - executada uma vez
const detectDevice = (): DeviceInfo => {
  if (typeof window === 'undefined') {
    return getDefaultDeviceInfo();
  }

  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  
  // Detecção de instalação
  const isInstalled = 
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://');

  // Detecção de TV / TV Box
  const isFireTV = ua.includes('fire tv') || 
                   ua.includes('firetv') || 
                   ua.includes('aftb') || 
                   ua.includes('aftt') ||
                   ua.includes('afts') ||
                   ua.includes('aftm');
  
  const isAndroidTV = ua.includes('android tv') || 
                      ua.includes('googletv') ||
                      ua.includes('smart-tv') ||
                      ua.includes('smarttv') ||
                      (ua.includes('android') && (
                        ua.includes('tv') ||
                        ua.includes('box') ||
                        ua.includes('adt-') ||
                        ua.includes('mxq') ||
                        ua.includes('x96') ||
                        ua.includes('h96') ||
                        ua.includes('tx') ||
                        ua.includes('crkey')
                      ));
  
  const isSmartTV = ua.includes('webos') ||
                    ua.includes('tizen') ||
                    ua.includes('netcast') ||
                    ua.includes('viera') ||
                    ua.includes('bravia') ||
                    ua.includes('philipstv') ||
                    ua.includes('hbbtv') ||
                    ua.includes('nettv') ||
                    ua.includes('roku') ||
                    ua.includes('vidaa');

  // iOS
  const isIOS = /iphone|ipad|ipod/.test(ua) ||
                (platform.includes('mac') && navigator.maxTouchPoints > 1);
  const isIPad = /ipad/.test(ua) || 
                 (platform.includes('mac') && navigator.maxTouchPoints > 1);
  const isIPhone = /iphone|ipod/.test(ua);

  // Android
  const isAndroid = ua.includes('android') && !isAndroidTV && !isFireTV;
  const isAndroidTablet = isAndroid && !ua.includes('mobile');
  const isAndroidMobile = isAndroid && ua.includes('mobile');

  // Desktop
  const isWindows = ua.includes('windows') || platform.includes('win');
  const isMacOS = (ua.includes('mac') || platform.includes('mac')) && !isIOS;
  const isLinux = (ua.includes('linux') || platform.includes('linux')) && !isAndroid;
  const isChromeOS = ua.includes('cros');

  // Navegador
  const isSamsungInternet = ua.includes('samsungbrowser');
  const isEdge = ua.includes('edg/') || ua.includes('edge');
  const isFirefox = ua.includes('firefox');
  const isOpera = ua.includes('opr/') || ua.includes('opera');
  const isBrave = (navigator as any).brave !== undefined;
  const isChrome = ua.includes('chrome') && !isEdge && !isOpera && !isSamsungInternet && !isBrave;
  const isSafari = ua.includes('safari') && !isChrome && !isEdge && !isFirefox && !isOpera && !isSamsungInternet;

  // Tipo de dispositivo
  let deviceType: DeviceType = 'unknown';
  let browserType: BrowserType = 'unknown';
  
  if (isFireTV) deviceType = 'fire-tv';
  else if (isAndroidTV) deviceType = 'android-tv';
  else if (isSmartTV) deviceType = 'smart-tv';
  else if (isIPad) deviceType = 'ios-tablet';
  else if (isIPhone) deviceType = 'ios-mobile';
  else if (isAndroidTablet) deviceType = 'android-tablet';
  else if (isAndroidMobile) deviceType = 'android-mobile';
  else if (isWindows) deviceType = 'desktop-windows';
  else if (isMacOS) deviceType = 'desktop-macos';
  else if (isChromeOS) deviceType = 'desktop-chromeos';
  else if (isLinux) deviceType = 'desktop-linux';

  if (isSamsungInternet) browserType = 'samsung-internet';
  else if (isEdge) browserType = 'edge';
  else if (isFirefox) browserType = 'firefox';
  else if (isOpera) browserType = 'opera';
  else if (isBrave) browserType = 'brave';
  else if (isChrome) browserType = 'chrome';
  else if (isSafari) browserType = 'safari';

  const isMobile = deviceType === 'android-mobile' || deviceType === 'ios-mobile';
  const isTablet = deviceType === 'android-tablet' || deviceType === 'ios-tablet';
  const isTV = deviceType === 'android-tv' || deviceType === 'fire-tv' || deviceType === 'smart-tv';
  const isDesktop = deviceType.startsWith('desktop-');

  let installMethod: 'prompt' | 'manual-ios' | 'manual-tv' | 'none' = 'none';
  let canInstall = !isInstalled;

  if (isInstalled) {
    installMethod = 'none';
    canInstall = false;
  } else if (isTV) {
    installMethod = 'manual-tv';
  } else if (isIOS) {
    installMethod = 'manual-ios';
  } else if (isAndroid || isDesktop) {
    installMethod = 'prompt';
  }

  const deviceNames: Record<DeviceType, string> = {
    'android-mobile': 'Celular Android',
    'android-tablet': 'Tablet Android',
    'android-tv': 'Android TV / TV Box',
    'fire-tv': 'Amazon Fire TV',
    'ios-mobile': 'iPhone',
    'ios-tablet': 'iPad',
    'smart-tv': 'Smart TV',
    'desktop-windows': 'Windows',
    'desktop-macos': 'Mac',
    'desktop-linux': 'Linux',
    'desktop-chromeos': 'Chromebook',
    'unknown': 'Dispositivo',
  };

  const getInstallInstructions = (): string => {
    if (isInstalled) return 'O app já está instalado!';
    if (isTV) return 'Use o app em tela cheia ou acesse pelo navegador para melhor experiência.';
    if (isIOS) {
      if (isSafari) return 'Toque em "Compartilhar" e depois "Adicionar à Tela de Início"';
      return 'Abra no Safari para instalar. Toque em "Compartilhar" → "Adicionar à Tela de Início"';
    }
    if (isSamsungInternet) return 'Toque no menu (≡) e selecione "Adicionar à tela inicial"';
    if (isChrome || isEdge) return 'Clique em "Instalar" para adicionar ao seu dispositivo';
    if (isFirefox) return 'O Firefox não suporta instalação PWA. Use Chrome ou Edge.';
    return 'Instale o app para acesso rápido e offline';
  };

  return {
    deviceType,
    browserType,
    isMobile,
    isTablet,
    isDesktop,
    isTV,
    isAndroid: isAndroid || isAndroidTV || isFireTV,
    isIOS,
    isWindows,
    isMacOS,
    isLinux,
    isChrome,
    isSafari,
    isFirefox,
    isEdge,
    isSamsungInternet,
    isInstalled,
    canInstall,
    installMethod,
    deviceName: deviceNames[deviceType],
    installInstructions: getInstallInstructions(),
  };
};

function getDefaultDeviceInfo(): DeviceInfo {
  return {
    deviceType: 'unknown',
    browserType: 'unknown',
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    isTV: false,
    isAndroid: false,
    isIOS: false,
    isWindows: false,
    isMacOS: false,
    isLinux: false,
    isChrome: false,
    isSafari: false,
    isFirefox: false,
    isEdge: false,
    isSamsungInternet: false,
    isInstalled: false,
    canInstall: false,
    installMethod: 'none',
    deviceName: 'Dispositivo',
    installInstructions: '',
  };
}

// Cache da detecção para evitar re-cálculos
let cachedDeviceInfo: DeviceInfo | null = null;

export const useDeviceDetection = (): DeviceInfo => {
  // Calcular apenas uma vez
  const deviceInfo = useMemo(() => {
    if (cachedDeviceInfo) return cachedDeviceInfo;
    cachedDeviceInfo = detectDevice();
    return cachedDeviceInfo;
  }, []);

  const [isInstalled, setIsInstalled] = useState(deviceInfo.isInstalled);

  // Listener para mudança de display-mode (quando o app é instalado)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
      // Atualizar cache
      if (cachedDeviceInfo) {
        cachedDeviceInfo = { ...cachedDeviceInfo, isInstalled: e.matches, canInstall: !e.matches };
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Retornar versão atualizada se instalação mudou
  return useMemo(() => ({
    ...deviceInfo,
    isInstalled,
    canInstall: !isInstalled && deviceInfo.installMethod !== 'none',
  }), [deviceInfo, isInstalled]);
};
