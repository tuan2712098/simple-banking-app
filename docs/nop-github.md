# Repository GitHub

Source Simple Banking App được lưu tại:
https://github.com/tuan2712098/simple-banking-app

Repository gồm backend, frontend, tài liệu và bộ kiểm thử.

Sau khi sửa code, chạy test và kiểm tra Git trước khi cập nhật:

```powershell
git status --short
git diff --check
git add .
git commit -m "Update banking app"
git push origin main
```

Không đưa file .env, mật khẩu, node_modules hoặc dữ liệu PostgreSQL lên GitHub.
Kiểm tra GitHub Actions sau khi push để xác nhận bản cập nhật chạy thành công.