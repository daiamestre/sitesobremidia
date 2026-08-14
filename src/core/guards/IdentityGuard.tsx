import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useIdentity } from '../identity/IdentityContext';

export const IdentityGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, loading } = useIdentity();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!identity) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!identity.active) {
    return <Navigate to="/auth?error=inactive" replace />;
  }

  return <>{children}</>;
};
