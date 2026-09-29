# Nâng cấp database từ phiên bản cũ

Bản source cũ có database `simple_banking_app`, với ba bảng `users`, `accounts`, `transactions`. File `.env` và dữ liệu PostgreSQL trên máy không được đưa lên GitHub.

Mặc định bản mới chạy với database **riêng** `simple_banking_app_final` để không làm thay đổi dữ liệu thử nghiệm cũ. Cách này giúp giữ nguyên dữ liệu thử nghiệm của phiên bản cũ.

Nếu muốn nâng cấp trực tiếp database cũ:

1. Sao lưu database bằng `pg_dump` trước.
2. Trong `backend/.env`, đổi `DB_DATABASE=simple_banking_app` và `DB_SYNCHRONIZE=false`.
3. Chạy `npm run migrate:legacy`. Script chuyển các enum cũ thành varchar, cập nhật trạng thái giao dịch sang tên mới, sau đó tạo schema nâng cao và ghi bút toán mở đầu cho số dư đang có.
4. Chạy `npm run db:protect` để bật trigger sổ cái bất biến.
5. Kiểm tra lại số dư và lịch sử trước khi chạy API mới.

Không chạy script migration hai lần hoặc trên DB đang hoạt động thật. Với dữ liệu cũ lớn hoặc có sửa tay nhiều lần, cần đối soát và kiểm tra riêng vì phần lịch sử cũ chưa được tạo sổ cái kép tại thời điểm phát sinh.
