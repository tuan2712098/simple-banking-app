'use client';

import { FormEvent, useEffect, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { errorMessage } from '../../components/ErrorNotice';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
  const user = useAuthStore((state) => state.user);
  const reset = useAuthStore((state) => state.reset);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<{ id: string; previousEmail: string; updatedEmail: string; createdAt: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    setEmail(user.email);
    api.get<typeof history>('/accounts/me/history').then(({ data }) => setHistory(data)).catch(() => {});
  }, [user]);

  async function updateEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.patch('/accounts/me/email', { email });
      reset();
      router.replace('/login');
    } catch (err) { setError(errorMessage(err)); }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      reset();
      router.replace('/login');
    } catch (err) { setError(errorMessage(err)); }
  }

  return <ProtectedRoute><main className="dashboard-page"><Navigation title="Tài khoản" />
    <section className="dashboard-content"><section className="page-card">
      <h2>Thông tin cá nhân</h2><p>{user?.fullName}</p>
      <div className="two-col">
        <form onSubmit={updateEmail}><h3>Đổi email</h3><label htmlFor="email">Email mới</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><button type="submit">Cập nhật email</button></form>
        <form onSubmit={updatePassword}><h3>Đổi mật khẩu</h3><label htmlFor="current">Mật khẩu hiện tại</label><input id="current" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /><label htmlFor="replacement">Mật khẩu mới</label><input id="replacement" type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><button type="submit">Đổi mật khẩu</button></form>
      </div>
      {error && <div className="form-error">{error}</div>}
      <h3>Lịch sử cập nhật email</h3>{history.length === 0 ? <p>Chưa có thay đổi.</p> : history.map((item) => <p key={item.id}>{item.previousEmail} → {item.updatedEmail} ({new Date(item.createdAt).toLocaleString('vi-VN')})</p>)}
    </section></section>
  </main></ProtectedRoute>;
}
