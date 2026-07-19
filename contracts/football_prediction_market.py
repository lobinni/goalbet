# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class FootballPredictionMarket(gl.Contract):
    """
    Football Prediction Market - Polymarket style pari-mutuel betting.
    Winners split the entire pool proportionally.
    """
    
    # Use str for JSON storage, u256 for integers
    markets: TreeMap[str, str]
    bets: TreeMap[str, str]
    balances: TreeMap[str, u256]
    total_liquidity: u256

    def __init__(self):
        self.total_liquidity = u256(0)

    @gl.public.write
    def create_market(
        self,
        market_id: str,
        game_date: str,
        team1: str,
        team2: str
    ) -> typing.Any:
        existing = self.markets.get(market_id, None)
        if existing is not None:
            return {"error": "Market already exists"}
        
        resolution_url = "https://www.bbc.com/sport/football/scores-fixtures/" + game_date
        
        market_data = json.dumps({
            "id": market_id,
            "date": game_date,
            "team1": team1,
            "team2": team2,
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
        
        return {"success": True, "market_id": market_id}

    @gl.public.write
    def place_bet(self, market_id: str, outcome: u256, amount: u256) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        
        market = json.loads(market_json)
        
        if market["resolved"]:
            return {"error": "Market resolved"}
        
        outcome_int = int(outcome)
        if outcome_int not in [0, 1, 2]:
            return {"error": "Invalid outcome"}
        
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
        
        if outcome_int == 1:
            market["pool1"] += amount_int
        elif outcome_int == 0:
            market["pool0"] += amount_int
        else:
            market["pool2"] += amount_int
        
        market["total"] += amount_int
        self.total_liquidity = self.total_liquidity + amount
        self.markets[market_id] = json.dumps(market)
        
        total = market["total"]
        p1 = market["pool1"]
        p0 = market["pool0"]
        p2 = market["pool2"]
        
        return {
            "success": True,
            "total": total,
            "odds": {
                "team1": round(total / p1, 2) if p1 > 0 else 2.0,
                "draw": round(total / p0, 2) if p0 > 0 else 3.0,
                "team2": round(total / p2, 2) if p2 > 0 else 2.0
            }
        }

    @gl.public.write
    def resolve_market(self, market_id: str) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        
        market = json.loads(market_json)
        
        if market["resolved"]:
            return {"error": "Already resolved"}
        
        team1 = market["team1"]
        team2 = market["team2"]
        url = market["url"]
        
        def fetch_result() -> str:
            web_data = gl.get_webpage(url, mode="text")
            
            task = f"""In the following web page, find the match result between:
Team 1: {team1}
Team 2: {team2}

Web page content:
{web_data}
End of web page data.

If it says "Kick off [time]" between the names, the game hasn't started.
If you fail to find the score, assume the game is not resolved.

Respond with the following JSON format:
{{"score": "X-Y", "winner": N}}
Where winner is: 1 if team1 wins, 2 if team2 wins, 0 for draw, -1 if not finished.
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
"""
            result = gl.exec_prompt(task)
            result = result.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(result)
            return json.dumps(parsed, sort_keys=True)
        
        result_str = gl.eq_principle_strict_eq(fetch_result)
        result = json.loads(result_str)
        
        if result["winner"] == -1:
            return {"error": "Match not finished"}
        
        market["resolved"] = True
        market["winner"] = result["winner"]
        market["score"] = result["score"]
        self.markets[market_id] = json.dumps(market)
        
        return {
            "success": True,
            "winner": result["winner"],
            "score": result["score"]
        }

    @gl.public.write
    def claim_winnings(self, market_id: str) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Market not found"}
        
        market = json.loads(market_json)
        
        if not market["resolved"]:
            return {"error": "Not resolved"}
        
        sender = gl.message.sender_address.as_hex
        winner = market["winner"]
        total_pool = market["total"]
        
        if winner == 1:
            winning_pool = market["pool1"]
        elif winner == 0:
            winning_pool = market["pool0"]
        else:
            winning_pool = market["pool2"]
        
        bets_json = self.bets.get(market_id, "[]")
        bets_list = json.loads(bets_json)
        
        payout = 0
        updated_bets = []
        
        for bet in bets_list:
            if bet["user"] == sender and not bet["claimed"]:
                if bet["outcome"] == winner and winning_pool > 0:
                    payout += (bet["amount"] * total_pool) // winning_pool
                bet["claimed"] = True
            updated_bets.append(bet)
        
        self.bets[market_id] = json.dumps(updated_bets)
        
        if payout == 0:
            return {"error": "No winnings"}
        
        current_balance = self.balances.get(sender, u256(0))
        self.balances[sender] = current_balance + u256(payout)
        
        return {
            "success": True,
            "payout": payout,
            "new_balance": int(self.balances[sender])
        }

    @gl.public.write
    def deposit(self, amount: u256) -> typing.Any:
        if amount <= u256(0):
            return {"error": "Invalid amount"}
        
        sender = gl.message.sender_address.as_hex
        current = self.balances.get(sender, u256(0))
        self.balances[sender] = current + amount
        self.total_liquidity = self.total_liquidity + amount
        
        return {"success": True, "balance": int(self.balances[sender])}

    @gl.public.write
    def withdraw(self, amount: u256) -> typing.Any:
        sender = gl.message.sender_address.as_hex
        current = self.balances.get(sender, u256(0))
        
        if amount > current:
            return {"error": "Insufficient balance"}
        
        self.balances[sender] = current - amount
        
        return {"success": True, "remaining": int(self.balances[sender])}

    @gl.public.view
    def get_market(self, market_id: str) -> typing.Any:
        market_json = self.markets.get(market_id, None)
        if market_json is None:
            return {"error": "Not found"}
        
        market = json.loads(market_json)
        total = market["total"]
        p1 = market["pool1"]
        p0 = market["pool0"]
        p2 = market["pool2"]
        
        return {
            "id": market["id"],
            "date": market["date"],
            "team1": market["team1"],
            "team2": market["team2"],
            "pools": {"team1": p1, "draw": p0, "team2": p2, "total": total},
            "odds": {
                "team1": round(total / p1, 2) if p1 > 0 else 2.0,
                "draw": round(total / p0, 2) if p0 > 0 else 3.0,
                "team2": round(total / p2, 2) if p2 > 0 else 2.0
            },
            "resolved": market["resolved"],
            "winner": market["winner"],
            "score": market["score"]
        }

    @gl.public.view
    def get_user_bets(self, market_id: str, user_address: str) -> typing.Any:
        bets_json = self.bets.get(market_id, "[]")
        bets_list = json.loads(bets_json)
        
        result = []
        for bet in bets_list:
            if bet["user"] == user_address:
                result.append(bet)
        return result

    @gl.public.view
    def get_balance(self, user_address: str) -> u256:
        return self.balances.get(user_address, u256(0))

    @gl.public.view
    def get_all_markets(self) -> typing.Any:
        return list(self.markets.keys())

    @gl.public.view
    def get_total_liquidity(self) -> u256:
        return self.total_liquidity
