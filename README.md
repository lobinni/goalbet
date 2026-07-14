# ⚽ GoalBet — On-Chain Football Betting dApp

[![Built on GenLayer](https://img.shields.io/badge/Built%20on-GenLayer-6366f1?style=for-the-badge)](https://genlayer.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)

A decentralized football betting platform with **funded payouts**, **solvency guarantees**, and **AI Oracle resolution**.

## ✨ Features

- 🦊 **MetaMask Integration** — Connect wallet, auto network switching to GenLayer StudioNet
- 💰 **Real GEN Betting** — Stake GEN tokens on match outcomes
- 🏦 **Funded Claim Path** — Winners claim payouts; GEN is actually transferred from the pool
- 📊 **Solvency-Guaranteed** — Odds constrained to available pool backing; bets rejected if pool can't cover
- 🤖 **AI Oracle Resolution** — On-chain AI verifies results from BBC Sport
- 🏆 **Leaderboard** — Ranked by total GEN winnings
- ⚽ **Live Fixtures** — Real-time match data with countdown timers
- 🏟️ **Team Logos** — Official club crests and national flags
- 🎨 **Modern UI** — Dark glassmorphism design with animations

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, Glassmorphism |
| **Database** | PostgreSQL via Drizzle ORM |
| **Blockchain** | GenLayer StudioNet |
| **Smart Contract** | Python (GenVM) |
| **AI Oracle** | `gl.nondet.web.render` + `gl.nondet.exec_prompt` |
| **Wallet** | MetaMask via `genlayer-js` |
| **Deploy** | Vercel |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- MetaMask browser extension
- GEN tokens from [faucet](https://studio.genlayer.com/contracts)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/goalbet.git
cd goalbet
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL
```

### 3. Setup Database

```bash
npm run db:push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Run Tests

```bash
npm test
```

## 🌐 Deploy to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/goalbet&env=DATABASE_URL&envDescription=PostgreSQL%20connection%20string&envLink=https://vercel.com/docs/environment-variables)

### Option 2: Manual Deploy

1. **Push to GitHub**

```bash
git init
git add -A
git commit -m "Initial commit: GoalBet dApp"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/goalbet.git
git push -u origin main
```

2. **Set up PostgreSQL database**

   Recommended providers for Vercel:
   - [Neon](https://neon.tech) — Serverless Postgres, free tier
   - [Supabase](https://supabase.com) — Postgres with real-time
   - [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)

3. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Add environment variable: `DATABASE_URL` = your PostgreSQL connection string
   - Click **Deploy**
   - Done! 🎉

4. **Environment Variables in Vercel Dashboard**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `FOOTBALL_DATA_API_KEY` | No | API key for live fixtures |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | No | GenLayer contract address |

## 🏦 Pool Solvency System

GoalBet uses a **solvency-guaranteed pool model**:

```
Place bet:     poolBalance += stake        pendingPayouts += stake × odds
Resolve (win): pendingPayouts -= payout     (→ payable on claim)
Resolve (lose):pendingPayouts -= payout     (→ stake stays as surplus)
Claim:         poolBalance  -= payout      (GEN leaves pool → winner)
Deposit:       poolBalance  += amount      (liquidity provision)
```

**Invariant**: `pendingPayouts ≤ poolBalance` — checked before every bet.

If a bet would violate solvency, it's **rejected** and the API returns the **maximum odds the pool can back**:

```json
{
  "error": "Insufficient pool liquidity for 50.0× odds. Max odds backed by pool: 3.45× (pool 1090.00 GEN, pending 1000.00 GEN). Deposit more GEN or lower your odds."
}
```

### Deposit API

Add liquidity to the pool:

```bash
curl -X POST https://your-app.vercel.app/api/pool/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000}'
```

## 📱 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. User connects MetaMask                                  │
│     └── Switch to GenLayer StudioNet (auto-prompt)          │
├─────────────────────────────────────────────────────────────┤
│  2. Select match + prediction + stake amount                │
│     └── Man City vs Liverpool → Man City Win → 10 GEN       │
├─────────────────────────────────────────────────────────────┤
│  3. Solvency check                                          │
│     └── Pool must cover: stake × odds for ALL pending bets  │
│     └── If insufficient: odds capped or bet rejected        │
├─────────────────────────────────────────────────────────────┤
│  4. Sign transaction                                        │
│     └── GEN tokens transferred to contract pool             │
├─────────────────────────────────────────────────────────────┤
│  5. Match finishes in real world                            │
│     └── BBC Sport updates results                           │
├─────────────────────────────────────────────────────────────┤
│  6. Click "Resolve with AI"                                 │
│     └── AI Oracle fetches BBC Sport                         │
│     └── LLM extracts score and winner                       │
│     └── Multi-validator consensus                           │
├─────────────────────────────────────────────────────────────┤
│  7. Winner clicks "Claim Winnings"                          │
│     └── Pool transfers payout (stake × odds) to winner      │
│     └── Pool balance decremented                            │
│     └── Loser's stake stays as pool surplus                 │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
goalbet/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main app component
│   │   ├── layout.tsx            # Root layout
│   │   ├── globals.css           # Tailwind + custom styles
│   │   └── api/
│   │       ├── health/           # Health check endpoint
│   │       ├── fixtures/         # Live match data API
│   │       ├── users/            # User management
│   │       ├── bets/             # Place & list bets
│   │       │   └── [id]/
│   │       │       ├── resolve/  # AI Oracle resolution
│   │       │       └── claim/    # Funded payout claim
│   │       ├── leaderboard/      # Rankings API
│   │       ├── balance/          # User balance API
│   │       └── pool/             # Pool state + deposit API
│   ├── components/
│   │   └── TeamLogo.tsx          # Team logo component
│   ├── lib/
│   │   ├── genlayer.ts           # GenLayer client (on-chain)
│   │   ├── matches.ts            # Match data utilities
│   │   └── team-logos.ts         # Team logo mappings
│   └── db/
│       ├── index.ts              # Database client
│       └── schema.ts             # Drizzle schema (users, bets, pool)
├── contract.py                   # GenLayer smart contract
├── __tests__/                    # Vitest integration tests
├── vercel.json                   # Vercel deployment config
├── drizzle.config.ts             # Drizzle ORM config
├── .env.example                  # Environment variables template
└── package.json
```

## 🧪 Tests

24 integration tests covering the full lifecycle:

```
✓ Stake: place bet, duplicate rejection, min stake, odds > 1, balance deduction, pool tracking
✓ Solvency: rejects unbacked odds (returns max odds), deposit increases liquidity
✓ Resolve: 3 users covering all outcomes, reject re-resolve, mark resolved
✓ Claim: winner claims + GEN transferred, loser rejected, re-claim rejected
✓ Guards: reject claim on unresolved bet
✓ Final: user stats correct, pool solvent, winner balance increased
```

## 📜 Smart Contract

The Intelligent Contract is deployed on GenLayer StudioNet:

```python
class GoalBet(gl.Contract):
    bets: TreeMap[str, Bet]
    stats: TreeMap[Address, PlayerStats]
    total_pool: u256
    total_pending_payouts: u256

    @gl.public.write.payable
    def deposit(self) -> None: ...

    @gl.public.write.payable
    def create_bet(self, game_date, team1, team2, predicted_winner, odds) -> None: ...

    @gl.public.write
    def resolve_bet(self, bet_id) -> None: ...

    @gl.public.write
    def claim_winnings(self, bet_id) -> None: ...

    @gl.public.view
    def get_total_pool(self) -> dict: ...
```

## 🔒 Security

- ✅ Private keys never leave MetaMask
- ✅ All transactions signed client-side
- ✅ Pool solvency invariant enforced on every bet
- ✅ Claim path: only resolved, won, unclaimed bets can claim
- ✅ Payout transfer checked against pool balance (503 if insolvent)
- ✅ AI consensus prevents single-validator manipulation
- ✅ Odds constrained to available pool backing

## 📄 License

MIT License — see [LICENSE](LICENSE) file

---

**Built with ❤️ on [GenLayer](https://genlayer.com)** · **Deployed on [Vercel](https://vercel.com)**

⚽ Happy Betting! 🎯
