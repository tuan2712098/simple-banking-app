# Cách mình demo

1. Chạy backend + frontend, mở `/health` xem trạng thái PostgreSQL.
2. Đăng nhập user Tuan. Xem số tài khoản và số dư trên Dashboard.
3. Chuyển 100.000 VND cho An, mở lịch sử để thấy tiền ra. Đăng nhập An để thấy cùng giao dịch đó là tiền vào.
4. Thử số tiền âm, vượt số dư và số tài khoản của chính mình. Backend phải từ chối.
5. Thử cùng một Idempotency-Key 5 lần. Tổng số lần trừ tiền phải bằng 1.
6. Chuyển từ 10 triệu đồng trở lên sau khi cấp đủ số dư demo, nhập OTP demo. Nhập sai/hết hạn phải bị từ chối.
7. Chạy bài kiểm thử 20 request đồng thời trên database test, kiểm tra không âm quỹ và không mất bút toán.
8. Đăng nhập teller để demo giao dịch tại quầy; thử vào phần admin phải bị chặn.
9. Đăng nhập admin để xem user, khóa tài khoản, xem cờ bất thường, audit, đối soát và reversal.
10. Trình bày hai sequence diagram và giải thích chỗ rollback trong transaction.

Chạy `npm run test`, `npm run test:cov` và `npm run test:e2e` với database `_test`. Kết quả coverage/benchmark phải lấy từ lần chạy thực tế, không điền số liệu giả vào báo cáo.

Khi đẩy lên GitHub, file `.github/workflows/ci.yml` sẽ thử build hai phần và chạy các bộ test bằng PostgreSQL test riêng. Nếu CI báo đỏ thì cần xem log và sửa trước khi gửi mentor.
