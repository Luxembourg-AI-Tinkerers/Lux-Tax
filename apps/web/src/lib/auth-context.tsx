'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserDto, AuthResponseDto } from '@luxtax/contracts';
import {
  ACCESS_TOKEN_KEY,
  LOGOUT_URL,
  REFRESH_TOKEN_KEY,
  apiClient,
  clearSession,
  readStoredToken,
  storeSession,
} from './api';

interface AuthContextType {
  user: UserDto | null;
  isLoading: boolean;
  login: (tokens: AuthResponseDto['tokens'], user: UserDto) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    const token = readStoredToken(ACCESS_TOKEN_KEY);
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const res = await apiClient.getMe();
    if (res.data) {
      setUser(res.data);
    } else {
      setUser(null);
      clearSession();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (tokens: AuthResponseDto['tokens'], loggedInUser: UserDto) => {
    storeSession(tokens);
    setUser(loggedInUser);
  };

  const logout = async () => {
    const refreshToken = readStoredToken(REFRESH_TOKEN_KEY) || undefined;
    const accessToken = readStoredToken(ACCESS_TOKEN_KEY);
    try {
      // Best effort: revoke the refresh token server-side. The local session is
      // ended below whatever the server answers.
      const res = await fetch(LOGOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Not swallowed: a refresh token that failed to be revoked stays valid
        // until it expires, which the console record must make visible.
        console.error(
          `Logout request failed with HTTP ${res.status}; the local session was cleared anyway, the refresh token may not be revoked.`,
        );
      }
    } catch (err) {
      console.error('Logout request failed; the local session was cleared anyway.', err);
    }
    clearSession();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
