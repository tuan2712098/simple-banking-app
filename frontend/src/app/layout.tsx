import type { Metadata } from 'next';
import AuthBootstrap from '../components/AuthBootstrap';
import './globals.css';

export const metadata: Metadata = { title: 'Simple Banking', description: 'Ứng dụng ngân hàng nội bộ' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><AuthBootstrap>{children}</AuthBootstrap></body></html>;
}
