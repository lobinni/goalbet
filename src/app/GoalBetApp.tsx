"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import TeamLogo from "@/components/TeamLogo";
import {
  type Match, formatDateHeader,
  formatKickoffTime, relativeDayLabel, LEAGUE_INFO,
} from "@/lib/matches";
import type { FixtureGroup, LeagueGroup } from "@/lib/fixtures";
import {
  getEthereum, shortenAddress,
  BASE_SEPOLIA, CONTRACT_ADDRESS, EXPLORER_TX,
} from "@/lib/genlayer";
import { USDC_ADDRESS, USDC_DECIMALS, POOL_WALLET, encodeTransfer, encodeBalanceOf } from "@/lib/usdc";

/** Safe JSON parsing for fetch responses — handles empty/invalid bodies */
async function safeJson(r: globalThis.Response): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const text = await r.text();
    if (!text || !text.trim()) {
      return { ok: false, data: { error: `Empty response (status ${r.status})` } };
    }
    const data = JSON.parse(text);
    return { ok: r.ok, data };
  } catch {
    return { ok: false, data: { error: `Invalid response (status ${r.status})` } };
  }
}

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
  if (text === "LIVE") return <span className="font-mono text-[10px] font-bold text-livec tracking-widest">KICKED OFF</span>;
  if (text === "FT") return <span className="font-mono text-[10px] font-bold text-sage tracking-widest">FT</span>;
  return <span className="font-mono text-[10px] font-bold text-gold tracking-widest">IN {text.toUpperCase()}</span>;
}

/** Shared clock ticking every 30s — keeps kickoff locks reactive */
function useNow(interval = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(iv);
  }, [interval]);
  return now;
}

/** Ambient pitch marking decoration */
function PitchLines() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.045]"
      viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid slice" aria-hidden
    >
      <g fill="none" stroke="#edf4ea" strokeWidth="2">
        <rect x="24" y="24" width="952" height="592" />
        <line x1="500" y1="24" x2="500" y2="616" />
        <circle cx="500" cy="320" r="92" />
        <circle cx="500" cy="320" r="4" fill="#edf4ea" />
        <rect x="24" y="170" width="150" height="300" />
        <rect x="826" y="170" width="150" height="300" />
        <rect x="24" y="250" width="55" height="140" />
        <rect x="921" y="250" width="55" height="140" />
        <path d="M174 265 A65 65 0 0 1 174 375" />
        <path d="M826 265 A65 65 0 0 0 826 375" />
      </g>
    </svg>
  );
}

const abbr = (m: Match) => ({
  t1: m.team1Code || m.team1.slice(0, 3).toUpperCase(),
  t2: m.team2Code || m.team2.slice(0, 3).toUpperCase(),
});

/** Scrolling results ticker — pauses on hover */
function Ticker({ matches }: { matches: Match[] }) {
  const items = matches.length
    ? matches.slice(0, 14).map((m) => {
        const a = abbr(m);
        const live = m.status === "IN_PLAY" || m.status === "PAUSED";
        const done = m.status === "FINISHED";
        return {
          key: m.id,
          live,
          done,
          label: `${a.t1} ${m.score ?? "v"} ${a.t2}`,
          tag: done ? "FT" : live ? "LIVE" : formatKickoffTime(m.kickoffTime),
        };
      })
    : [
        { key: "a", live: false, done: false, label: "GOALBET", tag: "AI ORACLE ON GENLAYER" },
        { key: "b", live: false, done: false, label: "USDC", tag: "BASE SEPOLIA TESTNET" },
      ];
  const loop = [...items, ...items];
  return (
    <div className="ticker-shell sticky top-0 z-50">
      <div className="ticker-track py-1.5">
        {loop.map((it, i) => (
          <span key={`${it.key}-${i}`} className="flex items-center gap-2 px-5 font-mono text-[11px] tracking-wider whitespace-nowrap">
            {it.live && <span className="live-dot" />}
            <span className={it.done ? "text-chalk font-bold" : "text-sage"}>{it.label}</span>
            <span className={it.live ? "text-livec font-bold" : it.done ? "text-win" : "text-gold"}>{it.tag}</span>
            <span className="text-pitch-600">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <span className="font-display text-2xl leading-none tracking-wide">
      <span className="text-chalk">GOAL</span><span className="text-gold">BET</span>
    </span>
  );
}

interface Props {
  initialGroups: FixtureGroup[];
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

const ODDS_META = [
  { l: "HOME", oc: 1, stripe: "var(--color-win)", txt: "text-win" },
  { l: "DRAW", oc: 0, stripe: "var(--color-drawc)", txt: "text-drawc" },
  { l: "AWAY", oc: 2, stripe: "var(--color-awayc)", txt: "text-awayc" },
] as const;

/** ESPN-style league section — logo + name + grouped matches */
function LeagueSection({
  group,
  matches: groupMatches,
  renderCard,
}: {
  group: LeagueGroup;
  matches: Match[];
  renderCard: (m: Match, i: number) => React.ReactNode;
}) {
  // Sub-group by date within a league
  const byDate = new Map<string, Match[]>();
  for (const m of groupMatches) {
    const arr = byDate.get(m.gameDate) || [];
    arr.push(m);
    byDate.set(m.gameDate, arr);
  }

  const li = LEAGUE_INFO[group.name];

  return (
    <div className="anim-rise">
      {/* league header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        {group.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.logo} alt="" className="w-6 h-6 object-contain shrink-0" />
        ) : li ? (
          <span className="text-lg shrink-0">{li.emoji}</span>
        ) : (
          <span className="text-lg shrink-0">⚽</span>
        )}
        <span className="font-semibold text-sm text-chalk tracking-wide truncate">{group.name}</span>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] text-sage tracking-widest shrink-0">
          {groupMatches.length} MATCH{groupMatches.length > 1 ? "ES" : ""}
        </span>
      </div>
      {/* date sub-sections */}
      {Array.from(byDate.entries()).map(([date, dayMatches]) => {
        const rel = relativeDayLabel(date);
        return (
          <div key={date} className="mb-4">
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="font-mono text-[10px] text-sage tracking-widest">{formatDateHeader(date)}</span>
              {rel && (
                <span className={`stamp ${rel === "TODAY" ? "text-gold" : rel === "YESTERDAY" ? "text-win" : "text-awayc"}`}>
                  {rel}
                </span>
              )}
            </div>
            <div className="grid gap-3">
              {dayMatches.map((m, i) => renderCard(m, i))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GoalBetApp({ initialGroups }: Props) {
  const [account, setAccount] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [usdcBalance, setUsdcBalance] = useState("0.00");

  const [fixtureGroups, setFixtureGroups] = useState<FixtureGroup[]>(initialGroups);
  const matches = fixtureGroups.flatMap(g => g.matches);
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

  /** Shared 30s clock — makes kickoff betting locks update live */
  const now = useNow(30000);

  // ── wallet ──
  const connect = async () => {
    const eth = getEthereum(); if(!eth) return notify("Install MetaMask to place bets","err");
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
    const fallbackUser = ():AppUser => ({id:"",walletAddress:account,totalBets:0,totalStaked:"0",totalWon:"0",wins:0,losses:0});
    (async()=>{
      try {
        const r1 = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
        const { ok: ok1, data: d1 } = await safeJson(r1);
        if(!c && ok1 && d1.user) { setUser(d1.user as AppUser); return; }
        // If /me returned 500 (db error), still try register but don't block UI
        const r2 = await fetch("/api/users/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({walletAddress:account})});
        const { ok: ok2, data: d2 } = await safeJson(r2);
        if(!c && ok2 && d2.user) { setUser(d2.user as AppUser); notify("Welcome to the pitch! ⚽","ok"); }
        else if(!c) {
          // DB might be down — let user browse with a local-only session
          setUser(fallbackUser());
          if(!ok1 || !ok2) notify("Server connection issue — some features may be limited","err");
        }
      } catch {
        if(!c) { setUser(fallbackUser()); notify("Server connection issue — browsing in offline mode","err"); }
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
    // Fixtures (ESPN — no DB) and Markets (DB) are independent
    // If DB is down, fixtures still load fine
    try {
      const fr = await fetch("/api/fixtures");
      const { data: fd } = await safeJson(fr);
      if(fd.groups) setFixtureGroups(fd.groups as FixtureGroup[]);
    } catch { /* keep current fixtures */ }
    try {
      const mr = await fetch("/api/markets");
      const { ok, data: md } = await safeJson(mr);
      if(ok && md.markets) { const c:Record<string,MarketRow>={}; for(const m of md.markets as MarketRow[]) c[m.id]=m; setMarketsCache(p=>({...p,...c})); }
    } catch { /* keep current markets cache */ }
    setMatchesLoading(false);
  },[]);
  useEffect(()=>{ fetchMatches(); },[fetchMatches]);

  // ── live refresh: scores/statuses re-sync every 60s ──
  useEffect(()=>{
    const iv = setInterval(fetchMatches, 60000);
    return ()=>clearInterval(iv);
  },[fetchMatches]);

  // ── bets ──
  const fetchBets = useCallback(async()=>{
    if(!user) return;
    try {
      const [br,mr] = await Promise.all([fetch(`/api/bets?userId=${user.id}`),fetch("/api/markets")]);
      const { data: bd } = await safeJson(br); const { data: md } = await safeJson(mr);
      if(bd.bets) setMyBets(bd.bets as BetRow[]);
      if(md.markets) { const c:Record<string,MarketRow>={}; for(const m of md.markets as MarketRow[]) c[m.id]=m; setMarketsCache(p=>({...p,...c})); }
    } catch { /* keep current state */ }
  },[user]);
  useEffect(()=>{ if(user) fetchBets(); },[user,fetchBets]);

  const fetchLB = useCallback(async()=>{
    try { const r = await fetch("/api/leaderboard"); const { data: d } = await safeJson(r); if(d.leaderboard) setLeaderboard(d.leaderboard as LBEntry[]); } catch { /* ignore */ }
  },[]);

  const refreshUser = async()=>{
    if(!account) return;
    const r = await fetch(`/api/users/me?wallet=${account.toLowerCase()}`);
    const { data: d } = await safeJson(r); if(d.user) setUser(d.user as AppUser);
  };

  const mkid = (m:Match) => `${m.gameDate}_${m.team1}_${m.team2}`.toLowerCase().replace(/ /g,"-");

  // ── auto-resolve sweep ──
  // Finished matches the user did NOT bet on get settled silently in the
  // background (fast mode = ESPN only), so results appear automatically.
  // Matches the user DID bet on keep the manual "Verify Result" moment.
  const autoResolving = useRef(new Set<string>());
  useEffect(()=>{
    if(!user) return;
    const targets = matches.filter(m => m.status === "FINISHED").filter(m => {
      const mid = mkid(m);
      const mkt = marketsCache[mid];
      return mkt
        && !mkt.isResolved
        && !myBets.some(b => b.marketId === mid)
        && !autoResolving.current.has(mid);
    }).slice(0, 4);
    if(!targets.length) return;
    let cancelled = false;
    (async () => {
      for (const m of targets) {
        const mid = mkid(m);
        autoResolving.current.add(mid);
        try {
          await fetch("/api/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({marketId:mid,fast:true})});
        } catch { /* keep going */ }
        try {
          const mr = await fetch("/api/markets");
          const { data: md } = await safeJson(mr);
          if(!cancelled && md.markets) {
            const c: Record<string,MarketRow> = {};
            for(const mk of md.markets as MarketRow[]) c[mk.id] = mk;
            setMarketsCache(p => ({...p, ...c}));
          }
        } catch { /* keep going */ }
      }
    })();
    return ()=>{ cancelled = true; };
  },[matches, marketsCache, myBets, user]);

  const getMarketForMatch = async(m:Match): Promise<{ market: MarketRow | null; error?: string }> => {
    const id = mkid(m);
    if(marketsCache[id]) return { market: marketsCache[id] };
    const r = await fetch("/api/markets",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,gameDate:m.gameDate,team1:m.team1,team2:m.team2,team1Code:m.team1Code,team2Code:m.team2Code,league:m.league,kickoffTime:m.kickoffTime})});
    const { ok, data: d } = await safeJson(r);
    if(ok && d.market) { setMarketsCache(p=>({...p,[id]:d.market as MarketRow})); return { market: d.market as MarketRow }; }
    return { market: null, error: String(d.error || `Server error (${r.status})`) };
  };

  // ── place bet: USDC transfer → pool wallet → record bet ──
  const placeBet = async () => {
    if(!user||!betModal||!account) return;
    const amt = Number(stakeAmount);
    if(amt<1) return notify("Min bet is 1 USDC","err");
    if(amt>Number(usdcBalance)) return notify(`Insufficient USDC (have ${usdcBalance})`,"err");
    setLoading(true);
    try {
      const { market: mkt, error: mktErr } = await getMarketForMatch(betModal.match);
      if(!mkt) throw new Error(mktErr || "Could not create market — check /api/health");

      // Step 1: Send USDC from user wallet → pool wallet
      notify("Confirm the USDC transfer in MetaMask…","info");
      const eth = getEthereum(); if(!eth) throw new Error("No wallet");
      const txData = encodeTransfer(POOL_WALLET, amt);
      const txHash = await eth.request({method:"eth_sendTransaction",params:[{
        from: account, to: USDC_ADDRESS, data: txData,
      }]}) as string;

      notify("USDC sent — recording your slip…","info");

      // Step 2: Record bet on server
      const r = await fetch("/api/bets",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({userId:user.id,marketId:mkt.id,outcome:betModal.selection,amount:amt,txHash})});
      const { ok: rok, data: d } = await safeJson(r);
      if(rok && d.success) {
        notify(`${amt} USDC on the table 🎯 Slip confirmed!`,"ok");
        setBetModal(null); setStakeAmount("5");
        await Promise.all([refreshUser(),fetchBets(),fetchUsdcBalance()]);
        setActiveTab("mybets");
      } else notify(String(d.error)||"Bet failed","err");
    } catch(e) { notify((e as Error).message||"Transaction failed","err"); }
    setLoading(false);
  };

  // ── resolve ──
  const resolveMarket = async(marketId:string) => {
    setResolving(marketId);
    notify("🤖 Querying the oracle…","info");
    try {
      const r = await fetch("/api/resolve",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({marketId})});
      const { ok: rok, data: d } = await safeJson(r);
      if(rok && d.success) { notify(`✅ Full time: ${d.score||"result verified"}`,"ok"); await Promise.all([fetchBets(),fetchMatches()]); }
      else notify(String(d.error)||"Not finished yet","err");
    } catch(e) { notify((e as Error).message,"err"); }
    setResolving(null);
  };

  // ── claim ──
  const claimBet = async(betId:string) => {
    if(!user) return;
    setClaiming(betId);
    try {
      const r = await fetch("/api/bets/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({betId,userId:user.id})});
      const { ok: rok, data: d } = await safeJson(r);
      if(rok && d.success) {
        if(d.isWon) notify(`+${d.payout} USDC paid out! 🎉`,"ok");
        else notify("Slip lost ❌","err");
        await Promise.all([refreshUser(),fetchBets()]);
      } else notify(String(d.error)||"Claim failed","err");
    } catch(e) { notify((e as Error).message,"err"); }
    setClaiming(null);
  };

  const hasBet = (m:Match) => myBets.some(b=>b.marketId===mkid(m));

  /* ═══════════════ MATCH CARD (shared shape for landing + board) ═══════════════ */
  const matchCard = (m: Match, connected: boolean, idx = 0) => {
    const bp = hasBet(m);
    const isLive = m.status==="IN_PLAY"||m.status==="PAUSED";
    const isFinished = m.status==="FINISHED";
    // Betting closes the moment the match kicks off — even if the status feed lags
    const kickoffPassed = !!m.kickoffTime && new Date(m.kickoffTime).getTime() <= now;
    const isStarted = isLive || isFinished || kickoffPassed;
    const canBet = !bp && !isStarted;
    const li = LEAGUE_INFO[m.league];
    const mid = mkid(m); const mkt = marketsCache[mid];
    const stripe = isLive ? "var(--color-livec)" : isFinished ? "var(--color-win-deep)" : isStarted ? "var(--color-drawc)" : "var(--color-gold)";

    return (
      <div key={m.id} className="match-card anim-rise p-4 pl-5" style={{animationDelay:`${Math.min(idx,8)*60}ms`}}>
        <span className="stripe" style={{background: stripe}} />
        {/* meta row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {li && <span className="text-sm shrink-0">{li.emoji}</span>}
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sage truncate">{m.league}</span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {isLive ? (
              <span className="flex items-center gap-1.5">
                <span className="live-dot" />
                <span className="font-mono text-[10px] font-bold text-livec tracking-widest">
                  {m.status==="PAUSED" ? "HT" : m.elapsed ? `${m.elapsed}'` : "LIVE"}
                </span>
              </span>
            ) : isFinished ? (
              <span className="stamp text-win">FT</span>
            ) : (
              <>
                <span className="font-mono text-[11px] text-chalk">{formatKickoffTime(m.kickoffTime)}</span>
                <Countdown kickoffTime={m.kickoffTime} />
              </>
            )}
          </div>
        </div>

        {/* teams + score */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex items-center gap-2.5 min-w-0 justify-start">
            <TeamLogo teamCode={m.team1Code} teamName={m.team1} size="sm" className="shrink-0" />
            <span className="font-semibold text-sm sm:text-base truncate">{m.team1}</span>
          </div>
          <div className="px-3 sm:px-5 text-center">
            {m.score ? (
              <span className={`font-display text-2xl sm:text-3xl tracking-wider ${isLive ? "text-livec" : "text-chalk"}`}>{m.score}</span>
            ) : (
              <span className="font-mono text-[11px] text-pitch-600 font-bold tracking-widest">VS</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 min-w-0 justify-end">
            <span className="font-semibold text-sm sm:text-base truncate text-right">{m.team2}</span>
            <TeamLogo teamCode={m.team2Code} teamName={m.team2} size="sm" className="shrink-0" />
          </div>
        </div>
        {m.venue && <p className="text-center font-mono text-[10px] text-sage mt-2 tracking-wide">🏟 {m.venue}</p>}

        {/* odds / result area */}
        {!isFinished && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            {ODDS_META.map(o=>{
              const od = o.oc===1 ? m.oddsTeam1 : o.oc===0 ? m.oddsDraw : m.oddsTeam2;
              return (
                <button
                  key={o.oc}
                  onClick={()=> connected ? setBetModal({match:m,selection:o.oc}) : connect()}
                  disabled={connected ? !canBet : false}
                  className="odds-btn"
                  style={{"--stripe": o.stripe} as React.CSSProperties}
                >
                  <span className="font-mono text-[9px] tracking-[0.18em] text-sage">{o.l}</span>
                  <span className={`font-mono text-lg font-bold ${o.txt}`}>{od.toFixed(2)}</span>
                </button>
              );
            })}
          </div>
        )}
        {bp && !isFinished && (
          <p className="mt-3 text-center font-mono text-[11px] tracking-widest text-win">✓ SLIP PLACED</p>
        )}
        {isStarted && !isFinished && !bp && (
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.18em] text-drawc">🔒 KICKED OFF — BETTING CLOSED</p>
        )}

        {/* finished → results */}
        {isFinished && (()=>{
          const ubets = connected ? myBets.filter(b => b.marketId === mid) : [];
          const [g1, g2] = (m.score || "").split("-").map(s => parseInt(s, 10));
          const derivedWinner = m.score && !isNaN(g1) && !isNaN(g2)
            ? (g1 > g2 ? m.team1 : g2 > g1 ? m.team2 : "Draw") : null;

          /* ─── No slip on this match → result updates automatically ─── */
          if (!ubets.length) {
            return m.score ? (
              <div className="mt-4 text-center panel px-3 py-3">
                <p className="font-mono text-[10px] tracking-[0.22em] text-sage">FULL TIME</p>
                <p className="font-display text-2xl text-chalk tracking-wider mt-0.5">{m.score}</p>
                {derivedWinner && (
                  <p className="text-xs mt-1.5 text-sage">
                    Winner <span className="font-bold text-win">{derivedWinner}</span>
                    {connected && <span className="text-pitch-600"> · you didn&apos;t back this match</span>}
                  </p>
                )}
              </div>
            ) : null;
          }

          /* ─── User has slip(s) → manual oracle verify + claim ─── */
          return (
            <div className="mt-4 space-y-2.5">
              {m.score && (
                <p className="text-center font-mono text-[11px] tracking-widest text-sage">
                  FULL TIME <span className="font-display text-lg text-chalk tracking-wider ml-1">{m.score}</span>
                </p>
              )}
              {(()=>{
                const isResolved = mkt?.isResolved;

                /* Case 1: Not resolved yet → Resolve button */
                if (!isResolved) {
                  return (
                    <div className="text-center space-y-2">
                      <p className="font-mono text-[11px] text-sage tracking-wide">
                        {ubets.length} slip{ubets.length>1?"s":""} on this match — verify the result to settle.
                      </p>
                      <button
                        onClick={async () => { await getMarketForMatch(m).catch(()=>{}); resolveMarket(mid); }}
                        disabled={resolving === mid}
                        className="btn-gold px-6 py-2.5 text-xs anim-glow"
                      >
                        {resolving === mid ? "⏳ Oracle verifying…" : "🤖 Verify Result"}
                      </button>
                      {resolving === mid && (
                        <p className="font-mono text-[10px] text-gold animate-pulse tracking-wide">
                          ESPN scoreboard → GenLayer validators → consensus…
                        </p>
                      )}
                    </div>
                  );
                }

                /* Case 2: Resolved */
                const winnerName = mkt.winningOutcome === 1 ? m.team1
                  : mkt.winningOutcome === 2 ? m.team2 : "Draw";

                const unclaimed = ubets.filter(b => !b.claimed);
              if (unclaimed.length) {
                const wp = mkt.winningOutcome === 1 ? Number(mkt.poolHome)
                  : mkt.winningOutcome === 0 ? Number(mkt.poolDraw) : Number(mkt.poolAway);
                const tp = Number(mkt.totalPool);
                return (
                  <div className="space-y-2">
                    <div className="text-center panel px-3 py-2.5">
                      <p className="text-sm">
                        {mkt.finalScore && <span className="font-mono font-bold text-chalk">{mkt.finalScore} · </span>}
                        <span className="text-sage">Winner</span> <span className="font-bold text-win">{winnerName}</span>
                      </p>
                    </div>
                    {unclaimed.map(b => {
                      const isWin = b.outcome === mkt.winningOutcome;
                      const payout = isWin && wp > 0 ? (Number(b.amount) * tp) / wp : 0;
                      return (
                        <div key={b.id} className="bet-ticket p-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-xs text-sage">
                                {Number(b.amount).toFixed(2)} USDC on{" "}
                                <span className="text-chalk font-semibold">
                                  {b.outcome===1?m.team1:b.outcome===2?m.team2:"Draw"}
                                </span>
                              </p>
                              <p className={`font-mono text-sm font-bold mt-0.5 ${isWin?"text-win":"text-livec"}`}>
                                {isWin ? `🎉 PAYS ${payout.toFixed(2)} USDC` : "✕ SLIP LOST"}
                              </p>
                            </div>
                            <button
                              onClick={()=>claimBet(b.id)}
                              disabled={claiming===b.id}
                              className={isWin ? "btn-win px-4 py-2 text-xs" : "btn-gold px-4 py-2 text-xs"}
                            >
                              {claiming===b.id ? "Settling…" : isWin ? "💰 Claim" : "Settle"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

                const wonBets = ubets.filter(b => b.isWon);
                const totalPayout = wonBets.reduce((s, b) => s + Number(b.payout || 0), 0);
                return (
                  <div className="text-center panel px-3 py-3">
                    <p className="text-sm">
                      {mkt.finalScore && <span className="font-mono font-bold text-chalk">{mkt.finalScore} · </span>}
                      <span className="text-sage">Winner</span> <span className="font-bold text-win">{winnerName}</span>
                    </p>
                    <p className={`font-mono text-sm font-bold mt-1.5 ${wonBets.length?"text-win":"text-livec"}`}>
                      {wonBets.length > 0
                        ? `🎉 +${totalPayout.toFixed(2)} USDC · PAID OUT`
                        : "✕ SLIP LOST — NEXT ONE'S YOURS"}
                    </p>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* pool info */}
        {connected && mkt && Number(mkt.totalPool)>0 && (
          <p className="mt-3 text-center font-mono text-[10px] text-sage tracking-widest">
            POOL <span className="text-gold font-bold">{Number(mkt.totalPool).toFixed(2)}</span> USDC · {mkt.totalBets} SLIP{mkt.totalBets>1?"S":""}
          </p>
        )}
      </div>
    );
  };

  /* ═══════════════ NOT CONNECTED ═══════════════ */
  if(!account) return (
    <div className="min-h-screen pb-24 relative">
      <PitchLines />
      <Ticker matches={matches} />

      {/* top bar */}
      <header className="relative z-10 border-b border-line bg-pitch-950/70 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="hidden sm:inline-block font-mono text-[9px] tracking-[0.2em] text-sage border border-line rounded px-2 py-1">
              AI ORACLE · GENLAYER
            </span>
          </div>
          <button onClick={connect} className="btn-gold px-4 sm:px-5 py-2 text-[11px] sm:text-xs">
            🦊 Connect Wallet
          </button>
        </div>
      </header>

      {/* opener */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 pt-12 pb-10 sm:pt-16">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-10 items-start">
          <div className="anim-rise">
            <p className="font-mono text-[11px] tracking-[0.3em] text-gold mb-4">MATCHDAY · PREDICTION MARKET</p>
            <h1 className="font-display uppercase leading-[0.92] text-[15vw] sm:text-7xl lg:text-8xl">
              <span className="display-outline block">Read the</span>
              <span className="block text-chalk">game.</span>
              <span className="block text-gold">Back the</span>
              <span className="block text-chalk">outcome.</span>
            </h1>
            <p className="mt-6 max-w-md text-sage text-sm sm:text-base leading-relaxed">
              Stake <span className="text-chalk font-semibold">USDC</span> on Base Sepolia, call the result before
              kickoff, and let <span className="text-chalk font-semibold">GenLayer validators</span> verify the final
              score straight from the scoreboard. Winners split the pool — no bookie in the middle.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button onClick={connect} className="btn-gold px-7 py-3.5 text-sm anim-glow">
                🦊 Connect MetaMask to Bet
              </button>
              <span className="font-mono text-[10px] text-sage tracking-widest">TESTNET · NO REAL MONEY</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <span className="font-mono text-[10px] tracking-widest text-sage border border-line rounded px-2.5 py-1.5">
                {matches.length} FIXTURES ON THE BOARD
              </span>
              <span className="font-mono text-[10px] tracking-widest text-sage border border-line rounded px-2.5 py-1.5">
                SETTLED IN USDC
              </span>
              <span className="font-mono text-[10px] tracking-widest text-sage border border-line rounded px-2.5 py-1.5">
                ORACLE TXN ON-CHAIN
              </span>
            </div>
          </div>

          {/* how it works rail */}
          <aside className="panel p-5 anim-rise hidden lg:block" style={{animationDelay:"120ms"}}>
            <p className="font-mono text-[10px] tracking-[0.25em] text-gold mb-4">HOW IT WORKS</p>
            <ol className="space-y-4">
              {[
                ["01","Connect wallet","MetaMask on Base Sepolia testnet."],
                ["02","Back a result","Stake USDC on home, draw or away before kickoff."],
                ["03","Oracle verifies","Validators cross-check the official scoreboard after full time."],
                ["04","Claim the pool","Winning slips are paid out from the match pool."],
              ].map(([n,t,d])=>(
                <li key={n} className="flex gap-3.5">
                  <span className="font-display text-2xl text-pitch-600 leading-none w-8">{n}</span>
                  <div>
                    <p className="font-semibold text-sm text-chalk">{t}</p>
                    <p className="text-xs text-sage mt-0.5 leading-relaxed">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      {/* the board */}
      <section className="relative z-10 max-w-5xl mx-auto px-4">
        <div className="flex items-end justify-between mb-4">
          <h2 className="font-display uppercase text-3xl text-chalk tracking-wide">The Board</h2>
          <span className="font-mono text-[10px] text-sage tracking-widest">{matches.length} MATCHES</span>
        </div>
        {matchesLoading ? (
          <div className="panel p-10 text-center"><span className="text-4xl ball-spin">⚽</span><p className="text-sage mt-3 text-sm">Loading fixtures…</p></div>
         ) : !fixtureGroups.length ? (
          <div className="panel p-10 text-center"><p className="text-sage text-sm">No matches on the board right now.</p></div>
        ) : (
          <div className="space-y-6">
            {fixtureGroups.map((fg) => (
              <LeagueSection key={fg.league.slug} group={fg.league} matches={fg.matches} renderCard={(m: Match, i: number) => matchCard(m, false, i)} />
            ))}
          </div>
        )}
      </section>

      <footer className="relative z-10 max-w-5xl mx-auto px-4 mt-14 pb-6 text-center font-mono text-[10px] text-sage tracking-widest">
        ORACLE BY <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">GENLAYER</a> · USDC ON BASE SEPOLIA
      </footer>
    </div>
  );

  /* ═══════════════ CONNECTING ═══════════════ */
  if(!user) return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <PitchLines />
      <div className="text-center anim-pop relative z-10">
        <span className="text-5xl ball-spin inline-block">⚽</span>
        <p className="font-mono text-xs text-sage mt-4 tracking-widest">{shortenAddress(account)}</p>
        <p className="font-mono text-[10px] text-pitch-600 mt-1 tracking-widest">ENTERING THE PITCH…</p>
      </div>
    </div>
  );

  /* ═══════════════ MAIN APP ═══════════════ */
  return (
    <div className="min-h-screen pb-24 relative">
      <PitchLines />
      {note && <div className={`toast toast-${note.type}`}>{note.msg}</div>}

      <Ticker matches={matches} />

      <header className="sticky top-[29px] z-40 bg-pitch-950/80 backdrop-blur-md border-b border-line">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Wordmark />
            <span className="font-mono text-[9px] tracking-[0.18em] text-gold border border-gold/30 rounded px-2 py-1">
              BASE SEPOLIA
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-baseline gap-1.5 border border-gold/30 rounded-lg px-3 py-1.5 bg-pitch-900">
              <span className="font-mono text-base font-bold text-gold">{usdcBalance}</span>
              <span className="font-mono text-[9px] text-sage tracking-widest">USDC</span>
            </div>
            {user.wins+user.losses>0 && (
              <span className={`font-mono text-xs font-bold ${user.wins>user.losses?"text-win":"text-livec"}`}>
                {user.wins}W·{user.losses}L
              </span>
            )}
            <span className="hidden sm:inline font-mono text-[10px] text-sage border border-line rounded-lg px-2.5 py-1.5 tracking-wider">
              {shortenAddress(user.walletAddress)}
            </span>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-5xl mx-auto px-4 mt-5 flex gap-2 flex-wrap">
        {([["matches","⚽ Match Board"],["mybets","🎫 My Slips"],["leaderboard","🏆 Top Punters"]] as const).map(([t,label])=>(
          <button key={t} onClick={()=>{setActiveTab(t);if(t==="leaderboard")fetchLB();if(t==="mybets")fetchBets();}}
            className={`tab-btn ${activeTab===t?"on":""}`}>
            {label}
          </button>
        ))}
      </div>

      <main className="relative z-10 max-w-5xl mx-auto px-4 mt-6">
        {/* ── MATCH BOARD ── */}
        {activeTab==="matches" && (
          <div className="space-y-7">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-3 flex-wrap">
                <h2 className="font-display uppercase text-3xl text-chalk tracking-wide">The Board</h2>
                <span className="font-mono text-[10px] text-sage tracking-widest">YESTERDAY → TOMORROW · ALL LEAGUES</span>
              </div>
              <button onClick={fetchMatches} className="font-mono text-[11px] text-gold hover:underline tracking-widest">↻ REFRESH</button>
            </div>
            {matchesLoading&&!fixtureGroups.length ? (
              <div className="panel p-10 text-center"><span className="text-4xl ball-spin inline-block">⚽</span><p className="text-sage mt-3 text-sm">Loading…</p></div>
            ) : !fixtureGroups.length ? (
              <div className="panel p-10 text-center"><p className="text-sage text-sm">No matches</p></div>
            ) : fixtureGroups.map((fg) => (
              <LeagueSection key={fg.league.slug} group={fg.league} matches={fg.matches} renderCard={(m: Match, i: number) => matchCard(m, true, i)} />
            ))}
          </div>
        )}

        {/* ── MY SLIPS ── */}
        {activeTab==="mybets"&&(
          <div className="space-y-4">
            <div className="flex items-end justify-between mb-1">
              <h2 className="font-display uppercase text-3xl text-chalk tracking-wide">My Slips</h2>
              <span className="font-mono text-[10px] text-sage tracking-widest">{myBets.length} SLIP{myBets.length===1?"":"S"}</span>
            </div>
            {!myBets.length ? (
              <div className="panel p-10 text-center">
                <p className="font-display uppercase text-2xl text-pitch-600 tracking-wide">No slips yet</p>
                <p className="text-sage text-sm mt-1">Head to the board and back a result.</p>
              </div>
            ) : myBets.map((bet, i)=>{
              const mkt=marketsCache[bet.marketId];
              return (
                <div key={bet.id} className="bet-ticket anim-rise" style={{animationDelay:`${Math.min(i,8)*60}ms`}}>
                  <div className="p-4 flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{mkt?`${mkt.team1} vs ${mkt.team2}`:bet.marketId}</p>
                      <p className="font-mono text-[10px] text-sage tracking-widest mt-0.5">{mkt?.gameDate}</p>
                    </div>
                    {bet.claimed
                      ? <span className={`stamp shrink-0 ${bet.isWon?"text-win":"text-livec"}`}>{bet.isWon?"WON":"LOST"}</span>
                      : <span className="stamp shrink-0 text-drawc">PENDING</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-4 px-4 pb-4">
                    <div><p className="font-mono text-[9px] text-sage tracking-[0.18em]">PREDICTION</p><p className="font-semibold text-sm mt-0.5">{bet.outcome===1?mkt?.team1||"Home":bet.outcome===2?mkt?.team2||"Away":"Draw"}</p></div>
                    <div><p className="font-mono text-[9px] text-sage tracking-[0.18em]">STAKE</p><p className="font-mono font-bold text-sm mt-0.5 text-chalk">{Number(bet.amount).toFixed(2)} <span className="text-sage font-normal">USDC</span></p></div>
                    <div><p className="font-mono text-[9px] text-sage tracking-[0.18em]">RETURN</p><p className={`font-mono font-bold text-sm mt-0.5 ${bet.isWon===true?"text-win":bet.isWon===false?"text-livec":"text-drawc"}`}>{bet.claimed?(bet.isWon?`+${Number(bet.payout).toFixed(2)}`:"—"):"⏳"}</p></div>
                  </div>
                  <div className="perf" />
                  <div className="px-4 py-3 flex justify-end">
                    {!bet.claimed&&!mkt?.isResolved&&(
                      <button onClick={()=>resolveMarket(bet.marketId)} disabled={resolving===bet.marketId} className="btn-gold px-5 py-2 text-[11px]">
                        {resolving===bet.marketId?"⏳ Verifying…":"🤖 Verify Result"}
                      </button>
                    )}
                    {!bet.claimed&&mkt?.isResolved&&(
                      <button onClick={()=>claimBet(bet.id)} disabled={claiming===bet.id} className="btn-win px-5 py-2 text-[11px]">
                        {claiming===bet.id?"Settling…":"💰 Settle Slip"}
                      </button>
                    )}
                    {bet.claimed&&bet.isWon&&<span className="font-mono text-[11px] text-win tracking-widest">✓ PAID OUT</span>}
                    {bet.claimed&&!bet.isWon&&<span className="font-mono text-[11px] text-sage tracking-widest">✓ SETTLED</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TOP PUNTERS ── */}
        {activeTab==="leaderboard"&&(
          <div className="space-y-3">
            <div className="flex items-end justify-between mb-1">
              <h2 className="font-display uppercase text-3xl text-chalk tracking-wide">Top Punters</h2>
              <span className="font-mono text-[10px] text-sage tracking-widest">BY TOTAL WON</span>
            </div>
            {!leaderboard.length ? (
              <div className="panel p-10 text-center"><p className="text-sage text-sm">No settled slips on the board yet.</p></div>
            ) : leaderboard.map((e,i)=>(
              <div key={e.address} className="lb-row panel px-4 py-3.5 grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 sm:gap-x-6 items-center anim-rise" style={{animationDelay:`${Math.min(i,10)*50}ms`}}>
                <span className={`font-display text-xl w-9 text-center ${i===0?"text-gold":i===1?"text-chalk":i===2?"text-bronze":"text-pitch-600"}`}>
                  {i===0?"①":i===1?"②":i===2?"③":`#${i+1}`}
                </span>
                <span className="font-mono text-xs text-chalk truncate">{shortenAddress(e.address)}</span>
                <span className="font-mono text-sm font-bold text-gold">{Number(e.totalWon).toFixed(1)}</span>
                <span className={`hidden sm:inline font-mono text-xs font-bold ${Number(e.profit)>=0?"text-win":"text-livec"}`}>
                  {Number(e.profit)>=0?"+":""}{Number(e.profit).toFixed(1)}
                </span>
                <span className="hidden sm:inline font-mono text-[11px] text-sage">{e.wins}W·{e.losses}L</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── BET SLIP MODAL ── */}
      {betModal&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={()=>!loading&&setBetModal(null)}>
          <div className="bet-ticket max-w-md w-full anim-pop" onClick={e=>e.stopPropagation()}>
            <div className="p-5 pb-4">
              <div className="flex justify-between items-center mb-4">
                <p className="font-display uppercase text-2xl text-chalk tracking-wide">Bet Slip</p>
                <button onClick={()=>setBetModal(null)} className="text-sage hover:text-chalk text-lg leading-none px-1">✕</button>
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-5">
                <div className="text-center min-w-0">
                  <TeamLogo teamCode={betModal.match.team1Code} teamName={betModal.match.team1} size="lg" className="mx-auto" />
                  <p className="mt-1.5 text-xs font-semibold truncate">{betModal.match.team1}</p>
                </div>
                <span className="font-display text-xl text-pitch-600">VS</span>
                <div className="text-center min-w-0">
                  <TeamLogo teamCode={betModal.match.team2Code} teamName={betModal.match.team2} size="lg" className="mx-auto" />
                  <p className="mt-1.5 text-xs font-semibold truncate">{betModal.match.team2}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="panel px-3 py-2.5">
                  <p className="font-mono text-[9px] text-sage tracking-[0.18em]">PREDICTION</p>
                  <p className="font-bold text-sm mt-0.5 truncate">{betModal.selection===1?`${betModal.match.team1} win`:betModal.selection===2?`${betModal.match.team2} win`:"Draw"}</p>
                </div>
                <div className="panel px-3 py-2.5">
                  <p className="font-mono text-[9px] text-sage tracking-[0.18em]">ODDS</p>
                  <p className="font-mono font-bold text-sm mt-0.5 text-gold">
                    {(betModal.selection===1?betModal.match.oddsTeam1:betModal.selection===2?betModal.match.oddsTeam2:betModal.match.oddsDraw).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between mb-1.5">
                  <span className="font-mono text-[10px] text-chalk tracking-[0.18em]">STAKE</span>
                  <span className="font-mono text-[10px] text-sage tracking-widest">BAL {usdcBalance} USDC</span>
                </div>
                <div className="relative">
                  <input type="number" value={stakeAmount} onChange={e=>setStakeAmount(e.target.value)} min="1" placeholder="5" className="stake-input" />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-sage tracking-widest">USDC</span>
                </div>
                <div className="flex gap-2 mt-2">
                  {[5,10,25,50].map(a=>(
                    <button key={a} onClick={()=>setStakeAmount(String(a))}
                      className="font-mono text-xs font-bold px-3.5 py-1.5 rounded border border-line text-sage hover:text-chalk hover:border-gold/40 transition-colors">
                      {a}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="perf" />
            <div className="p-5 pt-4">
              <div className="flex justify-between items-baseline mb-4">
                <span className="font-mono text-[10px] text-sage tracking-[0.18em]">POTENTIAL PAYOUT</span>
                <span className="font-mono text-2xl font-bold text-gold">
                  {(Number(stakeAmount||0)*(betModal.selection===1?betModal.match.oddsTeam1:betModal.selection===2?betModal.match.oddsTeam2:betModal.match.oddsDraw)).toFixed(2)}
                  <span className="text-[10px] text-sage ml-1">USDC</span>
                </span>
              </div>
              {Number(usdcBalance)<Number(stakeAmount)&&(
                <p className="mb-3 panel px-3 py-2.5 text-livec text-xs font-semibold border-livec/40">
                  Insufficient USDC balance in wallet
                </p>
              )}
              <div className="font-mono text-[10px] text-sage space-y-1 mb-4 tracking-wide">
                <p>✓ USDC moves straight from your wallet to the pool</p>
                <p>✓ GenLayer validators verify the final score</p>
                <p>✓ Winners are paid out from the match pool</p>
              </div>
              <button onClick={placeBet} disabled={loading||Number(usdcBalance)<Number(stakeAmount)||Number(stakeAmount)<1}
                className="btn-gold w-full py-3.5 text-sm">
                {loading?"⏳ Confirming…":"Place Bet"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="relative z-10 max-w-5xl mx-auto px-4 mt-14 pb-6 text-center font-mono text-[10px] text-sage tracking-widest">
        ORACLE BY <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">GENLAYER</a> · USDC ON BASE SEPOLIA ·{" "}
        <a href={`https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-sage hover:text-chalk">
          CONTRACT {shortenAddress(CONTRACT_ADDRESS)}
        </a>
      </footer>
    </div>
  );
}
