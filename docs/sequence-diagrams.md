# Sequence diagram

## 1. Đăng nhập bằng JWT

```mermaid
sequenceDiagram
  actor Client
  participant Controller as AuthController
  participant Service as AuthService
  participant Repository as User Repository
  participant Database as PostgreSQL
  participant JWT as JwtService
  Client->>Controller: POST /auth/login (email, password)
  Controller->>Service: login(dto)
  Service->>Repository: findByEmailWithPassword(email)
  Repository->>Database: SELECT user và password_hash
  Database-->>Repository: User
  Repository-->>Service: User
  Service->>Service: bcrypt.compare()
  alt Thông tin không đúng / tài khoản bị khóa
    Service-->>Controller: 401 Unauthorized
    Controller-->>Client: Lỗi đăng nhập
  else Hợp lệ
    Service->>JWT: signAsync(userId, role, tokenVersion)
    JWT-->>Service: JWT access token
    Service->>Database: INSERT refresh_sessions (token hash)
    Database-->>Service: OK
    Service-->>Controller: User an toàn + JWT + refresh token
    Controller-->>Client: JWT trong body; refresh trong HTTP-only cookie
  end
```

## 2. Chuyển khoản nội bộ, idempotency và rollback

```mermaid
sequenceDiagram
  actor Client
  participant Controller as TransactionController
  participant Service as TransactionService
  participant Repo as EntityManager/Repository
  participant Database as PostgreSQL
  Client->>Controller: POST /transactions/transfer + JWT + Idempotency-Key
  Controller->>Service: transfer(userId, dto, key)
  Service->>Repo: BEGIN DATABASE TRANSACTION
  Repo->>Database: BEGIN
  Service->>Repo: pg_advisory_xact_lock(key)
  Repo->>Database: Lock idempotency key
  Service->>Repo: Tìm key đã xử lý
  alt Key đã xử lý với cùng body
    Repo-->>Service: Kết quả cũ
    Service-->>Client: Trả kết quả cũ, không trừ tiền lần 2
  else Key chưa tồn tại
    Service->>Repo: Tìm hai tài khoản
    Service->>Repo: SELECT FOR UPDATE theo thứ tự accountId cố định
    Repo->>Database: Khóa 2 dòng accounts
    Database-->>Repo: Số dư đã khóa
    Service->>Service: Kiểm tra status, số dư, hạn mức, OTP
    alt Không hợp lệ / lỗi một bước ghi
      Service->>Repo: ROLLBACK
      Repo->>Database: ROLLBACK trừ tiền, cộng tiền và ledger entries
      Service-->>Client: 4xx/5xx, số dư không đổi
    else Giao dịch hợp lệ
      Service->>Repo: UPDATE account A - amount
      Repo->>Database: Ghi số dư A
      Service->>Repo: UPDATE account B + amount
      Repo->>Database: Ghi số dư B
      Service->>Repo: INSERT transactions
      Repo->>Database: Lưu transaction COMPLETED
      Service->>Repo: INSERT ledger_entries DEBIT + CREDIT
      Repo->>Database: Ghi đủ hai bút toán
      Service->>Repo: INSERT idempotency_keys (kết quả)
      Repo->>Database: Lưu response và request hash
      Service->>Repo: COMMIT
      Repo->>Database: COMMIT
      Service-->>Client: Kết quả giao dịch
    end
  end
```

Nhánh OTP: yêu cầu từ 10 triệu đồng trở lên được ghi `PENDING_OTP` trước, **chưa trừ tiền**. Khi xác nhận OTP hợp lệ, backend khóa tài khoản và xử lý chuyển khoản trong transaction tương tự sơ đồ trên.
