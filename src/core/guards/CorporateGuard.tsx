import React from 'react';
import { Navigate } from 'react-router-dom';
import { useCorporate } from '@/modules/corporate/bootstrap/CorporateContext';

export const CorporateGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { contextData, loading } = useCorporate();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!contextData || !contextData.organization) {
    // Cannot access corporate module without an organization context
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
