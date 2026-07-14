/**
 * GenLayer Client for GoalBet Contract
 * Interacts with the deployed contract on GenLayer StudioNet
 *
 * Key improvements:
 *  - get_total_pool() fully implemented → returns PoolInfo
 *  - Solvency check: odds constrained to available pool backing
 *  - claim_winnings(): funded payout path (GEN transferred to winner)
 *  - deposit(): liquidity provision for the pool
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// ─── Constants ────────────────────────────────────────────────────

export const CONTRACT_ADDRESS =
  "0x60fcDCeF6C6881ADD3A9327eE7F7EFeBf50aEC71" as const;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_TX_URL = "https://explorer-studio.genlayer.com/tx/";
export const EXPLORER_ADDRESS_URL =
  "https://explorer-studio.genlayer.com/address/";
export const FAUCET_URL = "https://studio.genlayer.com/contracts";
export const GENLAYER_STUDIO_URL = "https://studio.genlayer.com";

export const GENLAYER_NETWORK = {
  chainIdDec: 61999,
  chainIdHex: "0xF22F",
  chainName: "GenLayer StudioNet",
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

// ─── Types ────────────────────────────────────────────────────────

export interface Bet {
  id: string;
  has_resolved: boolean;
  has_claimed: boolean;
  game_date: string;
  resolution_url: string;
  team1: string;
  team2: string;
  predicted_winner: string;
  real_winner: string;
  real_score: string;
  stake: string | number;
  odds: string | number;
  payout: string | number;
  is_won: boolean;
}

export interface PlayerStats {
  total_bets: number;
  total_staked: number;
  total_won: number;
  total_lost: number;
  wins: number;
  losses: number;
}

export interface LeaderboardEntry {
  address: string;
  total_won: number;
  total_staked: number;
  total_lost: number;
  profit: number;
  wins: number;
  losses: number;
  win_rate: number;
}

/** Shape returned by on-chain get_total_pool() */
export interface PoolInfo {
  total_pool: number; // pool balance (wei)
  total_pending_payouts: number; // pending payouts (wei)
  available_liquidity: number; // pool − pending (wei)
}

// ─── Helpers ──────────────────────────────────────────────────────

export function weiToGEN(wei: number | string): number {
  return Number(wei) / 1e18;
}

export function genToWei(gen: number): bigint {
  return BigInt(Math.floor(gen * 1e18));
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (
    event: string,
    handler: (...args: unknown[]) => void,
  ) => void;
}

export function getEthereum(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum as EthereumProvider | null;
}

export function sameChain(
  chainId: string | null,
  targetHex: string,
): boolean {
  if (!chainId) return false;
  return chainId.toLowerCase() === targetHex.toLowerCase();
}

export function getNetworkLabel(chainId: string | null): string {
  if (!chainId) return "Unknown";
  const m: Record<string, string> = {
    "0x1": "Ethereum Mainnet",
    "0xaa36a7": "Sepolia",
    "0xf22f": "GenLayer StudioNet",
  };
  return m[chainId.toLowerCase()] || `Chain ${chainId}`;
}

// ─── Contract client ──────────────────────────────────────────────

export class GoalBetContract {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private account: `0x${string}` | null = null;
  private provider: EthereumProvider | null = null;

  constructor(account?: string, provider?: EthereumProvider) {
    this.account = account ? (account as `0x${string}`) : null;
    this.provider = provider || null;
    this.client = this.buildClient();
  }

  private buildClient() {
    const config: Record<string, unknown> = {
      chain: studionet,
      endpoint: RPC_URL,
    };
    if (this.account) config.account = this.account;
    if (this.provider) config.provider = this.provider;
    return createClient(config);
  }

  setAccount(account: string, provider?: EthereumProvider) {
    this.account = account as `0x${string}`;
    if (provider) this.provider = provider;
    this.client = this.buildClient();
  }

  // ── Read methods ────────────────────────────────────────────

  async getBets(): Promise<Record<string, Bet>> {
    try {
      const result = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_bets",
        args: [],
        jsonSafeReturn: true,
      });
      if (result && typeof result === "object" && !Array.isArray(result))
        return result as Record<string, Bet>;
      return {};
    } catch (error) {
      console.error("[GoalBet] getBets error:", error);
      throw error;
    }
  }

  async getPlayerStats(address: string): Promise<PlayerStats> {
    try {
      const result = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_player_stats",
        args: [address],
        jsonSafeReturn: true,
      });
      if (result && typeof result === "object") {
        const s = result as Record<string, unknown>;
        return {
          total_bets: Number(s.total_bets ?? 0),
          total_staked: Number(s.total_staked ?? 0),
          total_won: Number(s.total_won ?? 0),
          total_lost: Number(s.total_lost ?? 0),
          wins: Number(s.wins ?? 0),
          losses: Number(s.losses ?? 0),
        };
      }
      return {
        total_bets: 0, total_staked: 0, total_won: 0,
        total_lost: 0, wins: 0, losses: 0,
      };
    } catch (error) {
      console.error("[GoalBet] getPlayerStats error:", error);
      throw error;
    }
  }

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      const result = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_leaderboard",
        args: [],
        jsonSafeReturn: true,
      });
      const entries = Array.isArray(result) ? result : [];
      return entries.map((e: Record<string, unknown>) => ({
        address: String(e.address ?? ""),
        total_won: Number(e.total_won ?? 0),
        total_staked: Number(e.total_staked ?? 0),
        total_lost: Number(e.total_lost ?? 0),
        profit: Number(e.profit ?? 0),
        wins: Number(e.wins ?? 0),
        losses: Number(e.losses ?? 0),
        win_rate: Number(e.win_rate ?? 0),
      }));
    } catch (error) {
      console.error("[GoalBet] getLeaderboard error:", error);
      throw error;
    }
  }

  /**
   * get_total_pool() — fully implemented.
   * Returns pool balance, pending payouts, and available liquidity.
   * On-chain contract returns a dict with total_pool, total_pending_payouts,
   * available_liquidity (all in wei).
   */
  async getPoolInfo(): Promise<PoolInfo> {
    try {
      const result = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_total_pool",
        args: [],
        jsonSafeReturn: true,
      });
      if (result && typeof result === "object") {
        const r = result as Record<string, unknown>;
        return {
          total_pool: Number(r.total_pool ?? 0),
          total_pending_payouts: Number(r.total_pending_payouts ?? 0),
          available_liquidity: Number(r.available_liquidity ?? 0),
        };
      }
      return {
        total_pool: 0, total_pending_payouts: 0, available_liquidity: 0,
      };
    } catch (error) {
      console.error("[GoalBet] getPoolInfo error:", error);
      return {
        total_pool: 0, total_pending_payouts: 0, available_liquidity: 0,
      };
    }
  }

  // ── Write methods (signed via MetaMask) ─────────────────────

  /** Deposit GEN to provide pool liquidity */
  async deposit(amountGEN: number): Promise<{ txHash: string }> {
    const value = genToWei(amountGEN);
    const txHash = await this.client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "deposit",
      args: [],
      value,
    });
    await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "FINALIZED" as const,
      interval: 5000,
      retries: 30,
    });
    return { txHash: String(txHash) };
  }

  /** Create a bet (solvency-checked on-chain) */
  async createBet(
    gameDate: string,
    team1: string,
    team2: string,
    predictedWinner: string,
    stakeGEN: number,
    oddsMultiplied: number,
  ): Promise<{ txHash: string }> {
    const stakeWei = genToWei(stakeGEN);
    const txHash = await this.client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "create_bet",
      args: [gameDate, team1, team2, predictedWinner, String(oddsMultiplied)],
      value: stakeWei,
    });
    await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "FINALIZED" as const,
      interval: 5000,
      retries: 30,
    });
    return { txHash: String(txHash) };
  }

  /** Resolve a bet (triggers AI oracle) */
  async resolveBet(betId: string): Promise<{ txHash: string }> {
    const txHash = await this.client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "resolve_bet",
      args: [betId],
      value: BigInt(0),
    });
    await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "FINALIZED" as const,
      interval: 5000,
      retries: 60,
    });
    return { txHash: String(txHash) };
  }

  /** Claim winnings for a resolved, won bet (FUNDED PAYOUT) */
  async claimWinnings(betId: string): Promise<{ txHash: string }> {
    const txHash = await this.client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "claim_winnings",
      args: [betId],
      value: BigInt(0),
    });
    await this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "FINALIZED" as const,
      interval: 5000,
      retries: 30,
    });
    return { txHash: String(txHash) };
  }
}
