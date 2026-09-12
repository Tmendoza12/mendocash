import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('finanzas_user') || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [mustSetPassword, setMustSetPassword] = useState(() => localStorage.getItem('finanzas_must_set_password') === '1');

  const hasPermission = useCallback(
    (perm) => {
      if (!user) return false;
      return user.permissions?.includes(perm) || false;
    },
    [user]
  );

  useEffect(() => {
    const token = localStorage.getItem('finanzas_token');
    if (token) {
      api
        .get('/auth/me')
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('finanzas_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('finanzas_token', res.data.token);
    localStorage.setItem('finanzas_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const loginWithGoogle = async (identity) => {
    const res = await api.post('/auth/google', identity);
    localStorage.setItem('finanzas_token', res.data.token);
    localStorage.setItem('finanzas_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    localStorage.removeItem('finanzas_token');
    localStorage.removeItem('finanzas_user');
    setUser(null);
  };

  const updateUser = (u) => {
    setUser(u);
    localStorage.setItem('finanzas_user', JSON.stringify(u));
  };

  const clearMustSetPassword = () => {
    localStorage.removeItem('finanzas_must_set_password');
    setMustSetPassword(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, mustSetPassword, clearMustSetPassword, login, loginWithGoogle, logout, hasPermission, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
