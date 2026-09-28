'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '../../lib/api';
import { AuthUser, useAuthStore } from '../../store/authStore';
import { errorMessage } from '../../components/ErrorNotice';

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fullName.trim().length < 2 || password.length < 8 || !email.includes('@')) {
      setError('Kiểm tra lại họ tên, email và mật khẩu ít nhất 8 ký tự.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post<{ user: AuthUser; accessToken: string }>('/auth/register', { fullName: fullName.trim(), email: email.trim(), password });
      setAuth(data.user, data.accessToken);
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-card">
    <div className="brand"><span className="brand-mark">B</span><div><h1>Simple Banking</h1><p>Tạo tài khoản mới</p></div></div>
    <h2>Đăng ký</h2>
    <form onSubmit={submit}>
      <label htmlFor="name">Họ và tên</label><input id="name" value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={150} required />
      <label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      <label htmlFor="password">Mật khẩu</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required />
      {error && <div className="form-error">{error}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Đang đăng ký...' : 'Đăng ký'}</button>
    </form>
    <p className="auth-switch">Đã có tài khoản? <Link href="/login">Đăng nhập</Link></p>
  </section></main>;
}
