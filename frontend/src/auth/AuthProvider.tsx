import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthState } from './types';

interface AuthContextType extends AuthState {
  login: (token: string, user: User, rememberMe: boolean) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'webfts.auth.token';
const USER_KEY = 'webfts.auth.user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const initAuth = () => {
      try {
        const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
        const userStr = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
        
        if (token && userStr) {
          const user = JSON.parse(userStr) as User;
          setState({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
          setupFetchInterceptor(token, handleUnauthorized);
        } else {
          setState(s => ({ ...s, isLoading: false }));
        }
      } catch (e) {
        setState(s => ({ ...s, isLoading: false }));
      }
    };
    initAuth();
  }, []);

  const handleUnauthorized = () => {
    logout();
    if (window.location.pathname !== '/login' && window.location.pathname !== '/unauthorized') {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
  };

  const login = (token: string, user: User, rememberMe: boolean) => {
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
    
    setupFetchInterceptor(token, handleUnauthorized);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    
    // Clear fetch interceptor
    setupFetchInterceptor(null, handleUnauthorized);
  };

  const hasPermission = (permission: string): boolean => {
    if (!state.user || !state.user.permissions) return false;
    if (state.user.permissions.includes('*')) return true;
    if (state.user.permissions.includes(permission)) return true;
    
    const parts = permission.split('.');
    if (parts.length > 1) {
      const wildcard = `${parts[0]}.*`;
      if (state.user.permissions.includes(wildcard)) return true;
    }
    return false;
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some(hasPermission);
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, hasPermission, hasAnyPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Setup global fetch interceptor
const originalFetch = window.fetch;
let currentToken: string | null = null;
let onUnauthorizedCb: (() => void) | null = null;

const setupFetchInterceptor = (token: string | null, onUnauthorized: () => void) => {
  currentToken = token;
  onUnauthorizedCb = onUnauthorized;
};

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const isApi = typeof input === 'string' && input.startsWith('/api');
  
  if (isApi && currentToken) {
    init = init || {};
    init.headers = {
      ...init.headers,
      'Authorization': `Bearer ${currentToken}`
    };
  }
  
  const response = await originalFetch(input, init);
  
  if (isApi && (response.status === 401 || response.status === 403)) {
    // Note: for 403 we might want a different handling, but let's clear for now 
    // or just trigger unauthorized
    if (response.status === 401 && onUnauthorizedCb) {
      onUnauthorizedCb();
    } else if (response.status === 403) {
       // Just throw or let the application handle 403 Forbidden.
       // E.g. we might redirect to /unauthorized for 403.
       if (window.location.pathname !== '/unauthorized') {
          window.location.href = '/unauthorized';
       }
    }
  }
  
  return response;
};
