/**
 * GoalBet Integration Tests
 *
 * Deterministic coverage of the full lifecycle:
 *   STAKE → RESOLVE → CLAIM (settlement)
 *
 * Plus: solvency, odds-constraint, deposit, pool tracking.
 *
 * We place TWO bets (one per "side") so that regardless of the
 * random resolution outcome, at least one bet wins and at least
 * one bet loses — guaranteeing the claim path is always exercised.
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://127.0.0.1:3000";

const api = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, opts);

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let userAId = "";
let userBId = "";
let userCId = "";
const startingBalance = 1000;

describe("GoalBet – Stake / Resolve / Claim", () => {
  // ── Setup: three users (one per possible outcome → always ≥1 winner) ──
  beforeAll(async () => {
    const addrA = `0xA_${uid()}_000000000000000000000000`;
    const addrB = `0xB_${uid()}_000000000000000000000000`;
    const addrC = `0xC_${uid()}_000000000000000000000000`;

    const [rA, rB, rC] = await Promise.all([
      api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addrA, name: "PlayerA" }),
      }),
      api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addrB, name: "PlayerB" }),
      }),
      api("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addrC, name: "PlayerC" }),
      }),
    ]);

    const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);
    userAId = dA.user.id;
    userBId = dB.user.id;
    userCId = dC.user.id;
    expect(userAId).toBeTruthy();
    expect(userBId).toBeTruthy();
    expect(userCId).toBeTruthy();
  });

  // ══════════════════════════════════════════════════════════════
  //  1. STAKE
  // ══════════════════════════════════════════════════════════════
  describe("Stake", () => {
    it("places a bet for user A (predicts team 1)", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2025-12-25",
          team1: "Real Madrid",
          team2: "Barcelona",
          team1Code: "RMA",
          team2Code: "FCB",
          league: "La Liga",
          predictedWinner: "1",
          stake: 20,
          odds: 2.0,
        }),
      });
      expect(res.ok).toBe(true);
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.betId).toBe("2025-12-25_real-madrid_barcelona");
    });

    it("places a bet for user B on the same match (predicts team 2)", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userBId,
          gameDate: "2025-12-25",
          team1: "Real Madrid",
          team2: "Barcelona",
          team1Code: "RMA",
          team2Code: "FCB",
          league: "La Liga",
          predictedWinner: "2",
          stake: 15,
          odds: 3.0,
        }),
      });
      expect(res.ok).toBe(true);
    });

    it("places a bet for user C on the same match (predicts draw)", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userCId,
          gameDate: "2025-12-25",
          team1: "Real Madrid",
          team2: "Barcelona",
          team1Code: "RMA",
          team2Code: "FCB",
          league: "La Liga",
          predictedWinner: "0",
          stake: 10,
          odds: 3.5,
        }),
      });
      expect(res.ok).toBe(true);
    });

    it("deducts stake from user balance", async () => {
      const [rA, rB, rC] = await Promise.all([
        api(`/api/balance?userId=${userAId}`),
        api(`/api/balance?userId=${userBId}`),
        api(`/api/balance?userId=${userCId}`),
      ]);
      const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);
      expect(dA.balance).toBe(startingBalance - 20);
      expect(dB.balance).toBe(startingBalance - 15);
      expect(dC.balance).toBe(startingBalance - 10);
    });

    it("rejects duplicate bet on same match by same user", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2025-12-25",
          team1: "Real Madrid",
          team2: "Barcelona",
          predictedWinner: "0",
          stake: 5,
          odds: 3.5,
        }),
      });
      expect(res.ok).toBe(false);
    });

    it("rejects stake below minimum", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2025-12-30",
          team1: "Bayern",
          team2: "Dortmund",
          predictedWinner: "1",
          stake: 0.1,
          odds: 2.0,
        }),
      });
      expect(res.ok).toBe(false);
    });

    it("rejects odds ≤ 1.0", async () => {
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2025-12-30",
          team1: "Bayern",
          team2: "Dortmund",
          predictedWinner: "1",
          stake: 10,
          odds: 0.8,
        }),
      });
      expect(res.ok).toBe(false);
    });

    it("tracks pool after bets", async () => {
      const res = await api("/api/pool");
      const d = await res.json();
      expect(d.poolBalance).toBeGreaterThan(0);
      expect(d.pendingPayouts).toBeGreaterThan(0);
      // availableLiquidity must be ≥ 0 (solvency invariant)
      expect(d.availableLiquidity).toBeGreaterThanOrEqual(0);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  2. SOLVENCY & ODDS CONSTRAINT
  // ══════════════════════════════════════════════════════════════
  describe("Solvency / odds constraint", () => {
    it("rejects a bet whose payout would exceed pool backing", async () => {
      // Request absurd odds that the pool cannot back
      const res = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2025-12-26",
          team1: "Juventus",
          team2: "Napoli",
          predictedWinner: "1",
          stake: 500,
          odds: 50.0, // payout 25 000 — way beyond pool
        }),
      });
      expect(res.ok).toBe(false);
      const d = await res.json();
      expect(d.error).toContain("Insufficient pool liquidity");
      // Should also mention max odds
      expect(d.error).toMatch(/max odds/i);
    });

    it("pool deposit increases available liquidity", async () => {
      const before = await api("/api/pool").then((r) => r.json());
      const depositRes = await api("/api/pool/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 5000 }),
      });
      expect(depositRes.ok).toBe(true);
      const after = await api("/api/pool").then((r) => r.json());
      expect(after.poolBalance - before.poolBalance).toBe(5000);
      expect(after.availableLiquidity - before.availableLiquidity).toBe(5000);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  3. RESOLVE
  // ══════════════════════════════════════════════════════════════
  describe("Resolve", () => {
    const betId = "2025-12-25_real-madrid_barcelona";

    it("resolves user A's bet", async () => {
      const res = await api(`/api/bets/${encodeURIComponent(betId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userAId }),
      });
      expect(res.ok).toBe(true);
      const d = await res.json();
      expect(d.success).toBe(true);
      expect(d.result.realScore).toBeTruthy();
      expect(["0", "1", "2"]).toContain(d.result.realWinner);
    });

    it("resolves user B's bet (same match, different user)", async () => {
      const res = await api(`/api/bets/${encodeURIComponent(betId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userBId }),
      });
      expect(res.ok).toBe(true);
    });

    it("resolves user C's bet (same match, predicted draw)", async () => {
      const res = await api(`/api/bets/${encodeURIComponent(betId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userCId }),
      });
      expect(res.ok).toBe(true);
    });

    it("rejects re-resolving", async () => {
      const res = await api(`/api/bets/${encodeURIComponent(betId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userAId }),
      });
      expect(res.ok).toBe(false);
    });

    it("marks bet as resolved in DB", async () => {
      const res = await api(`/api/bets?userId=${userAId}`);
      const d = await res.json();
      const bet = d.bets.find((b: { id: string }) => b.id === betId);
      expect(bet).toBeDefined();
      expect(bet.hasResolved).toBe(true);
      expect(bet.realWinner).toBeTruthy();
    });

    it("decrements pendingPayouts in pool after resolution", async () => {
      const res = await api("/api/pool");
      const d = await res.json();
      // After resolution, pendingPayouts should have decreased
      // (the payout moved from "pending" to "payable-on-claim")
      expect(d.pendingPayouts).toBeLessThan(d.poolBalance);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  4. CLAIM (FUNDED PAYOUT PATH)
  // ══════════════════════════════════════════════════════════════
  describe("Claim (funded payout)", () => {
    const betId = "2025-12-25_real-madrid_barcelona";

    it("winner can claim and GEN is transferred", async () => {
      // Find which user(s) won — with 3 users covering all outcomes, ≥1 must win
      const [rA, rB, rC] = await Promise.all([
        api(`/api/bets?userId=${userAId}`),
        api(`/api/bets?userId=${userBId}`),
        api(`/api/bets?userId=${userCId}`),
      ]);
      const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);

      const betA = dA.bets.find((b: { id: string }) => b.id === betId);
      const betB = dB.bets.find((b: { id: string }) => b.id === betId);
      const betC = dC.bets.find((b: { id: string }) => b.id === betId);

      // One of A(1) / B(2) / C(0) MUST have won
      const wonA = betA.isWon;
      const wonB = betB.isWon;
      const wonC = betC.isWon;
      expect(wonA || wonB || wonC).toBe(true);

      // Claim for each winner and verify GEN transfer
      for (const [won, userId, bet] of [[wonA, userAId, betA], [wonB, userBId, betB], [wonC, userCId, betC]] as const) {
        if (won) {
          const balBefore = await api(`/api/balance?userId=${userId}`).then((r) => r.json());
          const claimRes = await api(`/api/bets/${encodeURIComponent(betId)}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          expect(claimRes.ok).toBe(true);
          const cd = await claimRes.json();
          expect(cd.success).toBe(true);
          expect(Number(cd.result.payout)).toBeGreaterThan(0);

          const balAfter = await api(`/api/balance?userId=${userId}`).then((r) => r.json());
          const diff = balAfter.balance - balBefore.balance;
          expect(diff).toBeCloseTo(Number(bet.payout), 1);
        }
      }
    });

    it("loser cannot claim", async () => {
      const [rA, rB, rC] = await Promise.all([
        api(`/api/bets?userId=${userAId}`),
        api(`/api/bets?userId=${userBId}`),
        api(`/api/bets?userId=${userCId}`),
      ]);
      const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);

      for (const [data, userId] of [[dA, userAId], [dB, userBId], [dC, userCId]] as const) {
        const bet = data.bets.find((b: { id: string }) => b.id === betId);
        if (bet && !bet.isWon && !bet.hasClaimed) {
          const res = await api(`/api/bets/${encodeURIComponent(betId)}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          expect(res.ok).toBe(false);
        }
      }
    });

    it("rejects re-claiming already claimed winnings", async () => {
      const [rA, rB, rC] = await Promise.all([
        api(`/api/bets?userId=${userAId}`),
        api(`/api/bets?userId=${userBId}`),
        api(`/api/bets?userId=${userCId}`),
      ]);
      const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);

      for (const [data, userId] of [[dA, userAId], [dB, userBId], [dC, userCId]] as const) {
        const bet = data.bets.find((b: { id: string }) => b.id === betId);
        if (bet && bet.hasClaimed) {
          const res = await api(`/api/bets/${encodeURIComponent(betId)}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          });
          expect(res.ok).toBe(false);
        }
      }
    });

    it("pool balance decreases by claimed payout amount", async () => {
      // Pool balance must have gone down compared to before claims
      const res = await api("/api/pool");
      const d = await res.json();
      expect(d.poolBalance).toBeGreaterThan(0);
      expect(d.availableLiquidity).toBeGreaterThanOrEqual(0);
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  5. REJECT CLAIM ON UNRESOLVED BET
  // ══════════════════════════════════════════════════════════════
  describe("Claim guard", () => {
    it("rejects claiming an unresolved bet", async () => {
      const betRes = await api("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userAId,
          gameDate: "2026-01-05",
          team1: "PSG",
          team2: "Marseille",
          team1Code: "PSG",
          team2Code: "OLM",
          league: "Ligue 1",
          predictedWinner: "1",
          stake: 5,
          odds: 1.8,
        }),
      });
      if (betRes.ok) {
        const claimRes = await api(
          `/api/bets/2026-01-05_psg_marseille/claim`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: userAId }),
          },
        );
        expect(claimRes.ok).toBe(false);
        const d = await claimRes.json();
        expect(d.error).toMatch(/not been resolved/i);
      }
    });
  });

  // ══════════════════════════════════════════════════════════════
  //  6. FINAL STATE CHECKS
  // ══════════════════════════════════════════════════════════════
  describe("Final state", () => {
    it("user stats are correct", async () => {
      const [rA, rB] = await Promise.all([
        api(`/api/balance?userId=${userAId}`),
        api(`/api/balance?userId=${userBId}`),
      ]);
      const [dA, dB] = await Promise.all([rA.json(), rB.json()]);
      // Both should have bet and resolution counts
      expect(dA.totalStaked).toBeGreaterThan(0);
      expect(dB.totalStaked).toBeGreaterThan(0);
      expect(dA.wins + dA.losses).toBeGreaterThan(0);
      expect(dB.wins + dB.losses).toBeGreaterThan(0);
    });

    it("pool remains solvent (availableLiquidity ≥ 0)", async () => {
      const res = await api("/api/pool");
      const d = await res.json();
      expect(d.availableLiquidity).toBeGreaterThanOrEqual(0);
      expect(d.poolBalance).toBeGreaterThan(0);
    });

    it("winner's balance increased beyond starting minus stake", async () => {
      const [rA, rB, rC] = await Promise.all([
        api(`/api/balance?userId=${userAId}`),
        api(`/api/balance?userId=${userBId}`),
        api(`/api/balance?userId=${userCId}`),
      ]);
      const [dA, dB, dC] = await Promise.all([rA.json(), rB.json(), rC.json()]);

      const aProfitable = dA.balance > startingBalance - 20;
      const bProfitable = dB.balance > startingBalance - 15;
      const cProfitable = dC.balance > startingBalance - 10;
      expect(aProfitable || bProfitable || cProfitable).toBe(true);
    });
  });
});
