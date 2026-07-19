# ⚽ GoalBet — On-Chain Football Prediction Market

Decentralized football prediction market powered by **GenLayer AI Oracle** for trustless match resolution and **USDC on Base Sepolia** for betting.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User (MetaMask on Base Sepolia)                            │
│  → Connect wallet → auto-register                           │
│  → Deposit USDC → place bets → claim winnings               │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Next.js + PostgreSQL  (Backbone)                           │
│  /api/bets       → pool tracking, payout calculation        │
│  /api/resolve    → calls GenLayer AI Oracle                 │
│  /api/fixtures   → live match data                          │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  GenLayer StudioNet  (Brain — AI Oracle)                    │
│  Contract: 0xAaE949a5eE8808ABFAd804ea562213Aca3C028d5      │
│  → resolve_market() fetches BBC Sport                       │
│  → LLM extracts match score                                │
│  → Multi-validator consensus                                │
│  → Verified result stored on-chain                          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Deploy

### 1. Push to GitHub

```bash
git init && git add -A
git commit -m "GoalBet: AI prediction market"
git branch -M main
git remote add origin https://github.com/YOUR_USER/goalbet.git
git push -u origin main
```

### 2. Create PostgreSQL — [neon.tech](https://neon.tech) (free)

### 3. Deploy on [vercel.com](https://vercel.com)

Import repo → set environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://...` (from Neon) |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `0xAaE949a5eE8808ABFAd804ea562213Aca3C028d5` |

### 4. Push schema + seed

```bash
DATABASE_URL="your_neon_url" npx drizzle-kit push
curl -X POST https://your-app.vercel.app/api/seed-test
```

## 📜 License

MIT
