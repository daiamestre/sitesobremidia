import React, { createContext, useContext, useEffect, useState } from 'react';
import { CorporateContextData, corporateBootstrap } from './CorporateBootstrap';
import { useIdentity } from '@/core/identity/IdentityContext';

interface CorporateContextType {
  contextData: CorporateContextData | null;
  loading: boolean;
  can: (permission: string) => boolean;
}

const CorporateContext = createContext<CorporateContextType>({
  contextData: null,
  loading: true,
  can: () => false
});

export const CorporateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contextData, setContextData] = useState<CorporateContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const { identity, can, loading: identityLoading } = useIdentity();

  useEffect(() => {
    let mounted = true;

    const initCorporate = async () => {
      if (identityLoading) return;
      
      if (!identity) {
        setLoading(false);
        return;
      }

      try {
        const data = await corporateBootstrap.loadContext();
        if (mounted) {
          setContextData(data);
        }
      } catch (error) {
        console.error('Failed to initialize corporate context', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initCorporate();

    return () => {
      mounted = false;
    };
  }, [identity, identityLoading]);

  return (
    <CorporateContext.Provider value={{
      contextData,
      loading: loading || identityLoading,
      can
    }}>
      {children}
    </CorporateContext.Provider>
  );
};

export const useCorporate = () => useContext(CorporateContext);
