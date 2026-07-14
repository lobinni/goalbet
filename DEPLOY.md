# 🚀 Hướng dẫn Deploy GoalBet lên GitHub + Vercel

## Bước 1: Tạo repository trên GitHub

1. Mở https://github.com/new
2. Tạo repo tên `goalbet` (Public hoặc Private)
3. **KHÔNG** check "Add a README" hay .gitignore (đã có sẵn)

## Bước 2: Push code lên GitHub

```bash
# Thêm remote (thay YOUR_USERNAME bằng username GitHub của bạn)
git remote add origin https://github.com/YOUR_USERNAME/goalbet.git

# Push code lên
git push -u origin main
```

Nếu dùng SSH:
```bash
git remote add origin git@github.com:YOUR_USERNAME/goalbet.git
git push -u origin main
```

## Bước 3: Tạo PostgreSQL Database

Chọn 1 trong các provider sau (đều có free tier):

### Option A: Neon (Recommended)
1. Mở https://neon.tech → Sign up
2. Create new project → Copy connection string
3. Format: `postgresql://username:password@ep-xxx.region.aws.neon.tech/goalbet?sslmode=require`

### Option B: Supabase
1. Mở https://supabase.com → New project
2. Settings → Database → Copy connection string

### Option C: Vercel Postgres
1. Mở https://vercel.com/dashboard → Storage → Create Database → Postgres
2. Copy `POSTGRES_URL`

## Bước 4: Deploy trên Vercel

### Cách 1: One-Click
Click badge trong README.md hoặc:
https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/goalbet

### Cách 2: Manual
1. Mở https://vercel.com/dashboard
2. **Add New...** → Project
3. Import Git Repository → Chọn `goalbet`
4. Configure Project:
   - Framework Preset: **Next.js** (auto-detected)
   - Build Command: `npm run vercel-build` (đã có trong vercel.json)
5. **Environment Variables** → Add:
   ```
   DATABASE_URL = postgresql://username:password@your-host/goalbet?sslmode=require
   ```
6. Click **Deploy**
7. Đợi ~2 phút, xong! 🎉

## Bước 5: Kiểm tra

Sau khi deploy xong:
1. Mở URL Vercel cấp (vd: `goalbet.vercel.app`)
2. Kiểm tra health: `goalbet.vercel.app/api/health`
3. Kiểm tra pool: `goalbet.vercel.app/api/pool`
4. Nạp thêm GEN vào pool:
   ```bash
   curl -X POST https://goalbet.vercel.app/api/pool/deposit \
     -H "Content-Type: application/json" \
     -d '{"amount": 5000}'
   ```

## 🔧 Cấu trúc Environment Variables

| Variable | Required | Mô tả |
|----------|----------|--------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `FOOTBALL_DATA_API_KEY` | ❌ | API key cho live fixtures |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | ❌ | GenLayer contract address |

## 📝 Lưu ý

- `vercel.json` đã cấu hình `buildCommand: npm run vercel-build`
- `vercel-build` script chạy `npm run db:push` (push schema) rồi `next build`
- Database schema tự động push mỗi lần deploy
- Pool default 1000 GEN khi deploy lần đầu
