import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { isAccessTokenExpired, parseJwtPayload, setToken as persistToken } from '@/api';

type AuthState = {
  token: string | null;
  username: string | null;
  role: string | null;
  login: (token: string) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState<string | null>(() => {
    const t = localStorage.getItem('ps_token');
    if (!t) return null;
    if (isAccessTokenExpired(t)) {
      localStorage.removeItem('ps_token');
      return null;
    }
    return t;
  });

  const payload = useMemo(() => (token ? parseJwtPayload(token) : {}), [token]);

  const login = useCallback((newToken: string) => {
    persistToken(newToken);
    setTok(newToken);
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setTok(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      username: payload.username ?? null,
      role: payload.role ? String(payload.role).toLowerCase() : null,
      login,
      logout,
    }),
    [token, payload.username, payload.role, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
