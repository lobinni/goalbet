#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# GoalBet — Push to GitHub & deploy on Vercel
# Usage: bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

REPO_URL="${GITHUB_REPO_URL:-https://github.com/lobinni/goalbet.git}"
BRANCH="${GITHUB_BRANCH:-main}"

echo "╔══════════════════════════════════════════════╗"
echo "║  ⚽ GoalBet — Deploy to GitHub + Vercel      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Git init ──
if [ ! -d .git ]; then
  echo "→ Initialising git repo…"
  git init
  git branch -M "$BRANCH"
fi

# ── 2. Add remote ──
if ! git remote | grep -q origin; then
  echo "→ Adding remote: $REPO_URL"
  git remote add origin "$REPO_URL"
else
  echo "→ Remote 'origin' already set: $(git remote get-url origin)"
  echo "  (Change with: git remote set-url origin <new-url>)"
fi

# ── 3. Stage + commit ──
git add -A
COMMIT_MSG="GoalBet V3: AI oracle, all leagues, auto-resolve ($(date -u '+%Y-%m-%d %H:%M UTC'))"
git commit -m "$COMMIT_MSG" || echo "  (nothing new to commit)"

# ── 4. Push ──
echo ""
echo "→ Pushing to $BRANCH…"
git push -u origin "$BRANCH" --force

echo ""
echo "════════════════════════════════════════════════"
echo "✅ Code pushed to GitHub!"
echo ""
echo "Next steps on Vercel (https://vercel.com/new):"
echo ""
echo "  1. Import the repo: $REPO_URL"
echo "  2. Framework preset: Next.js (auto-detected)"
echo "  3. Set environment variables:"
echo ""
echo "     DATABASE_URL                    = postgresql://... (from Neon)"
echo "     NEXT_PUBLIC_CONTRACT_ADDRESS    = 0x15823D410Ef22437285A5dcb53f64dFb47fe1fF8"
echo "     FOOTBALL_DATA_API_KEY           = (optional)"
echo ""
echo "  4. Deploy! Then push schema:"
echo ""
echo "     DATABASE_URL=\"your_neon_url\" npx drizzle-kit push"
echo ""
echo "════════════════════════════════════════════════"
