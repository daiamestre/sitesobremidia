import { ReactNode } from 'react';
import { SmartInstallBanner } from './SmartInstallBanner';
import { PWAUpdatePrompt } from './PWAUpdatePrompt';
import { PWAOfflineIndicator } from './PWAOfflineIndicator';

interface PWAProviderProps {
  children: ReactNode;
}

export const PWAProvider = ({ children }: PWAProviderProps) => {
  return (
    <>
      {children}
      <PWAUpdatePrompt />
      <SmartInstallBanner />
      <PWAOfflineIndicator />
    </>
  );
};
