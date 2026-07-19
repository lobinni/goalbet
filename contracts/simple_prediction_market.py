# { "Depends": "py-genlayer:test" }

from genlayer import *
import json
import typing


class SimplePredictionMarket(gl.Contract):
    """Simple prediction market for football matches."""
    
    markets: dict
    bets: dict
    balances: dict

    def __init__(self):
        self.markets = {}
        self.bets = {}
        self.balances = {}

    @gl.public.write
    def create_market(self, market_id: str, game_date: str, team1: str, team2: str) -> typing.Any:
        if market_id in self.markets:
            return {"error": "exists"}
        
        self.markets[market_id] = {
            "id": market_id,
            "date": game_date,
            "team1": team1,
            "team2": team2,
            "url": "https://www.bbc.com/sport/football/scores-fixtures/" + game_date,
            "pool1": 0,
            "pool0": 0,
            "pool2": 0,
            "total": 0,
            "resolved": False,
            "winner": -1,
            "score": ""
        }
        self.bets[market_id] = []
        return {"success": True}

    @gl.public.write
    def bet(self, market_id: str, outcome: int, amount: int) -> typing.Any:
        if market_id not in self.markets:
            return {"error": "not found"}
        
        m = self.markets[market_id]
        if m["resolved"]:
            return {"error": "resolved"}
        
        sender = gl.message.sender_address.as_hex
        
        self.bets[market_id].append({
            "user": sender,
            "outcome": outcome,
            "amount": amount,
            "claimed": False
        })
        
        if outcome == 1:
            m["pool1"] += amount
        elif outcome == 0:
            m["pool0"] += amount
        else:
            m["pool2"] += amount
        m["total"] += amount
        
        self.markets[market_id] = m
        return {"success": True, "total": m["total"]}

    @gl.public.write
    def resolve(self, market_id: str) -> typing.Any:
        if market_id not in self.markets:
            return {"error": "not found"}
        
        m = self.markets[market_id]
        if m["resolved"]:
            return {"error": "already resolved"}
        
        def fetch() -> str:
            data = gl.get_webpage(m["url"], mode="text")
            task = f"""Find result for {m["team1"]} vs {m["team2"]} in:
{data}
Return JSON: {{"score": "X-Y", "winner": N}} where N is 1,2,0,-1
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors."""
            r = gl.exec_prompt(task).replace("```json","").replace("```","")
            return json.dumps(json.loads(r), sort_keys=True)
        
        result = json.loads(gl.eq_principle_strict_eq(fetch))
        
        if result["winner"] == -1:
            return {"error": "not finished"}
        
        m["resolved"] = True
        m["winner"] = result["winner"]
        m["score"] = result["score"]
        self.markets[market_id] = m
        
        return {"success": True, "winner": result["winner"]}

    @gl.public.write
    def claim(self, market_id: str) -> typing.Any:
        if market_id not in self.markets:
            return {"error": "not found"}
        
        m = self.markets[market_id]
        if not m["resolved"]:
            return {"error": "not resolved"}
        
        sender = gl.message.sender_address.as_hex
        winner = m["winner"]
        
        if winner == 1:
            wp = m["pool1"]
        elif winner == 0:
            wp = m["pool0"]
        else:
            wp = m["pool2"]
        
        payout = 0
        for b in self.bets[market_id]:
            if b["user"] == sender and not b["claimed"]:
                if b["outcome"] == winner and wp > 0:
                    payout += (b["amount"] * m["total"]) // wp
                b["claimed"] = True
        
        if payout == 0:
            return {"error": "nothing to claim"}
        
        if sender not in self.balances:
            self.balances[sender] = 0
        self.balances[sender] += payout
        
        return {"success": True, "payout": payout}

    @gl.public.view
    def get_market(self, market_id: str) -> typing.Any:
        return self.markets.get(market_id, {})

    @gl.public.view
    def get_balance(self, addr: str) -> int:
        return self.balances.get(addr, 0)

    @gl.public.view
    def get_markets(self) -> typing.Any:
        return list(self.markets.keys())
