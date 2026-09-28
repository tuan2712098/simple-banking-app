# Simple Banking App

Đây là bài Simple Banking App mình làm trong đợt thực tập tại JITS. Mình làm tiếp từ project NestJS + React ban đầu, sau đó tích hợp phần bài tập bổ sung vào cùng một ứng dụng. Frontend bản cuối chuyển sang Next.js theo tài liệu bổ sung. Dự án chỉ dùng dữ liệu ngân hàng mô phỏng, không kết nối ngân hàng hay tiền thật.

## Công nghệ dùng

- Backend: NestJS, TypeScript, TypeORM, PostgreSQL.
- Frontend: Next.js, React, TypeScript.
- JWT, bcrypt, Axios, Zustand.
- Test: Jest, Supertest.

## Cần chuẩn bị

Máy cần có Node.js, npm và PostgreSQL. Mình dùng PostgreSQL 17; các bản tương thích với driver `pg` cũng dùng được.

### 1. Tạo database

Mở SQL Shell (psql), đăng nhập bằng tài khoản PostgreSQL của máy rồi chạy:

```sql
CREATE DATABASE simple_banking_app_final;
CREATE DATABASE simple_banking_app_test;
```

Có thể chỉ tạo database `simple_banking_app_final` nếu trước mắt chưa chạy integration test.

### 2. Chạy backend

Mở terminal tại thư mục `backend`:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Mở `backend/.env` rồi điền mật khẩu PostgreSQL của **máy đang chạy** vào `DB_PASSWORD`. Đổi `JWT_SECRET` sang một chuỗi bí mật dài, không dùng giá trị mẫu khi triển khai thật.

Với database mới và môi trường dev, để `DB_SYNCHRONIZE=true` để TypeORM tạo bảng. Không bật chế độ này ở môi trường production.

Tiếp tục:

```powershell
npm run seed
npm run db:protect
npm run start:dev
```

API chạy mặc định tại `http://localhost:3000`. Kiểm tra bằng `http://localhost:3000/health`.

Lệnh `db:protect` tạo trigger PostgreSQL chặn UPDATE và DELETE trên `ledger_entries`. Nó chỉ cho phép ghi bút toán mới bằng INSERT.

### 3. Chạy frontend

Mở **terminal thứ hai** tại thư mục `frontend`:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Mở `http://localhost:3001`. Để backend chạy ở terminal đầu tiên. Nếu thay cổng frontend, nhớ đổi `FRONTEND_ORIGIN` bên backend cho khớp.

## Tài khoản demo

Lệnh seed tạo các tài khoản sau nếu trong database chưa có:

| Email | Mật khẩu | Vai trò | Số tài khoản |
|---|---|---|---|
| tuan@example.com | Demo@123456 | CUSTOMER | 900000000001 |
| an@example.com | Demo@123456 | CUSTOMER | 900000000002 |
| binh@example.com | Demo@123456 | CUSTOMER | 900000000003 |
| teller@example.com | Demo@123456 | TELLER | 900000000004 |
| admin@example.com | Demo@123456 | ADMIN | 900000000005 |

Ba tài khoản customer ban đầu có 1.000.000 VND để test chuyển khoản. Đây là thông tin demo; không dùng các mật khẩu này trong hệ thống thật. Nếu chạy seed nhiều lần, script không tự cộng lại tiền vào các tài khoản đã tồn tại.

## Các chức năng

Phần chính gồm đăng ký, đăng nhập, xem số dư, chuyển khoản nội bộ, lịch sử giao dịch và đăng xuất. Chuyển khoản dùng transaction PostgreSQL, không tính tiền bằng `float`.

Phần bổ sung có locking theo hai cách, xử lý deadlock, idempotency key, OTP cho giao dịch lớn, sổ cái kép, reversal, audit, soft delete, RBAC cho customer/teller/admin, refresh token, hạn mức, đối soát cuối ngày, phát hiện giao dịch bất thường, health check và kiểm thử.

Chuyển khoản gọi `POST /transactions/transfer` và bắt buộc gửi `Idempotency-Key` là một UUID. Frontend tự sinh khóa khi mở form; nếu request timeout, nó dùng lại đúng khóa đó khi retry. Giao dịch từ 10.000.000 VND trở lên sẽ chờ OTP. **Ở chế độ development**, backend trả thêm `demoOtp` để có thể test trên máy cá nhân. Ở production, mã này không được trả về; cần tích hợp kênh gửi OTP thực tế trước khi triển khai cho người dùng thật.

## Chạy test

Dùng database test **riêng**, không dùng database đang chứa dữ liệu demo hoặc dữ liệu cần giữ:

```powershell
cd backend
$env:DB_DATABASE = 'simple_banking_app_test'
$env:DB_SYNCHRONIZE = 'true'
npm run seed
npm run db:protect
npm run test
npm run test:cov
npm run test:e2e
Remove-Item Env:DB_DATABASE
Remove-Item Env:DB_SYNCHRONIZE
```

Bộ e2e sẽ xóa dữ liệu trong database `_test` sau khi chạy. Không đổi tên database production thành `_test` để chạy thử.

Có thêm script mô phỏng race condition và đo hai cách locking:

```powershell
$env:DB_DATABASE = 'simple_banking_app_test'
$env:DB_SYNCHRONIZE = 'true'
npm run demo:race
npm run bench:locks
Remove-Item Env:DB_DATABASE
Remove-Item Env:DB_SYNCHRONIZE
```

`bench:locks` yêu cầu backend đang chạy và **cũng phải dùng database test**. Đừng chạy script benchmark trên data chính.

## Tài liệu

- [Danh sách API](docs/api.md)
- [Sequence diagram: đăng nhập và chuyển khoản](docs/sequence-diagrams.md)
- [Các bài bổ sung và vị trí code](docs/doi-chieu-de-bai.md)
- [Cách demo và kiểm thử](docs/demo.md)
- [Ghi chú kỹ thuật](docs/technical-notes.md)
- [Nếu cần nâng cấp database cũ](docs/nang-cap-database-cu.md)
- [Đẩy lên GitHub](docs/nop-github.md)

Source không chứa mật khẩu thật. File `.env` và `.env.local` không được commit lên Git.
