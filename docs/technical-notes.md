# Ghi chú kỹ thuật

Frontend sử dụng Zustand để lưu thông tin người dùng, JWT và trạng thái đăng nhập. Các yêu cầu gửi đến backend được xử lý qua Axios.

PostgreSQL lưu số tiền dưới dạng `numeric(18,2)`. Khi tính toán trong Node.js, số tiền được chuyển sang `bigint` theo đơn vị nhỏ nhất để tránh sai số của kiểu `float`.

Có hai cách xử lý giao dịch đồng thời:

- Pessimistic locking: khóa hai tài khoản theo thứ tự `accountId` trước khi cập nhật số dư, hạn chế deadlock khi có chuyển khoản hai chiều.
- Optimistic locking: dùng cột `version` và câu lệnh UPDATE có điều kiện. Nếu xảy ra xung đột, hệ thống đọc lại dữ liệu và thử lại, tối đa 8 lần.

Đã chạy benchmark với 20 yêu cầu chuyển khoản đồng thời cho mỗi cách. Trong lần đo này, cả hai đều có 10 giao dịch thành công, 10 giao dịch bị từ chối do không đủ số dư. Số dư cuối cùng của tài khoản gửi là 0 đồng, tài khoản nhận là 1.000.000 đồng. Thời gian xử lý đo được là 407 ms cho mỗi cách, tương đương khoảng 49 request/giây. Đây là kết quả của một lần đo, chưa đủ để kết luận cách nào luôn nhanh hơn.

API chuyển khoản sử dụng `Idempotency-Key` để xử lý yêu cầu gửi trùng. Nếu key và nội dung yêu cầu không đổi, backend trả lại kết quả cũ. Nếu dùng lại key với nội dung khác, API trả HTTP 409. Frontend giữ nguyên key khi thử gửi lại yêu cầu.

Mỗi giao dịch chuyển khoản tạo hai bút toán DEBIT và CREDIT trong cùng một database transaction. Trigger `ledger_append_only` ngăn sửa hoặc xóa các bút toán đã ghi.

Hệ thống phân quyền theo vai trò. ADMIN được xem audit log, quản lý trạng thái tài khoản, xử lý giao dịch bị gắn cờ và thực hiện reversal. TELLER có thể thực hiện giao dịch tại quầy nhưng không có quyền phê duyệt.

Với giao dịch giá trị lớn, hệ thống yêu cầu xác nhận OTP. Trong môi trường development, mã OTP được trả về để thuận tiện cho việc demo. Phiên bản hiện tại chưa tích hợp dịch vụ gửi OTP thực tế.

Refresh token được lưu dưới dạng hash trong bảng `refresh_sessions`. Khi refresh, token được thay mới. Đăng xuất hoặc đổi mật khẩu sẽ thu hồi phiên liên quan và tăng `tokenVersion` để vô hiệu hóa JWT cũ.

Job đối soát chạy lúc 23:55 theo giờ Việt Nam, so sánh số dư tài khoản với tổng các bút toán trong sổ cái. Nếu phát hiện chênh lệch, hệ thống ghi vào bảng `reconciliation_reports` và tạo log cảnh báo. Ngoài cron job còn có API chạy đối soát thủ công.

Các giao dịch có dấu hiệu bất thường được gắn cờ để quản trị viên kiểm tra. Hai quy tắc đã triển khai là nhiều hơn 5 giao dịch trong một phút hoặc số tiền lớn hơn 5 lần mức giao dịch trung bình của 30 ngày gần nhất.

Endpoint `/health` kiểm tra kết nối PostgreSQL. Mỗi HTTP request có `X-Request-Id` để hỗ trợ tìm log khi xảy ra lỗi.

Dự án sử dụng dữ liệu mô phỏng. Hạn mức giao dịch, ngưỡng OTP và thời gian sống của token là cấu hình phục vụ bài thực tập, không phải quy định của ngân hàng thực tế.