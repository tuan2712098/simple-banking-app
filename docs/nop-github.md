# Đẩy source lên GitHub

Giải nén ZIP, kiểm tra backend và frontend chạy được trên máy trước. Sau đó mở PowerShell ở thư mục gốc `Simple_Banking_App_Final` và chạy:

```powershell
git init
git add .gitignore package.json backend
git commit -m "Complete banking backend"
git add frontend
git commit -m "Build Next.js frontend"
git add docs README.md .github
git commit -m "Add tests and project documentation"
```

Tạo repository GitHub riêng cho Banking App, không đặt chung repo Day 1–6. Gắn remote theo địa chỉ repo bạn vừa tạo rồi:

```powershell
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Lưu ý không push `.env`, `.env.local`, `node_modules`, `.next`, `dist` hoặc file mật khẩu. Sau khi đẩy xong, mở GitHub kiểm tra README, thư mục backend/frontend và lịch sử commit rồi mới gửi mentor.
