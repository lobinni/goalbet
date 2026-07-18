# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json
import typing


class SimpleBet(gl.Contract):
    """Simple football betting contract for a single match."""
    
    game_date: str
    team1: str
    team2: str
    resolution_url: str
    has_resolved: bool
    winner: i32
    score: str
    pool1: u256
    pool0: u256
    pool2: u256
    total_pool: u256
    bets: TreeMap[str, str]
    balances: TreeMap[str, u256]

    def __init__(self, game_date: str, team1: str, team2: str):
        self.game_date = game_date
        self.team1 = team1
        self.team2 = team2
        self.resolution_url = "https://www.bbc.com/sport/football/scores-fixtures/" + game_date
        self.has_resolved = False
        self.winner = i32(-1)
        self.score = ""
        self.pool1 = u256(0)
        self.pool0 = u256(0)
        self.pool2 = u256(0)
        self.total_pool = u256(0)

    @gl.public.write
    def bet(self, outcome: u256, amount: u256) -> typing.Any:
        if self.has_resolved:
            return {"error": "resolved"}
        
        outcome_int = int(outcome)
        if outcome_int not in [0, 1, 2]:
            return {"error": "invalid outcome"}
        
        sender = gl.message.sender_address.as_hex
        
        existing = self.bets.get(sender, "[]")
        bets_list = json.loads(existing)
        bets_list.append({"outcome": outcome_int, "amount": int(amount), "claimed": False})
        self.bets[sender] = json.dumps(bets_list)
        
        if outcome_int == 1:
            self.pool1 = self.pool1 + amount
        elif outcome_int == 0:
            self.pool0 = self.pool0 + amount
        else:
            self.pool2 = self.pool2 + amount
        
        self.total_pool = self.total_pool + amount
        
        return {"success": True, "total": int(self.total_pool)}

    @gl.public.write
    def resolve(self) -> typing.Any:
        if self.has_resolved:
            return {"error": "already resolved"}
        
        def fetch() -> str:
            data = gl.get_webpage(self.resolution_url, mode="text")
            task = f"""Find match result for {self.team1} vs {self.team2}:
{data}
Return JSON only: {{"score": "X-Y", "winner": N}}
N is 1 if team1, 2 if team2, 0 draw, -1 not finished.
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors."""
            r = gl.exec_prompt(task).replace("```json","").replace("```","").strip()
            return json.dumps(json.loads(r), sort_keys=True)
        
        result = json.loads(gl.eq_principle_strict_eq(fetch))
        
        if result["winner"] == -1:
            return {"error": "not finished"}
        
        self.has_resolved = True
        self.winner = i32(result["winner"])
        self.score = result["score"]
        
        return {"success": True, "winner": int(self.winner), "score": self.score}

    @gl.public.write
    def claim(self) -> typing.Any:
        if not self.has_resolved:
            return {"error": "not resolved"}
        
        sender = gl.message.sender_address.as_hex
        winner_int = int(self.winner)
        
        if winner_int == 1:
            wp = int(self.pool1)
        elif winner_int == 0:
            wp = int(self.pool0)
        else:
            wp = int(self.pool2)
        
        bets_json = self.bets.get(sender, "[]")
        bets_list = json.loads(bets_json)
        
        payout = 0
        total = int(self.total_pool)
        updated = []
        for b in bets_list:
            if not b["claimed"] and b["outcome"] == winner_int and wp > 0:
                payout += (b["amount"] * total) // wp
            b["claimed"] = True
            updated.append(b)
        
        self.bets[sender] = json.dumps(updated)
        
        if payout == 0:
            return {"error": "no winnings"}
        
        current = self.balances.get(sender, u256(0))
        self.balances[sender] = current + u256(payout)
        
        return {"success": True, "payout": payout}

    @gl.public.view
    def get_info(self) -> typing.Any:
        return {
            "team1": self.team1,
            "team2": self.team2,
            "date": self.game_date,
            "pool1": int(self.pool1),
            "pool0": int(self.pool0),
            "pool2": int(self.pool2),
            "total": int(self.total_pool),
            "resolved": self.has_resolved,
            "winner": int(self.winner),
            "score": self.score
        }

    @gl.public.view
    def get_balance(self, addr: str) -> u256:
        return self.balances.get(addr, u256(0))

    @gl.public.view
    def get_my_bets(self, addr: str) -> typing.Any:
        return json.loads(self.bets.get(addr, "[]"))
