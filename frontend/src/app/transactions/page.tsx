'use client';

import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { errorMessage } from '../../components/ErrorNotice';
import { formatVnd } from '../../lib/money';
import { useAuthStore } from '../../store/authStore';

interface TransactionItem {
  id: string;
  direction: 'incoming' | 'outgoing';
  fromAccountNumber: string | null;
  toAccountNumber: string | null;
  amount: string;
  type: string;
  status: string;
  description: string;
  createdAt: string;
}

interface HistoryResponse {
  data: TransactionItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function TransactionHistoryPage() {
  const ready = useAuthStore((state) => state.ready);
  const token = useAuthStore((state) => state.accessToken);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const load = useCallback(async () => {
    if (!ready || !token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', sort });
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      const { data } = await api.get<HistoryResponse>(`/transactions?${params.toString()}`);
      setTransactions(data.data);
      setPages(Math.max(1, data.pagination.totalPages));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, sort, status, type, ready, token]);

  useEffect(() => { void load(); }, [load]);

  return <ProtectedRoute><main className="dashboard-page"><Navigation title="Lịch sử giao dịch" />
    <section className="dashboard-content"><section className="history-card">
      <div className="page-heading"><h2>Tiền vào và tiền ra</h2></div>
      <div className="filters">
        <label>Sắp xếp<select value={sort} onChange={(event) => { setSort(event.target.value as 'asc' | 'desc'); setPage(1); }}><option value="desc">Mới nhất trước</option><option value="asc">Cũ nhất trước</option></select></label>
        <label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Tất cả</option>{['COMPLETED','PENDING_OTP','FAILED','REVERSED'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Loại<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}><option value="">Tất cả</option>{['transfer','deposit','withdrawal','reversal'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      {loading && <div className="status-card">Đang tải giao dịch...</div>}
      {error && <div className="form-error">{error}</div>}
      {!loading && !error && transactions.length === 0 && <div className="status-card">Chưa có giao dịch.</div>}
      {!loading && !error && transactions.length > 0 && <div className="transaction-list">{transactions.map((tx) => <article className="transaction-item" key={tx.id}>
        <div><strong>{tx.direction === 'incoming' ? 'Tiền vào' : 'Tiền ra'}</strong><p>{tx.description}</p><small>{tx.fromAccountNumber || 'Tiền mặt'} → {tx.toAccountNumber || 'Tiền mặt'}</small><br/><small>{new Date(tx.createdAt).toLocaleString('vi-VN')} · {tx.status}</small></div>
        <strong className={tx.direction === 'incoming' ? 'amount incoming' : 'amount outgoing'}>{tx.direction === 'incoming' ? '+' : '-'}{formatVnd(tx.amount)}</strong>
      </article>)}</div>}
      <div className="pagination"><button disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page} / {pages}</span><button disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Trang sau</button></div>
    </section></section>
  </main></ProtectedRoute>;
}
