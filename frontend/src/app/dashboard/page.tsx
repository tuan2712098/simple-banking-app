'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { errorMessage } from '../../components/ErrorNotice';
import { formatVnd } from '../../lib/money';
import { useAuthStore } from '../../store/authStore';

interface AccountInfo {
  id: string;
  accountNumber: string;
  balance: string;
  currency: string;
  tier: string;
  status: string;
}

export default function DashboardPage() {
  const ready = useAuthStore((state) => state.ready);
  const token = useAuthStore((state) => state.accessToken);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready || !token) return;
    let active = true;
    api.get<AccountInfo>('/accounts/me')
      .then(({ data }) => { if (active) setAccount(data); })
      .catch((err) => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [ready, token]);

  return <ProtectedRoute><main className="dashboard-page"><Navigation title="Simple Banking" />
    <section className="dashboard-content">
      {loading && <div className="status-card">Đang tải tài khoản...</div>}
      {error && <div className="form-error">{error}</div>}
      {account && <>
        <section className="balance-card"><p>Số dư khả dụng</p>
          <h2>{formatVnd(account.balance)}</h2>
          <div className="account-info"><span>Số tài khoản</span><strong>{account.accountNumber}</strong></div>
          <div className="account-info"><span>Trạng thái: {account.status}</span><span>Loại tài khoản: {account.tier}</span></div>
        </section>
        <section className="quick-actions">
          <Link className="action-card" href="/transfer"><h3>Chuyển khoản</h3><p>Chuyển tiền nội bộ</p></Link>
          <Link className="action-card" href="/transactions"><h3>Lịch sử giao dịch</h3><p>Xem tiền vào và tiền ra</p></Link>
        </section>
      </>}
    </section>
  </main></ProtectedRoute>;
}
