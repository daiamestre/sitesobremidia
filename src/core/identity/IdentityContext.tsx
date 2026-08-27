import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserIdentity } from './types';
import { identityService } from './IdentityService';

interface IdentityContextType {
  identity: UserIdentity | null;
  loading: boolean;
  can: (permission: string) => boolean;
}

const IdentityContext = createContext<IdentityContextType>({
  identity: null,
  loading: true,
  can: () => false
});

export const IdentityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initializeIdentity = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const loadedIdentity = await identityService.loadIdentity(session.user.id);
          if (mounted) {
            setIdentity(loadedIdentity);
          }
        }
      } catch (error) {
        console.error('Error initializing identity:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeIdentity();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const loadedIdentity = await identityService.loadIdentity(session.user.id);
        if (mounted) setIdentity(loadedIdentity);
      } else if (event === 'SIGNED_OUT') {
        identityService.clear();
        if (mounted) setIdentity(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <IdentityContext.Provider value={{
      identity,
      loading,
      can: (permission: string) => identityService.can(permission)
    }}>
      {children}
    </IdentityContext.Provider>
  );
};

export const useIdentity = () => useContext(IdentityContext);
