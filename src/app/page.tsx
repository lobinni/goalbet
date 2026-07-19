"use client";
import { useState, useEffect, useCallback } from "react";
import TeamLogo from "@/components/TeamLogo";
import {
  type Match, groupMatchesByDate, formatDateHeader, getTimeUntilMatch,
  formatKickoffTime, LEAGUE_INFO,
} from "@/lib/matches";
import {
  getEthereum, shortenAddress,
  BASE_SEPOLIA, USDC_ADDRESS, USDC_DECIMALS,
  CONTRACT_ADDRESS, EXPLORER_TX,
} from "@/lib/genlayer";

/* ── tiny ERC-20 ABI for USDC transfer ── */
const ERC20_TRANSFER_ABI = "0xa9059cbb"; // transfer(address,uint256)

// ─── types ──────────────────────────────────────────────────────
interface AppUser {
  id: string; username: string; walletAddress: string;
  projectWallet: string; balance: string;
  totalBets: number; totalStaked: string; totalWon: string;
  wins: number; losses: number;
}
interface BetRow {
  id: string; marketId: string; outcome: number; amount: string;
  payout: string | null; isWon: boolean | null; claimed: boolean;
}
interface MarketRow {
  id: string; gameDate: string; team1: string; team2: string;
  team1Code: string; team2Code: string; league: string;
  poolHome: string; poolDraw: string; poolAway: string; totalPool: string;
  totalBets: number; isResolved: boolean; winningOutcome: number;
  finalScore: string | null; kickoffTime: string | null;
}
interface LBEntry {
  username: string; address: string; totalWon: string;
  totalStaked: string; profit: string; wins: number; losses: number;
}

// ═══════════════════════════════════════════════════════════════
export default function GoalBetApp() {
  const [account, setAccount] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);

  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [myBets, setMyBets] = useState<BetRow[]>([]);
  const [marketsCache, setMarketsCache] = useState<Record<string, MarketRow>>({});
  const [leaderboard, setLeaderboard] = useState<LBEntry[]>([]);

  const [activeTab, setActiveTab] = useState<"matches"|"mybets"|"leaderboard">("matches");
  const [betModal, setBetModal] = useState<{match:Match;selection:number}|null>(null);
  const [stakeAmount, setStakeAmount] = useState("5");
  const [loading, setLoading] = useState(false);
  const [depositAmt, setDepositAmt] = useState("10");
  const [depositing, setDepositing] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  const [note, setNote] = useState<{msg:string;type:"ok"|"err"|"info"}|null>(null);
  const notify = useCallback((msg:string, type:"ok"|"err"|"info"="info")=>{
    setNote({msg,type}); setTimeout(()=>setNote(null),5000);
  },[]);

  // ── wallet connect ──
  const connect = async () => {
    const eth = getEthereum(); if(!eth) return notify("Install MetaMask","err");
    try {
      const accs = (await eth.request({method:"eth_requestAccounts"})) as string[];
      if(accs.length) { setAccount(accs[0]); await switchToBase(); }
    } catch { notify("Connection failed","err"); }
  };

  const switchToBase = async () => {
    const eth = getEthereum(); if(!eth) return;
    try {
      await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:BASE_SEPOLIA.chainIdHex}]});
    } catch(e:unknown) {
      if((e as {code:number}).code===4902) {
        await eth.request({method:"wallet_addEthereumChain",params:[{
          chainId:BASE_SEPOLIA.chainIdHex, chainName:BASE_SEPOLIA.chainName,
          rpcUrls:BASE_SEPOLIA.rpcUrls, nativeCurrency:BASE_SEPOLIA.nativeCurrency,
          blockExplorerUrls:BASE_SEPOLIA.blockExplorerUrls,
        }]});
      }
    }
  };

  // auto-detect account
  useEffect(()=>{
    const eth = getEthereum(); if(!eth) return;
    eth.request({method:"eth_accounts"}).then((a)=>{
      const accs = a as string[]; if(accs.length) setAccount(accs[0]);
    }).catch(()=>{});
    const h = (a:unknown)=>{ const accs=a as string[]; setAccount(accs[0]||null); setUser(null); };
    eth.on("accountsChanged",h);
    return ()=>{ eth.removeListener("accountsChanged",h); };
  },[]);

  // Auto-register user on wallet connect (instant, no username)
  useEffect(()=>{
    if(!account) return;
    let cancelled = false;
    (async () => {
      try {
        // 1. Check existing
        const res = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
        const data = await res.json();
        if(!cancelled && data.user) { setUser(data.user); return; }

        // 2. Auto-register
        const reg = await fetch("/api/users/register",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({walletAddress:account}),
        });
        const rd = await reg.json();
        if(!cancelled && rd.user) {
          setUser(rd.user);
          notify("Welcome! Deposit USDC to start betting.","ok");
          setShowDeposit(true);
        }
      } catch {
        // Network error — still show app with empty user
        if(!cancelled) {
          setUser({
            id:"", username:"", walletAddress: account,
            projectWallet:"", balance:"0",
            totalBets:0, totalStaked:"0", totalWon:"0", wins:0, losses:0,
          });
        }
      }
    })();
    return ()=>{ cancelled = true; };
  },[account, notify]);

  // ── deposit USDC ──
  const depositUsdc = async () => {
    if(!user||!account) return;
    const amt = Number(depositAmt);
    if(amt<=0) return notify("Invalid amount","err");
    setDepositing(true);
    try {
      const eth = getEthereum(); if(!eth) throw new Error("No wallet");
      // encode ERC-20 transfer(projectWallet, amount)
      const to = user.projectWallet.slice(2).padStart(64,"0");
      const val = BigInt(Math.floor(amt*10**USDC_DECIMALS)).toString(16).padStart(64,"0");
      const data = ERC20_TRANSFER_ABI + to + val;

      const txHash = await eth.request({method:"eth_sendTransaction",params:[{
        from: account, to: USDC_ADDRESS, data,
      }]}) as string;

      notify("USDC transfer sent! Confirming...","info");

      // record deposit
      const r = await fetch("/api/deposit",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,amount:amt,txHash})});
      const d = await r.json();
      if(d.success) {
        setUser(prev=>prev?{...prev,balance:d.balance}:prev);
        notify(`Deposited ${amt} USDC ✅`,"ok");
        setShowDeposit(false);
      }
    } catch(e) { notify((e as Error).message||"Deposit failed","err"); }
    setDepositing(false);
  };

  // ── fixtures + markets cache ──
  const fetchMatches = useCallback(async ()=>{
    setMatchesLoading(true);
    try {
      const [fixRes, mktRes] = await Promise.all([
        fetch("/api/fixtures"),
        fetch("/api/markets"),
      ]);
      const fixData = await fixRes.json();
      const mktData = await mktRes.json();
      if(fixData.matches) setMatches(fixData.matches);
      if(mktData.markets) {
        const cache: Record<string,MarketRow> = {};
        for(const m of mktData.markets) cache[m.id] = m;
        setMarketsCache(prev => ({...prev, ...cache}));
      }
    } catch {}
    setMatchesLoading(false);
  },[]);
  useEffect(()=>{ fetchMatches(); },[fetchMatches]);

  // ── my bets + load all markets for context ──
  const fetchBets = useCallback(async ()=>{
    if(!user) return;
    try {
      const [betsRes, marketsRes] = await Promise.all([
        fetch(`/api/bets?userId=${user.id}`),
        fetch("/api/markets"),
      ]);
      const betsData = await betsRes.json();
      const marketsData = await marketsRes.json();
      if(betsData.bets) setMyBets(betsData.bets);
      if(marketsData.markets) {
        const cache: Record<string,MarketRow> = {};
        for(const m of marketsData.markets) cache[m.id] = m;
        setMarketsCache(cache);
      }
    } catch {}
  },[user]);
  useEffect(()=>{ if(user) fetchBets(); },[user,fetchBets]);

  // ── leaderboard ──
  const fetchLB = useCallback(async ()=>{
    const r = await fetch("/api/leaderboard"); const d = await r.json();
    if(d.leaderboard) setLeaderboard(d.leaderboard);
  },[]);

  // ── refresh user ──
  const refreshUser = async () => {
    if(!account) return;
    const r = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
    const d = await r.json(); if(d.user) setUser(d.user);
  };

  // ── market helpers ──
  const mkid = (m:Match) => `${m.gameDate}_${m.team1}_${m.team2}`.toLowerCase().replace(/ /g,"-");

  const getMarketForMatch = async (m:Match) => {
    const id = mkid(m);
    if(marketsCache[id]) return marketsCache[id];
    const r = await fetch("/api/markets",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,gameDate:m.gameDate,team1:m.team1,team2:m.team2,
        team1Code:m.team1Code,team2Code:m.team2Code,league:m.league,kickoffTime:m.kickoffTime})});
    const d = await r.json();
    if(d.market) { setMarketsCache(prev=>({...prev,[id]:d.market})); return d.market as MarketRow; }
    return null;
  };

  // ── place bet ──
  const placeBet = async () => {
    if(!user||!betModal) return;
    const amt = Number(stakeAmount);
    if(amt<1) return notify("Min bet is 1 USDC","err");
    if(amt>Number(user.balance)) return notify("Insufficient balance","err");
    setLoading(true);
    try {
      const mkt = await getMarketForMatch(betModal.match);
      if(!mkt) throw new Error("Could not create market");

      const r = await fetch("/api/bets",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,marketId:mkt.id,outcome:betModal.selection,amount:amt})});
      const d = await r.json();
      if(d.success) {
        notify(`Bet ${amt} USDC placed! 🎯`,"ok");
        setBetModal(null); setStakeAmount("5");
        await refreshUser(); await fetchBets();
        setActiveTab("mybets");
      } else notify(d.error||"Bet failed","err");
    } catch(e) { notify((e as Error).message,"err"); }
    setLoading(false);
  };

  // ── resolve (server-side, no MetaMask needed for GenLayer) ──
  const [resolving, setResolving] = useState<string|null>(null);
  const resolveMarket = async (marketId:string) => {
    setResolving(marketId);
    notify("🤖 Calling GenLayer AI Oracle — this may take a minute...","info");
    try {
      const r = await fetch("/api/resolve",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({marketId})});
      const d = await r.json();

      if(d.success) {
        notify(`✅ Resolved! Score: ${d.score}`,"ok");
        // Refresh bets and markets
        await fetchBets();
        // Reload markets cache
        const mr = await fetch("/api/markets"); const md = await mr.json();
        if(md.markets) {
          const cache: Record<string,MarketRow> = {};
          for(const m of md.markets) cache[m.id] = m;
          setMarketsCache(cache);
        }
      } else {
        notify(d.error||"Match not finished yet","err");
      }
    } catch(e) { notify((e as Error).message||"Resolution failed","err"); }
    setResolving(null);
  };

  // ── claim ──
  const [claiming, setClaiming] = useState<string|null>(null);
  const claimBet = async (betId:string) => {
    if(!user) return;
    setClaiming(betId);
    try {
      const r = await fetch("/api/bets/claim",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({betId,userId:user.id})});
      const d = await r.json();
      if(d.success) {
        if(d.isWon) notify(`Won ${d.payout} USDC! 🎉`,"ok");
        else notify("Bet lost ❌","err");
        await refreshUser(); await fetchBets();
      } else notify(d.error,"err");
    } catch(e) { notify((e as Error).message,"err"); }
    setClaiming(null);
  };

  const hasBet = (m:Match) => myBets.some(b=>b.marketId===mkid(m));
  const matchesByDate = groupMatchesByDate(matches);

  // ═══════════════ NOT CONNECTED ═══════════════
  if(!account) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-lg animate-fade-in">
        <div className="text-6xl mb-4">⚽</div>
        <h1 className="text-5xl font-bold gradient-text mb-2">GoalBet</h1>
        <p className="text-silver text-lg mb-8">On-Chain Football Predictions</p>
        <div className="glass-card p-6 mb-6 text-left space-y-2">
          <p>💰 Bet USDC on real football matches (Base Sepolia)</p>
          <p>🤖 AI Oracle resolves results via GenLayer</p>
          <p>📊 Polymarket-style pari-mutuel pools</p>
          <p>🏆 Winners split the entire pool</p>
        </div>
        <button onClick={connect} className="px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white text-lg font-bold hover:opacity-90 animate-pulse-glow">
          🦊 Connect MetaMask
        </button>
        <p className="mt-3 text-xs text-silver">Network: Base Sepolia • Currency: USDC</p>
      </div>
    </div>
  );

  // ═══════════════ LOADING (auto-registering) ═══════════════
  if(!user) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center max-w-md animate-fade-in">
        <div className="text-5xl mb-4 animate-pulse">⚽</div>
        <p className="text-silver mb-4">{shortenAddress(account)}</p>
        <p className="text-xs text-surface-lighter">Connecting to GoalBet...</p>
      </div>
    </div>
  );

  // ═══════════════ MAIN APP ═══════════════
  return (
    <div className="min-h-screen pb-20">
      {/* notification */}
      {note && <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg animate-slide-up max-w-sm ${note.type==="ok"?"bg-accent/20 border border-accent text-accent":note.type==="err"?"bg-danger/20 border border-danger text-danger":"bg-primary/20 border border-primary text-primary"}`}>{note.msg}</div>}

      {/* header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-surface-lighter">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gradient-text">GoalBet</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">Base Sepolia</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-surface-light rounded-lg px-3 py-1.5 cursor-pointer" onClick={()=>setShowDeposit(true)}>
              <span className="text-lg font-bold text-accent">{Number(user.balance).toFixed(2)}</span>
              <span className="text-xs text-silver">USDC</span>
              <span className="text-primary ml-1">+</span>
            </div>
            {user.wins+user.losses>0 && (
              <span className={`text-sm ${user.wins>user.losses?"text-accent":"text-danger"}`}>
                {user.wins}W/{user.losses}L
              </span>
            )}
            <span className="text-xs text-silver bg-surface-light rounded-lg px-3 py-1.5">
              {shortenAddress(user.walletAddress)}
            </span>
          </div>
        </div>
      </header>

      {/* tabs */}
      <div className="max-w-5xl mx-auto px-4 mt-4 flex gap-2">
        {(["matches","mybets","leaderboard"] as const).map(t=>(
          <button key={t} onClick={()=>{setActiveTab(t);if(t==="leaderboard")fetchLB();if(t==="mybets")fetchBets();}}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeTab===t?"tab-active":"tab-inactive"}`}>
            {t==="matches"?"⚽ Matches":t==="mybets"?"🎯 My Bets":"🏆 Leaderboard"}
          </button>
        ))}
      </div>

       <main className="max-w-5xl mx-auto px-4 mt-6">
        {/* Zero balance banner */}
        {Number(user.balance) === 0 && (
          <div className="glass-card p-4 mb-6 flex items-center justify-between border-warning/30">
            <div>
              <p className="font-medium text-warning">💰 Your balance is 0 USDC</p>
              <p className="text-xs text-silver mt-1">Deposit USDC (Base Sepolia) to start betting on matches</p>
            </div>
            <button onClick={()=>setShowDeposit(true)} className="px-4 py-2 rounded-lg bg-warning text-black text-sm font-bold hover:opacity-90 whitespace-nowrap">
              Deposit USDC
            </button>
          </div>
        )}

        {/* ── MATCHES ── */}
        {activeTab==="matches" && (
          <div className="space-y-6">
            {/* header bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-silver">{matches.length} matches</span>
                {matches.some(m=>m.status==="IN_PLAY"||m.status==="PAUSED") && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-danger/20 text-danger animate-pulse">
                    🔴 {matches.filter(m=>m.status==="IN_PLAY"||m.status==="PAUSED").length} LIVE
                  </span>
                )}
              </div>
              <button onClick={fetchMatches} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <span>↻</span> Refresh
              </button>
            </div>

            {matchesLoading&&!matches.length ? (
              <div className="glass-card p-8 text-center">
                <div className="text-4xl mb-2 animate-pulse">⚽</div>
                <p className="text-silver">Loading live fixtures from football-data.org...</p>
              </div>
            ) : !matches.length ? (
              <div className="glass-card p-8 text-center"><p>No upcoming matches</p></div>
            ) : Object.entries(matchesByDate).map(([date,dm])=>(
              <div key={date}>
                {/* date header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg font-semibold">{formatDateHeader(date)}</span>
                  <span className="text-xs text-silver">• {(dm as Match[]).length} matches</span>
                </div>
                <div className="grid gap-3">
                  {(dm as Match[]).map((m:Match)=>{
                    const bp=hasBet(m);
                    const tu=getTimeUntilMatch(m.kickoffTime);
                    const isLive = m.status==="IN_PLAY"||m.status==="PAUSED";
                    const isFinished = m.status==="FINISHED"||tu==="FT";
                    const canBet = !bp && !isLive && !isFinished;
                    const li = LEAGUE_INFO[m.league];

                    return (
                      <div key={m.id} className={`glass-card p-4 ${isLive?"border-danger/40":""}`}>
                        {/* top row: league + time info */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {li && <span className="text-sm">{li.emoji}</span>}
                            <span className="text-xs text-silver font-medium">{m.league}</span>
                            {m.matchday && <span className="text-xs text-surface-lighter">MD {m.matchday}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {isLive ? (
                              <div className="flex items-center gap-1.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-danger"></span>
                                </span>
                                <span className="text-xs font-bold text-danger">
                                  {m.status==="PAUSED"?"HT":m.elapsed?`${m.elapsed}'`:"LIVE"}
                                </span>
                              </div>
                            ) : isFinished ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-lighter text-silver">FT</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono text-white">{formatKickoffTime(m.kickoffTime)}</span>
                                {tu && <span className="text-xs text-silver">({tu})</span>}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* teams + score */}
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1">
                            <TeamLogo teamCode={m.team1Code} teamName={m.team1} size="md"/>
                            <span className="font-medium text-sm sm:text-base">{m.team1}</span>
                          </div>
                          <div className="flex flex-col items-center px-4 min-w-[60px]">
                            {m.score ? (
                              <span className={`text-xl font-bold ${isLive?"text-danger":"text-white"}`}>{m.score}</span>
                            ) : (
                              <span className="text-lg text-surface-lighter font-bold">vs</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <span className="font-medium text-sm sm:text-base">{m.team2}</span>
                            <TeamLogo teamCode={m.team2Code} teamName={m.team2} size="md"/>
                          </div>
                        </div>

                        {/* venue */}
                        {m.venue && (
                          <p className="text-center text-xs text-surface-lighter mb-3">🏟 {m.venue}</p>
                        )}

                        {/* odds / bet buttons */}
                        {!isFinished && (
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            {[{label:"Home",oc:1,odds:m.oddsTeam1,c:"text-accent"},
                              {label:"Draw",oc:0,odds:m.oddsDraw,c:"text-warning"},
                              {label:"Away",oc:2,odds:m.oddsTeam2,c:"text-primary"}].map(o=>(
                              <button key={o.oc} onClick={()=>setBetModal({match:m,selection:o.oc})} disabled={!canBet}
                                className="flex flex-col items-center p-3 rounded-xl bg-surface-light hover:bg-surface-lighter transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <span className="text-xs text-silver">{o.label}</span>
                                <span className={`text-lg font-bold ${o.c}`}>{o.odds.toFixed(2)}x</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* status badges + actions */}
                        {bp && !isFinished && <p className="mt-3 text-center text-sm text-accent">✅ Bet placed</p>}
                        {isFinished && m.score && (
                          <div className="mt-3 space-y-2">
                            <p className="text-center text-sm text-silver">Final Score: <span className="font-bold text-white text-lg">{m.score}</span></p>
                            {bp && (() => {
                              const mid = mkid(m);
                              const mkt = marketsCache[mid];
                              const userBetsOnMatch = myBets.filter(b => b.marketId === mid);
                              const allClaimed = userBetsOnMatch.length > 0 && userBetsOnMatch.every(b => b.claimed);
                              const hasUnclaimed = userBetsOnMatch.some(b => !b.claimed);

                              if (mkt?.isResolved && hasUnclaimed) {
                                return (
                                  <div className="flex justify-center gap-2">
                                    {userBetsOnMatch.filter(b => !b.claimed).map(bet => (
                                      <button key={bet.id} onClick={() => claimBet(bet.id)} disabled={claiming === bet.id}
                                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50">
                                        {claiming === bet.id ? "Claiming..." : "💰 Claim Winnings"}
                                      </button>
                                    ))}
                                  </div>
                                );
                              }
                              if (mkt?.isResolved && allClaimed) {
                                const wonBets = userBetsOnMatch.filter(b => b.isWon);
                                return <p className="text-center text-sm text-accent">
                                  {wonBets.length > 0 ? `🎉 Won ${wonBets.reduce((s,b) => s + Number(b.payout||0), 0).toFixed(2)} USDC` : "❌ Better luck next time"}
                                </p>;
                              }
                              if (!mkt?.isResolved) {
                                return (
                                  <div className="flex justify-center">
                                    <button onClick={() => resolveMarket(mid)} disabled={resolving === mid}
                                      className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-medium disabled:opacity-50 animate-pulse-glow">
                                      {resolving === mid ? "🤖 AI Oracle resolving..." : "🤖 Resolve with AI Oracle"}
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            {!bp && (() => {
                              const mid = mkid(m);
                              const mkt = marketsCache[mid];
                              if (!mkt?.isResolved && mkt) {
                                return (
                                  <div className="flex justify-center">
                                    <button onClick={() => resolveMarket(mid)} disabled={resolving === mid}
                                      className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-medium disabled:opacity-50">
                                      {resolving === mid ? "🤖 Resolving..." : "🤖 Resolve with AI"}
                                    </button>
                                  </div>
                                );
                              }
                              if (mkt?.isResolved) {
                                return <p className="text-center text-xs text-silver">
                                  Winner: {mkt.winningOutcome === 1 ? m.team1 : mkt.winningOutcome === 2 ? m.team2 : "Draw"}
                                </p>;
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── MY BETS ── */}
        {activeTab==="mybets" && (
          <div className="space-y-4">
            {!myBets.length?<div className="glass-card p-8 text-center"><p className="text-lg">No bets yet</p><p className="text-silver">Go to Matches to start!</p></div>
            : myBets.map(bet=>{
              const mkt = marketsCache[bet.marketId];
              return (
                <div key={bet.id} className="glass-card p-4">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">{mkt?`${mkt.team1} vs ${mkt.team2}`:bet.marketId}</span>
                    <span className="text-xs text-silver">{mkt?.gameDate}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div><span className="text-xs text-silver">Prediction</span>
                      <p className="font-medium">{bet.outcome===1?mkt?.team1||"Home":bet.outcome===2?mkt?.team2||"Away":"Draw"}</p></div>
                    <div><span className="text-xs text-silver">Stake</span>
                      <p className="font-medium">{Number(bet.amount).toFixed(2)} USDC</p></div>
                    <div><span className="text-xs text-silver">Status</span>
                      <p className={`font-medium ${bet.isWon===true?"text-accent":bet.isWon===false?"text-danger":"text-warning"}`}>
                        {bet.claimed?(bet.isWon?`🎉 +${Number(bet.payout).toFixed(2)}`:"❌ Lost"):"⏳ Pending"}</p></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    {!bet.claimed && !mkt?.isResolved && (
                      <button onClick={()=>resolveMarket(bet.marketId)} disabled={resolving===bet.marketId}
                        className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">
                        {resolving===bet.marketId?"Resolving...":"🤖 Resolve (AI)"}</button>
                    )}
                    {!bet.claimed && mkt?.isResolved && (
                      <button onClick={()=>claimBet(bet.id)} disabled={claiming===bet.id}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">
                        {claiming===bet.id?"Claiming...":"💰 Claim"}</button>
                    )}
                    {bet.claimed && bet.isWon && <span className="text-accent text-sm">✅ Claimed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {activeTab==="leaderboard" && (
          <div className="space-y-4">
            <div className="text-center mb-4"><h2 className="text-2xl font-bold">🏆 Top Winners</h2></div>
            {!leaderboard.length?<div className="glass-card p-8 text-center"><p>No data yet</p></div>
            : <div className="space-y-2">
              {leaderboard.map((e,i)=>(
                <div key={e.address} className="glass-card p-4 grid grid-cols-5 gap-4 items-center">
                  <span className="text-lg">{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                  <span className="font-medium font-mono">{shortenAddress(e.address)}</span>
                  <span className="text-accent font-bold">{Number(e.totalWon).toFixed(1)} USDC</span>
                  <span className={Number(e.profit)>=0?"text-accent":"text-danger"}>{Number(e.profit)>=0?"+":""}{Number(e.profit).toFixed(1)}</span>
                  <span className="text-silver">{e.wins}W/{e.losses}L</span>
                </div>
              ))}
            </div>}
          </div>
        )}
      </main>

      {/* ── BET MODAL ── */}
      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-md w-full animate-slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-bold">Place Bet</h3>
              <button onClick={()=>setBetModal(null)} className="text-silver hover:text-white">✕</button>
            </div>
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center"><TeamLogo teamCode={betModal.match.team1Code} teamName={betModal.match.team1} size="lg"/><div className="mt-1 text-sm">{betModal.match.team1}</div></div>
              <div className="text-2xl text-silver">VS</div>
              <div className="text-center"><TeamLogo teamCode={betModal.match.team2Code} teamName={betModal.match.team2} size="lg"/><div className="mt-1 text-sm">{betModal.match.team2}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div><span className="text-xs text-silver">Prediction</span><p className="font-bold text-lg">{betModal.selection===1?`${betModal.match.team1} Win`:betModal.selection===2?`${betModal.match.team2} Win`:"Draw"}</p></div>
              <div><span className="text-xs text-silver">Odds</span><p className="font-bold text-lg text-accent">{(betModal.selection===1?betModal.match.oddsTeam1:betModal.selection===2?betModal.match.oddsTeam2:betModal.match.oddsDraw).toFixed(2)}x</p></div>
            </div>
            <div className="mb-4">
              <div className="flex justify-between mb-1"><span className="text-sm">Stake</span><span className="text-xs text-silver">Balance: {Number(user.balance).toFixed(2)} USDC</span></div>
              <div className="relative">
                <input type="number" value={stakeAmount} onChange={e=>setStakeAmount(e.target.value)} min="1"
                  className="w-full px-4 py-3 rounded-xl bg-surface-light border border-surface-lighter text-white text-lg font-bold focus:outline-none focus:border-primary pr-16" placeholder="5"/>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-silver">USDC</span>
              </div>
              <div className="flex gap-2 mt-2">{[5,10,25,50].map(a=><button key={a} onClick={()=>setStakeAmount(String(a))} className="px-3 py-1 rounded-lg bg-surface-light text-sm hover:bg-surface-lighter">{a}</button>)}</div>
            </div>
            <div className="flex justify-between mb-4 p-3 rounded-xl bg-surface-light">
              <span className="text-silver">Potential Payout</span>
              <span className="text-xl font-bold text-accent">{(Number(stakeAmount||0)*(betModal.selection===1?betModal.match.oddsTeam1:betModal.selection===2?betModal.match.oddsTeam2:betModal.match.oddsDraw)).toFixed(2)} USDC</span>
            </div>
            {Number(user.balance)<Number(stakeAmount)&&<p className="mb-3 p-3 rounded-xl bg-danger/20 text-danger text-sm">Insufficient balance. <button onClick={()=>{setBetModal(null);setShowDeposit(true);}} className="underline">Deposit USDC</button></p>}
            <div className="text-xs text-silver mb-4 space-y-1">
              <p>✓ USDC deducted from your GoalBet balance</p>
              <p>✓ AI Oracle resolves results from BBC Sport</p>
              <p>✓ Winners split entire pool (Polymarket style)</p>
            </div>
            <button onClick={placeBet} disabled={loading||Number(user.balance)<Number(stakeAmount)||Number(stakeAmount)<1}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold disabled:opacity-50">
              {loading?"Placing...":"Place Bet"}</button>
          </div>
        </div>
      )}

      {/* ── DEPOSIT MODAL ── */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-md w-full animate-slide-up">
            <div className="flex justify-between mb-4">
              <h3 className="text-xl font-bold">Deposit USDC</h3>
              <button onClick={()=>setShowDeposit(false)} className="text-silver hover:text-white">✕</button>
            </div>
            <p className="text-silver mb-4">Send USDC (Base Sepolia) to your GoalBet wallet:</p>
            <div className="p-3 rounded-xl bg-surface-light mb-4">
              <p className="text-xs text-silver">Your GoalBet Wallet</p>
              <p className="font-mono text-sm break-all">{user.projectWallet}</p>
            </div>
            <div className="mb-4">
              <span className="text-sm">Amount</span>
              <div className="relative mt-1">
                <input type="number" value={depositAmt} onChange={e=>setDepositAmt(e.target.value)} min="1"
                  className="w-full px-4 py-3 rounded-xl bg-surface-light border border-surface-lighter text-white text-lg font-bold focus:outline-none focus:border-primary pr-16"/>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-silver">USDC</span>
              </div>
            </div>
            <button onClick={depositUsdc} disabled={depositing||Number(depositAmt)<=0}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-accent to-accent-dark text-white font-bold disabled:opacity-50">
              {depositing?"Sending...":"Send USDC from MetaMask"}</button>
            <p className="mt-3 text-xs text-silver text-center">USDC contract: {shortenAddress(USDC_ADDRESS)}</p>
          </div>
        </div>
      )}

      {/* footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-bg/80 backdrop-blur-xl border-t border-surface-lighter py-3 text-center text-xs text-silver">
        <span>Built on </span>
        <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GenLayer</a>
        <span> • Oracle: </span>
        <a href={`${EXPLORER_TX}${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{shortenAddress(CONTRACT_ADDRESS)}</a>
        <span> • USDC on Base Sepolia</span>
      </footer>
    </div>
  );
}
