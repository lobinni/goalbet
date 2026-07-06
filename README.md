# ⚽ GoalBet - On-Chain Football Betting dApp

[![Built on GenLayer](https://img.shields.io/badge/Built%20on-GenLayer-6366f1?style=for-the-badge)](https://genlayer.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Deploy with Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)

A decentralized football betting platform built on **GenLayer** — the first blockchain with native AI inference. Bet GEN tokens on real football matches, and outcomes are resolved automatically by an AI Oracle that fetches live results from BBC Sport.

![GoalBet Preview](https://via.placeholder.com/800x400/0f0d1a/6366f1?text=GoalBet+-+Football+Betting+dApp)

## ✨ Features

- 🦊 **MetaMask Integration** — Connect wallet, auto network switching
- 💰 **Real GEN Betting** — Stake GEN tokens on match outcomes
- 🤖 **AI Oracle Resolution** — Automatic result verification from BBC Sport
- 🏆 **Leaderboard** — Ranked by total GEN winnings
- ⚽ **Live Fixtures** — Real-time match data with countdown timers
- 🏟️ **Team Logos** — Official club crests and national flags
- 🎨 **Modern UI** — Dark glassmorphism design with animations

## 🔗 Links

| Resource | URL |
|----------|-----|
| 📱 **Live App** | [goalbet-rho.vercel.app](https://goalbet-rho.vercel.app) |
| 📜 **Contract** | [0x60fcDCeF6C6881ADD3A9327eE7F7EFeBf50aEC71](https://explorer-studio.genlayer.com/address/0x60fcDCeF6C6881ADD3A9327eE7F7EFeBf50aEC71) |
| 💰 **Faucet** | [GenLayer Studio](https://studio.genlayer.com/contracts) |
| 🌐 **GenLayer** | [genlayer.com](https://genlayer.com) |

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, Glassmorphism |
| **Blockchain** | GenLayer StudioNet |
| **Smart Contract** | Python (GenVM) |
| **AI Oracle** | `gl.nondet.web.render` + `gl.nondet.exec_prompt` |
| **Wallet** | MetaMask via `genlayer-js` |
| **Team Logos** | football-data.org + flagcdn.com |

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MetaMask browser extension
- GEN tokens from [faucet](https://studio.genlayer.com/contracts)

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/goalbet.git
cd goalbet

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. User connects MetaMask                                  │
│     └── Switch to GenLayer StudioNet (auto-prompt)          │
├─────────────────────────────────────────────────────────────┤
│  2. Select match + prediction + stake amount                │
│     └── Man City vs Liverpool → Man City Win → 10 GEN       │
├─────────────────────────────────────────────────────────────┤
│  3. Sign transaction                                        │
│     └── GEN tokens transferred to contract                  │
├─────────────────────────────────────────────────────────────┤
│  4. Match finishes in real world                            │
│     └── BBC Sport updates results                           │
├─────────────────────────────────────────────────────────────┤
│  5. Click "Resolve with AI"                                 │
│     └── AI Oracle fetches BBC Sport                         │
│     └── LLM extracts score and winner                       │
│     └── Multi-validator consensus                           │
├─────────────────────────────────────────────────────────────┤
│  6. Result committed on-chain                               │
│     └── Winner: Receive payout (stake × odds)               │
│     └── Loser: Lose stake                                   │
└─────────────────────────────────────────────────────────────┘
```

## 🌐 Deploy to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/user/goalbet)

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

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Click **Deploy**
   - Done! 🎉

No environment variables required for basic functionality.

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
│   │       └── fixtures/         # Live match data API
│   ├── components/
│   │   └── TeamLogo.tsx          # Team logo component
│   └── lib/
│       ├── genlayer.ts           # GenLayer client wrapper
│       ├── matches.ts            # Match data utilities
│       └── team-logos.ts         # Team logo mappings
├── contract.py                   # GenLayer smart contract
├── public/                       # Static assets
├── package.json
├── next.config.ts
├── vercel.json
└── README.md
```

## 📜 Smart Contract

The Intelligent Contract is deployed on GenLayer StudioNet:

```python
class GoalBet(gl.Contract):
    bets: TreeMap[str, Bet]
    stats: TreeMap[Address, PlayerStats]

    @gl.public.write
    def create_bet(game_date, team1, team2, predicted_winner, odds):
        # Receives GEN stake via gl.message.value
        ...

    @gl.public.write
    def resolve_bet(bet_id):
        # AI Oracle fetches BBC Sport and verifies result
        match_result = self._check_match(...)
        if correct_prediction:
            gl.transfer(sender, payout)
        ...

    @gl.public.view
    def get_leaderboard():
        # Returns players sorted by total GEN won
        ...
```

### Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `create_bet` | Write | Place bet with GEN stake |
| `resolve_bet` | Write | Trigger AI resolution |
| `get_bets` | View | Get user's bets |
| `get_leaderboard` | View | Get rankings by winnings |
| `get_player_stats` | View | Get player statistics |

## 🔒 Security

- ✅ Private keys never leave MetaMask
- ✅ All transactions signed client-side
- ✅ Gasless on StudioNet
- ✅ AI consensus prevents single-validator manipulation
- ✅ No backend server required

## 🎨 UI Features

- **Dark Theme** — Eye-friendly glassmorphism design
- **Responsive** — Works on mobile and desktop
- **Animations** — Smooth transitions and loading states
- **Team Logos** — 100+ official club crests
- **Live Countdown** — "in 2h 30m" until kickoff
- **Toast Notifications** — Transaction feedback with explorer links

## 📄 License

MIT License — see [LICENSE](LICENSE) file

---

**Built with ❤️ on [GenLayer](https://genlayer.com)**

⚽ Happy Betting! 🎯
