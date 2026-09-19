import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import i18n from '../i18n/index.js';
import { apiFetch } from '../api/client.js';
import { demoLoginRequest, loginRequest, logoutRequest, registerRequest } from '../api/auth.js';
import { AuthContext } from './context.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Load the current user once on start (via /meta, which includes it).
  useEffect(() => {
    let active = true;
    apiFetch('/meta')
      .then((meta) => {
        if (!active) return;
        setUser(meta.user);
        if (meta.user?.locale && meta.user.locale !== i18n.language) {
          i18n.changeLanguage(meta.user.locale);
        }
      })
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const applyUser = useCallback(
    (nextUser) => {
      setUser(nextUser);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const login = useCallback(
    async (data) => {
      const { user: u } = await loginRequest(data);
      applyUser(u);
      return u;
    },
    [applyUser],
  );

  const register = useCallback(
    async (data) => {
      const { user: u } = await registerRequest(data);
      applyUser(u);
      return u;
    },
    [applyUser],
  );

  const demoLogin = useCallback(
    async (role) => {
      const { user: u } = await demoLoginRequest(role);
      applyUser(u);
      return u;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, loading, login, register, demoLogin, logout, setUser }),
    [user, loading, login, register, demoLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
