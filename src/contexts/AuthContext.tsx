// AuthContext.tsx
// Responsibility: Manage authentication state across the application.

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface AuthData {
  user_id: number;
  username: string;
  display_name: string;
  roli_verification: string | null;
}

interface AuthContextType {
  authData: AuthData | null;
  isLoading: boolean;
  login: (data: AuthData) => void;
  logout: () => Promise<void>;
  updateRoliVerification: (token: string) => Promise<void>;
  reloadAuthData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load auth data on mount
    loadAuthData();
  }, []);

  const loadAuthData = async () => {
    try {
      const data = await invoke<AuthData | null>('load_auth_data');
      setAuthData(data);
    } catch (error) {
      console.error('Failed to load auth data:', error);
      setAuthData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const reloadAuthData = async () => {
    try {
      const data = await invoke<AuthData | null>('load_auth_data');
      setAuthData(data);
    } catch (error) {
      console.error('Failed to reload auth data:', error);
      throw error;
    }
  };

  const login = (data: AuthData) => {
    setAuthData(data);
  };

  const logout = async () => {
    try {
      await invoke('logout');
      setAuthData(null);
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const updateRoliVerification = async (token: string) => {
    try {
      await invoke('update_roli_verification', { roliVerification: token });
      await reloadAuthData();
    } catch (error) {
      console.error('Failed to update roli verification:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ authData, isLoading, login, logout, updateRoliVerification, reloadAuthData }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
