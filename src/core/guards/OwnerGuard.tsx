import React from 'react';
import { Navigate } from 'react-router-dom';
import { useIdentity } from '../identity/IdentityContext';

export const OwnerGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { identity, loading } = useIdentity();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Double check
  if (!identity || !identity.isOwner) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
