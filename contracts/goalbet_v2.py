# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class GoalBetV2(gl.Contract):
    """
    GoalBet V2 — AI Oracle for football prediction markets.

    This contract is the BRAIN:
    - Records markets and bets on-chain (verifiable)
    - Resolves match results via AI Oracle (BBC Sport + LLM consensus)
    - Does NOT handle money (USDC flows on Base Sepolia)
    """

    # All data stored as single JSON strings to avoid TreeMap deserialization issues
    # markets_data: JSON string of { market_id: {date, team1, team2, resolved, winner, score} }
    markets_data: str
    # bets_data: JSON string of [ {market_id, user, outcome, amount} ]
    bets_data: str

    def __init__(self):
        self.markets_data = "{}"
        self.bets_data = "[]"

    # ═══════════════════════════════════════════
    # WRITE METHODS
    # ═══════════════════════════════════════════

    @gl.public.write
    def create_market(
        self, market_id: str, game_date: str, team1: str, team2: str
    ) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id in markets:
            return {"ok": False, "error": "exists"}

        markets[market_id] = {
            "date": game_date,
            "team1": team1,
            "team2": team2,
            "resolved": False,
            "winner": -1,
            "score": ""
        }
        self.markets_data = json.dumps(markets)
        return {"ok": True, "id": market_id}

    @gl.public.write
    def record_bet(
        self, market_id: str, user_addr: str, outcome: u256, amount: u256
    ) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"ok": False, "error": "market not found"}
        if markets[market_id]["resolved"]:
            return {"ok": False, "error": "market resolved"}

        all_bets = json.loads(self.bets_data)
        all_bets.append({
            "market": market_id,
            "user": user_addr,
            "outcome": int(outcome),
            "amount": int(amount)
        })
        self.bets_data = json.dumps(all_bets)
        return {"ok": True, "total_bets": len(all_bets)}

    @gl.public.write
    def resolve_market(self, market_id: str) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"ok": False, "error": "market not found"}

        m = markets[market_id]
        if m["resolved"]:
            return {"ok": False, "error": "already resolved"}

        url = "https://www.bbc.com/sport/football/scores-fixtures/" + m["date"]
        team1 = m["team1"]
        team2 = m["team2"]

        def fetch_result() -> str:
            web_data = gl.get_webpage(url, mode="text")
            task = f"""In the following web page, find the match result between:
Team 1: {team1}
Team 2: {team2}

Web page content:
{web_data}
End of web page data.

If it says "Kick off [time]" between the team names, the game hasn't started.
If you cannot find the score, assume the game is not resolved yet.

Respond with the following JSON format:
{{"score": "X-Y", "winner": N}}
Where winner is: 1 if team1 wins, 2 if team2 wins, 0 for draw, -1 if not finished.
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors."""
            result = gl.exec_prompt(task)
            result = result.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(result)
            return json.dumps(parsed, sort_keys=True)

        result = json.loads(gl.eq_principle_strict_eq(fetch_result))

        if result["winner"] == -1:
            return {"ok": False, "error": "match not finished"}

        m["resolved"] = True
        m["winner"] = result["winner"]
        m["score"] = result["score"]
        markets[market_id] = m
        self.markets_data = json.dumps(markets)

        return {
            "ok": True,
            "winner": result["winner"],
            "score": result["score"]
        }

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
            "resolved": m["resolved"],
            "winner": m["winner"],
            "score": m["score"]
        }

    @gl.public.view
    def get_all_markets(self) -> typing.Any:
        markets = json.loads(self.markets_data)
        result = []
        for mid, m in markets.items():
            result.append({
                "id": mid,
                "team1": m["team1"],
                "team2": m["team2"],
                "date": m["date"],
                "resolved": m["resolved"],
                "winner": m["winner"],
                "score": m["score"]
            })
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
        return {
            "total_markets": len(markets),
            "resolved_markets": resolved,
            "total_bets": len(all_bets)
        }
