# ⚽ GoalBet — On-Chain Football Prediction Market

Decentralized football prediction market powered by **GenLayer AI Oracle** and **USDC on Base Sepolia**.

## Architecture

```
User (MetaMask / Base Sepolia)
  │── Deposit USDC ──→ Project Wallet (custodial)
  │── Place Bets ────→ PostgreSQL (pool tracking) + GenLayer (on-chain record)
  │── Claim Wins ────→ PostgreSQL (payout = stake/winning_pool × total_pool)
  │
Server (Next.js)
  │── /api/resolve ──→ GenLayer AI Oracle
  │                     → gl.get_webpage(BBC Sport)
  │                     → gl.exec_prompt(extract score)
  │                     → gl.eq_principle_strict_eq (multi-validator consensus)
  │                     → On-chain verified result
```

## Contract

```
GoalBetV2 on GenLayer StudioNet
Address: 0xAaE949a5eE8808ABFAd804ea562213Aca3C028d5
Explorer: https://explorer-studio.genlayer.com/address/0xAaE949a5eE8808ABFAd804ea562213Aca3C028d5
```

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add -A
git commit -m "GoalBet: AI-powered football prediction market"
git branch -M main
git remote add origin https://github.com/YOUR_USER/goalbet.git
git push -u origin main
```

### 2. Create PostgreSQL database

Use [Neon](https://neon.tech) (free) or [Supabase](https://supabase.com):
- Create a new project
- Copy the connection string

### 3. Deploy on Vercel

- Go to [vercel.com](https://vercel.com) → Import GitHub repo
- Add environment variable:
  - `DATABASE_URL` = your PostgreSQL connection string
  - `NEXT_PUBLIC_CONTRACT_ADDRESS` = `0xAaE949a5eE8808ABFAd804ea562213Aca3C028d5`
- Click **Deploy**

### 4. Push database schema

```bash
npx drizzle-kit push
```

## Local Development

```bash
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL
npm run dev
```

## License

MIT
