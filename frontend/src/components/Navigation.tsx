'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';

export default function Navigation({ title }: { title: string }) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  return <header className="dashboard-header">
    <div><h1>{title}</h1><p>Xin chào, {user?.fullName}</p></div>
    <nav className="nav-links">
      <Link href="/dashboard">Tổng quan</Link>
      <Link href="/transfer">Chuyển tiền</Link>
      <Link href="/transactions">Lịch sử</Link>
      <Link href="/account">Tài khoản</Link>
      {(user?.role === 'admin' || user?.role === 'teller') && <Link href="/admin">Quản trị</Link>}
      <button className="secondary-button" onClick={async () => { await logout(); router.replace('/login'); }}>Đăng xuất</button>
    </nav>
  </header>;
}
