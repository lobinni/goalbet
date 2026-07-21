# ⚽ GoalBet — Hướng dẫn Deploy lên GitHub + Vercel

## Bước 1: Push code lên GitHub

### Cách A — Clone từ sandbox (khuyến nghị)

Trên máy local, chạy:

```bash
# 1. Clone repo hiện tại (hoặc dùng repo đã có)
git clone https://github.com/lobinni/goalbet.git
cd goalbet

# 2. Xóa code cũ, giữ .git
find . -maxdepth 1 ! -name '.git' ! -name '.' -exec rm -rf {} +

# 3. Copy toàn bộ code mới (từ sandbox) vào đây
#    Nếu dùng git bundle:
git pull goalbet-v3.bundle main --allow-unrelated-histories

# 4. Commit + push
git add -A
git commit -m "GoalBet V3: AI oracle, all leagues, auto-resolve"
git push origin main --force
```

### Cách B — Tạo repo mới từ đầu

```bash
# 1. Tạo thư mục mới
mkdir goalbet && cd goalbet
git init && git branch -M main

# 2. Copy tất cả file source từ sandbox vào đây
#    (download từ preview, hoặc dùng bundle)

# 3. Commit + push
git add -A
git commit -m "GoalBet V3: AI oracle, all leagues, auto-resolve"
git remote add origin https://github.com/lobinni/goalbet.git
git push -u origin main --force
```

### Cách C — Dùng GitHub token trong sandbox

```bash
# Set token (tạo tại https://github.com/settings/tokens)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Push
cd /app
git remote set-url origin https://${GITHUB_TOKEN}@github.com/lobinni/goalbet.git
git push -u origin main --force
```

---

## Bước 2: Tạo PostgreSQL (Neon — miễn phí)

1. Vào https://neon.tech → Sign up → Create project
2. Copy connection string: `postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require`

---

## Bước 3: Deploy trên Vercel

1. Vào https://vercel.com/new
2. **Import Git Repository** → chọn `lobinni/goalbet`
3. **Framework Preset**: Next.js (tự phát hiện)
4. **Environment Variables** — thêm:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | `postgresql://...` (từ Neon bước 2) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0x15823D410Ef22437285A5dcb53f64dFb47fe1fF8` |
| `FOOTBALL_DATA_API_KEY` | _(tùy chọn)_ |

5. Click **Deploy**

---

## Bước 4: Push database schema

Sau khi Vercel deploy xong, chạy trên máy local:

```bash
DATABASE_URL="postgresql://...neon_url..." npx drizzle-kit push
```

Hoặc dùng Vercel CLI:
```bash
npx vercel env pull .env.local
npx drizzle-kit push
```

---

## Bước 5: Test

- Mở `https://goalbet-rust.vercel.app` (hoặc URL mới)
- Connect MetaMask → Chọn trận → Bet
- Sau trận kết thúc → Nhấn "🤖 Verify Result" → Claim

---

## Lưu ý quan trọng

- **Contract đã deploy**: `0x15823D410Ef22437285A5dcb53f64dFb47fe1fF8` trên GenLayer StudioNet — đã test resolve thành công
- **Vercel Hobby plan**: hàm serverless tối đa 10s. Nếu resolve qua GenLayer (fallback) chậm, nâng lên Pro plan (60s) hoặc dùng `vercel.json` đã cấu hình `maxDuration: 60`
- **ESPN API**: không cần key, miễn phí, nhưng không chính thức → có thể thay đổi bất kỳ lúc nào
