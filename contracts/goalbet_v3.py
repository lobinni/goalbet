# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class GoalBetV3(gl.Contract):
    """
    GoalBet V3 — Multi-source AI Oracle for football results.
    Fetches from ESPN, BBC Sport, and Google to find match results.
    """

    markets_data: str
    bets_data: str

    def __init__(self):
        self.markets_data = "{}"
        self.bets_data = "[]"

    @gl.public.write
    def create_market(self, market_id: str, game_date: str, team1: str, team2: str) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id in markets:
            return {"ok": False, "error": "exists"}
        markets[market_id] = {"date": game_date, "team1": team1, "team2": team2, "resolved": False, "winner": -1, "score": ""}
        self.markets_data = json.dumps(markets)
        return {"ok": True, "id": market_id}

    @gl.public.write
    def record_bet(self, market_id: str, user_addr: str, outcome: u256, amount: u256) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"ok": False, "error": "not found"}
        if markets[market_id]["resolved"]:
            return {"ok": False, "error": "resolved"}
        all_bets = json.loads(self.bets_data)
        all_bets.append({"market": market_id, "user": user_addr, "outcome": int(outcome), "amount": int(amount)})
        self.bets_data = json.dumps(all_bets)
        return {"ok": True}

    @gl.public.write
    def resolve_market(self, market_id: str) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"ok": False, "error": "not found"}
        m = markets[market_id]
        if m["resolved"]:
            return {"ok": False, "error": "already resolved"}

        team1 = m["team1"]
        team2 = m["team2"]
        game_date = m["date"]

        def fetch_result() -> str:
            # Try multiple sources for reliability
            sources_data = ""

            # Source 1: ESPN scoreboard
            try:
                espn_date = game_date.replace("-", "")
                espn_url = f"https://www.espn.com/soccer/scoreboard/_/date/{espn_date}"
                espn_data = gl.get_webpage(espn_url, mode="text")
                sources_data += f"\n--- ESPN DATA ---\n{espn_data[:3000]}\n"
            except Exception:
                pass

            # Source 2: BBC Sport
            try:
                bbc_url = f"https://www.bbc.com/sport/football/scores-fixtures/{game_date}"
                bbc_data = gl.get_webpage(bbc_url, mode="text")
                sources_data += f"\n--- BBC DATA ---\n{bbc_data[:3000]}\n"
            except Exception:
                pass

            # Source 3: Google search
            try:
                google_url = f"https://www.google.com/search?q={team1}+vs+{team2}+{game_date}+score"
                google_data = gl.get_webpage(google_url, mode="text")
                sources_data += f"\n--- GOOGLE DATA ---\n{google_data[:3000]}\n"
            except Exception:
                pass

            if not sources_data.strip():
                return json.dumps({"score": "-", "winner": -1})

            task = f"""Find the final match score between:
Team 1: {team1}
Team 2: {team2}
Date: {game_date}

Data from multiple sources:
{sources_data}

IMPORTANT: Team 1 is the HOME team. Find the score where Team 1's goals are listed FIRST.
For example if Team1 scored 4 and Team2 scored 6, the score is "4-6".

Respond ONLY with this JSON format:
{{"score": "X-Y", "winner": N}}
Where:
- score is "HomeGoals-AwayGoals" (Team 1 goals first, Team 2 goals second)
- winner is 1 if Team 1 has more goals, 2 if Team 2 has more goals, 0 for draw, -1 if game not finished

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

        return {"ok": True, "winner": result["winner"], "score": result["score"]}

    @gl.public.view
    def get_market(self, market_id: str) -> typing.Any:
        markets = json.loads(self.markets_data)
        if market_id not in markets:
            return {"error": "not found"}
        m = markets[market_id]
        return {"id": market_id, "date": m["date"], "team1": m["team1"], "team2": m["team2"],
                "resolved": m["resolved"], "winner": m["winner"], "score": m["score"]}

    @gl.public.view
    def get_all_markets(self) -> typing.Any:
        return [{"id": k, **v} for k, v in json.loads(self.markets_data).items()]

    @gl.public.view
    def get_stats(self) -> typing.Any:
        markets = json.loads(self.markets_data)
        return {"total_markets": len(markets), "total_bets": len(json.loads(self.bets_data)),
                "resolved": sum(1 for m in markets.values() if m["resolved"])}
