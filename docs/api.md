# Danh sách API

Backend mặc định chạy tại `http://localhost:3000`. Những API cần đăng nhập gửi `Authorization: Bearer <accessToken>`. Refresh token lưu trong cookie HTTP-only, không trả về body. Các API chuyển khoản, chuyển khoản hộ và nạp tiền yêu cầu header `Idempotency-Key: <UUID>`.

| Method | Endpoint | Quyền | Chức năng |
|---|---|---|---|
| POST | `/auth/register` | Công khai | Tạo user và tài khoản ngân hàng |
| POST | `/auth/login` | Công khai | Đăng nhập, nhận access token |
| POST | `/auth/refresh` | Cookie | Refresh, xoay vòng token |
| POST | `/auth/logout` | Đăng nhập | Thu hồi phiên đăng nhập |
| POST | `/auth/change-password` | Đăng nhập | Đổi mật khẩu, thu hồi phiên cũ |
| GET | `/accounts/me` | Đăng nhập | Xem số tài khoản và số dư |
| PATCH | `/accounts/me/email` | Đăng nhập | Đổi email và ghi lịch sử thay đổi |
| GET | `/accounts/me/history` | Đăng nhập | Lịch sử thay đổi email |
| POST | `/transactions/transfer` | Đăng nhập | Chuyển khoản pessimistic locking |
| POST | `/transactions/transfer-optimistic` | Đăng nhập | Chuyển khoản optimistic locking để so sánh |
| POST | `/transactions/confirm-otp` | Đăng nhập | Xác nhận OTP cho giao dịch lớn |
| POST | `/transactions/withdraw` | Đăng nhập | Mô phỏng rút tiền |
| POST | `/transactions/deposit` | TELLER/ADMIN | Mô phỏng nạp tiền |
| POST | `/transactions/teller-transfer` | TELLER/ADMIN | Giao dịch hộ khách hàng |
| GET | `/transactions` | Đăng nhập | Lịch sử riêng, phân trang/lọc/sắp xếp |
| GET | `/admin/users` | ADMIN | Danh sách người dùng |
| PATCH | `/admin/users/:id/status` | ADMIN | Khóa/mở user |
| PATCH | `/admin/accounts/:id/status` | ADMIN | ACTIVE/FROZEN/CLOSED |
| PATCH | `/admin/accounts/:id/tier` | ADMIN | STANDARD/VIP |
| DELETE | `/admin/accounts/:id` | ADMIN | Soft delete tài khoản |
| DELETE | `/admin/users/:id` | ADMIN | Soft delete user |
| GET | `/admin/transactions` | ADMIN | Xem toàn bộ giao dịch |
| POST | `/admin/transactions/:id/approve-large` | ADMIN | Duyệt giao dịch lớn tại quầy, khách vẫn phải xác nhận OTP |
| POST | `/admin/transactions/:id/reverse` | ADMIN | Hoàn tiền bằng giao dịch đảo ngược |
| GET | `/admin/flagged-transactions` | ADMIN | Xem giao dịch bị gắn cờ |
| PATCH | `/admin/flagged-transactions/:id/approve` | ADMIN | Duyệt kết quả review |
| PATCH | `/admin/flagged-transactions/:id/reject` | ADMIN | Từ chối kết quả review |
| GET | `/admin/audit-logs` | ADMIN | Xem audit log |
| POST | `/admin/reconcile` | ADMIN | Chạy đối soát thủ công |
| GET | `/admin/reconciliation-reports` | ADMIN | Xem chênh lệch sổ cái |
| GET | `/health` | Công khai | Kiểm tra PostgreSQL |

## Ví dụ

Đăng nhập:

```json
{
  "email": "tuan@example.com",
  "password": "Demo@123456"
}
```

Body chuyển khoản:

```json
{
  "toAccountNumber": "900000000002",
  "amount": "100000.00",
  "description": "Chuyen tien test"
}
```

Số tiền gửi dưới dạng **chuỗi decimal** để không có lỗi làm tròn kiểu số thực. Giá trị phải lớn hơn 0, tối đa 16 chữ số phần nguyên và 2 chữ số thập phân.

Nếu request hợp lệ, giao dịch nhỏ trả trạng thái `COMPLETED`; giao dịch lớn từ 10 triệu đồng trả `PENDING_OTP`. Ở chế độ development, response có `demoOtp`; không có trường đó ở production.

Body xác nhận OTP:

```json
{
  "transactionId": "UUID-cua-giao-dich",
  "otp": "123456"
}
```

Lịch sử:

`GET /transactions?page=1&limit=10&sort=desc&type=transfer&status=COMPLETED`

Nếu gửi lại cùng một Idempotency-Key và cùng body, backend trả response cũ và không chuyển tiền thêm. Nếu dùng lại key với body khác sẽ trả `409 Conflict`.

Dùng sai quyền trả `403`, chưa đăng nhập hoặc token hết hạn trả `401`, input không hợp lệ trả `400`, tài khoản không tồn tại trả `404`, vượt tốc độ yêu cầu trả `429`.
