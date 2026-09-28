'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/authStore';

export default function ProtectedRoute({ children, allowRoles }: { children: ReactNode; allowRoles?: string[] }) {
  const router = useRouter();
  const { user, ready } = useAuthStore();
  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace('/login');
    else if (allowRoles && !allowRoles.includes(user.role)) router.replace('/dashboard');
  }, [ready, user, router, allowRoles]);
  if (!ready) return <main className="auth-page"><div className="status-card">Đang kiểm tra đăng nhập...</div></main>;
  if (!user || (allowRoles && !allowRoles.includes(user.role))) return null;
  return <>{children}</>;
}
