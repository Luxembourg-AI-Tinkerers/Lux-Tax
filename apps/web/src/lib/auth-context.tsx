'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserDto, AuthResponseDto } from '@luxtax/contracts';
import { apiClient } from './api';

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
    const token = typeof window !== 'undefined' ? localStorage.getItem('luxtax_access_token') : null;
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
      localStorage.removeItem('luxtax_access_token');
      localStorage.removeItem('luxtax_refresh_token');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = (tokens: AuthResponseDto['tokens'], loggedInUser: UserDto) => {
    localStorage.setItem('luxtax_access_token', tokens.accessToken);
    localStorage.setItem('luxtax_refresh_token', tokens.refreshToken);
    setUser(loggedInUser);
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('luxtax_refresh_token') || undefined;
    try {
      // Best effort logout on server
      await fetch('http://localhost:3001/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('luxtax_access_token')}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Ignore network errors on logout
    }
    localStorage.removeItem('luxtax_access_token');
    localStorage.removeItem('luxtax_refresh_token');
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
