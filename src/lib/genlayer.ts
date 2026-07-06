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
  "0x5": "Goerli",
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

// Helper to convert Map to Object
function mapToObject<T>(value: unknown): T {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = mapToObject(v);
    }
    return obj as T;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = mapToObject(v);
    }
    return obj as T;
  }
  return value as T;
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
    const bets = await this.client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_bets",
      args: [],
    });
    return mapToObject<Record<string, Bet>>(bets);
  }

  /** Get player stats */
  async getPlayerStats(address: string): Promise<PlayerStats> {
    const stats = await this.client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_player_stats",
      args: [address],
    });
    return mapToObject<PlayerStats>(stats);
  }

  /** Get leaderboard sorted by total GEN won */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const leaderboard = await this.client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_leaderboard",
      args: [],
    });
    const entries = mapToObject<LeaderboardEntry[]>(leaderboard);
    return Array.isArray(entries) ? entries : [];
  }

  /** Get total pool */
  async getTotalPool(): Promise<number> {
    const pool = await this.client.readContract({
      address: CONTRACT_ADDRESS,
      functionName: "get_total_pool",
      args: [],
    });
    return Number(pool);
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
