# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

# Standard GoalBet Contract — All resolution steps on-chain via GenLayer AI Oracle
# Fixed for GenLayer v0.1.3+ API
# Fixed GenLayer contract: multi-league support, ESPN JSON resolution,
# resolves by matching team names + game date

from genlayer import *
import json
import typing


class FootballPredictionMarket(gl.Contract):
    """Multi-league prediction market with ESPN JSON oracle."""

    # Stored as JSON strings
    markets: TreeMap[str, str]
    bets: TreeMap[str, str]
    balances: TreeMap[str, u256]
    total_liquidity: u256

    # League slug mapping for ESPN
    LEAGUE_SLUGS = {
        "fifa.world": "fifa.world",
        "WC": "fifa.world",
        "eng.1": "eng.1",
        "PL": "eng.1",
        "esp.1": "esp.1",
        "PD": "esp.1",
        "ger.1": "ger.1",
        "BL1": "ger.1",
        "ita.1": "ita.1",
        "SA": "ita.1",
        "fra.1": "fra.1",
        "FL1": "fra.1",
        "CL": "uefa.champions",
        "EC": "uefa.europa",
    }

    def __init__(self):
        self.total_liquidity = u256(0)

    @gl.public.write
    def create_market(
        self,
        market_id: str,
        game_date: str,
        team1: str,
        team2: str,
        league_slug: str = "fifa.world"
    ) -> typing.Any:
        existing = self.markets.get(market_id, None)
        if existing is not None:
            return {"error": "Market already exists"}

        slug = self.LEAGUE_SLUGS.get(league_slug, league_slug)
        # ESPN scoreboard URL: dates in YYYYMMDD format
        date_fmt = game_date.replace("-", "")
        resolution_url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{slug}/scoreboard?dates={date_fmt}"

        market_data = json.dumps({
            "id": market_id,
            "date": game_date,
            "team1": team1,
            "team2": team2,
            "league_slug": league_slug,
            "league": league_slug,
            "url": resolution_url,
            "pool1": 0,
            "pool0": 0,
            "pool2": 0,
            "total": 0,
            "resolved": False,
            "winner": -1,
            "score": ""
        })
        self.markets[market_id] = market_data
        self.bets[market_id] = "[]"
        return {"success": True, "market_id": market_id, "league": league_slug}

    @gl.public.write
    def place_bet(self, market_id: str, outcome: u256, amount: u256) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        market = json.loads(market_json)
        if market.get("resolved", False):
            return {"error": "Market resolved"}

        outcome_int = int(outcome)
        if outcome_int not in [0, 1, 2]:
            return {"error": "Invalid outcome (0=draw,1=team1,2=team2)"}

        amount_int = int(amount)
        if amount_int < 1:
            return {"error": "Amount must be positive"}

        sender = gl.message.sender_address.as_hex
        bets_json = self.bets.get(market_id, "[]")
        bets_list = json.loads(bets_json)

        bet = {
            "user": sender,
            "outcome": outcome_int,
            "amount": amount_int,
            "claimed": False
        }
        bets_list.append(bet)
        self.bets[market_id] = json.dumps(bets_list)

        pool_key = f"pool{outcome_int}"
        market[pool_key] = market.get(pool_key, 0) + amount_int
        market["total"] = market.get("total", 0) + amount_int
        self.markets[market_id] = json.dumps(market)

        total = market.get("total", 0)
        p1 = market.get("pool1", 0)
        p0 = market.get("pool0", 0)
        p2 = market.get("pool2", 0)

        return {
            "success": True,
            "market_id": market_id,
            "user": sender,
            "outcome": outcome_int,
            "amount": amount_int,
            "total_pool": total,
            "odds": {
                "team1": round(total / p1, 2) if p1 > 0 else 2.0,
                "draw": round(total / p0, 2) if p0 > 0 else 3.0,
                "team2": round(total / p2, 2) if p2 > 0 else 2.0,
            }
        }

    @gl.public.write
    def resolve_market(self, market_id: str) -> typing.Any:
        """Resolve by fetching ESPN JSON and using strict equality consensus."""
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}

        market = json.loads(market_json)
        if market.get("resolved", False):
            return {
                "success": True,
                "already_resolved": True,
                "winner": market.get("winner", -1),
                "score": market.get("score", ""),
                "market_id": market_id
            }

        team1 = market.get("team1", "")
        team2 = market.get("team2", "")
        game_date = market.get("date", "")
        league_slug = market.get("league_slug", "fifa.world")
        url = market.get("url", "")

        def fetch_espn_result() -> str:
            # Fetch ESPN scoreboard page as text (contains JSON embedded)
            web_text = gl.nondet.web.render(url, mode="text")

            # Build a structured prompt that asks the LLM to find the match
            # and return strict JSON
            prompt_text = f"""You are analyzing an ESPN scoreboard JSON response.
Find the match result for:
- Team 1: {team1}
- Team 2: {team2}
- Date: {game_date}
- League: {league_slug}

Web response (first 8000 chars):
{web_text[:8000]}

Look for the event entry where:
- competitors[0] (home) matches '{team1}' or its abbreviation/code
- competitors[1] (away) matches '{team2}' or its abbreviation/code
- status indicates FINISHED, FULL_TIME, AET, or post

Extract:
- score: final score as "X-Y" (e.g., "4-6", "1-0", "2-1")
- winner: 1 if team1/home wins, 2 if team2/away wins, 0 for draw, -1 if not finished

Respond ONLY with this exact JSON format (no extra text, no markdown):
{{"score":"X-Y","winner":N}}
"""
            response = gl.nondet.exec_prompt(prompt_text)
            # Clean up response
            clean = response.replace("```json", "").replace("```", "").strip()
            # Find first JSON object
            import re
            match = re.search(r'\{[^{}]*"score"[^{}]*"winner"[^{}]*\}', clean, re.DOTALL)
            if not match:
                match = re.search(r'\{.*?\}', clean, re.DOTALL)
            if match:
                clean = match.group(0)
            return clean

        try:
            result_str = gl.eq_principle.strict_eq(fetch_espn_result)
        except Exception as exc:
            return {
                "success": False,
                "error": f"Consensus failed: {str(exc)[:200]}",
                "market_id": market_id
            }

        try:
            result = json.loads(result_str)
        except json.JSONDecodeError:
            return {"success": False, "error": "Oracle returned invalid JSON", "raw": result_str}

        winner_val = result.get("winner", -1)
        score_str = result.get("score", "")

        if winner_val == -1:
            return {"success": False, "error": "Match not finished yet", "market_id": market_id}

        market["resolved"] = True
        market["winner"] = int(winner_val)
        market["score"] = str(score_str)
        self.markets[market_id] = json.dumps(market)

        return {
            "success": True,
            "market_id": market_id,
            "team1": team1,
            "team2": team2,
            "date": game_date,
            "winner": int(winner_val),
            "score": str(score_str),
            "league": league_slug,
            "source": "genlayer-espn"
        }

    @gl.public.write
    def claim_winnings(self, market_id: str) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        market = json.loads(market_json)
        if not market.get("resolved", False):
            return {"error": "Market not resolved"}

        sender = gl.message.sender_address.as_hex
        winner = market.get("winner", -1)
        total_pool = market.get("total", 0)

        winning_pool = 0
        if winner == 1:
            winning_pool = market.get("pool1", 0)
        elif winner == 0:
            winning_pool = market.get("pool0", 0)
        elif winner == 2:
            winning_pool = market.get("pool2", 0)

        bets_json = self.bets.get(market_id, "[]")
        bets_list = json.loads(bets_json)

        payout = 0
        updated_bets = []
        for bet in bets_list:
            user = bet.get("user", "")
            claimed = bet.get("claimed", False)
            bet_outcome = bet.get("outcome", -1)
            amount = bet.get("amount", 0)

            if user == sender and not claimed:
                if bet_outcome == winner and winning_pool > 0:
                    payout += (amount * total_pool) // winning_pool
                bet["claimed"] = True
            updated_bets.append(bet)

        self.bets[market_id] = json.dumps(updated_bets)

        if payout == 0:
            return {"success": False, "message": "No winning payout for your bet", "market_id": market_id}

        current = self.balances.get(sender, u256(0))
        self.balances[sender] = current + u256(payout)

        return {
            "success": True,
            "market_id": market_id,
            "user": sender,
            "bet_outcome": "won" if payout > 0 else "lost",
            "payout": payout,
            "new_balance": int(self.balances[sender])
        }

    @gl.public.view
    def get_market(self, market_id: str) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        return json.loads(market_json)

    @gl.public.view
    def get_all_markets(self) -> typing.Any:
        result = []
        for k in self.markets:
            data = json.loads(self.markets[k])
            data.pop("url", None)  # don't expose internal URL
            result.append(data)
        return result

    @gl.public.view
    def get_stats(self) -> typing.Any:
        total = int(self.total_liquidity)
        return {
            "total_liquidity": total,
            "markets": len(self.markets),
            "version": "v2.2-multi-league",
            "supported_leagues": list(self.LEAGUE_SLUGS.values())
        }
