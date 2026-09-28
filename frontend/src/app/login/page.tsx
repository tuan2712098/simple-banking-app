'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { AuthUser, useAuthStore } from '../../store/authStore';
import { errorMessage } from '../../components/ErrorNotice';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return setError('Nhập email và mật khẩu nhé.');
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post<{ user: AuthUser; accessToken: string }>('/auth/login', { email: email.trim(), password });
      setAuth(data.user, data.accessToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="brand"><span className="brand-mark">B</span><div><h1>Simple Banking</h1><p>Đăng nhập tài khoản</p></div></div>
    <h2>Đăng nhập</h2>
    <form onSubmit={submit}>
      <label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
      <label htmlFor="password">Mật khẩu</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Đang đăng nhập...' : 'Đăng nhập'}</button>
    </form>
    <p className="auth-switch">Chưa có tài khoản? <Link href="/register">Đăng ký</Link></p>
  </section></main>;
}
