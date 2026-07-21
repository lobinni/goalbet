# GoalBet Contracts (GenLayer StudioNet)

## `goalbet_v3.py` — bản contract đã sửa lỗi resolve

### Vì sao V2 bị lỗi?

Contract V2 (`goalbet_v2.py`) dùng các API cũ của GenLayer SDK đã bị loại bỏ:

| V2 (lỗi — `AttributeError`) | V3 (SDK hiện tại) |
|---|---|
| `gl.eq_principle_strict_eq(fn)` | `gl.eq_principle.strict_eq(fn)` |
| `gl.get_webpage(url, mode="text")` | `gl.nondet.web.get(url)` → `response.body.decode("utf-8")` |
| `gl.exec_prompt(task)` | `gl.nondet.exec_prompt(task, response_format="json")` |
| Scrape HTML BBC Sport (nặng, hay bị block) | ESPN public JSON API (ổn định, có cấu trúc) |

### Chiến lược resolve trong V3 (2 lớp)

1. **Lớp 1 — Tất định (deterministic):** contract fetch JSON scoreboard của ESPN
   (`site.api.espn.com/apis/site/v2/sports/soccer/{league}/scoreboard?dates=...`)
   rồi trích xuất tỷ số bằng Python thuần. Dữ liệu trận đã kết thúc là bất biến
   → mọi validator tính ra kết quả giống hệt nhau → **đồng thuận strict_eq
   được bảo đảm** và resolve nhanh.
2. **Lớp 2 — AI fallback:** nếu không tìm thấy trận trong JSON, LLM đọc dữ liệu
   và trả về JSON chuẩn hóa `{"score": "X-Y", "winner": N}` (không gian kết quả
   rất nhỏ → đồng thuận strict đáng tin cậy).

`winner`: `1` = đội nhà (team1) thắng • `2` = đội khách (team2) thắng • `0` = hòa • `-1` = chưa đá xong.

### Cách deploy V3 lên GenLayer Studio

1. Mở https://studio.genlayer.com → **Deploy contract**
2. Paste nội dung `goalbet_v3.py` → Deploy
3. Copy địa chỉ contract mới (ví dụ `0x1234...`)
4. Trên Vercel, đặt biến môi trường:

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...địa_chỉ_mới...
```

5. Redeploy app trên Vercel.

> ⚠️ Contract đã deploy trên chain **không thể sửa** — phải deploy bản V3 thành
> contract mới và trỏ `NEXT_PUBLIC_CONTRACT_ADDRESS` sang địa chỉ mới.

### ABI các hàm (khớp với app)

```python
create_market(market_id, game_date, team1, team2, league="fifa.world")
record_bet(market_id, user_addr, outcome, amount)
resolve_market(market_id)          # ← user bấm "Resolve" để kiểm tra kết quả bet
get_market(market_id)              # → {id, date, team1, team2, league, resolved, winner, score}
get_all_markets()
get_market_bets(market_id)
get_stats()
```

### Test nhanh trên Studio

```
1. create_market("2026-07-18_france_england", "2026-07-18", "France", "England", "fifa.world")
2. resolve_market("2026-07-18_france_england")   → {"ok": true, "winner": 2, "score": "4-6"}
3. get_market("2026-07-18_france_england")       → {"resolved": true, "winner": 2, "score": "4-6", ...}
```
