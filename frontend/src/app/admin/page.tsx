'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import api from '../../lib/api';
import { errorMessage } from '../../components/ErrorNotice';
import { useAuthStore } from '../../store/authStore';

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
}

interface FlaggedTransaction {
  id: string;
  amount: string;
  reviewStatus: string;
  status: string;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  actorId: string | null;
  createdAt: string;
}

export default function AdminPage() {
  const user = useAuthStore((state) => state.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [flagged, setFlagged] = useState<FlaggedTransaction[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<{ id: string; amount: string; status: string; tellerInitiated: boolean; approvedById: string | null }[]>([]);
  const [accountNumber, setAccountNumber] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const depositInFlight = useRef(false);
  const depositRequest = useRef<{ payload: string; key: string } | null>(null);
  const depositCompleted = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const [userResult, flags, logs, transactions] = await Promise.all([
        api.get<AdminUser[]>('/admin/users'),
        api.get<FlaggedTransaction[]>('/admin/flagged-transactions'),
        api.get<{ data: AuditRow[] }>('/admin/audit-logs'),
        api.get<typeof pendingApprovals>('/admin/transactions'),
      ]);
      setUsers(userResult.data);
      setFlagged(flags.data);
      setAudits(logs.data.data);
      setPendingApprovals(transactions.data.filter((tx) => tx.tellerInitiated && tx.status === 'PENDING_OTP' && !tx.approvedById));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user?.role]);

  useEffect(() => { void load(); }, [load]);

  async function execute(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await action();
      setMessage('Đã xử lý thành công.');
      await load();
      return response;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = JSON.stringify([accountNumber.trim(), amount.trim()]);

    if (depositInFlight.current || busy || depositCompleted.current === payload) {
      return;
    }

    depositInFlight.current = true;

    let request = depositRequest.current;

    if (!request || request.payload !== payload) {
      request = { payload, key: crypto.randomUUID() };
      depositRequest.current = request;
    }

    try {
      const response = await execute(() => api.post(
        '/transactions/deposit',
        { accountNumber: accountNumber.trim(), amount: amount.trim() },
        { headers: { 'Idempotency-Key': request.key } },
      ));

      if (response) {
        depositCompleted.current = payload;
        depositRequest.current = null;
        setAccountNumber('');
        setAmount('');
      }
    } finally {
      depositInFlight.current = false;
    }
  }

  async function tellerTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await execute(() => api.post('/transactions/teller-transfer', {
      ownerId,
      toAccountNumber: recipient,
      amount,
      description: 'Giao dịch tại quầy',
    }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }));
  }

  return <ProtectedRoute allowRoles={['teller', 'admin']}><main className="dashboard-page"><Navigation title="Quản trị ngân hàng" />
    <section className="dashboard-content">
      {error && <div className="form-error">{error}</div>}
      {message && <div className="form-success">{message}</div>}
      <div className="two-col">
        <section className="page-card"><h2>Nạp tiền tại quầy</h2><form onSubmit={deposit}><label>Số tài khoản<input value={accountNumber} disabled={busy} onChange={(e) => { setAccountNumber(e.target.value); depositCompleted.current = null; }} required /></label><label>Số tiền<input value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value); depositCompleted.current = null; }} required /></label><button disabled={busy}>Nạp tiền</button></form></section>
        <section className="page-card"><h2>Chuyển khoản hộ</h2><form onSubmit={tellerTransfer}><label>ID khách hàng<input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required /></label><label>Số tài khoản nhận<input value={recipient} onChange={(e) => setRecipient(e.target.value)} required /></label><label>Số tiền<input value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><button disabled={busy}>Chuyển khoản</button></form></section>
      </div>
      {user?.role === 'admin' && <>
        <section className="page-card" style={{ marginTop: 24 }}><h2>Danh sách người dùng</h2>{users.map((item) => <div className="transaction-item" key={item.id}><div><strong>{item.fullName}</strong><p>{item.email} · {item.role} · {item.status}</p></div><button disabled={busy} onClick={() => void execute(() => api.patch(`/admin/users/${item.id}/status`, { status: item.status === 'active' ? 'locked' : 'active' }))}>{item.status === 'active' ? 'Khóa' : 'Mở khóa'}</button></div>)}</section>
        <section className="page-card" style={{ marginTop: 24 }}><h2>Giao dịch cần kiểm tra</h2>{flagged.length === 0 && <p>Chưa có giao dịch cần kiểm tra.</p>}{flagged.map((item) => <div className="transaction-item" key={item.id}><div><strong>{item.id}</strong><p>{item.amount} VND · {item.status}</p></div><div><button disabled={busy} onClick={() => void execute(() => api.patch(`/admin/flagged-transactions/${item.id}/approve`))}>Duyệt</button>{' '}<button disabled={busy} onClick={() => void execute(() => api.patch(`/admin/flagged-transactions/${item.id}/reject`))}>Từ chối</button></div></div>)}</section>
        <section className="page-card" style={{ marginTop: 24 }}><h2>Giao dịch lớn cần duyệt</h2>{pendingApprovals.length === 0 && <p>Không có giao dịch đang chờ.</p>}{pendingApprovals.map((item) => <div className="transaction-item" key={item.id}><div><strong>{item.id}</strong><p>{item.amount} VND · {item.status}</p></div><button disabled={busy} onClick={() => void execute(() => api.post(`/admin/transactions/${item.id}/approve-large`))}>Duyệt giao dịch</button></div>)}</section>
        <section className="page-card" style={{ marginTop: 24 }}><h2>Đối soát cuối ngày</h2><button disabled={busy} onClick={() => void execute(() => api.post('/admin/reconcile'))}>Chạy đối soát</button></section>
        <section className="page-card" style={{ marginTop: 24 }}><h2>Audit log</h2>{audits.slice(0, 20).map((item) => <p key={item.id}>{item.action} · {item.entity} · {item.actorId || 'system'} · {new Date(item.createdAt).toLocaleString('vi-VN')}</p>)}</section>
      </>}
    </section>
  </main></ProtectedRoute>;
}
