import React from 'react';
import { Navigate } from 'react-router-dom';
import { useIdentity } from '../identity/IdentityContext';

interface PermissionGuardProps {
  permission: string;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ permission, children }) => {
  const { can, loading } = useIdentity();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!can(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
