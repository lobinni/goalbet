/**
 * GenLayer Client for GoalBet Contract
 * Interacts with the deployed contract on GenLayer StudioNet
 */

import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

// Contract deployed on StudioNet (with GEN staking)
export const CONTRACT_ADDRESS = "0xe7e1eD19Ebc2F37314EfA571e4b529527901ebb9" as const;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_TX_URL = "https://explorer-studio.genlayer.com/tx/";
export const EXPLORER_ADDRESS_URL = "https://explorer-studio.genlayer.com/address/";
export const FAUCET_URL = "https://studio.genlayer.com/contracts";
export const GENLAYER_STUDIO_URL = "https://studio.genlayer.com";

// GenLayer StudioNet network parameters for MetaMask
export const GENLAYER_NETWORK = {
  chainIdDec: 61999,
  chainIdHex: "0xF22F",
  chainName: "GenLayer StudioNet",
  rpcUrls: [RPC_URL],
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
};

// Known networks for display
export const KNOWN_NETWORKS: Record<string, string> = {
  "0x1": "Ethereum Mainnet",
  "0xaa36a7": "Sepolia",
  "0x89": "Polygon",
  "0x38": "BNB Chain",
  "0xa4b1": "Arbitrum One",
  "0xa": "Optimism",
};

// Types
export interface Bet {
  id: string;
  has_resolved: boolean;
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

/**
 * Recursively convert Map / dataclass instances into plain JS objects.
 * genlayer-js returns Maps for TreeMap and dataclass-like objects for structs.
 */
function mapToObject(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Map → plain object
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = mapToObject(v);
    }
    return obj;
  }

  // Array → recurse into each element
  if (Array.isArray(value)) {
    return value.map((item) => mapToObject(item));
  }

  // BigInt → number (for display; fine for wei values within JS safe range)
  if (typeof value === "bigint") {
    return value.toString();
  }

  // Plain object → recurse into each property
  if (typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }

  return value;
}

// Convert wei to GEN
export function weiToGEN(wei: number | string): number {
  return Number(wei) / 1e18;
}

// Convert GEN to wei
export function genToWei(gen: number): bigint {
  return BigInt(Math.floor(gen * 1e18));
}

export class GoalBetContract {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private account: `0x${string}` | null = null;

  constructor(account?: string) {
    this.account = account ? (account as `0x${string}`) : null;
    this.client = this.buildClient();
  }

  private buildClient() {
    return createClient({
      chain: studionet,
      endpoint: RPC_URL,
      ...(this.account ? { account: this.account } : {}),
    });
  }

  setAccount(account: string) {
    this.account = account as `0x${string}`;
    this.client = this.buildClient();
  }

  // ── Read Methods ────────────────────────────────────────

  /** Get caller's bets */
  async getBets(): Promise<Record<string, Bet>> {
    try {
      const raw = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_bets",
        args: [],
      });
      const converted = mapToObject(raw);
      console.log("[GoalBet] getBets raw:", raw, "converted:", converted);

      // If it's already a plain object, return it
      if (converted && typeof converted === "object" && !Array.isArray(converted)) {
        return converted as Record<string, Bet>;
      }
      return {};
    } catch (error) {
      console.error("[GoalBet] getBets error:", error);
      return {};
    }
  }

  /** Get player stats */
  async getPlayerStats(address: string): Promise<PlayerStats> {
    const defaultStats: PlayerStats = {
      total_bets: 0, total_staked: 0, total_won: 0,
      total_lost: 0, wins: 0, losses: 0,
    };
    try {
      const raw = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_player_stats",
        args: [address],
      });
      const converted = mapToObject(raw);
      console.log("[GoalBet] getPlayerStats raw:", raw, "converted:", converted);

      if (converted && typeof converted === "object") {
        const s = converted as Record<string, unknown>;
        return {
          total_bets: Number(s.total_bets ?? 0),
          total_staked: Number(s.total_staked ?? 0),
          total_won: Number(s.total_won ?? 0),
          total_lost: Number(s.total_lost ?? 0),
          wins: Number(s.wins ?? 0),
          losses: Number(s.losses ?? 0),
        };
      }
      return defaultStats;
    } catch (error) {
      console.error("[GoalBet] getPlayerStats error:", error);
      return defaultStats;
    }
  }

  /** Get leaderboard sorted by total GEN won */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      const raw = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_leaderboard",
        args: [],
      });
      const converted = mapToObject(raw);
      console.log("[GoalBet] getLeaderboard raw:", raw, "converted:", converted);

      // Contract returns a list of dicts
      if (Array.isArray(converted)) {
        return converted.map((entry: unknown) => {
          const e = entry as Record<string, unknown>;
          return {
            address: String(e.address ?? ""),
            total_won: Number(e.total_won ?? 0),
            total_staked: Number(e.total_staked ?? 0),
            total_lost: Number(e.total_lost ?? 0),
            profit: Number(e.profit ?? 0),
            wins: Number(e.wins ?? 0),
            losses: Number(e.losses ?? 0),
            win_rate: Number(e.win_rate ?? 0),
          };
        });
      }

      // Might come back as Map or object – try to extract values
      if (converted && typeof converted === "object") {
        const values = Object.values(converted as Record<string, unknown>);
        if (values.length > 0) {
          return values.map((entry: unknown) => {
            const e = entry as Record<string, unknown>;
            return {
              address: String(e.address ?? ""),
              total_won: Number(e.total_won ?? 0),
              total_staked: Number(e.total_staked ?? 0),
              total_lost: Number(e.total_lost ?? 0),
              profit: Number(e.profit ?? 0),
              wins: Number(e.wins ?? 0),
              losses: Number(e.losses ?? 0),
              win_rate: Number(e.win_rate ?? 0),
            };
          });
        }
      }

      return [];
    } catch (error) {
      console.error("[GoalBet] getLeaderboard error:", error);
      return [];
    }
  }

  /** Get total pool */
  async getTotalPool(): Promise<number> {
    try {
      const pool = await this.client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: "get_total_pool",
        args: [],
      });
      return Number(pool);
    } catch (error) {
      console.error("[GoalBet] getTotalPool error:", error);
      return 0;
    }
  }

  // ── Write Methods (signed via MetaMask) ─────────────────

  /** Create a new bet with GEN stake */
  async createBet(
    gameDate: string,
    team1: string,
    team2: string,
    predictedWinner: string,
    stakeGEN: number,
    oddsMultiplied: number
  ): Promise<{ txHash: string }> {
    const stakeWei = genToWei(stakeGEN);

    const txHash = await this.client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: "create_bet",
      args: [gameDate, team1, team2, predictedWinner, oddsMultiplied],
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
}

// Singleton instance
let contractInstance: GoalBetContract | null = null;

export function getContract(account?: string): GoalBetContract {
  if (!contractInstance) {
    contractInstance = new GoalBetContract(account);
  } else if (account) {
    contractInstance.setAccount(account);
  }
  return contractInstance;
}
