# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from datetime import date, timedelta
import json
import typing


# ═══════════════════════════════════════════════════════════════
# Deterministic helpers (pure Python — identical on every validator)
# ═══════════════════════════════════════════════════════════════

def _norm(s: str) -> str:
    """Lowercase + strip non-alphanumerics for robust team name matching."""
    out = ""
    for ch in s.lower():
        if ch.isalnum():
            out += ch
    return out


def _team_matches(espn_name: str, espn_abbr: str, db_name: str) -> bool:
    """Deterministic fuzzy match between an ESPN team and our stored team name."""
    n = _norm(db_name)
    en = _norm(espn_name)
    ea = _norm(espn_abbr)
    if not n or not en:
        return False
    if en == n:
        return True
    # substring match for variants ("Man City" vs "Manchester City")
    if len(n) >= 4 and (n in en or en in n):
        return True
    # abbreviation prefix match ("FRA" vs "France")
    if ea and len(n) >= 3 and ea == n[:3]:
        return True
    return False


def _extract_score_from_espn(
    payload_text: str, team1: str, team2: str
) -> typing.Optional[typing.Dict[str, typing.Any]]:
    """
    Deterministically extract the final score of team1 (home) vs team2 (away)
    from ESPN scoreboard JSON. Returns {"score": "X-Y", "winner": N} or None.
    winner: 1 = team1, 2 = team2, 0 = draw.
    """
    try:
        data = json.loads(payload_text)
    except Exception:
        return None

    for ev in data.get("events") or []:
        comps = ev.get("competitions") or []
        if not comps:
            continue
        comp = comps[0]
        status = ((comp.get("status") or {}).get("type") or {})
        if not status.get("completed"):
            continue

        home = None
        away = None
        for c in comp.get("competitors") or []:
            if c.get("homeAway") == "home":
                home = c
            elif c.get("homeAway") == "away":
                away = c
        if home is None or away is None:
            continue

        ht = home.get("team") or {}
        at = away.get("team") or {}
        home_ok = _team_matches(
            ht.get("displayName") or ht.get("name") or "",
            ht.get("abbreviation") or "",
            team1,
        )
        away_ok = _team_matches(
            at.get("displayName") or at.get("name") or "",
            at.get("abbreviation") or "",
            team2,
        )
        if not (home_ok and away_ok):
            continue

        hs = int(home.get("score") or 0)
        aws = int(away.get("score") or 0)
        winner = 1 if hs > aws else (2 if aws > hs else 0)
        return {"score": str(hs) + "-" + str(aws), "winner": winner}

    return None


# ═══════════════════════════════════════════════════════════════
# Contract
# ═══════════════════════════════════════════════════════════════

class GoalBetV3(gl.Contract):
    """
    GoalBet V3 — AI Oracle for football prediction markets.

    This contract is the BRAIN of GoalBet:
    - Records markets and bets on-chain (verifiable history)
    - Resolves match results when a user wants to check their bets

    Resolution strategy (inside resolve_market):
      Layer 1 — DETERMINISTIC: fetch ESPN's public JSON scoreboard and extract
               the score in pure Python. Finished-match data is immutable, so
               every validator computes the exact same result → strict
               consensus is guaranteed and resolution is fast.
      Layer 2 — AI FALLBACK: if the match cannot be located deterministically,
               an LLM reads the scoreboard data and answers with a tiny,
               canonical JSON payload ({"score": "X-Y", "winner": N}) which
               validators compare with strict equality.

    Money (USDC) never touches this contract — it flows on Base Sepolia.

    V2 → V3 changes:
      - gl.eq_principle_strict_eq  →  gl.eq_principle.strict_eq   (SDK moved)
      - gl.get_webpage             →  gl.nondet.web.get
      - gl.exec_prompt             →  gl.nondet.exec_prompt(response_format="json")
      - BBC Sport HTML scraping    →  ESPN public JSON API (structured, stable)
      - create_market now stores the ESPN league slug for accurate lookups
    """

    # JSON string blobs keep storage simple and avoid TreeMap serialization issues
    # markets_data: { market_id: {date, team1, team2, league, resolved, winner, score} }
    markets_data: str
    # bets_data: [ {market, user, outcome, amount} ]
    bets_data: str

    def __init__(self):
        self.markets_data = "{}"
        self.bets_data = "[]"

    # ═══════════════════════════════════════════
    # WRITE METHODS
    # ═══════════════════════════════════════════

    @gl.public.write
    def create_market(
        self,
        market_id: str,
        game_date: str,
        team1: str,
        team2: str,
        league: str = "fifa.world",
    ) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id in markets:
            return {"ok": True, "already_exists": True, "id": market_id}

        markets[market_id] = {
            "date": game_date,
            "team1": team1,
            "team2": team2,
            "league": league,
            "resolved": False,
            "winner": -1,
            "score": "",
        }
        self.markets_data = json.dumps(markets, sort_keys=True)
        return {"ok": True, "id": market_id}

    @gl.public.write
    def record_bet(
        self, market_id: str, user_addr: str, outcome: u256, amount: u256
    ) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            raise gl.vm.UserError("market not found - call create_market first")
        if markets[market_id]["resolved"]:
            raise gl.vm.UserError("market already resolved")

        all_bets = json.loads(self.bets_data)
        all_bets.append(
            {
                "market": market_id,
                "user": user_addr,
                "outcome": int(outcome),
                "amount": int(amount),
            }
        )
        self.bets_data = json.dumps(all_bets, sort_keys=True)
        return {"ok": True, "total_bets": len(all_bets)}

    @gl.public.write
    def resolve_market(self, market_id: str) -> typing.Any:
        """
        Resolve a finished match. Called by the frontend when a user clicks
        "Resolve" to check their bet results.

        Reads the ESPN scoreboard for the match date (±1 day to cover
        timezones), extracts the score, and stores the verified winner:
        winner = 1 (team1) | 2 (team2) | 0 (draw).
        """
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            raise gl.vm.UserError("market not found - call create_market first")

        m = markets[market_id]
        if m["resolved"]:
            # Instant return — no web fetch, no consensus round needed
            return {
                "ok": True,
                "already_resolved": True,
                "winner": m["winner"],
                "score": m["score"],
            }

        # Build ESPN scoreboard URL for the match date ±1 day (timezone safety)
        y = int(m["date"][0:4])
        mo = int(m["date"][5:7])
        d = int(m["date"][8:10])
        d_from = date(y, mo, d) - timedelta(days=1)
        d_to = date(y, mo, d) + timedelta(days=1)
        range_str = (
            f"{d_from.year:04d}{d_from.month:02d}{d_from.day:02d}"
            + "-"
            + f"{d_to.year:04d}{d_to.month:02d}{d_to.day:02d}"
        )
        league = m.get("league") or "fifa.world"
        url = (
            "https://site.api.espn.com/apis/site/v2/sports/soccer/"
            + league
            + "/scoreboard?dates="
            + range_str
        )

        team1 = m["team1"]
        team2 = m["team2"]

        def fetch_result() -> str:
            # Non-deterministic block: every validator runs this independently.
            response = gl.nondet.web.get(url)
            payload = response.body.decode("utf-8")

            # ── Layer 1: deterministic extraction ──
            # Finished-match scoreboard data is immutable, so every validator
            # computes the exact same string → strict consensus is guaranteed.
            found = _extract_score_from_espn(payload, team1, team2)
            if found is not None:
                return json.dumps(found, sort_keys=True)

            # ── Layer 2: AI fallback (LLM consensus) ──
            task = (
                "You are a sports results oracle. Below is ESPN scoreboard JSON "
                "for football (soccer) matches. Find the COMPLETED match between "
                "the two teams.\n"
                + "team1 (expected home): " + team1 + "\n"
                + "team2 (expected away): " + team2 + "\n\n"
                + "Scoreboard JSON:\n" + payload[:18000] + "\n\n"
                + "Rules:\n"
                + "- winner = 1 if team1 scored more goals, 2 if team2 scored "
                + "more, 0 for a draw, -1 if the match is missing or not finished.\n"
                + '- score = "goals_team1-goals_team2" (example: "4-6"), or "" '
                + "when winner is -1.\n"
                + "Respond with ONLY this JSON object, nothing else:\n"
                + '{"score": "X-Y", "winner": N}'
            )
            ai = gl.nondet.exec_prompt(task, response_format="json")

            winner = -1
            score = ""
            if isinstance(ai, dict):
                try:
                    winner = int(ai.get("winner", -1))
                except Exception:
                    winner = -1
                score = str(ai.get("score", "") or "")
            # Canonicalize so every validator returns an identical string
            if winner not in (0, 1, 2):
                winner = -1
                score = ""
            return json.dumps({"score": score, "winner": winner}, sort_keys=True)

        result = json.loads(gl.eq_principle.strict_eq(fetch_result))

        if int(result.get("winner", -1)) == -1:
            raise gl.vm.UserError(
                "match not finished or not found in scoreboard - try again later"
            )

        m["resolved"] = True
        m["winner"] = int(result["winner"])
        m["score"] = str(result.get("score", ""))
        markets[market_id] = m
        self.markets_data = json.dumps(markets, sort_keys=True)

        return {"ok": True, "winner": m["winner"], "score": m["score"]}

    # ═══════════════════════════════════════════
    # VIEW METHODS
    # ═══════════════════════════════════════════

    @gl.public.view
    def get_market(self, market_id: str) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"error": "not found"}
        m = markets[market_id]
        return {
            "id": market_id,
            "date": m["date"],
            "team1": m["team1"],
            "team2": m["team2"],
            "league": m.get("league", ""),
            "resolved": m["resolved"],
            "winner": m["winner"],
            "score": m["score"],
        }

    @gl.public.view
    def get_all_markets(self) -> typing.Any:
        markets = json.loads(self.markets_data)
        result = []
        for mid, m in markets.items():
            result.append(
                {
                    "id": mid,
                    "team1": m["team1"],
                    "team2": m["team2"],
                    "date": m["date"],
                    "league": m.get("league", ""),
                    "resolved": m["resolved"],
                    "winner": m["winner"],
                    "score": m["score"],
                }
            )
        return result

    @gl.public.view
    def get_market_bets(self, market_id: str) -> typing.Any:
        all_bets = json.loads(self.bets_data)
        return [b for b in all_bets if b["market"] == market_id]

    @gl.public.view
    def get_stats(self) -> typing.Any:
        markets = json.loads(self.markets_data)
        all_bets = json.loads(self.bets_data)
        resolved = sum(1 for m in markets.values() if m["resolved"])
        volume = sum(b.get("amount", 0) for b in all_bets)
        return {
            "total_markets": len(markets),
            "resolved_markets": resolved,
            "total_bets": len(all_bets),
            "total_volume": volume,
        }
