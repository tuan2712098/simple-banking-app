'use client';

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, type AuthUser } from '../store/authStore';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const api = axios.create({ baseURL, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as (InternalAxiosRequestConfig & { retried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !request || request.retried || request.url?.startsWith('/auth/')) {
      return Promise.reject(error);
    }
    request.retried = true;
    try {
      refreshing ||= axios.post<{ user: AuthUser; accessToken: string }>(`${baseURL}/auth/refresh`, {}, { withCredentials: true })
        .then(({ data }) => {
          useAuthStore.getState().setAuth(data.user, data.accessToken);
          return data.accessToken;
        })
        .finally(() => { refreshing = null; });
      const token = await refreshing;
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch {
      useAuthStore.getState().reset();
      return Promise.reject(error);
    }
  },
);

export default api;
