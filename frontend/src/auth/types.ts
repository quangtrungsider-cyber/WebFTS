export type Role = 'admin' | 'analyst' | 'reviewer' | 'viewer' | 'demo';

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: Role;
  permissions: string[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
