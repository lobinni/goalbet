/**
 * GenLayer Integration — GoalBet V2
 *
 * Contract: GoalBetV2 on GenLayer StudioNet
 * Role: AI Oracle + On-chain verifiable records
 *
 * Flow:
 *  USDC betting → PostgreSQL + Base Sepolia
 *  Match resolution → GenLayer AI Oracle (BBC Sport + LLM consensus)
 *  On-chain records → create_market, record_bet, resolve_market
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0xfe3bCb5D779131a0e71ADa8718fd4694cab4622D"
) as `0x${string}`;
export const RPC_URL = "https://studio.genlayer.com/api";
export const EXPLORER_TX = "https://explorer-studio.genlayer.com/tx/";
export const EXPLORER_ADDR = "https://explorer-studio.genlayer.com/address/";

export const BASE_SEPOLIA = {
  chainId: 84532,
  chainIdHex: "0x14A34",
  chainName: "Base Sepolia",
  rpcUrls: ["https://sepolia.base.org"],
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  blockExplorerUrls: ["https://sepolia.basescan.org"],
};

export const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export function shortenAddress(a: string) {
  if (!a || a.length < 10) return a || "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

interface EthProvider {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (e: string, h: (...a: unknown[]) => void) => void;
  removeListener: (e: string, h: (...a: unknown[]) => void) => void;
}
export function getEthereum(): EthProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

/* ═══════════════════════════════════════════════════════════════
   GenLayer Client — server-side only via createAccount()
   ═══════════════════════════════════════════════════════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

function gl() {
  if (!_client) {
    _client = createClient({
      chain: studionet,
      endpoint: RPC_URL,
      account: createAccount(),
    });
  }
  return _client;
}

/** Create market on GenLayer (verifiable on-chain record) */
export async function glCreateMarket(
  id: string, date: string, t1: string, t2: string,
): Promise<string> {
  const tx = await gl().writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_market",
    args: [id, date, t1, t2],
    value: BigInt(0),
  });
  await gl().waitForTransactionReceipt({
    hash: tx, status: "FINALIZED", interval: 8000, retries: 15,
  });
  return String(tx);
}

/** Record bet on GenLayer (verifiable on-chain proof) */
export async function glRecordBet(
  marketId: string, userAddr: string, outcome: number, amount: number,
): Promise<string> {
  const tx = await gl().writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "record_bet",
    args: [marketId, userAddr, outcome, amount],
    value: BigInt(0),
  });
  await gl().waitForTransactionReceipt({
    hash: tx, status: "FINALIZED", interval: 8000, retries: 15,
  });
  return String(tx);
}

/** Resolve match via AI Oracle (BBC Sport + LLM + multi-validator consensus) */
export async function glResolveMarket(id: string): Promise<string> {
  const tx = await gl().writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "resolve_market",
    args: [id],
    value: BigInt(0),
  });
  // AI resolution can take 1-3 minutes
  await gl().waitForTransactionReceipt({
    hash: tx, status: "FINALIZED", interval: 10000, retries: 30,
  });
  return String(tx);
}

/** Read market from on-chain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetMarket(id: string): Promise<any> {
  return gl().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_market",
    args: [id],
    jsonSafeReturn: true,
  });
}

/** Read all markets from on-chain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetAllMarkets(): Promise<any[]> {
  return gl().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_all_markets",
    args: [],
    jsonSafeReturn: true,
  });
}

/** Read contract stats */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetStats(): Promise<any> {
  return gl().readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_stats",
    args: [],
    jsonSafeReturn: true,
  });
}
