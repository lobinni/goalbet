"use client";

import { useState, useEffect, useCallback } from "react";
import TeamLogo from "@/components/TeamLogo";
import {
  type Match,
  groupMatchesByDate,
  generateBetId,
  formatDateHeader,
  getTimeUntilMatch,
  shortenAddress,
} from "@/lib/matches";
import { getTeamCodeFromName } from "@/lib/team-logos";
import {
  GoalBetContract,
  getEthereum,
  sameChain,
  getNetworkLabel,
  GENLAYER_NETWORK,
  EXPLORER_TX_URL,
  FAUCET_URL,
  CONTRACT_ADDRESS,
  weiToGEN,
  type Bet,
  type LeaderboardEntry,
  type PlayerStats,
  type PoolInfo,
} from "@/lib/genlayer";

// ─── Component ──────────────────────────────────────────────────

export default function GoalBetApp() {
  // Auth state
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [contract, setContract] = useState<GoalBetContract | null>(null);
  const [hasMetaMask, setHasMetaMask] = useState(true);
  const [connectingWallet, setConnectingWallet] = useState(false);

  // Data state
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [myBets, setMyBets] = useState<Record<string, Bet>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [genBalance, setGenBalance] = useState("0");
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [stakeAmount, setStakeAmount] = useState("10");

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
  const [claimingBet, setClaimingBet] = useState<string | null>(null);
  const [betsLoading, setBetsLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Check for MetaMask on mount
  useEffect(() => {
    setHasMetaMask(!!getEthereum());
  }, []);

  const isCorrectNetwork = sameChain(chainId, GENLAYER_NETWORK.chainIdHex);

  // ─── Notifications ─────────────────────────────────────────

  const showNotification = useCallback(
    (message: string, type: "success" | "error" | "info", txHash?: string) => {
      setNotification({ message, type, txHash });
      setTimeout(() => setNotification(null), 6000);
    },
    []
  );

  // ─── Fetch Matches ─────────────────────────────────────────

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

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // ─── MetaMask Connection ────────────────────────────────────

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

        const contractInstance = new GoalBetContract(accounts[0], ethereum);
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
        const contractInstance = new GoalBetContract(accs[0], ethereum);
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
          const contractInstance = new GoalBetContract(accs[0], ethereum);
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

  // ─── Data Fetching ─────────────────────────────────────────

  const fetchBets = useCallback(async () => {
    if (!contract || !isCorrectNetwork) return;
    setBetsLoading(true);
    try {
      const bets = await contract.getBets();
      setMyBets(bets);
    } catch (error) {
      console.error("Error fetching bets:", error);
    }
    setBetsLoading(false);
  }, [contract, isCorrectNetwork]);

  const fetchLeaderboard = useCallback(async () => {
    if (!contract || !isCorrectNetwork) return;
    setLeaderboardLoading(true);
    try {
      const entries = await contract.getLeaderboard();
      setLeaderboard(entries);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    }
    setLeaderboardLoading(false);
  }, [contract, isCorrectNetwork]);

  const fetchMyStats = useCallback(async () => {
    if (!contract || !account || !isCorrectNetwork) return;
    try {
      const stats = await contract.getPlayerStats(account);
      setMyStats(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }, [contract, account, isCorrectNetwork]);

  const fetchGenBalance = useCallback(async () => {
    const ethereum = getEthereum();
    if (!ethereum || !account || !isCorrectNetwork) return;
    try {
      const balance = (await ethereum.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      })) as string;
      const balanceInGEN = parseInt(balance, 16) / 1e18;
      setGenBalance(balanceInGEN.toFixed(4));
    } catch (error) {
      console.error("Error fetching balance:", error);
    }
  }, [account, isCorrectNetwork]);

  const fetchPoolInfo = useCallback(async () => {
    try {
      // Prefer server API (works without MetaMask / contract)
      const res = await fetch("/api/pool");
      if (res.ok) {
        const data = await res.json();
        setPoolInfo({
          total_pool: data.poolBalance,
          total_pending_payouts: data.pendingPayouts,
          available_liquidity: data.availableLiquidity,
        });
        return;
      }
    } catch {
      // fall through
    }
    // Fallback: try on-chain contract if available
    if (!contract || !isCorrectNetwork) return;
    try {
      const info = await contract.getPoolInfo();
      setPoolInfo(info);
    } catch (error) {
      console.error("Error fetching pool info:", error);
    }
  }, [contract, isCorrectNetwork]);

  // Initial data load
  useEffect(() => {
    if (contract && isCorrectNetwork) {
      fetchGenBalance();
      fetchBets();
      fetchLeaderboard();
      fetchMyStats();
      fetchPoolInfo();
    }
  }, [contract, isCorrectNetwork, fetchGenBalance, fetchBets, fetchLeaderboard, fetchMyStats, fetchPoolInfo]);

  // Refresh when tab changes
  useEffect(() => {
    if (!contract || !isCorrectNetwork) return;
    if (activeTab === "mybets") {
      fetchBets();
      fetchMyStats();
    } else if (activeTab === "leaderboard") {
      fetchLeaderboard();
    }
  }, [activeTab, contract, isCorrectNetwork, fetchBets, fetchMyStats, fetchLeaderboard]);

  // Refresh balance periodically
  useEffect(() => {
    if (!isCorrectNetwork || !account) return;
    const interval = setInterval(fetchGenBalance, 10000);
    return () => clearInterval(interval);
  }, [isCorrectNetwork, account, fetchGenBalance]);

  // ─── Actions ───────────────────────────────────────────────

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

      const odds =
        selection === "team1"
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
      await Promise.all([fetchBets(), fetchGenBalance(), fetchLeaderboard(), fetchMyStats(), fetchPoolInfo()]);
      setActiveTab("mybets");
    } catch (error: unknown) {
      const errMsg = (error as Error).message || "Transaction failed";
      if (errMsg.includes("already exists")) {
        showNotification("You already have a bet on this match", "error");
      } else if (errMsg.includes("Insufficient pool liquidity")) {
        showNotification("Pool has insufficient liquidity for this bet. Wait for more deposits.", "error");
      } else if (errMsg.includes("Minimum stake")) {
        showNotification("Minimum stake is 1 GEN", "error");
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
      await Promise.all([fetchBets(), fetchMyStats(), fetchLeaderboard(), fetchGenBalance(), fetchPoolInfo()]);
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

  const handleClaimWinnings = async (betId: string) => {
    if (!contract || !isCorrectNetwork) return;
    setClaimingBet(betId);
    try {
      const { txHash } = await contract.claimWinnings(betId);
      showNotification("🎉 Winnings claimed! GEN transferred to your wallet!", "success", txHash);
      await Promise.all([fetchBets(), fetchMyStats(), fetchLeaderboard(), fetchGenBalance(), fetchPoolInfo()]);
    } catch (error: unknown) {
      const errMsg = (error as Error).message || "Claim failed";
      if (errMsg.includes("already claimed")) {
        showNotification("Winnings already claimed", "error");
      } else if (errMsg.includes("not won")) {
        showNotification("Bet was not won, nothing to claim", "error");
      } else if (errMsg.includes("not been resolved")) {
        showNotification("Resolve the bet first before claiming", "error");
      } else {
        showNotification(errMsg.slice(0, 100), "error");
      }
    }
    setClaimingBet(null);
  };

  // Check if user has bet on a match
  const hasBetOnMatch = (match: Match): boolean => {
    const betId = generateBetId(match.gameDate, match.team1, match.team2);
    return betId in myBets;
  };

  // Group matches by date
  const matchesByDate = groupMatchesByDate(matches);

  // ─── NOT CONNECTED SCREEN ───────────────────────────────────

  if (!account) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-lg animate-fade-in">
          <div className="mb-8">
            <div className="text-6xl mb-4">⚽</div>
            <h1 className="text-5xl font-bold gradient-text mb-2">GoalBet</h1>
            <p className="text-silver text-lg">On-Chain Football Predictions</p>
          </div>

          <div className="glass-card p-8 mb-6">
            <p className="text-lg mb-2">💰 Bet GEN tokens on real football matches</p>
            <p className="text-silver mb-2">🤖 Powered by GenLayer AI Consensus</p>
            <p className="text-silver">🏦 Solvent pool with funded payouts</p>
          </div>

          <button
            onClick={connectWallet}
            disabled={connectingWallet}
            className="px-8 py-4 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white text-lg font-bold hover:opacity-90 transition-all animate-pulse-glow disabled:opacity-50"
          >
            {connectingWallet ? "Connecting..." : "🦊 Connect MetaMask"}
          </button>

          {!hasMetaMask && (
            <p className="mt-4 text-sm text-danger">
              MetaMask not detected. Please install it to continue.
            </p>
          )}

          <p className="mt-4 text-sm text-silver">
            Get GEN from{" "}
            <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              GenLayer Faucet
            </a>
          </p>
        </div>
      </div>
    );
  }

  // ─── WRONG NETWORK BANNER ───────────────────────────────────

  const wrongNetworkBanner = !isCorrectNetwork && (
    <div className="bg-warning/20 border border-warning text-warning px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span>⚠️</span>
        <span>Wrong network: {getNetworkLabel(chainId)}</span>
      </div>
      <button onClick={switchToGenLayer} className="px-4 py-1.5 rounded-lg bg-warning text-black text-sm font-bold hover:opacity-90">
        Switch to GenLayer
      </button>
    </div>
  );

  // ─── MAIN APP ────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-20">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg animate-slide-up max-w-sm ${
            notification.type === "success"
              ? "bg-accent/20 border border-accent text-accent"
              : notification.type === "error"
                ? "bg-danger/20 border border-danger text-danger"
                : "bg-primary/20 border border-primary text-primary"
          }`}
        >
          <div>{notification.message}</div>
          {notification.txHash && (
            <a
              href={`${EXPLORER_TX_URL}${notification.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-1 block"
            >
              View on Explorer →
            </a>
          )}
        </div>
      )}

      {/* Wrong Network Banner */}
      {wrongNetworkBanner}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-xl border-b border-surface-lighter">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gradient-text">GoalBet</span>
            {isCorrectNetwork && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                StudioNet
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Pool Info */}
            {poolInfo && isCorrectNetwork && (
              <div className="hidden sm:flex items-center gap-1 bg-surface-light rounded-lg px-3 py-1.5">
                <span className="text-xs text-silver">Pool:</span>
                <span className="text-sm font-bold text-warning">
                  {weiToGEN(poolInfo.available_liquidity).toFixed(1)}
                </span>
                <span className="text-xs text-silver">GEN</span>
              </div>
            )}
            {/* GEN Balance */}
            <div className="flex items-center gap-1.5 bg-surface-light rounded-lg px-3 py-1.5">
              <span className="text-lg font-bold text-accent">{genBalance}</span>
              <span className="text-xs text-silver">GEN</span>
              <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-white ml-1" title="Get GEN from faucet">
                +
              </a>
            </div>
            {/* Total Won */}
            {myStats && myStats.total_won > 0 && (
              <div className="hidden sm:flex items-center gap-1 text-accent text-sm">
                +{weiToGEN(myStats.total_won).toFixed(1)} won
              </div>
            )}
            {/* Win Rate */}
            {myStats && myStats.total_bets > 0 && (
              <div className="hidden sm:flex items-center gap-1 text-sm">
                <span className={myStats.wins > myStats.losses ? "text-accent" : "text-danger"}>
                  {myStats.wins}W/{myStats.losses}L
                </span>
              </div>
            )}
            {/* Wallet */}
            <a
              href={`https://explorer-studio.genlayer.com/address/${account}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-surface-light rounded-lg px-3 py-1.5 hover:border-primary border border-transparent transition-colors"
            >
              <span className="text-xs text-silver">{shortenAddress(account)}</span>
            </a>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-5xl mx-auto px-4 mt-4">
        <div className="flex gap-2">
          {(["matches", "mybets", "leaderboard"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab ? "tab-active" : "tab-inactive"
              }`}
            >
              {tab === "matches"
                ? "⚽ Matches"
                : tab === "mybets"
                  ? "🎯 My Bets"
                  : "🏆 Leaderboard"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 mt-6">
        {/* ── MATCHES TAB ──────────────────────────────────── */}
        {activeTab === "matches" && (
          <div>
            {/* Pool & refresh bar */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-silver text-sm">
                {matches.length} upcoming matches
                {poolInfo && isCorrectNetwork && (
                  <span className="ml-2">
                    • Pool liquidity: <span className="text-warning">{weiToGEN(poolInfo.available_liquidity).toFixed(1)}</span> GEN
                  </span>
                )}
              </span>
              <button onClick={fetchMatches} className="text-sm text-primary hover:text-white transition-colors">
                🔄 Refresh
              </button>
            </div>

            {matchesLoading && matches.length === 0 ? (
              <div className="text-center py-20 text-silver">
                <div className="text-4xl mb-4 animate-pulse">⚽</div>
                Loading live fixtures...
              </div>
            ) : matches.length === 0 ? (
              <div className="text-center py-20 text-silver">
                <div className="text-6xl mb-4">⚽</div>
                <h3 className="text-xl font-bold text-white mb-2">No upcoming matches</h3>
                <p>Check back later!</p>
              </div>
            ) : (
              Object.entries(matchesByDate).map(([date, dateMatches]) => (
                <div key={date} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-surface-lighter" />
                    <span className="text-sm text-silver px-2">{formatDateHeader(date)}</span>
                    <div className="h-px flex-1 bg-surface-lighter" />
                  </div>
                  <div className="space-y-3">
                    {dateMatches.map((match) => {
                      const betPlaced = hasBetOnMatch(match);
                      const timeUntil = getTimeUntilMatch(match.kickoffTime);
                      const isLive = timeUntil === "LIVE";

                      return (
                        <div key={match.id} className="glass-card p-4">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs text-silver">{match.league}</span>
                            <div className="flex items-center gap-2">
                              {isLive && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-danger/20 text-danger font-bold">LIVE</span>
                              )}
                              {!isLive && timeUntil && (
                                <span className="text-xs text-silver">{timeUntil}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3 flex-1">
                              <TeamLogo teamCode={match.team1Code} teamName={match.team1} size="md" />
                              <span className="font-medium text-sm">{match.team1}</span>
                            </div>
                            <div className="px-4">
                              {match.score ? (
                                <span className="text-xl font-bold">{match.score}</span>
                              ) : (
                                <span className="text-sm text-silver font-bold">VS</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 flex-1 justify-end">
                              <span className="font-medium text-sm">{match.team2}</span>
                              <TeamLogo teamCode={match.team2Code} teamName={match.team2} size="md" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => !betPlaced && setBetModal({ match, selection: "team1" })}
                              disabled={betPlaced || !isCorrectNetwork}
                              className={`py-2.5 rounded-xl text-center transition-all ${
                                betPlaced || !isCorrectNetwork
                                  ? "bg-surface-lighter/50 text-silver cursor-not-allowed"
                                  : "bg-surface-light hover:bg-primary/20 hover:border-primary border border-transparent cursor-pointer"
                              }`}
                            >
                              <div className="text-xs text-silver mb-0.5">1</div>
                              <div className="font-bold">{match.oddsTeam1.toFixed(2)}</div>
                            </button>
                            <button
                              onClick={() => !betPlaced && setBetModal({ match, selection: "draw" })}
                              disabled={betPlaced || !isCorrectNetwork}
                              className={`py-2.5 rounded-xl text-center transition-all ${
                                betPlaced || !isCorrectNetwork
                                  ? "bg-surface-lighter/50 text-silver cursor-not-allowed"
                                  : "bg-surface-light hover:bg-warning/20 hover:border-warning border border-transparent cursor-pointer"
                              }`}
                            >
                              <div className="text-xs text-silver mb-0.5">X</div>
                              <div className="font-bold">{match.oddsDraw.toFixed(2)}</div>
                            </button>
                            <button
                              onClick={() => !betPlaced && setBetModal({ match, selection: "team2" })}
                              disabled={betPlaced || !isCorrectNetwork}
                              className={`py-2.5 rounded-xl text-center transition-all ${
                                betPlaced || !isCorrectNetwork
                                  ? "bg-surface-lighter/50 text-silver cursor-not-allowed"
                                  : "bg-surface-light hover:bg-primary/20 hover:border-primary border border-transparent cursor-pointer"
                              }`}
                            >
                              <div className="text-xs text-silver mb-0.5">2</div>
                              <div className="font-bold">{match.oddsTeam2.toFixed(2)}</div>
                            </button>
                          </div>
                          {betPlaced && (
                            <div className="mt-2 text-center text-sm text-accent">✅ Bet placed on-chain</div>
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
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-silver text-sm">
                {Object.keys(myBets).length} bet{Object.keys(myBets).length !== 1 ? "s" : ""}
              </span>
              <button onClick={fetchBets} className="text-sm text-primary hover:text-white transition-colors">
                🔄 Refresh
              </button>
            </div>

            {betsLoading && Object.keys(myBets).length === 0 && (
              <div className="text-center py-20 text-silver">
                <div className="text-4xl mb-4 animate-pulse">🎯</div>
                Loading your bets from blockchain...
              </div>
            )}

            {!betsLoading && Object.keys(myBets).length === 0 ? (
              <div className="text-center py-20 text-silver">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-bold text-white mb-2">No bets placed yet</h3>
                <p>Go to Matches to start betting!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(myBets).map(([betId, bet]) => {
                  const stakeGEN = bet.stake ? weiToGEN(Number(bet.stake)) : 0;
                  const payoutGEN = bet.payout ? weiToGEN(Number(bet.payout)) : 0;
                  const oddsValue = bet.odds ? Number(bet.odds) / 100 : 0;
                  const team1Code = getTeamCodeFromName(bet.team1);
                  const team2Code = getTeamCodeFromName(bet.team2);

                  return (
                    <div key={betId} className="glass-card p-4">
                      {/* Match info */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <TeamLogo teamCode={team1Code} teamName={bet.team1} size="sm" />
                          <span className="text-sm text-silver">vs</span>
                          <TeamLogo teamCode={team2Code} teamName={bet.team2} size="sm" />
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{bet.team1} vs {bet.team2}</div>
                          <div className="text-xs text-silver">{bet.game_date}</div>
                        </div>
                      </div>

                      {/* Prediction & Stake */}
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div>
                          <div className="text-xs text-silver">Prediction</div>
                          <div className="text-sm font-medium text-primary">
                            {bet.predicted_winner === "1" ? bet.team1 : bet.predicted_winner === "2" ? bet.team2 : "Draw"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-silver">Stake</div>
                          <div className="text-sm font-medium">{stakeGEN.toFixed(2)} GEN</div>
                          {oddsValue > 0 && <div className="text-xs text-silver">{oddsValue.toFixed(2)}x</div>}
                        </div>
                        <div>
                          <div className="text-xs text-silver">
                            {bet.has_resolved && bet.is_won ? "Won" : "Potential"}
                          </div>
                          <div className="text-sm font-bold text-accent">{payoutGEN.toFixed(2)} GEN</div>
                        </div>
                      </div>

                      {/* Status + Actions */}
                      <div className="flex items-center justify-between">
                        <div>
                          {!bet.has_resolved ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-warning/20 text-warning">⏳ Pending</span>
                          ) : bet.is_won ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                              🎉 Won
                              {bet.has_claimed && " ✅ Claimed"}
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full bg-danger/20 text-danger">❌ Lost</span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {/* Resolve button */}
                          {!bet.has_resolved && (
                            <button
                              onClick={() => handleResolveBet(betId)}
                              disabled={resolvingBet === betId}
                              className="px-4 py-2 rounded-xl bg-primary/20 text-primary text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
                            >
                              {resolvingBet === betId ? "🤖 Resolving..." : "🤖 Resolve"}
                            </button>
                          )}

                          {/* Claim winnings button (FUNDED PAYOUT PATH) */}
                          {bet.has_resolved && bet.is_won && !bet.has_claimed && (
                            <button
                              onClick={() => handleClaimWinnings(betId)}
                              disabled={claimingBet === betId}
                              className="px-4 py-2 rounded-xl bg-accent/20 text-accent text-sm font-bold hover:bg-accent/30 transition-colors disabled:opacity-50 animate-pulse-glow"
                            >
                              {claimingBet === betId ? "💰 Claiming..." : "💰 Claim Winnings"}
                            </button>
                          )}
                        </div>

                        {/* Score if resolved */}
                        {bet.has_resolved && bet.real_score && (
                          <div className="text-sm text-silver">
                            Final: <span className="text-white font-bold">{bet.real_score}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── LEADERBOARD TAB ──────────────────────────────── */}
        {activeTab === "leaderboard" && (
          <div>
            <div className="glass-card p-6 mb-6">
              <h2 className="text-xl font-bold mb-1">🏆 Top Winners</h2>
              <p className="text-sm text-silver">Ranked by total GEN won from correct predictions</p>
            </div>

            {leaderboardLoading && leaderboard.length === 0 && (
              <div className="text-center py-20 text-silver">
                <div className="text-4xl mb-4 animate-pulse">🏆</div>
                Loading leaderboard from blockchain...
              </div>
            )}

            {!leaderboardLoading && leaderboard.length === 0 ? (
              <div className="text-center py-20 text-silver">
                <div className="text-6xl mb-4">🏆</div>
                <h3 className="text-xl font-bold text-white mb-2">No bets resolved yet</h3>
                <p>Be the first to win!</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-6 gap-2 px-4 py-2 text-xs text-silver mb-2">
                  <div>#</div><div>Player</div><div>Won</div><div>Staked</div><div>Profit</div><div>W/L</div>
                </div>
                <div className="space-y-2">
                  {leaderboard.map((entry, index) => {
                    const totalWonGEN = weiToGEN(entry.total_won);
                    const totalStakedGEN = weiToGEN(entry.total_staked);
                    const netProfitGEN = weiToGEN(entry.profit);

                    return (
                      <div key={entry.address} className="glass-card p-4 grid grid-cols-6 gap-2 items-center">
                        <div className="text-lg">
                          {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : <span className="text-silver">#{index + 1}</span>}
                        </div>
                        <a
                          href={`https://explorer-studio.genlayer.com/address/${entry.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate hover:text-primary transition-colors"
                        >
                          {shortenAddress(entry.address)}
                        </a>
                        <div>
                          <div className="text-sm font-bold text-accent">{totalWonGEN.toFixed(1)}</div>
                          <div className="text-xs text-silver">GEN</div>
                        </div>
                        <div className="text-sm text-silver">{totalStakedGEN.toFixed(1)}</div>
                        <div className={`text-sm font-bold ${netProfitGEN >= 0 ? "text-accent" : "text-danger"}`}>
                          {netProfitGEN >= 0 ? "+" : ""}{netProfitGEN.toFixed(1)}
                        </div>
                        <div className="text-sm text-silver">
                          <span className="text-accent">{entry.wins}</span>/<span className="text-danger">{entry.losses}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ── BET MODAL ──────────────────────────────────────── */}
      {betModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card p-6 w-full max-w-md animate-slide-up gradient-border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <TeamLogo teamCode={betModal.match.team1Code} teamName={betModal.match.team1} size="sm" />
                <span className="font-medium">{betModal.match.team1}</span>
              </div>
              <span className="text-silver font-bold">VS</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{betModal.match.team2}</span>
                <TeamLogo teamCode={betModal.match.team2Code} teamName={betModal.match.team2} size="sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-surface-light rounded-xl p-3">
                <div className="text-xs text-silver">Your Prediction</div>
                <div className="text-sm font-bold text-primary">
                  {betModal.selection === "team1"
                    ? `${betModal.match.team1} Win`
                    : betModal.selection === "team2"
                      ? `${betModal.match.team2} Win`
                      : "Draw"}
                </div>
              </div>
              <div className="bg-surface-light rounded-xl p-3">
                <div className="text-xs text-silver">Odds</div>
                <div className="text-sm font-bold text-accent">
                  {betModal.selection === "team1"
                    ? betModal.match.oddsTeam1.toFixed(2)
                    : betModal.selection === "team2"
                      ? betModal.match.oddsTeam2.toFixed(2)
                      : betModal.match.oddsDraw.toFixed(2)}
                  x
                </div>
              </div>
            </div>

            {/* Solvency indicator */}
            {poolInfo && (
              <div className="bg-surface-light rounded-xl p-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-silver">Pool Liquidity</span>
                  <span className={weiToGEN(poolInfo.available_liquidity) > Number(stakeAmount) ? "text-accent" : "text-danger"}>
                    {weiToGEN(poolInfo.available_liquidity).toFixed(1)} GEN available
                  </span>
                </div>
              </div>
            )}

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-silver">Stake Amount</label>
                <span className="text-xs text-silver">Balance: {genBalance} GEN</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-surface-light border border-surface-lighter text-white text-lg font-bold focus:outline-none focus:border-primary transition-colors pr-16"
                  placeholder="10"
                  min="1"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-silver text-sm">GEN</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setStakeAmount(String(amount))}
                    className="flex-1 py-1.5 rounded-lg bg-surface-light text-sm hover:bg-primary/20 hover:text-primary transition-colors"
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-accent/10 rounded-xl p-3 mb-4">
              <div className="text-xs text-silver mb-1">Potential Payout</div>
              <div className="text-lg font-bold text-accent">
                {(
                  Number(stakeAmount || 0) *
                  (betModal.selection === "team1"
                    ? betModal.match.oddsTeam1
                    : betModal.selection === "team2"
                      ? betModal.match.oddsTeam2
                      : betModal.match.oddsDraw)
                ).toFixed(2)}{" "}
                GEN
              </div>
            </div>

            {Number(genBalance) < Number(stakeAmount) && (
              <div className="text-sm text-danger mb-4">
                ⚠️ Insufficient balance.{" "}
                <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="underline">
                  Get GEN from faucet
                </a>
              </div>
            )}

            <div className="text-xs text-silver space-y-1 mb-6">
              <p>✓ Bet recorded on GenLayer blockchain</p>
              <p>✓ AI Oracle verifies match results from BBC Sport</p>
              <p>✓ Win → Claim winnings → GEN transferred to wallet</p>
              <p>✓ Pool solvency guaranteed before accepting bets</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setBetModal(null); setStakeAmount("10"); }}
                className="flex-1 py-3 rounded-xl bg-surface-light text-silver font-medium hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePlaceBet}
                disabled={loading || Number(stakeAmount) > Number(genBalance)}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary to-primary-dark text-white font-bold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? "Placing..." : "Place Bet 🎯"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 mt-12 text-center text-xs text-silver/50">
        <p>GoalBet • Built on <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="text-primary/50 hover:text-primary">GenLayer</a> • Contract: <a href={`https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="text-primary/50 hover:text-primary">{shortenAddress(CONTRACT_ADDRESS)}</a></p>
      </footer>
    </div>
  );
}
