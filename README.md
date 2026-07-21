# ⚽ GoalBet — On-Chain Football Prediction Market

Decentralized football prediction market powered by the **GenLayer AI Oracle**
for trustless match resolution and **USDC on Base Sepolia** for betting.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  User (MetaMask on Base Sepolia)                            │
│  → Connect wallet → auto-register                           │
│  → Deposit USDC → place bets → resolve → claim winnings     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  Next.js + PostgreSQL  (Backbone)                           │
│  /api/bets       → pool tracking, payout calculation        │
│  /api/resolve    → ESPN JSON → football-data → GenLayer     │
│  /api/fixtures   → live match data (ESPN public API)        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│  GenLayer StudioNet  (Brain — AI Oracle)                    │
│  Contract: contracts/goalbet_v3.py                          │
│  → resolve_market() fetches ESPN scoreboard JSON            │
│  → deterministic score extraction (strict validator         │
│    consensus), LLM fallback for edge cases                  │
│  → Verified result stored on-chain                          │
└─────────────────────────────────────────────────────────────┘
```

### Match resolution priority (`POST /api/resolve`)

1. **ESPN public JSON API** — no auth, structured, reliable (primary)
2. **football-data.org** — if `FOOTBALL_DATA_API_KEY` is set
3. **GenLayer AI Oracle** — on-chain verifiable resolution (see `contracts/goalbet_v3.py`)

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

### 3. Deploy the GenLayer oracle contract

1. Open https://studio.genlayer.com → **Deploy contract**
2. Paste the content of `contracts/goalbet_v3.py` → Deploy
3. Copy the new contract address

> ⚠️ The old V2 contract crashes with
> `AttributeError: module 'genlayer.gl' has no attribute 'eq_principle_strict_eq'`
> because the SDK moved to `gl.eq_principle.strict_eq` / `gl.nondet.web.get` /
> `gl.nondet.exec_prompt`. Always deploy **V3**. Details in `contracts/README.md`.

### 4. Deploy on [vercel.com](https://vercel.com)

Import repo → set environment variables:

| Variable                        | Value                                      |
| ------------------------------- | ------------------------------------------ |
| DATABASE_URL                    | postgresql://... (from Neon)               |
| NEXT_PUBLIC_CONTRACT_ADDRESS    | 0x... (V3 contract from step 3)            |
| FOOTBALL_DATA_API_KEY           | optional                                   |

### 5. Push schema

```bash
DATABASE_URL="your_neon_url" npx drizzle-kit push
```

## 📜 License

MIT
