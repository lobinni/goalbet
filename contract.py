# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

"""
GoalBet - On-Chain Football Betting with GEN Tokens
====================================================
Bet GEN on matches. AI Oracle resolves from BBC Sport.
Ranked by total GEN winnings.
"""

from dataclasses import dataclass
from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"


@allow_storage
@dataclass
class Bet:
    id: str
    has_resolved: bool
    game_date: str
    resolution_url: str
    team1: str
    team2: str
    predicted_winner: str
    real_winner: str
    real_score: str
    stake: u256
    odds: u256
    payout: u256
    is_won: bool


@allow_storage
@dataclass
class PlayerStats:
    total_bets: u256
    total_staked: u256
    total_won: u256
    total_lost: u256
    wins: u256
    losses: u256


class GoalBet(gl.Contract):
    bets: TreeMap[str, Bet]
    stats: TreeMap[Address, PlayerStats]

    def __init__(self):
        pass

    def _bet_key(self, address: Address, bet_id: str) -> str:
        return address.as_hex + ":" + bet_id

    def _get_or_create_stats(self, address: Address) -> PlayerStats:
        if address not in self.stats:
            self.stats[address] = PlayerStats(
                total_bets=u256(0),
                total_staked=u256(0),
                total_won=u256(0),
                total_lost=u256(0),
                wins=u256(0),
                losses=u256(0),
            )
        return self.stats[address]

    def _check_match(self, resolution_url: str, team1: str, team2: str) -> dict:
        def leader_fn() -> dict:
            web_data = gl.nondet.web.render(resolution_url, mode="text")
            task = f"""
Extract the match result for:
Team 1: {team1}
Team 2: {team2}

Web content:
{web_data}

Respond in JSON:
{{
    "score": str,
    "winner": int
}}
Rules:
- "score" should be e.g. "1:2", or "-" if the match has not finished.
- "winner" should be 1 if Team 1 won, 2 if Team 2 won, 0 for draw,
  or -1 if the match has not finished yet.
Respond ONLY with the JSON object. No extra text, no markdown fences.
"""
            result = gl.nondet.exec_prompt(task, response_format="json")
            return {"score": str(result["score"]), "winner": int(result["winner"])}

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                return False
            validator_result = leader_fn()
            leader_winner = int(leaders_res.calldata["winner"])
            validator_winner = validator_result["winner"]
            if (leader_winner < 0) != (validator_winner < 0):
                return False
            if leader_winner < 0 and validator_winner < 0:
                return True
            return leader_winner == validator_winner

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    @gl.public.write.payable
    def create_bet(
        self, game_date: str, team1: str, team2: str, predicted_winner: str, odds: str
    ) -> None:
        stake = gl.message.value

        if stake < u256(1_000_000_000_000_000_000):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Minimum stake is 1 GEN")

        odds_int = int(odds)
        if odds_int <= 100:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Odds must be greater than 1.00x")

        resolution_url = "https://www.bbc.com/sport/football/scores-fixtures/" + game_date
        sender = gl.message.sender_address
        bet_id = f"{game_date}_{team1}_{team2}".lower().replace(" ", "-")
        key = self._bet_key(sender, bet_id)

        if key in self.bets:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Bet already exists for this match")

        potential_payout = (stake * u256(odds_int)) // u256(100)

        bet = Bet(
            id=bet_id,
            has_resolved=False,
            game_date=game_date,
            resolution_url=resolution_url,
            team1=team1,
            team2=team2,
            predicted_winner=predicted_winner,
            real_winner="",
            real_score="",
            stake=stake,
            odds=u256(odds_int),
            payout=potential_payout,
            is_won=False,
        )
        self.bets[key] = bet

        player_stats = self._get_or_create_stats(sender)
        player_stats.total_bets += u256(1)
        player_stats.total_staked += stake

    @gl.public.write
    def resolve_bet(self, bet_id: str) -> None:
        sender = gl.message.sender_address
        key = self._bet_key(sender, bet_id)

        if key not in self.bets:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Bet not found")

        bet = self.bets[key]
        if bet.has_resolved:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Bet already resolved")

        match_result = self._check_match(bet.resolution_url, bet.team1, bet.team2)

        if int(match_result["winner"]) < 0:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Match has not finished yet")

        bet.has_resolved = True
        bet.real_winner = str(match_result["winner"])
        bet.real_score = match_result["score"]

        player_stats = self._get_or_create_stats(sender)

        if bet.real_winner == bet.predicted_winner:
            bet.is_won = True
            player_stats.total_won += bet.payout
            player_stats.wins += u256(1)
        else:
            bet.is_won = False
            player_stats.total_lost += bet.stake
            player_stats.losses += u256(1)

    @gl.public.view
    def get_bets(self) -> dict:
        sender = gl.message.sender_address
        prefix = sender.as_hex + ":"
        return {
            k[len(prefix):]: v
            for k, v in self.bets.items()
            if k.startswith(prefix)
        }

    @gl.public.view
    def get_player_stats(self, player_address: str) -> dict:
        addr = Address(player_address)
        if addr not in self.stats:
            return {
                "total_bets": 0,
                "total_staked": 0,
                "total_won": 0,
                "total_lost": 0,
                "wins": 0,
                "losses": 0,
            }
        s = self.stats[addr]
        return {
            "total_bets": int(s.total_bets),
            "total_staked": int(s.total_staked),
            "total_won": int(s.total_won),
            "total_lost": int(s.total_lost),
            "wins": int(s.wins),
            "losses": int(s.losses),
        }

    @gl.public.view
    def get_leaderboard(self) -> list:
        entries = []
        for addr, s in self.stats.items():
            if int(s.total_bets) > 0:
                total_bets = int(s.total_bets)
                wins = int(s.wins)
                losses = int(s.losses)
                total_won = int(s.total_won)
                total_staked = int(s.total_staked)
                total_lost = int(s.total_lost)
                profit = total_won - total_lost if total_won >= total_lost else -(total_lost - total_won)

                entries.append({
                    "address": addr.as_hex,
                    "total_won": total_won,
                    "total_staked": total_staked,
                    "total_lost": total_lost,
                    "profit": profit,
                    "wins": wins,
                    "losses": losses,
                    "win_rate": (wins * 100) // total_bets if total_bets > 0 else 0,
                })
        entries.sort(key=lambda x: x["total_won"], reverse=True)
        return entries
