# api-h5 API Reference


## 1. Overview

- **Base URL**: `https://apih5.ho8.net`
- **Default method**: Unless stated otherwise, endpoints accept `POST` with either JSON (`Content-Type: application/json`) or standard form fields.
- **Standard response body**:
  ```json
  {
    "code": "B100",
    "msg": "OK",
    "ts": 1718258200,
    "data": { "...": "..." }
  }
  ```
- **Session handling**: Almost every API requires a valid `sess_id` stored in `mrlive.session.s_uqid`. Obtain it via `loginuidpid.php`.
- **Idempotency**: Parameters named `uniqueid` are cached in Redis to guard against duplicate submissions.
- **Rate limits**: Betting and validation routes throttle by IP, session, player ID, or explicit Redis keys such as `BETIP:*`, `BETSESS:*`, `BETPID:*`, `RATEVCODE:*`.
- **Wallet types**:
  - `a_wallettype = "1"` → single wallet (balances fetched/debited via upstream operator APIs).
  - `a_wallettype = "2"` → transfer wallet (balances tracked locally with `passbook`/`creditlog` records).

### Common error codes

| Code | Meaning                                   |
|------|-------------------------------------------|
| B100 | Success                                   |
| B201 | Insufficient balance                      |
| B204 | Account disabled                          |
| B210 | Site/game maintenance or suspended        |
| B211 | Game/table not open                       |
| B215 | Missing bet-limit profile                 |
| B216 | Amount outside bet-limit range            |
| B217 | Round-level bet limit exceeded            |
| B230 | Parameter/format error                    |
| B231 | Duplicate `uniqueid`                      |
| B232 | `sess_id` not found/expired               |
| B240 | Risk-control balance cap hit              |
| B250 | Odds changed                              |
| B251 | Odds not found                            |
| B260 | Wallet debit failed                       |

Login-specific codes (700–725) appear only in `loginuidpid.php`.

## 2. Endpoint catalogue

| File                | Purpose                                         |
|---------------------|-------------------------------------------------|
| `loginuidpid.php`   | Player login via account/password               |
| `playerinfo.php`    | Lobby profile, balance, bet-limit, game config  |
| `balance.php`       | Lightweight balance poll                        |
| `lobbyinfo.php`     | Table/round snapshot for lobby display          |
| `history.php`       | Authenticated draw history + roadmaps           |
| `public_history.php`| Public draw history (no session)                |
| `wagerdetail.php`   | Single bet details for HTML modal               |
| `odds.php`          | Full odds list for a round                      |
| `bet_cflive.php`    | Cockfight betting handler                       |
| `wager_rid.php`     | Bets for a specific round                       |
| `bethistory.php`    | Daily bet history + follow bets                 |
| `bethistory2.php`   | Date-range bet history grouped by date          |
| `changepid.php`     | Player password change                          |
| `start_game.php`    | Launch other games (currently SmartSoft)        |


## 3. Endpoint details

### 3.1 `POST /loginuidpid.php`

Authenticates a player for H5.

| Field       | Type   | Notes                                                        |
|-------------|--------|--------------------------------------------------------------|
| `operatorId`| string | 1–5 alphanumeric characters, case-insensitive                |
| `username`  | string | 4–255 chars, allowed `_ @ # & *`                             |
| `password`  | string | 4–255 chars                                                  |
| `language`  | string | Optional, defaults to `zh-cn`; must exist in `language` table|
| `uniqueid`  | string | Required, ≤255 chars, cached 24h for replay protection       |
| `sign`      | string | Optional MD5 signature check (agent-specific)                |

Response on success:
```json
{
  "code": "0",
  "msg": "成功",
  "uniqueid": "f2c1b23e1f...",
  "lobby_url": "https://game.ho8.net/Lobby.html?sess_id=<sess>&lang=zh-cn"
}
```
Errors 700–725 describe format, duplication, maintenance, or auth issues.

### 3.2 `POST /playerinfo.php`

Returns lobby essentials.

| Field     | Type   | Notes                                    |
|-----------|--------|------------------------------------------|
| `sess_id` | string | Active session token                     |
| `uniqueid`| string | Replay guard                             |

Response includes `username`, `balance`, `currency`, bet-limit `{min,max}`, `gid` (allowed GPIDs), and `gidlist` (table → product mapping).

### 3.3 `POST /balance.php`

Single field `sess_id`; returns `{code,balance}`. For single-wallet players the balance is either cached Redis value or `-1` if not yet queried from the operator.

### 3.4 `POST /lobbyinfo.php`

Fields: `sess_id`, `uniqueid`.
- Updates `player.p_info` with latest IP and login time.
- Responds with `data` mirroring the `tableround` WebSocket payload, cached under `allTableRound` (TTL 3 seconds).

### 3.5 `POST /history.php`

Fields: `sess_id`, `uniqueid`, `tableid`.
- Marks participation in Redis DB12 (`online<tableid>:<p_id>`).
- Returns the draw history `drawresult:{tableid}` plus `accu`, `roadmap`, `goodroad`, and global `allgr`.

### 3.6 `GET /public_history.php`

Fields: `tableid`, optional `uniqueid`.
- No authentication.
- Fetches `drawresult:{tableid}` from Redis DB `_REDISDB_`.
- **Known issues**: contains debugging output (`var_dump`) and references `$code` before definition; downstream consumers should sanitize responses until cleaned.

### 3.8 `GET /wagerdetail.php`

Field: `no` (wager number, 10–20 alphanumeric characters).
- Ensures `HTTP_REFERER` includes `ho8.net`.
- Outputs wager record plus `playback` URL `https://vfile.dk77.bet/<round>.mp4`.

### 3.9 `POST /odds.php`

Fields: `sess_id`, `r_no`, `uniqueid`.
- Validates session and resolves `r_no` to `r_id`.
- Returns cached odds: list of `{o_bettype,o_opentype,o_odds,o_notes,o_bl_ratio,o_bl_group}`.

### 3.10 `POST /bet_cflive.php`

Parameters (form encoded):

| Field      | Notes                                                                  |
|------------|------------------------------------------------------------------------|
| `sess_id`  | Player session                                                         |
| `t_id`     | Table ID                                                                |
| `r_id`     | Round ID                                                                |
| `type`     | Must be `21001`, `21002`, or `21003`                                   |
| `zone`     | Must match type (`M`, `W`, `D` or derived `X@YZ`)                      |
| `amount`   | Numeric; converted to positive                                         |
| `odds`     | Numeric or `"XXX"` (testing)                                           |
| `uniqueid` | Required; TTL 3,660 seconds under `uniqueid@{sess}`                    |
| `cuid`     | Client tracking token returned verbatim                                |
| `anyodds`  | `Y` to accept server odds automatically                                |

Execution flow:
1. Logs incoming payload to `/logs-api/bet_cflive.log`.
2. Applies IP/session/player rate limits and maintenance switches (`MAINTAIN`, `NOBET`, `roundaccept`).
3. Validates agent/player `gameconf`, bet-limit profile, and per-round bet totals.
4. Confirms odds by comparing request vs `roundodds:*`.
5. Inserts wager (status `-2` pending) and updates realtime bet stats (`RTBET`).
6. Handles wallet deduction:
   - **Single wallet**: locks `betlock:{p_id}`, ensures upstream balance < limit, builds `calloutlog`, POSTs to operator `/debit`, handles timeout/cancel, updates wager status, and caches new balance.
   - **Transfer wallet**: records passbook debit, writes `creditlog`, and sets `w_status=0`.
7. Returns success with current balance and `allbets` (all active wagers for the round).

Sample success:
```json
{
  "code": "B100",
  "msg": "下注成功",
  "ts": 1718258200,
  "balance": 123.45,
  "cuid": "client-123",
  "allbets": [
    {"w_no":"2406010001","w_bet":50,"w_bettype":"21001","w_betzone":"M", "...": "..."}
  ]
}
```

### 3.12 `POST /wager_rid.php`

Fields: `sess_id`, `uniqueid`, `r_id` (numeric).
- Returns `{unsettle:[...], settle:[...]}` arrays for the specified round.

### 3.13 `POST /bethistory.php`

Fields: `sess_id`, `uniqueid`, `date` (`YYYY-MM-DD`, defaults to today).
- Queries wagers within `[date, date + 1 day)`:
  - `unsettle`: `w_status = 0`
  - `settle`: `w_status <> 0`
  - `followbet`: entries from `prewager`

### 3.14 `POST /bethistory2.php`

Fields: `sess_id`, `uniqueid`, `startdate`, `enddate` (inclusive, `YYYY-MM-DD`).
- Same data as `bethistory.php`, but grouped by calendar day:
  ```json
  {
    "data": {
      "2024-05-01": {
        "unsettle": [...],
        "settle": [...],
        "followbet": [...]
      }
    }
  }
  ```

### 3.15 `POST /changepid.php`

Fields: `sess_id`, `old_password`, `new_password`, `uniqueid`.
- Ensures old/new lengths (old ≥4 chars, new ≥6 chars) and verifies the existing hash via `password_verify`.
- Stores the new password hash, logs the action with `public_logplayer`, and refreshes the Redis cache `player:{p_id}` if present.

### 3.16 `POST /start_game.php`

Fields: `sess_id`, `gpid`, `gid`, `info`, `lang` (defaults to `en`), `ismobile`.
- Enforces maintenance flags and checks that both agent and player `gameconf` enable the requested GPID/GID.
- Verifies required keys `PT`, `REBATE`, and `DS` exist inside the agent config.
- Currently hard-codes `$gid = 'SS'` and only supports SmartSoft:
  - Builds launch URL using configured Portal key (`c6254ddd-f237-1fcd-d381-67cf8d9d2f58`) and maps `lang` to SmartSoft language codes.
  - Returns `{code:"OK", msg:"OK", url:"https://sg-server.ggravityportal.com/..."}`

## 4. Operational notes

- **Logging**: Betting, login, and sensitive actions use helper `public_logplayer` and write structured JSON to facilitate audits.
- **Redis namespaces**: Maintenance and blacklist switches live in DB0; application data uses `_REDISDB_` (value defined in `config.php`, currently `2`).
- **Security**: `lib/public.php` blocks requests from blacklisted IPs automatically and short-circuits responses when `MAINTAIN = Y` (unless the script filename contains `paychannel`).
- **Files to monitor**: `/logs-api/bet_cflive.log`, Redis queues (`calloutqueue`, `vcode:*`), and callout tables for third-party wallet reconciliation.

For questions or updates, edit this README alongside corresponding PHP handlers to keep the documentation accurate.

