'use client';

import { create } from 'zustand';
import axios from 'axios';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: 'customer' | 'teller' | 'admin';
  status: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  ready: boolean;
  setAuth: (user: AuthUser, accessToken: string) => void;
  reset: () => void;
  boot: () => Promise<void>;
  logout: () => Promise<void>;
}

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  ready: false,
  setAuth: (user, accessToken) => set({ user, accessToken, ready: true }),
  reset: () => set({ user: null, accessToken: null, ready: true }),
  boot: async () => {
    if (get().ready) return;
    try {
      const response = await axios.post<{ user: AuthUser; accessToken: string }>(
        `${baseURL}/auth/refresh`, {}, { withCredentials: true },
      );
      if (!get().ready) set({ user: response.data.user, accessToken: response.data.accessToken, ready: true });
    } catch {
      if (!get().ready) set({ user: null, accessToken: null, ready: true });
    }
  },
  logout: async () => {
    try {
      await axios.post(`${baseURL}/auth/logout`, {}, {
        withCredentials: true,
        headers: { Authorization: `Bearer ${get().accessToken || ''}` },
      });
    } finally {
      if (!get().ready) set({ user: null, accessToken: null, ready: true });
    }
  },
}));
