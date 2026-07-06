# 🚀 Deploy GoalBet to GitHub & Vercel

## Step 1: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name**: `goalbet`
   - **Description**: `On-Chain Football Betting dApp on GenLayer`
   - **Visibility**: Public
3. **DO NOT** check "Add a README file"
4. Click **Create repository**

## Step 2: Push Code to GitHub

```bash
# Initialize git (if not already)
git init

# Add all files
git add -A

# Create commit
git commit -m "🚀 GoalBet - On-Chain Football Betting dApp"

# Set main branch
git branch -M main

# Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/goalbet.git

# Push to GitHub
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: One-Click Deploy

Click this button after pushing to GitHub:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/goalbet)

### Option B: Manual Deploy

1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New"** → **"Project"**
4. Find and select `goalbet` repository
5. Click **"Import"**
6. Keep default settings (Framework: Next.js)
7. Click **"Deploy"**

Wait ~1 minute for deployment.

## Step 4: Access Your App

Your app will be live at:
```
https://goalbet.vercel.app
```

Or with your username:
```
https://goalbet-YOUR_USERNAME.vercel.app
```

## 🔄 Auto-Deploy Updates

After initial setup, every `git push` automatically redeploys:

```bash
# Make changes, then:
git add -A
git commit -m "Your commit message"
git push
```

## ⚙️ Optional: Custom Domain

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `goalbet.com`)
3. Update DNS records as instructed

## ❓ Troubleshooting

### Build fails?
```bash
# Test build locally first
npm run build
```

### MetaMask not connecting?
- Install MetaMask extension
- Switch to GenLayer StudioNet network
- Get GEN from faucet: https://studio.genlayer.com/contracts

### Blank page?
- Check browser console (F12) for errors
- Ensure MetaMask is unlocked

---

**Need help?** Check [GenLayer Docs](https://docs.genlayer.com) or create an issue.
