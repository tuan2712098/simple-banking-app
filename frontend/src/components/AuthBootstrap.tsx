'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

export default function AuthBootstrap({ children }: { children: ReactNode }) {
  const boot = useAuthStore((state) => state.boot);
  useEffect(() => { void boot(); }, [boot]);
  return <>{children}</>;
}
