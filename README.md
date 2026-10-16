# Chord Stock Rotation

Holds the 3 tokenized stocks with the best volatility-adjusted momentum on Robinhood and rotates once a day, through Chord.

An example agent built on [Chord](https://getchord.xyz), the trading API and on-chain data index for agents. Paper by default. Not financial advice.

## Run it

Node 20.12 or newer. Nothing to install and no key for paper mode.

```bash
git clone https://github.com/tuantqse90/chord-stock-rotation
cd chord-stock-rotation
node index.js                    # one cycle on robinhood
node index.js --loop             # every 60 min (--interval <seconds> to change)
```

The report prints to the terminal and is saved to `state/report.md`.

## What it does each cycle

1. Reads every stock and ETF token on Robinhood (`GET /v1/rh/stocks`) and keeps those with `MIN_VOLUME_USD` or more of daily volume.
2. Pulls 200 hourly candles each and ranks them by volatility-adjusted momentum: (0.6 × 7-day return + 0.4 × 3-day return) ÷ daily volatility.
3. Once a day, sells holdings that fell out of the top 6 or whose 7-day return turned negative, and buys the top `HOLD` that still have positive momentum.
4. Runs stops every cycle (take-profit 30%, stop-loss 8%, trailing 10%).

## Sample run (16 October 2026, paper)

```text
# Stock Rotation on Robinhood, 2026-10-16T14:29:37.054Z
81 stock tokens, 24 with $250.0k+ daily volume, 24 with 100+ hours of candles. Hold the top 3, keep while inside the top 6.
**Rebalanced now:** bought USO, bought AAPL, bought GME

| Rank | Stock | Price | 7d | 3d | Daily vol | Score | Eligible | Held |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | USO | $155.91 | +5.0% | +2.7% | 2.54% | 1.61 | yes | yes |
| 2 | AAPL | $344.43 | +3.1% | -0.4% | 1.34% | 1.28 | yes | yes |
| 3 | GME | $27.18 | +4.2% | -0.3% | 3.22% | 0.76 | yes | yes |
| 4 | GLD | $384.75 | +0.3% | +0.7% | 0.92% | 0.48 | yes |  |
| 5 | COIN | $181.94 | +1.6% | +0.4% | 3.85% | 0.30 | yes |  |
| 6 | CRCL | $86.45 | +0.6% | +2.5% | 5.22% | 0.26 | yes |  |

Book: PAPER · open 3 · unrealized $0.00 · realized $0.00 · equity $1000.00
```

## Chains

Robinhood, where tokenized stocks and ETFs trade around the clock.

## Settings

Copy `.env.example` to `.env`. Every setting is optional.

| Variable | Default | What it does |
| --- | --- | --- |
| `MIN_VOLUME_USD` | `250000` | Smallest daily volume considered. |
| `HOLD` | `3` | How many stocks to hold. |
| `LIVE` | `0` | 1 = sign and send real transactions with your key. Anything else = paper. |
| `PRIVATE_KEY` | — | Live only. A fresh hot wallet with small funds; the key never leaves this machine. |
| `RPC_URL` | — | Live only. Your RPC endpoint for the chain; transactions are dry-run and sent through it. |
| `MAX_TRADE_USD` | `25` | Largest single entry. |
| `MAX_OPEN_POSITIONS` | `5` | Entries are refused above this. |
| `MAX_SLIPPAGE_BPS` | `100` | Slippage sent with every quote (100 = 1%). |
| `MAX_PRICE_IMPACT_PCT` | `1.5` | Quotes with more price impact are refused. |
| `DAILY_LOSS_LIMIT_USD` | `50` | No new entries for the rest of the UTC day once realized losses reach this. |
| `PAPER_BANKROLL_USD` | `1000` | Starting cash of the paper book. |
| `CHORD_API` | `https://api.getchord.xyz/v1` | Chord API base URL. |
| `CHORD_API_KEY` | — | Optional. Not needed for anything this agent calls. |
| `CHORD_RPM` | `50` | Client-side request cap per minute (anonymous callers get 60 per IP). |

## Paper and live

**Paper (default).** Every quote is a real route from Chord's router; the fill is simulated at the quoted output, after Chord's fee. The book lives in `state/`.

**Live.** Set `LIVE=1`, `PRIVATE_KEY` and `RPC_URL`, then `npm install` (adds `viem`). Each trade goes: Chord quote → unsigned transaction from Chord (`POST /v1/swap`) → approval of Chord's router if needed → dry run on your RPC → your key signs → send → measure the tokens that actually arrived. Chord never takes custody of keys or funds.

Every entry passes the same risk gate: `MAX_TRADE_USD`, `MAX_OPEN_POSITIONS`, `MAX_PRICE_IMPACT_PCT` and `DAILY_LOSS_LIMIT_USD`. Use a fresh wallet with small funds: the cash leg is the chain's main dollar stablecoin, plus a little native coin for gas.

## Built on Chord

Chord calls this agent makes:

- `GET /v1/rh/stocks`
- `GET /v1/candles`
- `GET /v1/quote` and, in live mode, `POST /v1/swap`

No key is needed: anonymous callers get 60 requests a minute per IP, and the client in `lib/chord.js` stays under that, caches reads briefly and backs off on 429.

- Docs and OpenAPI: https://getchord.xyz/docs
- Hosted MCP server for LLM agents (quotes, unsigned swaps, token boards, trades, wallet PnL; no key): `https://api.getchord.xyz/v1/mcp`. In Claude Code: `claude mcp add --transport http chord https://api.getchord.xyz/v1/mcp`
- More templates: https://github.com/tuantqse90/chord-agent-templates

## Files

```text
index.js          the agent
lib/chord.js      Chord client: rate limit, cache, chain paths from GET /v1/chains
lib/portfolio.js  paper / live book, risk gate, exits
lib/wallet.js     your key and RPC (live mode only)
lib/config.js     settings from .env
lib/util.js       formatting, --loop runner
```

## Disclaimer

Example code, not financial advice. Backtests and paper results do not predict real results. In live mode this program signs real transactions with your key and can lose money.

## License

MIT
