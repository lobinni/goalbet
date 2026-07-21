/**
 * Smoke-test the deployed GoalBet V3 oracle contract on GenLayer StudioNet.
 * Usage: node scripts/test-oracle.mjs [contractAddress]
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT = process.argv[2] || "0x15823D410Ef22437285A5dcb53f64dFb47fe1fF8";
const client = createClient({
  chain: studionet,
  endpoint: "https://studio.genlayer.com/api",
  account: createAccount(),
});

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

try {
  // ── 1. create_market ──
  log("STEP 1: create_market (France vs England, 2026-07-18)");
  const tx1 = await client.writeContract({
    address: CONTRACT,
    functionName: "create_market",
    args: ["wc2026-3rd-fra-eng", "2026-07-18", "France", "England", "fifa.world"],
    value: BigInt(0),
  });
  log("  tx:", String(tx1));
  await client.waitForTransactionReceipt({ hash: tx1, status: "FINALIZED", interval: 6000, retries: 20 });
  log("  ✅ create_market FINALIZED");

  // ── 2. record_bet ──
  log("STEP 2: record_bet (user bets 5 USDC on England=outcome 2)");
  const tx2 = await client.writeContract({
    address: CONTRACT,
    functionName: "record_bet",
    args: ["wc2026-3rd-fra-eng", "0x1234567890123456789012345678901234567890", 2, 5000000],
    value: BigInt(0),
  });
  log("  tx:", String(tx2));
  await client.waitForTransactionReceipt({ hash: tx2, status: "FINALIZED", interval: 6000, retries: 20 });
  log("  ✅ record_bet FINALIZED");

  // ── 3. resolve_market (the critical one — AI Oracle) ──
  log("STEP 3: resolve_market (ESPN fetch + validator consensus)...");
  const t0 = Date.now();
  const tx3 = await client.writeContract({
    address: CONTRACT,
    functionName: "resolve_market",
    args: ["wc2026-3rd-fra-eng"],
    value: BigInt(0),
  });
  log("  tx:", String(tx3));
  await client.waitForTransactionReceipt({ hash: tx3, status: "FINALIZED", interval: 8000, retries: 40 });
  log(`  ✅ resolve_market FINALIZED in ${Math.round((Date.now() - t0) / 1000)}s`);
  log("  explorer: https://explorer-studio.genlayer.com/tx/" + String(tx3));

  // ── 4. get_market — read verified result ──
  log("STEP 4: get_market");
  const m = await client.readContract({
    address: CONTRACT,
    functionName: "get_market",
    args: ["wc2026-3rd-fra-eng"],
    jsonSafeReturn: true,
  });
  log("  result:", JSON.stringify(m));

  const stats = await client.readContract({
    address: CONTRACT,
    functionName: "get_stats",
    args: [],
    jsonSafeReturn: true,
  });
  log("  stats:", JSON.stringify(stats));

  if (m && m.resolved && Number(m.winner) === 2 && String(m.score).startsWith("4-6")) {
    log("🎉 CONTRACT V3 RESOLVE WORKS: France 4-6 England, winner=2 (England)");
  } else {
    log("⚠️ Unexpected result:", JSON.stringify(m));
  }
  process.exit(0);
} catch (e) {
  log("❌ ERROR:", e?.message || String(e));
  process.exit(1);
}
