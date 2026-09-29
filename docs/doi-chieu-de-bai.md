# Đối chiếu hai file mentor giao

## File Simple Banking App chính

| Yêu cầu | Vị trí |
|---|---|
| NestJS, TypeORM, PostgreSQL | `backend/src/app.module.ts` |
| Auth JWT, bcrypt | `backend/src/auth` |
| Account + VND numeric(18,2) | `backend/src/accounts` |
| Chuyển khoản nguyên tử, rollback | `backend/src/transactions/transactions.service.ts` |
| Lịch sử, phân trang, sắp xếp | `backend/src/transactions` |
| Giao diện React | `frontend/src/app` (Next.js dùng React) |
| Axios, JWT, Zustand, protected route | `frontend/src/lib`, `frontend/src/store`, `frontend/src/components` |
| README, seed, env.example | `README.md`, `backend/scripts/seed.ts`, `backend/.env.example` |
| API docs, sequence diagrams | `docs/api.md`, `docs/sequence-diagrams.md` |

## File bài tập bổ sung

| Bài | Vị trí |
|---|---|
| 1.1 Mô phỏng race condition | `backend/scripts/demo-race.ts` (database test) |
| 1.2 Pessimistic locking | `TransactionsService.lockedAccounts()` |
| 1.3 Optimistic locking + version | `TransactionsService.updateAccount()` + `transfer-optimistic` |
| 1.4 Khóa đúng thứ tự chống deadlock | `TransactionsService.lockedAccounts()` |
| 2.1 Idempotency-Key | `IdempotencyService`, bảng `idempotency_keys` |
| 2.2 Retry cùng key, chống double submit | `frontend/src/app/transfer/page.tsx` |
| 3.1 Double-entry ledger | `LedgerService` + `scripts/enforce-ledger.ts` |
| 3.2 Reversal, state machine | `TransactionsService.reverse()`, `common/transaction-state.ts` |
| 3.3 Audit logs | `AuditInterceptor`, `audit_logs`, `/admin/audit-logs` |
| 3.4 Soft delete và account history | `User`, `Account`, `AccountHistory`, `/accounts/me/email` |
| 4.1 RBAC CUSTOMER/TELLER/ADMIN | `RolesGuard`, `AdminController`, `teller-transfer`, `approve-large` |
| 4.2 Access/refresh/revoke | `AuthService`, `SecurityService`, `refresh_sessions` |
| 4.3 OTP giao dịch lớn | `TransactionsService.confirmOtp()` |
| 4.4 Rate limiting và khóa tạm thời | `ThrottlerModule`, `UserThrottleGuard`, `AuthService.login()` |
| 5.1 Hạn mức lần/ngày | `TransactionsService.limitCheck()` |
| 5.2 Trạng thái tài khoản, số dư | `AccountStatus`, `TransactionsService.ensureActive()` |
| 5.3 State machine và xử lý treo | `changeTransactionStatus()`, `TransactionsService.failStalled()` |
| 6.1 Đối soát cuối ngày | `MonitoringService.reconcile()` |
| 6.2 Gắn cờ bất thường | `TransactionsService.fraudReview()` |
| 6.3 Structured logging, health check | `RequestLogMiddleware`, `MonitoringService.health()` |
| 7.1 Unit test | `backend/src/**/*.spec.ts` |
| 7.2 Integration concurrency | `backend/test/banking.e2e-spec.ts` |
| 7.3 Rollback khi lỗi giữa 2 bút toán | `backend/test/banking.e2e-spec.ts` |

Kết quả kiểm thử ngày 30/09/2026: 132/132 Unit Test và 11/11 E2E Test thành công. Benchmark với 20 yêu cầu đồng thời cho mỗi phương pháp: cả pessimistic và optimistic locking đều có 10 giao dịch thành công, 10 giao dịch bị từ chối do không đủ số dư. Số dư cuối cùng chính xác; thời gian đo được là 407 ms, tương đương khoảng 49 request/giây cho mỗi phương pháp. Kết quả benchmark được ghi nhận từ một lần chạy.
