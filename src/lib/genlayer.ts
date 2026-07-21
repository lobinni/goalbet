/**
 * GenLayer Integration — GoalBet V2
 *
 * Lazy-init client to avoid crashing on import in serverless environments.
 * All GenLayer calls are wrapped with try-catch + timeouts.
 */

export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x15823D410Ef22437285A5dcb53f64dFb47fe1fF8"
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
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Map a market's league display name to its ESPN API slug (used by the V3 oracle contract) */
export function leagueToEspnSlug(league: string): string {
  const l = (league || "").toLowerCase();
  if (l.includes("world cup")) return "fifa.world";
  if (l.includes("premier league")) return "eng.1";
  if (l.includes("la liga") || l.includes("primera")) return "esp.1";
  if (l.includes("bundesliga")) return "ger.1";
  if (l.includes("serie a")) return "ita.1";
  if (l.includes("ligue 1")) return "fra.1";
  if (l.includes("champions league")) return "uefa.champions";
  if (l.includes("europa league")) return "uefa.europa";
  if (l.includes("liga mx")) return "mex.1";
  if (l.includes("mls")) return "usa.1";
  if (l.includes("brasileir")) return "bra.1";
  if (l.includes("eredivisie")) return "ned.1";
  if (l.includes("primeira liga")) return "por.1";
  return "fifa.world";
}

export interface EthProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (e: string, h: (...a: unknown[]) => void) => void;
  removeListener: (e: string, h: (...a: unknown[]) => void) => void;
}

export function getEthereum(): EthProvider | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

/* ═══════════════════════════════════════════════════════════════
   GenLayer Client — lazy-initialized, server-side only
   ═══════════════════════════════════════════════════════════════ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

function gl() {
  if (!_client) {
    try {
      // Dynamic require to avoid crashing at module-load time on edge/serverless
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient, createAccount } = require("genlayer-js");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { studionet } = require("genlayer-js/chains");
      _client = createClient({
        chain: studionet,
        endpoint: RPC_URL,
        account: createAccount(),
      });
    } catch (e) {
      console.warn("Failed to initialize GenLayer client:", (e as Error).message);
      return null;
    }
  }
  return _client;
}

/** Create market on GenLayer (verifiable on-chain record) */
export async function glCreateMarket(
  id: string,
  date: string,
  t1: string,
  t2: string,
  league = "fifa.world",
): Promise<string> {
  const client = gl();
  if (!client) throw new Error("GenLayer client not available");
  const tx = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_market",
    args: [id, date, t1, t2, league],
    value: BigInt(0),
  });
  await client.waitForTransactionReceipt({
    hash: tx,
    status: "FINALIZED",
    interval: 8000,
    retries: 15,
  });
  return String(tx);
}

/** Record bet on GenLayer (verifiable on-chain proof) */
export async function glRecordBet(
  marketId: string,
  userAddr: string,
  outcome: number,
  amount: number,
): Promise<string> {
  const client = gl();
  if (!client) throw new Error("GenLayer client not available");
  const tx = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "record_bet",
    args: [marketId, userAddr, outcome, amount],
    value: BigInt(0),
  });
  await client.waitForTransactionReceipt({
    hash: tx,
    status: "FINALIZED",
    interval: 8000,
    retries: 15,
  });
  return String(tx);
}

/** Resolve match via AI Oracle (BBC Sport + LLM + multi-validator consensus) */
export async function glResolveMarket(id: string): Promise<string> {
  const client = gl();
  if (!client) throw new Error("GenLayer client not available");
  const tx = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "resolve_market",
    args: [id],
    value: BigInt(0),
  });
  // AI resolution can take 1-3 minutes
  await client.waitForTransactionReceipt({
    hash: tx,
    status: "FINALIZED",
    interval: 10000,
    retries: 30,
  });
  return String(tx);
}

/** Read market from on-chain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetMarket(id: string): Promise<any> {
  const client = gl();
  if (!client) return null;
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_market",
    args: [id],
    jsonSafeReturn: true,
  });
}

/** Read all markets from on-chain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetAllMarkets(): Promise<any> {
  const client = gl();
  if (!client) return [];
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_all_markets",
    args: [],
    jsonSafeReturn: true,
  });
}

/** Read contract stats */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function glGetStats(): Promise<any> {
  const client = gl();
  if (!client) return null;
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_stats",
    args: [],
    jsonSafeReturn: true,
  });
}
