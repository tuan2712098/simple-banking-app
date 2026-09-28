'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Navigation from '../../components/Navigation';
import { errorMessage } from '../../components/ErrorNotice';
import { formatVnd } from '../../lib/money';

interface TransferResult {
  id: string;
  amount?: string;
  status: string;
  otpRequired?: boolean;
  demoOtp?: string;
}

export default function TransferPage() {
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState<TransferResult | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const key = useRef('');
  const busy = useRef(false);

  useEffect(() => { key.current = crypto.randomUUID(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!/^\d{8,30}$/.test(toAccountNumber.trim()) || !/^(?!0+(?:\.0{1,2})?$)\d{1,16}(?:\.\d{1,2})?$/.test(amount) || !description.trim()) {
      setError('Kiểm tra lại số tài khoản, số tiền và nội dung.');
      return;
    }
    busy.current = true;
    setLoading(true);
    setError('');
    setSuccess('');
    const payload = { toAccountNumber: toAccountNumber.trim(), amount, description: description.trim() };
    try {
      let result: TransferResult | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await api.post<TransferResult>('/transactions/transfer', payload, {
            headers: { 'Idempotency-Key': key.current },
            timeout: 10000,
          });
          result = response.data;
          break;
        } catch (error: unknown) {
          if (attempt === 0 && isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK')) continue;
          throw error;
        }
      }
      if (!result) throw new Error('No response');
      if (result.otpRequired) {
        setPending(result);
      } else {
        setSuccess(`Đã chuyển ${formatVnd(result.amount || amount)}.`);
        setToAccountNumber('');
        setAmount('');
        setDescription('');
        key.current = crypto.randomUUID();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function confirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post<TransferResult>('/transactions/confirm-otp', { transactionId: pending.id, otp });
      if (data.status !== 'COMPLETED') throw new Error('OTP chưa hợp lệ');
      setSuccess(`Đã chuyển ${formatVnd(amount)}.`);
      setPending(null);
      setOtp('');
      setToAccountNumber('');
      setAmount('');
      setDescription('');
      key.current = crypto.randomUUID();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return <ProtectedRoute><main className="dashboard-page"><Navigation title="Chuyển khoản" />
    <section className="dashboard-content"><section className="page-card">
      <h2>Chuyển tiền nội bộ</h2>
      {!pending ? <form onSubmit={submit}>
        <label htmlFor="receiver">Số tài khoản nhận</label><input id="receiver" value={toAccountNumber} onChange={(event) => setToAccountNumber(event.target.value)} placeholder="Nhập số tài khoản" required />
        <label htmlFor="amount">Số tiền (VND)</label><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="100000.00" required />
        <label htmlFor="description">Nội dung chuyển khoản</label><textarea id="description" value={description} maxLength={255} onChange={(event) => setDescription(event.target.value)} required />
        {error && <div className="form-error">{error}</div>}
        {success && <div className="form-success">{success}</div>}
        <button type="submit" disabled={loading}>{loading ? 'Đang xử lý...' : 'Xác nhận chuyển khoản'}</button>
      </form> : <form onSubmit={confirmOtp}>
        <div className="status-card">Giao dịch đang chờ OTP. Mã hết hạn sau 5 phút, tối đa 3 lần nhập sai.</div>
        {pending.demoOtp && <div className="status-card">Mã OTP môi trường demo: <strong>{pending.demoOtp}</strong></div>}
        <label htmlFor="otp">OTP gồm 6 số</label><input id="otp" value={otp} maxLength={6} inputMode="numeric" onChange={(event) => setOtp(event.target.value)} required />
        {error && <div className="form-error">{error}</div>}
        <button type="submit" disabled={loading || otp.length !== 6}>{loading ? 'Đang xác nhận...' : 'Xác nhận OTP'}</button>
      </form>}
    </section></section>
  </main></ProtectedRoute>;
}
