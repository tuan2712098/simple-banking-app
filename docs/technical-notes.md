# Ghi chú về cách mình làm

- Mình dùng **Zustand** vì phần client cần giữ user, JWT và trạng thái đăng nhập. Dự án này chưa cần chia quá nhiều state như Redux. API vẫn gọi bằng Axios theo đề.
- PostgreSQL lưu `numeric(18,2)`; trong code Node.js tiền được chuyển sang `bigint` theo đơn vị nhỏ nhất. Không lấy JavaScript `float` để tính số dư.
- Với pessimistic locking, backend lock hai account theo thứ tự `accountId` để giảm deadlock khi A chuyển B và B chuyển A đồng thời.
- Với optimistic locking, backend dùng cột `version` và câu UPDATE có điều kiện, thất bại thì retry tối đa 5 lần.
- Cùng một Idempotency-Key và cùng request sẽ dùng lại response cũ. Khác payload thì `409`. Trên frontend, khi timeout sẽ thử lại đúng key cũ.
- Sổ cái có hai dòng DEBIT/CREDIT cho mỗi chuyển khoản, được ghi cùng DB transaction. Trigger `ledger_append_only` chặn việc sửa hoặc xóa bút toán.
- Chỉ ADMIN được xem audit, thay trạng thái tài khoản, duyệt cờ bất thường và reversal. TELLER có quyền giao dịch tại quầy nhưng không có quyền duyệt.
- OTP demo hiện ở response khi chạy môi trường `development` để mentor kiểm tra trên máy. Triển khai thật phải có kênh gửi OTP riêng và không được đưa mã trong response.
- Refresh token được lưu bản hash trong bảng `refresh_sessions`, luân phiên khi refresh. Đăng xuất hoặc đổi mật khẩu thu hồi refresh session, đồng thời tăng `tokenVersion` để JWT cũ hết hiệu lực.
- Đối soát cuối ngày lúc 23:55 theo giờ Việt Nam, so sánh balance và tổng bút toán. Dữ liệu lệch được lưu trong `reconciliation_reports`. Có API chạy đối soát thủ công để demo.
- Giao dịch bất thường được gắn cờ, không tự ý chặn cả tài khoản. Quy tắc đã làm: nhiều hơn 5 giao dịch/phút hoặc lớn hơn 5 lần mức giao dịch trung bình 30 ngày.
- Health check có kiểm tra PostgreSQL. Log HTTP trả `X-Request-Id` để tìm các dòng log cùng yêu cầu.
- Dự án mô phỏng nghiệp vụ; các tham số hạn mức, thời gian sống token và ngưỡng OTP là thông số demo trong tài liệu bổ sung, không phải quy định của ngân hàng thật.
