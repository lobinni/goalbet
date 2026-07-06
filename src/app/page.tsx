"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GoalBetContract,
  GENLAYER_NETWORK,
  KNOWN_NETWORKS,
  EXPLORER_TX_URL,
  EXPLORER_ADDRESS_URL,
  CONTRACT_ADDRESS,
  FAUCET_URL,
  GENLAYER_STUDIO_URL,
  weiToGEN,
  type Bet,
  type LeaderboardEntry,
  type PlayerStats,
} from "@/lib/genlayer";
import {
  groupMatchesByDate,
  formatDateHeader,
  generateBetId,
  getTimeUntilMatch,
  type Match,
} from "@/lib/matches";
import TeamLogo from "@/components/TeamLogo";
import { getTeamCodeFromName } from "@/lib/team-logos";

// ─── MetaMask Types ───────────────────────────────────────────────

interface EthereumProvider {
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

const shortenAddress = (addr: string) =>
  addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

const sameChain = (a: string | null, b: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const getNetworkLabel = (chainIdHex: string | null): string => {
  if (!chainIdHex) return "Unknown";
  if (sameChain(chainIdHex, GENLAYER_NETWORK.chainIdHex)) return GENLAYER_NETWORK.chainName;
  return KNOWN_NETWORKS[chainIdHex.toLowerCase()] || `Chain ${parseInt(chainIdHex, 16)}`;
};

// Safe window check for SSR
const getEthereum = () => {
  if (typeof window !== "undefined") {
    return window.ethereum;
  }
  return undefined;
};

// ─── Main App ─────────────────────────────────────────────────────

export default function HomePage() {
  // Wallet state
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [contract, setContract] = useState<GoalBetContract | null>(null);

  // Data state
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [myBets, setMyBets] = useState<Record<string, Bet>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [genBalance, setGenBalance] = useState<string>("0");
  const [stakeAmount, setStakeAmount] = useState<string>("10");

  // UI state
  const [activeTab, setActiveTab] = useState<"matches" | "mybets" | "leaderboard">("matches");
  const [betModal, setBetModal] = useState<{ match: Match; selection: string } | null>(null);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
    txHash?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingBet, setResolvingBet] = useState<string | null>(null);
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(true); // assume true for SSR

  // Check for MetaMask on mount
  useEffect(() => {
    setHasMetaMask(!!getEthereum());
  }, []);

  // Fetch real-time matches
  const fetchMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const res = await fetch("/api/fixtures");
      if (res.ok) {
        const data = await res.json();
        if (data.matches && Array.isArray(data.matches)) {
          setMatches(data.matches);
        }
      }
    } catch (error) {
      console.error("Error fetching matches:", error);
    }
    setMatchesLoading(false);
  }, []);

  // Fetch matches on mount and refresh
  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Notification helper
  const showNotification = useCallback(
    (message: string, type: "success" | "error" | "info", txHash?: string) => {
      setNotification({ message, type, txHash });
      setTimeout(() => setNotification(null), 6000);
    },
    []
  );

  // Check if on correct network
  const isCorrectNetwork = sameChain(chainId, GENLAYER_NETWORK.chainIdHex);

  // ─── MetaMask Connection ────────────────────────────────────────

  const connectWallet = async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      showNotification("Please install MetaMask to use GoalBet!", "error");
      return;
    }
    setConnectingWallet(true);
    try {
      const accounts = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        const chain = (await ethereum.request({
          method: "eth_chainId",
        })) as string;
        setChainId(chain);

        const contractInstance = new GoalBetContract(accounts[0]);
        setContract(contractInstance);
        showNotification(`Connected: ${shortenAddress(accounts[0])}`, "success");
      }
    } catch (error) {
      console.error("Wallet connection error:", error);
      showNotification("Failed to connect wallet", "error");
    }
    setConnectingWallet(false);
  };

  const switchToGenLayer = async () => {
    const ethereum = getEthereum();
    if (!ethereum) return;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: GENLAYER_NETWORK.chainIdHex }],
      });
    } catch (switchError: unknown) {
      // Chain not added, try to add it
      if ((switchError as { code: number }).code === 4902) {
        try {
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: GENLAYER_NETWORK.chainIdHex,
                chainName: GENLAYER_NETWORK.chainName,
                rpcUrls: GENLAYER_NETWORK.rpcUrls,
                nativeCurrency: GENLAYER_NETWORK.nativeCurrency,
                blockExplorerUrls: GENLAYER_NETWORK.blockExplorerUrls,
              },
            ],
          });
        } catch {
          showNotification("Failed to add GenLayer network", "error");
        }
      }
    }
  };

  // Listen for account/chain changes
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        setAccount(null);
        setContract(null);
      } else {
        setAccount(accs[0]);
        const contractInstance = new GoalBetContract(accs[0]);
        setContract(contractInstance);
      }
    };

    const handleChainChanged = (chain: unknown) => {
      setChainId(chain as string);
    };

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);

    // Check if already connected
    ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs.length > 0) {
          setAccount(accs[0]);
          const contractInstance = new GoalBetContract(accs[0]);
          setContract(contractInstance);
        }
      })
      .catch(console.error);

    ethereum
      .request({ method: "eth_chainId" })
      .then((chain) => setChainId(chain as string))
      .catch(console.error);

    return () => {
      const eth = getEthereum();
      eth?.removeListener("accountsChanged", handleAccountsChanged);
      eth?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  // ─── Data Fetching ──────────────────────────────────────────────

  const fetchBets = useCallback(async () => {
    if (!contract || !isCorrectNetwork) return;
    try {
      const bets = await contract.getBets();
      setMyBets(bets);
    } catch (error) {
      console.error("Error fetching bets:", error);
    }
  }, [contract, isCorrectNetwork]);

  const fetchLeaderboard = useCallback(async () => {
    if (!contract) return;
    try {
      const entries = await contract.getLeaderboard();
      setLeaderboard(entries);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
  }, [contract]);

  const fetchMyStats = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const stats = await contract.getPlayerStats(account);
      setMyStats(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, [contract, account]);

  // Fetch GEN balance from wallet
  const fetchGenBalance = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum || !account || !isCorrectNetwork) return;
    try {
      const balance = await ethereum.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      }) as string;
      // Convert from wei to GEN (18 decimals)
      const balanceInGEN = parseInt(balance, 16) / 1e18;
      setGenBalance(balanceInGEN.toFixed(4));
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  }, [account, isCorrectNetwork]);

  useEffect(() => {
    if (contract && isCorrectNetwork) {
      fetchBets();
      fetchLeaderboard();
      fetchMyStats();
      fetchGenBalance();
    }
  }, [contract, isCorrectNetwork, fetchBets, fetchLeaderboard, fetchMyStats, fetchGenBalance]);

  // Refresh balance periodically
  useEffect(() => {
    if (!isCorrectNetwork || !account) return;
    const interval = setInterval(fetchGenBalance, 10000);
    return () => clearInterval(interval);
  }, [isCorrectNetwork, account, fetchGenBalance]);

  // ─── Actions ────────────────────────────────────────────────────

  const handlePlaceBet = async () => {
    if (!betModal || !contract || !isCorrectNetwork) return;
    
    const stake = Number(stakeAmount);
    if (isNaN(stake) || stake < 1) {
      showNotification("Minimum stake is 1 GEN", "error");
      return;
    }
    if (stake > Number(genBalance)) {
      showNotification("Insufficient GEN balance. Get more from faucet!", "error");
      return;
    }
    
    setLoading(true);
    try {
      const { match, selection } = betModal;
      const predictedWinner =
        selection === "team1" ? "1" : selection === "team2" ? "2" : "0";
      
      // Get odds and multiply by 100 for contract
      const odds = selection === "team1" 
        ? match.oddsTeam1 
        : selection === "team2" 
          ? match.oddsTeam2 
          : match.oddsDraw;
      const oddsMultiplied = Math.round(odds * 100);

      const { txHash } = await contract.createBet(
        match.gameDate,
        match.team1,
        match.team2,
        predictedWinner,
        stake,
        oddsMultiplied
      );

      showNotification(`Bet ${stake} GEN placed on-chain! 🎯`, "success", txHash);
      setBetModal(null);
      setStakeAmount("10");
      // Refresh balance and bets
      await Promise.all([fetchBets(), fetchGenBalance()]);
    } catch (error: unknown) {
      const errMsg = (error as Error).message || "Transaction failed";
      if (errMsg.includes("already exists")) {
        showNotification("You already have a bet on this match", "error");
      } else if (errMsg.includes("Minimum stake")) {
        showNotification("Minimum stake is 1 GEN", "error");
      } else if (errMsg.includes("insufficient") || errMsg.includes("balance")) {
        showNotification("Insufficient GEN balance", "error");
      } else {
        showNotification(errMsg.slice(0, 100), "error");
      }
    }
    setLoading(false);
  };

  const handleResolveBet = async (betId: string) => {
    if (!contract || !isCorrectNetwork) return;
    setResolvingBet(betId);
    try {
      const { txHash } = await contract.resolveBet(betId);
      showNotification("Bet resolved via AI Oracle! 🤖", "success", txHash);
      await Promise.all([fetchBets(), fetchMyStats(), fetchLeaderboard(), fetchGenBalance()]);
    } catch (error: unknown) {
      const errMsg = (error as Error).message || "Resolution failed";
      if (errMsg.includes("not finished")) {
        showNotification("Match has not finished yet", "error");
      } else if (errMsg.includes("already resolved")) {
        showNotification("Bet already resolved", "error");
      } else {
        showNotification(errMsg.slice(0, 100), "error");
      }
    }
    setResolvingBet(null);
  };

  // Check if user has bet on a match
  const hasBetOnMatch = (match: Match): boolean => {
    const betId = generateBetId(match.gameDate, match.team1, match.team2);
    return betId in myBets;
  };

  // Group matches by date
  const matchesByDate = groupMatchesByDate(matches);

  // ─── NOT CONNECTED SCREEN ───────────────────────────────────────

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 w-full max-w-md animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">⚽</div>
            <h1 className="text-3xl font-black gradient-text">GoalBet</h1>
            <p className="text-sm text-slate-400 mt-2">
              On-Chain Football Predictions
            </p>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent mb-8" />

          <div className="space-y-4">
            <div className="text-center space-y-2 mb-6">
              <p className="text-sm text-slate-300">
                Bet GEN tokens on real football matches
              </p>
              <p className="text-xs text-slate-500">
                Powered by GenLayer AI Consensus
              </p>
            </div>

            <button
              onClick={connectWallet}
              disabled={connectingWallet}
              className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-primary to-purple-500 hover:from-primary-dark hover:to-purple-600 disabled:opacity-50 transition-all duration-300 shadow-lg shadow-primary/25 flex items-center justify-center gap-3"
            >
              {connectingWallet ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <span className="text-xl">🦊</span>
                  Connect MetaMask
                </>
              )}
            </button>

            {!hasMetaMask && (
              <p className="text-xs text-center text-danger">
                MetaMask not detected. Please install it to continue.
              </p>
            )}
          </div>

          {/* Faucet Info */}
          <div className="mt-6 p-4 rounded-xl bg-accent/10 border border-accent/20">
            <p className="text-xs text-center text-slate-300 mb-2">
              💰 Need GEN tokens to bet?
            </p>
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2 rounded-lg bg-accent/20 text-accent text-sm font-semibold text-center hover:bg-accent/30 transition-colors"
            >
              Get Free GEN from Faucet →
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center gap-4 text-xs">
            <a
              href={`${EXPLORER_ADDRESS_URL}${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Contract
            </a>
            <span className="text-slate-600">•</span>
            <a
              href={GENLAYER_STUDIO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              GenLayer Studio
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── WRONG NETWORK BANNER ───────────────────────────────────────

  const wrongNetworkBanner = !isCorrectNetwork && (
    <div className="bg-warning/20 border-b border-warning/30 px-4 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-warning">⚠️</span>
          <span className="text-warning">
            Wrong network: <strong>{getNetworkLabel(chainId)}</strong>
          </span>
        </div>
        <button
          onClick={switchToGenLayer}
          className="px-4 py-1.5 rounded-lg bg-warning text-black text-sm font-semibold hover:bg-warning/80 transition-colors"
        >
          Switch to GenLayer StudioNet
        </button>
      </div>
    </div>
  );

  // ─── MAIN APP ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-2xl animate-slide-up max-w-sm ${
            notification.type === "success"
              ? "bg-accent/90 text-white"
              : notification.type === "error"
                ? "bg-danger/90 text-white"
                : "bg-primary/90 text-white"
          }`}
        >
          <p>{notification.message}</p>
          {notification.txHash && (
            <a
              href={`${EXPLORER_TX_URL}${notification.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline opacity-80 hover:opacity-100 mt-1 block"
            >
              View Transaction →
            </a>
          )}
        </div>
      )}

      {/* Wrong Network Banner */}
      {wrongNetworkBanner}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-surface-lighter/50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <h1 className="text-xl font-black gradient-text hidden sm:block">GoalBet</h1>
            {isCorrectNetwork && (
              <span className="hidden md:inline-block px-2 py-0.5 rounded-full text-xs bg-accent/20 text-accent">
                StudioNet
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* GEN Balance */}
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card px-3 sm:px-4 py-2 flex items-center gap-2 hover:border-accent/50 transition-colors group"
              title="Click to get more GEN from faucet"
            >
              <span className="text-accent font-bold">{genBalance}</span>
              <span className="text-xs text-slate-400">GEN</span>
              <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                +
              </span>
            </a>
            {/* Total Won */}
            {myStats && myStats.total_won > 0 && (
              <div className="glass-card px-3 sm:px-4 py-2 flex items-center gap-2" title="Total GEN Won">
                <span className="text-gold font-bold">+{weiToGEN(myStats.total_won).toFixed(1)}</span>
                <span className="text-xs text-slate-400">won</span>
              </div>
            )}
            {/* Win Rate */}
            {myStats && myStats.total_bets > 0 && (
              <div className="glass-card px-3 sm:px-4 py-2 flex items-center gap-2" title="Win Rate">
                <span className={`font-bold ${myStats.wins > myStats.losses ? 'text-accent' : 'text-danger'}`}>
                  {myStats.wins}W/{myStats.losses}L
                </span>
              </div>
            )}
            {/* Wallet */}
            <div className="glass-card px-3 sm:px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-sm font-mono">{shortenAddress(account)}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2">
          {(["matches", "mybets", "leaderboard"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                activeTab === tab ? "tab-active" : "tab-inactive"
              }`}
            >
              {tab === "matches" && "⚽ Matches"}
              {tab === "mybets" && `🎯 My Bets (${Object.keys(myBets).length})`}
              {tab === "leaderboard" && "🏆 Leaderboard"}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 pb-12">
        {/* ── MATCHES TAB ──────────────────────────────────── */}
        {activeTab === "matches" && (
          <div className="animate-fade-in space-y-8">
            {/* Refresh button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-400">
                {matches.length} upcoming matches
              </p>
              <button
                onClick={fetchMatches}
                disabled={matchesLoading}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-light hover:bg-surface-lighter border border-surface-lighter hover:border-primary/30 transition-all disabled:opacity-50"
              >
                {matchesLoading ? (
                  <>
                    <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    🔄 Refresh
                  </>
                )}
              </button>
            </div>

            {matchesLoading && matches.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Loading live fixtures...</p>
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <div className="text-4xl mb-4">⚽</div>
                <p>No upcoming matches</p>
                <p className="text-sm mt-1">Check back later!</p>
              </div>
            ) : (
              Object.entries(matchesByDate).map(([date, dateMatches]) => (
                <div key={date}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent" />
                    <span className="text-sm font-semibold text-primary">
                      {formatDateHeader(date)}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-l from-primary/50 to-transparent" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {dateMatches.map((match) => {
                      const betPlaced = hasBetOnMatch(match);
                      const timeUntil = getTimeUntilMatch(match.kickoffTime);
                      const isLive = timeUntil === "LIVE";
                      
                      return (
                        <div
                          key={match.id}
                          className={`glass-card p-5 transition-all duration-300 hover:scale-[1.02] ${
                            isLive ? "border-accent/50 animate-pulse-glow" : ""
                          }`}
                        >
                          {/* League + time */}
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs text-slate-500 truncate pr-2">
                              {match.league}
                            </span>
                            <div className="flex items-center gap-2">
                              {isLive && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent text-white animate-pulse">
                                  LIVE
                                </span>
                              )}
                              {!isLive && timeUntil && (
                                <span className="text-xs text-warning font-medium">
                                  {timeUntil}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Teams */}
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex flex-col items-center flex-1">
                              <TeamLogo teamCode={match.team1Code} teamName={match.team1} size="md" className="mb-1" />
                            <span className="text-xs font-semibold text-center leading-tight">
                              {match.team1}
                            </span>
                          </div>

                            <div className="flex flex-col items-center px-3">
                              {match.score ? (
                                <div className="text-xl font-black text-white">{match.score}</div>
                              ) : (
                                <div className="text-xl font-bold text-slate-500">VS</div>
                              )}
                            </div>

                            <div className="flex flex-col items-center flex-1">
                              <TeamLogo teamCode={match.team2Code} teamName={match.team2} size="md" className="mb-1" />
                              <span className="text-xs font-semibold text-center leading-tight">
                                {match.team2}
                              </span>
                            </div>
                          </div>

                        {/* Odds */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <button
                            onClick={() =>
                              isCorrectNetwork &&
                              !betPlaced &&
                              setBetModal({ match, selection: "team1" })
                            }
                            disabled={!isCorrectNetwork || betPlaced}
                            className="py-2.5 rounded-lg text-center bg-surface-light hover:bg-primary/20 border border-transparent hover:border-primary/40 transition-all disabled:opacity-40 disabled:hover:bg-surface-light disabled:hover:border-transparent"
                          >
                            <div className="text-xs text-slate-400">1</div>
                            <div className="text-sm font-bold text-white">
                              {match.oddsTeam1.toFixed(2)}
                            </div>
                          </button>
                          <button
                            onClick={() =>
                              isCorrectNetwork &&
                              !betPlaced &&
                              setBetModal({ match, selection: "draw" })
                            }
                            disabled={!isCorrectNetwork || betPlaced}
                            className="py-2.5 rounded-lg text-center bg-surface-light hover:bg-warning/20 border border-transparent hover:border-warning/40 transition-all disabled:opacity-40 disabled:hover:bg-surface-light disabled:hover:border-transparent"
                          >
                            <div className="text-xs text-slate-400">X</div>
                            <div className="text-sm font-bold text-white">
                              {match.oddsDraw.toFixed(2)}
                            </div>
                          </button>
                          <button
                            onClick={() =>
                              isCorrectNetwork &&
                              !betPlaced &&
                              setBetModal({ match, selection: "team2" })
                            }
                            disabled={!isCorrectNetwork || betPlaced}
                            className="py-2.5 rounded-lg text-center bg-surface-light hover:bg-accent/20 border border-transparent hover:border-accent/40 transition-all disabled:opacity-40 disabled:hover:bg-surface-light disabled:hover:border-transparent"
                          >
                            <div className="text-xs text-slate-400">2</div>
                            <div className="text-sm font-bold text-white">
                              {match.oddsTeam2.toFixed(2)}
                            </div>
                          </button>
                        </div>

                        {betPlaced && (
                          <p className="text-xs text-center text-accent">✅ Bet placed on-chain</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
            )}
          </div>
        )}

        {/* ── MY BETS TAB ──────────────────────────────────── */}
        {activeTab === "mybets" && (
          <div className="animate-fade-in space-y-4">
            {Object.keys(myBets).length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <div className="text-4xl mb-4">🎯</div>
                <p>No bets placed yet</p>
                <p className="text-sm mt-1">Go to Matches to start betting!</p>
              </div>
            ) : (
              Object.entries(myBets).map(([betId, bet]) => {
                // Convert wei to GEN
                const stakeGEN = bet.stake ? Number(bet.stake) / 1e18 : 0;
                const payoutGEN = bet.payout ? Number(bet.payout) / 1e18 : 0;
                const oddsValue = bet.odds ? Number(bet.odds) / 100 : 0;
                const team1Code = getTeamCodeFromName(bet.team1);
                const team2Code = getTeamCodeFromName(bet.team2);
                
                return (
                  <div key={betId} className="glass-card p-5 animate-slide-up">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      {/* Match info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-1 shrink-0">
                          <TeamLogo teamCode={team1Code} teamName={bet.team1} size="sm" />
                          <span className="text-xs text-slate-500">vs</span>
                          <TeamLogo teamCode={team2Code} teamName={bet.team2} size="sm" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            {bet.team1} vs {bet.team2}
                          </div>
                          <div className="text-xs text-slate-400">{bet.game_date}</div>
                        </div>
                      </div>

                      {/* Prediction */}
                      <div className="text-center">
                        <div className="text-xs text-slate-400">Prediction</div>
                        <div className="text-sm font-bold text-primary">
                          {bet.predicted_winner === "1"
                            ? bet.team1
                            : bet.predicted_winner === "2"
                              ? bet.team2
                              : "Draw"}
                        </div>
                      </div>

                      {/* Stake */}
                      {stakeGEN > 0 && (
                        <div className="text-center">
                          <div className="text-xs text-slate-400">Stake</div>
                          <div className="text-sm font-bold text-white">
                            {stakeGEN.toFixed(2)} GEN
                          </div>
                          {oddsValue > 0 && (
                            <div className="text-xs text-warning">{oddsValue.toFixed(2)}x</div>
                          )}
                        </div>
                      )}

                      {/* Potential/Actual Payout */}
                      {payoutGEN > 0 && (
                        <div className="text-center">
                          <div className="text-xs text-slate-400">
                            {bet.has_resolved && bet.real_winner === bet.predicted_winner 
                              ? "Won" 
                              : "Potential"}
                          </div>
                          <div className={`text-sm font-bold ${
                            bet.has_resolved && bet.real_winner === bet.predicted_winner
                              ? "text-accent"
                              : "text-slate-300"
                          }`}>
                            {payoutGEN.toFixed(2)} GEN
                          </div>
                        </div>
                      )}

                      {/* Status */}
                      <div className="text-center">
                        {!bet.has_resolved ? (
                          <button
                            onClick={() => handleResolveBet(betId)}
                            disabled={resolvingBet === betId}
                            className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 transition-all disabled:opacity-50"
                          >
                            {resolvingBet === betId ? (
                              <span className="flex items-center gap-2">
                                <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                AI Resolving...
                              </span>
                            ) : (
                              "🤖 Resolve with AI"
                            )}
                          </button>
                        ) : bet.real_winner === bet.predicted_winner ? (
                          <div>
                            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-accent/20 text-accent">
                              🎉 Won
                            </span>
                            <div className="text-xs text-accent mt-1">+1 point</div>
                          </div>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-danger/20 text-danger">
                            ❌ Lost
                          </span>
                        )}
                      </div>

                      {/* Score if resolved */}
                      {bet.has_resolved && bet.real_score && (
                        <div className="text-center">
                          <div className="text-xs text-slate-400">Final Score</div>
                          <div className="text-lg font-black">{bet.real_score}</div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── LEADERBOARD TAB ──────────────────────────────── */}
        {activeTab === "leaderboard" && (
          <div className="animate-fade-in">
            <div className="glass-card overflow-hidden">
              <div className="p-5 border-b border-surface-lighter">
                <h2 className="text-lg font-bold gradient-text">🏆 Top Winners</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Ranked by total GEN won from correct predictions
                </p>
              </div>

              {/* Column Headers */}
              <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-surface-light/50 text-xs text-slate-500 font-medium">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Player</div>
                <div className="col-span-2 text-right">Won</div>
                <div className="col-span-2 text-right">Staked</div>
                <div className="col-span-2 text-right">Profit</div>
                <div className="col-span-1 text-right">W/L</div>
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <div className="text-4xl mb-4">🏆</div>
                  <p>No bets placed yet</p>
                  <p className="text-sm mt-1">Be the first to win!</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-lighter/50">
                  {leaderboard.map((entry, index) => {
                    const totalWonGEN = weiToGEN(entry.total_won);
                    const totalStakedGEN = weiToGEN(entry.total_staked);
                    const netProfitGEN = weiToGEN(entry.profit);
                    
                    return (
                      <div
                        key={entry.address}
                        className={`grid grid-cols-12 gap-2 px-5 py-4 items-center transition-colors hover:bg-surface-light/50 ${
                          entry.address.toLowerCase() === account?.toLowerCase()
                            ? "bg-primary/5"
                            : ""
                        }`}
                      >
                        {/* Rank */}
                        <div className="col-span-1 text-center">
                          {index === 0 ? (
                            <span className="text-xl">🥇</span>
                          ) : index === 1 ? (
                            <span className="text-xl">🥈</span>
                          ) : index === 2 ? (
                            <span className="text-xl">🥉</span>
                          ) : (
                            <span className="text-sm font-bold text-slate-500">#{index + 1}</span>
                          )}
                        </div>

                        {/* Address */}
                        <div className="col-span-4 min-w-0">
                          <a
                            href={`${EXPLORER_ADDRESS_URL}${entry.address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm hover:text-primary transition-colors truncate block"
                          >
                            {shortenAddress(entry.address)}
                            {entry.address.toLowerCase() === account?.toLowerCase() && (
                              <span className="ml-1 text-xs text-primary">(You)</span>
                            )}
                          </a>
                        </div>

                        {/* Total Won */}
                        <div className="col-span-2 text-right">
                          <span className="text-sm font-bold text-gold">
                            {totalWonGEN.toFixed(1)}
                          </span>
                          <span className="text-xs text-slate-500 ml-1">GEN</span>
                        </div>

                        {/* Total Staked */}
                        <div className="col-span-2 text-right">
                          <span className="text-sm text-slate-400">
                            {totalStakedGEN.toFixed(1)}
                          </span>
                        </div>

                        {/* Net Profit */}
                        <div className="col-span-2 text-right">
                          <span className={`text-sm font-bold ${netProfitGEN >= 0 ? 'text-accent' : 'text-danger'}`}>
                            {netProfitGEN >= 0 ? '+' : ''}{netProfitGEN.toFixed(1)}
                          </span>
                        </div>

                        {/* Win/Loss */}
                        <div className="col-span-1 text-right">
                          <span className="text-xs">
                            <span className="text-accent">{entry.wins}</span>
                            <span className="text-slate-600">/</span>
                            <span className="text-danger">{entry.losses}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── BET MODAL ──────────────────────────────────────── */}
      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card w-full max-w-md p-6 animate-slide-up gradient-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold">Place Your Bet</h3>
              <button
                onClick={() => setBetModal(null)}
                className="w-8 h-8 rounded-full bg-surface-light flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Match */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-center">
                <TeamLogo teamCode={betModal.match.team1Code} teamName={betModal.match.team1} size="lg" />
                <div className="text-sm font-semibold mt-1">{betModal.match.team1}</div>
              </div>
              <span className="text-lg font-bold text-slate-500">VS</span>
              <div className="text-center">
                <TeamLogo teamCode={betModal.match.team2Code} teamName={betModal.match.team2} size="lg" />
                <div className="text-sm font-semibold mt-1">{betModal.match.team2}</div>
              </div>
            </div>

            {/* Selection & Odds */}
            <div className="bg-surface-light rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Your Prediction</div>
                  <div className="text-lg font-bold text-primary">
                    {betModal.selection === "team1"
                      ? `${betModal.match.team1} Win`
                      : betModal.selection === "team2"
                        ? `${betModal.match.team2} Win`
                        : "Draw"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400 mb-1">Odds</div>
                  <div className="text-lg font-bold text-warning">
                    {betModal.selection === "team1"
                      ? betModal.match.oddsTeam1.toFixed(2)
                      : betModal.selection === "team2"
                        ? betModal.match.oddsTeam2.toFixed(2)
                        : betModal.match.oddsDraw.toFixed(2)}x
                  </div>
                </div>
              </div>
            </div>

            {/* Stake Amount */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">Stake Amount</label>
                <span className="text-xs text-slate-500">
                  Balance: <span className="text-accent">{genBalance} GEN</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-light border border-surface-lighter text-white text-lg font-bold focus:outline-none focus:border-primary transition-colors pr-16"
                  placeholder="10"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  GEN
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setStakeAmount(String(amount))}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      stakeAmount === String(amount)
                        ? "bg-primary/30 text-primary border border-primary/50"
                        : "bg-surface-light hover:bg-primary/20 border border-surface-lighter hover:border-primary/40"
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            {/* Potential Payout */}
            <div className="bg-accent/10 rounded-xl p-4 mb-4 border border-accent/20">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Potential Payout</span>
                <span className="text-xl font-black text-accent">
                  {(
                    Number(stakeAmount || 0) *
                    (betModal.selection === "team1"
                      ? betModal.match.oddsTeam1
                      : betModal.selection === "team2"
                        ? betModal.match.oddsTeam2
                        : betModal.match.oddsDraw)
                  ).toFixed(2)}{" "}
                  GEN
                </span>
              </div>
            </div>

            {/* Low balance warning */}
            {Number(genBalance) < Number(stakeAmount) && (
              <div className="bg-warning/10 rounded-xl p-3 mb-4 border border-warning/20">
                <p className="text-xs text-warning text-center">
                  ⚠️ Insufficient balance.{" "}
                  <a
                    href={FAUCET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:no-underline"
                  >
                    Get GEN from Faucet
                  </a>
                </p>
              </div>
            )}

            {/* Info */}
            <div className="bg-surface-light/50 rounded-xl p-3 mb-5">
              <ul className="text-xs text-slate-400 space-y-1">
                <li>✓ Bet recorded on GenLayer blockchain</li>
                <li>✓ AI Oracle verifies result from BBC Sport</li>
                <li>✓ Win = Stake × Odds + 1 point</li>
              </ul>
            </div>

            <button
              onClick={handlePlaceBet}
              disabled={loading || Number(stakeAmount) <= 0}
              className="w-full py-3.5 rounded-xl font-bold text-white bg-gradient-to-r from-primary to-purple-500 hover:from-primary-dark hover:to-purple-600 disabled:opacity-50 transition-all duration-300 shadow-lg shadow-primary/25"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing Transaction...
                </span>
              ) : (
                `🎯 Bet ${stakeAmount || 0} GEN`
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-surface-lighter/50 py-8 text-center">
        <div className="text-2xl mb-2">⚽</div>
        <p className="gradient-text font-bold">GoalBet</p>
        <p className="text-xs text-slate-500 mt-1">
          On-Chain Football Predictions — Powered by GenLayer AI Oracle
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline font-semibold"
          >
            💰 Get GEN Tokens
          </a>
          <span className="text-slate-600">•</span>
          <a
            href={`${EXPLORER_ADDRESS_URL}${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            Contract
          </a>
          <span className="text-slate-600">•</span>
          <a
            href={GENLAYER_STUDIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline"
          >
            GenLayer Studio
          </a>
        </div>
        <p className="text-xs text-slate-600 mt-4">© 2026 GoalBet. All rights reserved.</p>
      </footer>
    </div>
  );
}
