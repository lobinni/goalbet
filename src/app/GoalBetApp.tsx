"use client";
import { useState, useEffect, useCallback } from "react";
import TeamLogo from "@/components/TeamLogo";
import {
  type Match, groupMatchesByDate, formatDateHeader,
  formatKickoffTime, LEAGUE_INFO,
} from "@/lib/matches";
import {
  getEthereum, shortenAddress,
  BASE_SEPOLIA, CONTRACT_ADDRESS, EXPLORER_TX,
} from "@/lib/genlayer";
import { USDC_ADDRESS, USDC_DECIMALS, POOL_WALLET, encodeTransfer, encodeBalanceOf } from "@/lib/usdc";

/** Client-side countdown — avoids SSR mismatch */
function useCountdown(kickoffTime?: string): string {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!kickoffTime) return;
    const update = () => {
      const diff = new Date(kickoffTime).getTime() - Date.now();
      if (diff < -7200_000) { setText("FT"); return; }
      if (diff < 0) { setText("LIVE"); return; }
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(mins / 60);
      if (hrs >= 24) setText(`${Math.floor(hrs/24)}d ${hrs%24}h`);
      else if (hrs > 0) setText(`${hrs}h ${mins%60}m`);
      else setText(`${mins}m`);
    };
    update();
    const iv = setInterval(update, 30000);
    return () => clearInterval(iv);
  }, [kickoffTime]);
  return text;
}

/** Tiny component so each card gets its own countdown */
function Countdown({ kickoffTime }: { kickoffTime?: string }) {
  const text = useCountdown(kickoffTime);
  if (!text) return null;
  if (text === "LIVE") return <span className="text-xs font-bold text-danger animate-pulse">🔴 LIVE</span>;
  if (text === "FT") return <span className="text-xs px-2 py-0.5 rounded-full bg-surface-lighter text-silver">FT</span>;
  return <span className="text-xs text-silver">{text}</span>;
}

interface Props {
  initialMatches: Match[];
}

// ─── types ──────────────────────────────────────────────────
interface AppUser {
  id: string; walletAddress: string;
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
  address: string; totalWon: string; totalStaked: string;
  profit: string; wins: number; losses: number;
}

export default function GoalBetApp({ initialMatches }: Props) {
  const [account, setAccount] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [usdcBalance, setUsdcBalance] = useState("0.00");

  const [matches, setMatches] = useState<Match[]>(initialMatches);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [myBets, setMyBets] = useState<BetRow[]>([]);
  const [marketsCache, setMarketsCache] = useState<Record<string, MarketRow>>({});
  const [leaderboard, setLeaderboard] = useState<LBEntry[]>([]);

  const [activeTab, setActiveTab] = useState<"matches"|"mybets"|"leaderboard">("matches");
  const [betModal, setBetModal] = useState<{match:Match;selection:number}|null>(null);
  const [stakeAmount, setStakeAmount] = useState("5");
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string|null>(null);
  const [claiming, setClaiming] = useState<string|null>(null);

  const [note, setNote] = useState<{msg:string;type:"ok"|"err"|"info"}|null>(null);
  const notify = useCallback((msg:string, type:"ok"|"err"|"info"="info")=>{
    setNote({msg,type}); setTimeout(()=>setNote(null),5000);
  },[]);

  // ── wallet ──
  const connect = async () => {
    const eth = getEthereum(); if(!eth) return notify("Install MetaMask","err");
    try {
      const accs = (await eth.request({method:"eth_requestAccounts"})) as string[];
      if(accs.length) { setAccount(accs[0]); await switchToBase(); }
    } catch { notify("Connection failed","err"); }
  };
  const switchToBase = async () => {
    const eth = getEthereum(); if(!eth) return;
    try { await eth.request({method:"wallet_switchEthereumChain",params:[{chainId:BASE_SEPOLIA.chainIdHex}]}); }
    catch(e:unknown) {
      if((e as {code:number}).code===4902)
        await eth.request({method:"wallet_addEthereumChain",params:[{
          chainId:BASE_SEPOLIA.chainIdHex, chainName:BASE_SEPOLIA.chainName,
          rpcUrls:BASE_SEPOLIA.rpcUrls, nativeCurrency:BASE_SEPOLIA.nativeCurrency,
          blockExplorerUrls:BASE_SEPOLIA.blockExplorerUrls,
        }]});
    }
  };
  useEffect(()=>{
    const eth = getEthereum(); if(!eth) return;
    eth.request({method:"eth_accounts"}).then(a=>{ const ac=a as string[]; if(ac.length) setAccount(ac[0]); }).catch(()=>{});
    const h = (a:unknown)=>{ const ac=a as string[]; setAccount(ac[0]||null); setUser(null); };
    eth.on("accountsChanged",h);
    return ()=>{ eth.removeListener("accountsChanged",h); };
  },[]);

  // ── auto register ──
  useEffect(()=>{
    if(!account) return;
    let c = false;
    (async()=>{
      try {
        const r1 = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
        const d1 = await r1.json();
        if(!c && d1.user) { setUser(d1.user); return; }
        const r2 = await fetch("/api/users/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({walletAddress:account})});
        const d2 = await r2.json();
        if(!c && d2.user) { setUser(d2.user); notify("Welcome to GoalBet!","ok"); }
      } catch {
        if(!c) setUser({id:"",walletAddress:account,totalBets:0,totalStaked:"0",totalWon:"0",wins:0,losses:0});
      }
    })();
    return ()=>{ c=true; };
  },[account,notify]);

  // ── USDC balance ──
  const fetchUsdcBalance = useCallback(async()=>{
    const eth = getEthereum(); if(!eth||!account) return;
    try {
      const data = encodeBalanceOf(account);
      const result = await eth.request({method:"eth_call",params:[{to:USDC_ADDRESS,data},"latest"]}) as string;
      const bal = parseInt(result,16) / 10**USDC_DECIMALS;
      setUsdcBalance(bal.toFixed(2));
    } catch { setUsdcBalance("0.00"); }
  },[account]);
  useEffect(()=>{ fetchUsdcBalance(); },[fetchUsdcBalance]);
  useEffect(()=>{
    if(!account) return;
    const iv = setInterval(fetchUsdcBalance, 15000);
    return ()=>clearInterval(iv);
  },[account,fetchUsdcBalance]);

  // ── fixtures + markets ──
  const fetchMatches = useCallback(async()=>{
    setMatchesLoading(true);
    try {
      const [fr,mr] = await Promise.all([fetch("/api/fixtures"),fetch("/api/markets")]);
      const fd = await fr.json(); const md = await mr.json();
      if(fd.matches) setMatches(fd.matches);
      if(md.markets) { const c:Record<string,MarketRow>={}; for(const m of md.markets) c[m.id]=m; setMarketsCache(p=>({...p,...c})); }
    } catch {}
    setMatchesLoading(false);
  },[]);
  useEffect(()=>{ fetchMatches(); },[fetchMatches]);

  // ── bets ──
  const fetchBets = useCallback(async()=>{
    if(!user) return;
    try {
      const [br,mr] = await Promise.all([fetch(`/api/bets?userId=${user.id}`),fetch("/api/markets")]);
      const bd = await br.json(); const md = await mr.json();
      if(bd.bets) setMyBets(bd.bets);
      if(md.markets) { const c:Record<string,MarketRow>={}; for(const m of md.markets) c[m.id]=m; setMarketsCache(p=>({...p,...c})); }
    } catch {}
  },[user]);
  useEffect(()=>{ if(user) fetchBets(); },[user,fetchBets]);

  const fetchLB = useCallback(async()=>{
    try { const r = await fetch("/api/leaderboard"); const d = await r.json(); if(d.leaderboard) setLeaderboard(d.leaderboard); } catch {}
  },[]);

  const refreshUser = async()=>{
    if(!account) return;
    const r = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
    const d = await r.json(); if(d.user) setUser(d.user);
  };

  const mkid = (m:Match) => `${m.gameDate}_${m.team1}_${m.team2}`.toLowerCase().replace(/ /g,"-");

  const getMarketForMatch = async(m:Match) => {
    const id = mkid(m);
    if(marketsCache[id]) return marketsCache[id];
    const r = await fetch("/api/markets",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,gameDate:m.gameDate,team1:m.team1,team2:m.team2,team1Code:m.team1Code,team2Code:m.team2Code,league:m.league,kickoffTime:m.kickoffTime})});
    const d = await r.json();
    if(d.market) { setMarketsCache(p=>({...p,[id]:d.market})); return d.market as MarketRow; }
    return null;
  };

  // ── place bet: USDC transfer → pool wallet → record bet ──
  const placeBet = async () => {
    if(!user||!betModal||!account) return;
    const amt = Number(stakeAmount);
    if(amt<1) return notify("Min bet is 1 USDC","err");
    if(amt>Number(usdcBalance)) return notify(`Insufficient USDC (have ${usdcBalance})`,"err");
    setLoading(true);
    try {
      const mkt = await getMarketForMatch(betModal.match);
      if(!mkt) throw new Error("Could not create market");

      // Step 1: Send USDC from user wallet → pool wallet
      notify("Confirm USDC transfer in MetaMask...","info");
      const eth = getEthereum(); if(!eth) throw new Error("No wallet");
      const txData = encodeTransfer(POOL_WALLET, amt);
      const txHash = await eth.request({method:"eth_sendTransaction",params:[{
        from: account, to: USDC_ADDRESS, data: txData,
      }]}) as string;

      notify("USDC sent! Recording bet...","info");

      // Step 2: Record bet on server
      const r = await fetch("/api/bets",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,marketId:mkt.id,outcome:betModal.selection,amount:amt,txHash})});
      const d = await r.json();
      if(d.success) {
        notify(`Bet ${amt} USDC placed! 🎯`,"ok");
        setBetModal(null); setStakeAmount("5");
        await Promise.all([refreshUser(),fetchBets(),fetchUsdcBalance()]);
        setActiveTab("mybets");
      } else notify(d.error||"Bet failed","err");
    } catch(e) { notify((e as Error).message||"Transaction failed","err"); }
    setLoading(false);
  };

  // ── resolve ──
  const resolveMarket = async(marketId:string) => {
    setResolving(marketId);
    notify("🤖 Calling GenLayer AI Oracle...","info");
    try {
      const r = await fetch("/api/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({marketId})});
      const d = await r.json();
      if(d.success) { notify(`✅ Resolved! Score: ${d.score||"See explorer"}`,"ok"); await Promise.all([fetchBets(),fetchMatches()]); }
      else notify(d.error||"Not finished yet","err");
    } catch(e) { notify((e as Error).message,"err"); }
    setResolving(null);
  };

  // ── claim ──
  const claimBet = async(betId:string) => {
    if(!user) return;
    setClaiming(betId);
    try {
      const r = await fetch("/api/bets/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({betId,userId:user.id})});
      const d = await r.json();
      if(d.success) {
        if(d.isWon) notify(`Won ${d.payout} USDC! 🎉 Payout will be sent to your wallet.`,"ok");
        else notify("Bet lost ❌","err");
        await Promise.all([refreshUser(),fetchBets()]);
      } else notify(d.error,"err");
    } catch(e) { notify((e as Error).message,"err"); }
    setClaiming(null);
  };

  const hasBet = (m:Match) => myBets.some(b=>b.marketId===mkid(m));
  const matchesByDate = groupMatchesByDate(matches);

  // ═══ NOT CONNECTED — show matches + connect prompt ═══
  if(!account) return (
    <div className="min-h-screen pb-20">
      {/* Hero */}
      <div className="text-center py-8 px-4">
        <div className="text-5xl mb-3">⚽</div>
        <h1 className="text-4xl font-bold gradient-text mb-1">GoalBet</h1>
        <p className="text-silver text-sm mb-4">AI-Powered Football Predictions • USDC on Base Sepolia • GenLayer Oracle</p>
        <button onClick={connect} className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold hover:opacity-90 animate-pulse-glow">
          🦊 Connect MetaMask to Bet
        </button>
      </div>

      {/* Show matches even without wallet */}
      <div className="max-w-5xl mx-auto px-4">
        <h2 className="text-lg font-semibold mb-4">🏆 Live Matches</h2>
        {matchesLoading ? (
          <div className="glass-card p-8 text-center"><div className="text-4xl mb-2 animate-pulse">⚽</div><p className="text-silver">Loading fixtures...</p></div>
        ) : !matches.length ? (
          <div className="glass-card p-8 text-center"><p className="text-silver">No matches available</p></div>
        ) : (
          <div className="space-y-3">
            {matches.map(m => {
              
              const isLive = m.status==="IN_PLAY"||m.status==="PAUSED";
              const isFinished = m.status==="FINISHED";
              const li = LEAGUE_INFO[m.league];
              return (
                <div key={m.id} className={`glass-card p-4 ${isLive?"border-danger/40":""}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {li&&<span className="text-sm">{li.emoji}</span>}
                      <span className="text-xs text-silver font-medium">{m.league}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isFinished
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-surface-lighter text-silver">FT</span>
                        : <><span className="text-xs font-mono text-white">{formatKickoffTime(m.kickoffTime)}</span><Countdown kickoffTime={m.kickoffTime} /></>
                      }
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1"><TeamLogo teamCode={m.team1Code} teamName={m.team1} size="md"/><span className="font-medium">{m.team1}</span></div>
                    <div className="px-4 min-w-[60px] text-center">{m.score?<span className={`text-xl font-bold ${isLive?"text-danger":"text-white"}`}>{m.score}</span>:<span className="text-surface-lighter font-bold">vs</span>}</div>
                    <div className="flex items-center gap-2 flex-1 justify-end"><span className="font-medium">{m.team2}</span><TeamLogo teamCode={m.team2Code} teamName={m.team2} size="md"/></div>
                  </div>
                  {m.venue&&<p className="text-center text-xs text-surface-lighter mt-2">🏟 {m.venue}</p>}
                  {!isFinished&&(
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[{l:"Home",od:m.oddsTeam1,c:"text-accent"},{l:"Draw",od:m.oddsDraw,c:"text-warning"},{l:"Away",od:m.oddsTeam2,c:"text-primary"}].map(o=>(
                        <button key={o.l} onClick={connect} className="flex flex-col items-center p-2 rounded-xl bg-surface-light hover:bg-surface-lighter transition-colors">
                          <span className="text-xs text-silver">{o.l}</span><span className={`text-lg font-bold ${o.c}`}>{o.od.toFixed(2)}x</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {isFinished&&m.score&&<p className="text-center text-sm text-silver mt-2">Final Score: <span className="font-bold text-white">{m.score}</span></p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if(!user) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center animate-fade-in">
        <div className="text-5xl mb-4 animate-pulse">⚽</div>
        <p className="text-silver">{shortenAddress(account)}</p>
      </div>
    </div>
  );

  // ═══ MAIN ═══
  return (
    <div className="min-h-screen pb-20">
      {note && <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg animate-slide-up max-w-sm ${note.type==="ok"?"bg-accent/20 border border-accent text-accent":note.type==="err"?"bg-danger/20 border border-danger text-danger":"bg-primary/20 border border-primary text-primary"}`}>{note.msg}</div>}

      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-surface-lighter">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gradient-text">GoalBet</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">Base Sepolia</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-surface-light rounded-lg px-3 py-1.5">
              <span className="text-lg font-bold text-accent">{usdcBalance}</span>
              <span className="text-xs text-silver">USDC</span>
            </div>
            {user.wins+user.losses>0 && <span className={`text-sm ${user.wins>user.losses?"text-accent":"text-danger"}`}>{user.wins}W/{user.losses}L</span>}
            <span className="text-xs text-silver bg-surface-light rounded-lg px-3 py-1.5">{shortenAddress(user.walletAddress)}</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 mt-4 flex gap-2">
        {(["matches","mybets","leaderboard"] as const).map(t=>(
          <button key={t} onClick={()=>{setActiveTab(t);if(t==="leaderboard")fetchLB();if(t==="mybets")fetchBets();}}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeTab===t?"tab-active":"tab-inactive"}`}>
            {t==="matches"?"⚽ Matches":t==="mybets"?"🎯 My Bets":"🏆 Leaderboard"}
          </button>
        ))}
      </div>

      <main className="max-w-5xl mx-auto px-4 mt-6">
        {/* MATCHES */}
        {activeTab==="matches" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-silver">{matches.length} matches</span>
              <button onClick={fetchMatches} className="text-sm text-primary hover:underline">↻ Refresh</button>
            </div>
            {matchesLoading&&!matches.length ? <div className="glass-card p-8 text-center"><div className="text-4xl mb-2 animate-pulse">⚽</div><p className="text-silver">Loading...</p></div>
            : !matches.length ? <div className="glass-card p-8 text-center"><p>No matches</p></div>
            : Object.entries(matchesByDate).map(([date,dm])=>(
              <div key={date}>
                <div className="flex items-center gap-2 mb-3"><span className="text-lg font-semibold">{formatDateHeader(date)}</span></div>
                <div className="grid gap-3">
                  {(dm as Match[]).map((m:Match)=>{
                    const bp=hasBet(m); 
                    const isLive=m.status==="IN_PLAY"||m.status==="PAUSED";
                    const isFinished=m.status==="FINISHED";
                    const canBet=!bp&&!isLive&&!isFinished;
                    const li=LEAGUE_INFO[m.league];
                    const mid=mkid(m); const mkt=marketsCache[mid];

                    return (
                      <div key={m.id} className={`glass-card p-4 ${isLive?"border-danger/40":""}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {li&&<span className="text-sm">{li.emoji}</span>}
                            <span className="text-xs text-silver font-medium">{m.league}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isLive?<div className="flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-danger opacity-75"/><span className="relative inline-flex rounded-full h-2 w-2 bg-danger"/></span><span className="text-xs font-bold text-danger">{m.status==="PAUSED"?"HT":m.elapsed?`${m.elapsed}'`:"LIVE"}</span></div>
                            :isFinished?<span className="text-xs px-2 py-0.5 rounded-full bg-surface-lighter text-silver">FT</span>
                            :<div className="flex items-center gap-1.5"><span className="text-xs font-mono text-white">{formatKickoffTime(m.kickoffTime)}</span><Countdown kickoffTime={m.kickoffTime} /></div>}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1"><TeamLogo teamCode={m.team1Code} teamName={m.team1} size="md"/><span className="font-medium text-sm sm:text-base">{m.team1}</span></div>
                          <div className="px-4 min-w-[60px] text-center">{m.score?<span className={`text-xl font-bold ${isLive?"text-danger":"text-white"}`}>{m.score}</span>:<span className="text-lg text-surface-lighter font-bold">vs</span>}</div>
                          <div className="flex items-center gap-2 flex-1 justify-end"><span className="font-medium text-sm sm:text-base">{m.team2}</span><TeamLogo teamCode={m.team2Code} teamName={m.team2} size="md"/></div>
                        </div>
                        {m.venue&&<p className="text-center text-xs text-surface-lighter mb-3">🏟 {m.venue}</p>}

                        {/* Bet buttons (before match) */}
                        {!isFinished&&(
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            {[{l:"Home",oc:1,od:m.oddsTeam1,c:"text-accent"},{l:"Draw",oc:0,od:m.oddsDraw,c:"text-warning"},{l:"Away",oc:2,od:m.oddsTeam2,c:"text-primary"}].map(o=>(
                              <button key={o.oc} onClick={()=>setBetModal({match:m,selection:o.oc})} disabled={!canBet}
                                className="flex flex-col items-center p-3 rounded-xl bg-surface-light hover:bg-surface-lighter transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <span className="text-xs text-silver">{o.l}</span><span className={`text-lg font-bold ${o.c}`}>{o.od.toFixed(2)}x</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {bp&&!isFinished&&<p className="mt-3 text-center text-sm text-accent">✅ Bet placed</p>}

                        {/* After match finished */}
                        {isFinished && (
                          <div className="mt-3 space-y-3">
                            {/* Score display */}
                            {m.score && (
                              <p className="text-center text-sm text-silver">
                                Final Score: <span className="font-bold text-white text-lg">{m.score}</span>
                              </p>
                            )}

                            {(()=>{
                              const ubets = myBets.filter(b => b.marketId === mid);
                              const isResolved = mkt?.isResolved;

                              /* ─── Case 1: Not resolved yet → show Resolve button for everyone ─── */
                              if (!isResolved) {
                                return (
                                  <div className="text-center space-y-2">
                                    <p className="text-xs text-silver">
                                      {ubets.length
                                        ? `You have ${ubets.length} bet(s) on this match. Resolve to check results!`
                                        : "Match ended. Resolve to see the AI-verified result."}
                                    </p>
                                    <button
                                      onClick={async () => {
                                        // Ensure market exists in DB first
                                        await getMarketForMatch(m);
                                        resolveMarket(mid);
                                      }}
                                      disabled={resolving === mid}
                                      className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-medium disabled:opacity-50 animate-pulse-glow"
                                    >
                                      {resolving === mid
                                        ? "🤖 AI Oracle resolving — please wait..."
                                        : "🤖 Resolve with GenLayer AI Oracle"}
                                    </button>
                                    {resolving === mid && (
                                      <p className="text-xs text-primary animate-pulse">
                                        Fetching result from BBC Sport → LLM analysis → Validator consensus...
                                      </p>
                                    )}
                                  </div>
                                );
                              }

                              /* ─── Case 2: Resolved, show winner ─── */
                              const winnerName = mkt.winningOutcome === 1 ? m.team1
                                : mkt.winningOutcome === 2 ? m.team2 : "Draw";

                              /* ─── Case 2a: User has no bets → show result info ─── */
                              if (!ubets.length) {
                                return (
                                  <div className="text-center p-3 rounded-xl bg-surface-light">
                                    <p className="text-sm">
                                      {mkt.finalScore && <span className="text-white font-bold">{mkt.finalScore} • </span>}
                                      Winner: <span className="text-accent font-bold">{winnerName}</span>
                                    </p>
                                    <p className="text-xs text-silver mt-1">
                                      You didn&apos;t bet on this match
                                    </p>
                                  </div>
                                );
                              }

                              /* ─── Case 2b: User has unclaimed bets → show claim buttons ─── */
                              const unclaimed = ubets.filter(b => !b.claimed);
                              if (unclaimed.length) {
                                // Calculate potential payouts
                                const wp = mkt.winningOutcome === 1 ? Number(mkt.poolHome)
                                  : mkt.winningOutcome === 0 ? Number(mkt.poolDraw) : Number(mkt.poolAway);
                                const tp = Number(mkt.totalPool);

                                return (
                                  <div className="space-y-2">
                                    <div className="text-center p-3 rounded-xl bg-surface-light">
                                      <p className="text-sm">
                                        {mkt.finalScore && <span className="text-white font-bold">{mkt.finalScore} • </span>}
                                        Winner: <span className="text-accent font-bold">{winnerName}</span>
                                      </p>
                                    </div>
                                    {unclaimed.map(b => {
                                      const isWin = b.outcome === mkt.winningOutcome;
                                      const payout = isWin && wp > 0 ? (Number(b.amount) * tp) / wp : 0;
                                      return (
                                        <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl ${isWin ? "bg-accent/10 border border-accent/30" : "bg-danger/10 border border-danger/30"}`}>
                                          <div>
                                            <p className="text-sm font-medium">
                                              You bet <span className="text-white">{Number(b.amount).toFixed(2)} USDC</span> on{" "}
                                              <span className="text-white">{b.outcome===1?m.team1:b.outcome===2?m.team2:"Draw"}</span>
                                            </p>
                                            <p className={`text-xs ${isWin ? "text-accent" : "text-danger"}`}>
                                              {isWin ? `🎉 You won! Payout: ${payout.toFixed(2)} USDC` : "❌ This bet lost"}
                                            </p>
                                          </div>
                                          <button
                                            onClick={() => claimBet(b.id)}
                                            disabled={claiming === b.id}
                                            className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${isWin ? "bg-accent" : "bg-surface-lighter"}`}
                                          >
                                            {claiming === b.id ? "..." : isWin ? "💰 Claim" : "Confirm"}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }

                              /* ─── Case 2c: All claimed → show final results ─── */
                              const wonBets = ubets.filter(b => b.isWon);
                              const totalPayout = wonBets.reduce((s, b) => s + Number(b.payout || 0), 0);
                              return (
                                <div className="text-center p-3 rounded-xl bg-surface-light">
                                  <p className="text-sm">
                                    {mkt.finalScore && <span className="text-white font-bold">{mkt.finalScore} • </span>}
                                    Winner: <span className="text-accent font-bold">{winnerName}</span>
                                  </p>
                                  {wonBets.length > 0
                                    ? <p className="text-accent text-sm mt-1">🎉 You won {totalPayout.toFixed(2)} USDC! ✅ Claimed</p>
                                    : <p className="text-danger text-sm mt-1">❌ You lost. Better luck next time!</p>
                                  }
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {/* Pool info */}
                        {mkt&&Number(mkt.totalPool)>0&&<p className="mt-2 text-center text-xs text-surface-lighter">Pool: {Number(mkt.totalPool).toFixed(2)} USDC • {mkt.totalBets} bets</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MY BETS */}
        {activeTab==="mybets"&&(
          <div className="space-y-4">
            {!myBets.length?<div className="glass-card p-8 text-center"><p className="text-lg">No bets yet</p><p className="text-silver">Go to Matches!</p></div>
            :myBets.map(bet=>{
              const mkt=marketsCache[bet.marketId];
              return (
                <div key={bet.id} className="glass-card p-4">
                  <div className="flex justify-between mb-2"><span className="font-medium">{mkt?`${mkt.team1} vs ${mkt.team2}`:bet.marketId}</span><span className="text-xs text-silver">{mkt?.gameDate}</span></div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div><span className="text-xs text-silver">Prediction</span><p className="font-medium">{bet.outcome===1?mkt?.team1||"Home":bet.outcome===2?mkt?.team2||"Away":"Draw"}</p></div>
                    <div><span className="text-xs text-silver">Stake</span><p className="font-medium">{Number(bet.amount).toFixed(2)} USDC</p></div>
                    <div><span className="text-xs text-silver">Status</span><p className={`font-medium ${bet.isWon===true?"text-accent":bet.isWon===false?"text-danger":"text-warning"}`}>{bet.claimed?(bet.isWon?`🎉 +${Number(bet.payout).toFixed(2)}`:"❌ Lost"):"⏳ Pending"}</p></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    {!bet.claimed&&!mkt?.isResolved&&<button onClick={()=>resolveMarket(bet.marketId)} disabled={resolving===bet.marketId} className="px-4 py-2 rounded-lg bg-primary text-white text-sm disabled:opacity-50">{resolving===bet.marketId?"Resolving...":"🤖 Resolve"}</button>}
                    {!bet.claimed&&mkt?.isResolved&&<button onClick={()=>claimBet(bet.id)} disabled={claiming===bet.id} className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">{claiming===bet.id?"Claiming...":"💰 Claim"}</button>}
                    {bet.claimed&&bet.isWon&&<span className="text-accent text-sm">✅ Claimed</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab==="leaderboard"&&(
          <div className="space-y-4">
            <div className="text-center mb-4"><h2 className="text-2xl font-bold">🏆 Top Winners</h2></div>
            {!leaderboard.length?<div className="glass-card p-8 text-center"><p>No data yet</p></div>
            :<div className="space-y-2">{leaderboard.map((e,i)=>(
              <div key={e.address} className="glass-card p-4 grid grid-cols-5 gap-4 items-center">
                <span className="text-lg">{i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}</span>
                <span className="font-medium font-mono">{shortenAddress(e.address)}</span>
                <span className="text-accent font-bold">{Number(e.totalWon).toFixed(1)} USDC</span>
                <span className={Number(e.profit)>=0?"text-accent":"text-danger"}>{Number(e.profit)>=0?"+":""}{Number(e.profit).toFixed(1)}</span>
                <span className="text-silver">{e.wins}W/{e.losses}L</span>
              </div>
            ))}</div>}
          </div>
        )}
      </main>

      {/* BET MODAL */}
      {betModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="glass-card p-6 max-w-md w-full animate-slide-up">
            <div className="flex justify-between mb-4"><h3 className="text-xl font-bold">Place Bet</h3><button onClick={()=>setBetModal(null)} className="text-silver hover:text-white">✕</button></div>
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
              <div className="flex justify-between mb-1"><span className="text-sm">Stake</span><span className="text-xs text-silver">USDC Balance: {usdcBalance}</span></div>
              <div className="relative"><input type="number" value={stakeAmount} onChange={e=>setStakeAmount(e.target.value)} min="1" className="w-full px-4 py-3 rounded-xl bg-surface-light border border-surface-lighter text-white text-lg font-bold focus:outline-none focus:border-primary pr-16" placeholder="5"/><span className="absolute right-4 top-1/2 -translate-y-1/2 text-silver">USDC</span></div>
              <div className="flex gap-2 mt-2">{[5,10,25,50].map(a=><button key={a} onClick={()=>setStakeAmount(String(a))} className="px-3 py-1 rounded-lg bg-surface-light text-sm hover:bg-surface-lighter">{a}</button>)}</div>
            </div>
            <div className="flex justify-between mb-4 p-3 rounded-xl bg-surface-light">
              <span className="text-silver">Potential Payout</span>
              <span className="text-xl font-bold text-accent">{(Number(stakeAmount||0)*(betModal.selection===1?betModal.match.oddsTeam1:betModal.selection===2?betModal.match.oddsTeam2:betModal.match.oddsDraw)).toFixed(2)} USDC</span>
            </div>
            {Number(usdcBalance)<Number(stakeAmount)&&<p className="mb-3 p-3 rounded-xl bg-danger/20 text-danger text-sm">Insufficient USDC balance in wallet</p>}
            <div className="text-xs text-silver mb-4 space-y-1">
              <p>✓ USDC transferred directly from your wallet to pool</p>
              <p>✓ GenLayer AI Oracle resolves match results</p>
              <p>✓ Winners get USDC payout from pool</p>
            </div>
            <button onClick={placeBet} disabled={loading||Number(usdcBalance)<Number(stakeAmount)||Number(stakeAmount)<1}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold disabled:opacity-50">
              {loading?"Confirming...":"Place Bet"}</button>
          </div>
        </div>
      )}

      <footer className="fixed bottom-0 left-0 right-0 bg-bg/80 backdrop-blur-xl border-t border-surface-lighter py-3 text-center text-xs text-silver">
        Built on <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GenLayer</a>
        {" • "}<a href={`${EXPLORER_TX}${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline">{shortenAddress(CONTRACT_ADDRESS)}</a>
        {" • USDC on Base Sepolia"}
      </footer>
    </div>
  );
}
