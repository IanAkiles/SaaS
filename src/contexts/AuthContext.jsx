// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi, assinatura as assinaturaApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,        setUser]        = useState(null);
  const [assinatura,  setAssinatura]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [bloqueado,   setBloqueado]   = useState(false);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('bp_token');
    if (!token) { setLoading(false); return; }
    try {
      const res  = await authApi.me();
      setUser(res.data);
      // Verifica status da assinatura
      const as = res.data.assinatura_status;
      if (as === 'vencido' || as === 'bloqueado') setBloqueado(true);
    } catch {
      localStorage.removeItem('bp_token');
      localStorage.removeItem('bp_refresh');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();

    // Listener global de logout (disparado pelo api.js quando refresh falha)
    const onLogout = () => { setUser(null); setAssinatura(null); setBloqueado(false); };
    const onVencida = () => setBloqueado(true);
    window.addEventListener('bp:logout',            onLogout);
    window.addEventListener('bp:assinatura_vencida', onVencida);
    return () => {
      window.removeEventListener('bp:logout',             onLogout);
      window.removeEventListener('bp:assinatura_vencida', onVencida);
    };
  }, [loadUser]);

  const login = async (email, senha) => {
    const res = await authApi.login(email, senha);
    setUser(res.data.usuario);
    const status = res.data.usuario.assinatura_status;
    if (status === 'vencido' || status === 'bloqueado') setBloqueado(true);
    return res;
  };

  const register = async (dados) => {
    const res = await authApi.register(dados);
    setUser(res.data.usuario);
    return res;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setAssinatura(null);
    setBloqueado(false);
  };

  const isBarbeiro = user?.role === 'barbeiro';
  const isDono     = user?.role === 'dono';
  const isGerente  = user?.role === 'gerente';
  const isCliente  = user?.role === 'cliente';

  return (
    <AuthContext.Provider value={{
      user, assinatura, loading, bloqueado,
      login, register, logout, loadUser,
      isBarbeiro, isDono, isGerente, isCliente,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};

export default AuthContext;
