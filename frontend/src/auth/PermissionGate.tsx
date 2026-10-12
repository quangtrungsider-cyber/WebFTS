import React from 'react';
import { useAuth } from './AuthProvider';

interface PermissionGateProps {
  children: React.ReactNode;
  permission?: string;
  permissions?: string[]; // requires any of these
  fallback?: React.ReactNode;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({ 
  children, 
  permission, 
  permissions, 
  fallback = null 
}) => {
  const { hasPermission, hasAnyPermission, isLoading } = useAuth();

  if (isLoading) return null;

  let hasAccess = true;

  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = hasAnyPermission(permissions);
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
