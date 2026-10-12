
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

interface CustomerOption {
  id: string;
  fullName: string;
  email: string;
  accountNumber: string;
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

interface PendingApproval {
  id: string;
  amount: string;
  status: string;
  tellerInitiated: boolean;
  approvedById: string | null;
}

export default function AdminPage() {
  const user = useAuthStore((state) => state.user);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [flagged, setFlagged] = useState<FlaggedTransaction[]>([]);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  const [accountNumber, setAccountNumber] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tellerAmount, setTellerAmount] = useState('');

  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const depositInFlight = useRef(false);
  const depositRequest = useRef<{ payload: string; key: string } | null>(null);
  const depositCompleted = useRef<string | null>(null);

  const tellerInFlight = useRef(false);
  const tellerRequest = useRef<{ payload: string; key: string } | null>(null);
  const tellerCompleted = useRef<string | null>(null);

  const selectedCustomer = customers.find(
    (customer) => customer.id === ownerId,
  );

  const filteredCustomers = customers.filter((customer) => {
    const keyword = customerSearch.trim().toLowerCase();

    if (!keyword) return false;

    return (
      customer.fullName.toLowerCase().includes(keyword) ||
      customer.email.toLowerCase().includes(keyword) ||
      customer.accountNumber.includes(keyword)
    );
  });

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return;

    try {
      const [userResult, flags, logs, transactions] = await Promise.all([
        api.get<AdminUser[]>('/admin/users'),
        api.get<FlaggedTransaction[]>('/admin/flagged-transactions'),
        api.get<{ data: AuditRow[] }>('/admin/audit-logs'),
        api.get<PendingApproval[]>('/admin/transactions'),
      ]);

      setUsers(userResult.data);
      setFlagged(flags.data);
      setAudits(logs.data.data);

      setPendingApprovals(
        transactions.data.filter(
          (tx) =>
            tx.tellerInitiated &&
            tx.status === 'PENDING_OTP' &&
            !tx.approvedById,
        ),
      );
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'teller') {
      return;
    }

    let active = true;

    async function loadCustomers() {
      setCustomerLoading(true);
      setCustomerError('');

      try {
        const response = await api.get<CustomerOption[]>(
          '/staff/customers',
        );

        if (active) {
          setCustomers(response.data);
        }
      } catch (err) {
        if (active) {
          setCustomerError(errorMessage(err));
        }
      } finally {
        if (active) {
          setCustomerLoading(false);
        }
      }
    }

    void loadCustomers();

    return () => {
      active = false;
    };
  }, [user?.role]);

  function selectCustomer(customer: CustomerOption) {
    setOwnerId(customer.id);
    setCustomerSearch(customer.email);
    setShowCustomerSuggestions(false);
    setError('');
    tellerCompleted.current = null;
  }

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

    return null;
  }

  async function deposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = JSON.stringify([
      accountNumber.trim(),
      amount.trim(),
    ]);

    if (
      depositInFlight.current ||
      busy ||
      depositCompleted.current === payload
    ) {
      return;
    }

    depositInFlight.current = true;

    let request = depositRequest.current;

    if (!request || request.payload !== payload) {
      request = {
        payload,
        key: crypto.randomUUID(),
      };

      depositRequest.current = request;
    }

    try {
      const response = await execute(() =>
        api.post(
          '/transactions/deposit',
          {
            accountNumber: accountNumber.trim(),
            amount: amount.trim(),
          },
          {
            headers: {
              'Idempotency-Key': request.key,
            },
          },
        ),
      );

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

    if (!selectedCustomer) {
      setError('Vui lòng chọn khách hàng gửi tiền.');
      return;
    }

    if (selectedCustomer.accountNumber === recipient.trim()) {
      setError('Không thể chuyển tiền vào chính tài khoản gửi.');
      return;
    }

    const payload = JSON.stringify([
      ownerId.trim(),
      recipient.trim(),
      tellerAmount.trim(),
    ]);

    if (
      tellerInFlight.current ||
      busy ||
      tellerCompleted.current === payload
    ) {
      return;
    }

    tellerInFlight.current = true;

    let request = tellerRequest.current;

    if (!request || request.payload !== payload) {
      request = {
        payload,
        key: crypto.randomUUID(),
      };

      tellerRequest.current = request;
    }

    try {
      const response = await execute(() =>
        api.post(
          '/transactions/teller-transfer',
          {
            ownerId: ownerId.trim(),
            toAccountNumber: recipient.trim(),
            amount: tellerAmount.trim(),
            description: 'Giao dịch tại quầy',
          },
          {
            headers: {
              'Idempotency-Key': request.key,
            },
          },
        ),
      );

      if (response) {
        tellerCompleted.current = payload;
        tellerRequest.current = null;
        setOwnerId('');
        setCustomerSearch('');
        setShowCustomerSuggestions(false);
        setRecipient('');
        setTellerAmount('');
      }
    } finally {
      tellerInFlight.current = false;
    }
  }

  return (
    <ProtectedRoute allowRoles={['teller', 'admin']}>
      <main className="dashboard-page">
        <Navigation title="Quản trị ngân hàng" />

        <section className="dashboard-content">
          {error && <div className="form-error">{error}</div>}
          {message && <div className="form-success">{message}</div>}

          <div className="two-col">
            <section className="page-card">
              <h2>Nạp tiền tại quầy</h2>

              <form onSubmit={deposit}>
                <label>
                  Số tài khoản
                  <input
                    value={accountNumber}
                    disabled={busy}
                    onChange={(e) => {
                      setAccountNumber(e.target.value);
                      depositCompleted.current = null;
                    }}
                    required
                  />
                </label>

                <label>
                  Số tiền
                  <input
                    value={amount}
                    disabled={busy}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      depositCompleted.current = null;
                    }}
                    required
                  />
                </label>

                <button disabled={busy}>Nạp tiền</button>
              </form>
            </section>

            <section className="page-card">
              <h2>Chuyển khoản hộ</h2>

              <form onSubmit={tellerTransfer}>
                <div
                  style={{ position: 'relative', marginBottom: 18 }}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setShowCustomerSuggestions(false);
                    }
                  }}
                >
                  <label>
                    Tìm khách hàng gửi
                    <input
                      type="search"
                      placeholder="Nhập tên, email hoặc số tài khoản"
                      value={customerSearch}
                      disabled={busy || customerLoading}
                      autoComplete="off"
                      onFocus={() => {
                        if (!selectedCustomer) {
                          setShowCustomerSuggestions(true);
                        }
                      }}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setOwnerId('');
                        setShowCustomerSuggestions(true);
                        setError('');
                        tellerCompleted.current = null;
                      }}
                    />
                  </label>

                  {showCustomerSuggestions &&
                    customerSearch.trim() !== '' &&
                    !customerLoading &&
                    !customerError &&
                    !selectedCustomer && (
                      <div
                        style={{
                          border: '1px solid #d5ddeb',
                          borderRadius: 12,
                          backgroundColor: '#ffffff',
                          marginTop: 6,
                          maxHeight: 240,
                          overflowY: 'auto',
                          boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                        }}
                      >
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.slice(0, 8).map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              disabled={busy}
                              onClick={() => selectCustomer(customer)}
                              style={{
                                display: 'block',
                                width: '100%',
                                padding: '12px 14px',
                                backgroundColor: '#ffffff',
                                color: '#17243d',
                                border: 'none',
                                borderBottom: '1px solid #e5eaf2',
                                borderRadius: 0,
                                textAlign: 'left',
                                cursor: 'pointer',
                              }}
                            >
                              <span
                                style={{
                                  display: 'block',
                                  fontWeight: 600,
                                  fontSize: 15,
                                }}
                              >
                                {customer.fullName}
                              </span>

                              <span
                                style={{
                                  display: 'block',
                                  fontSize: 13,
                                  color: '#64748b',
                                  marginTop: 4,
                                }}
                              >
                                {customer.email}
                              </span>

                              <span
                                style={{
                                  display: 'block',
                                  fontSize: 13,
                                  color: '#64748b',
                                  marginTop: 3,
                                }}
                              >
                                STK: {customer.accountNumber}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p
                            style={{
                              padding: 12,
                              color: '#64748b',
                              margin: 0,
                            }}
                          >
                            Không tìm thấy khách hàng.
                          </p>
                        )}
                      </div>
                    )}
                </div>

                {customerLoading && (
                  <p>Đang tải danh sách khách hàng...</p>
                )}

                {customerError && (
                  <div className="form-error">{customerError}</div>
                )}

                {selectedCustomer && (
                  <div
                    style={{
                      backgroundColor: '#eef7f2',
                      border: '1px solid #b7dfc7',
                      padding: 16,
                      borderRadius: 12,
                      marginBottom: 18,
                    }}
                  >
                    <strong style={{ color: '#166534' }}>
                      Đã chọn khách hàng
                    </strong>

                    <p style={{ marginTop: 10 }}>
                      Họ tên: <strong>{selectedCustomer.fullName}</strong>
                    </p>

                    <p>
                      Email: {selectedCustomer.email}
                    </p>

                    <p>
                      Tài khoản gửi:{' '}
                      <strong>{selectedCustomer.accountNumber}</strong>
                    </p>
                  </div>
                )}

                <label>
                  Số tài khoản nhận
                  <input
                    value={recipient}
                    disabled={busy}
                    onChange={(e) => {
                      setRecipient(e.target.value);
                      tellerCompleted.current = null;
                    }}
                    required
                  />
                </label>

                <label>
                  Số tiền
                  <input
                    value={tellerAmount}
                    disabled={busy}
                    onChange={(e) => {
                      setTellerAmount(e.target.value);
                      tellerCompleted.current = null;
                    }}
                    required
                  />
                </label>

                <button
                  disabled={
                    busy ||
                    customerLoading ||
                    !!customerError ||
                    !selectedCustomer
                  }
                >
                  Chuyển khoản
                </button>
              </form>
            </section>
          </div>

          {user?.role === 'admin' && (
            <>
              <section className="page-card" style={{ marginTop: 24 }}>
                <h2>Danh sách người dùng</h2>

                {users.map((item) => (
                  <div className="transaction-item" key={item.id}>
                    <div>
                      <strong>{item.fullName}</strong>
                      <p>
                        {item.email} · {item.role} · {item.status}
                      </p>
                    </div>

                    <button
                      disabled={busy}
                      onClick={() =>
                        void execute(() =>
                          api.patch(`/admin/users/${item.id}/status`, {
                            status:
                              item.status === 'active'
                                ? 'locked'
                                : 'active',
                          }),
                        )
                      }
                    >
                      {item.status === 'active' ? 'Khóa' : 'Mở khóa'}
                    </button>
                  </div>
                ))}
              </section>

              <section className="page-card" style={{ marginTop: 24 }}>
                <h2>Giao dịch cần kiểm tra</h2>

                {flagged.length === 0 && (
                  <p>Chưa có giao dịch cần kiểm tra.</p>
                )}

                {flagged.map((item) => (
                  <div className="transaction-item" key={item.id}>
                    <div>
                      <strong>{item.id}</strong>
                      <p>
                        {item.amount} VND · {item.status}
                      </p>
                    </div>

                    <div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void execute(() =>
                            api.patch(
                              `/admin/flagged-transactions/${item.id}/approve`,
                            ),
                          )
                        }
                      >
                        Duyệt
                      </button>

                      {' '}

                      <button
                        disabled={busy}
                        onClick={() =>
                          void execute(() =>
                            api.patch(
                              `/admin/flagged-transactions/${item.id}/reject`,
                            ),
                          )
                        }
                      >
                        Từ chối
                      </button>
                    </div>
                  </div>
                ))}
              </section>

              <section className="page-card" style={{ marginTop: 24 }}>
                <h2>Giao dịch lớn cần duyệt</h2>

                {pendingApprovals.length === 0 && (
                  <p>Không có giao dịch đang chờ.</p>
                )}

                {pendingApprovals.map((item) => (
                  <div className="transaction-item" key={item.id}>
                    <div>
                      <strong>{item.id}</strong>
                      <p>
                        {item.amount} VND · {item.status}
                      </p>
                    </div>

                    <button
                      disabled={busy}
                      onClick={() =>
                        void execute(() =>
                          api.post(
                            `/admin/transactions/${item.id}/approve-large`,
                          ),
                        )
                      }
                    >
                      Duyệt giao dịch
                    </button>
                  </div>
                ))}
              </section>

              <section className="page-card" style={{ marginTop: 24 }}>
                <h2>Đối soát cuối ngày</h2>

                <button
                  disabled={busy}
                  onClick={() =>
                    void execute(() => api.post('/admin/reconcile'))
                  }
                >
                  Chạy đối soát
                </button>
              </section>

              <section className="page-card" style={{ marginTop: 24 }}>
                <h2>Audit log</h2>

                {audits.slice(0, 20).map((item) => (
                  <p key={item.id}>
                    {item.action} · {item.entity} ·{' '}
                    {item.actorId || 'system'} ·{' '}
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </p>
                ))}
              </section>
            </>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}
