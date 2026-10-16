// Stock Rotation: cross-sectional momentum on the tokenized stocks and ETFs that trade on Robinhood.
// Ranks every liquid stock token by volatility-adjusted 7-day and 3-day returns (hourly candles from Chord),
// holds the top 3 and rotates at most once a day. A holding is sold when it drops out of the top 6 or its
// 7-day return turns negative. Stops run every cycle.
import { CONFIG } from './lib/config.js';
import { resolveChain, get, candles, mapLimit } from './lib/chord.js';
import { Portfolio } from './lib/portfolio.js';
import { safe, usd, pct, table, writeReport, runAgent } from './lib/util.js';

const P = {
  minVolume24h: Number(process.env.MIN_VOLUME_USD || 250_000),
  hold: Number(process.env.HOLD || 3),
  keepWithin: 6,
  rebalanceHours: 24,
  minR7: 0,             // absolute momentum: the 7-day return must be positive to be held
  minR3: -0.01,
  exits: { tp: 0.3, sl: 0.08, trail: 0.1, maxHoldHours: 24 * 21 },
};

export function momentum(cs) {
  cs = cs.filter((c) => c.c > 0);
  if (cs.length < 100) return null;
  const last = cs[cs.length - 1];
  const at = (h) => cs.filter((c) => c.t <= last.t - h * 3600).pop() || cs[0];
  const r7 = last.c / at(168).c - 1;
  const r3 = last.c / at(72).c - 1;
  const rets = [];
  for (let i = 1; i < cs.length; i++) rets.push(Math.log(cs[i].c / cs[i - 1].c));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const volDaily = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(24);
  return { r7, r3, volDaily, score: (0.6 * r7 + 0.4 * r3) / Math.max(volDaily, 0.004), price: last.c };
}

async function cycle() {
  const chain = await resolveChain('robinhood');
  const pf = new Portfolio(chain, { name: 'stock-rotation' });
  const { stocks } = await get('/rh/stocks');
  const uni = stocks.map((s) => ({ ...s, address: s.address.toLowerCase() })).filter((s) => safe(s.volume24h) >= P.minVolume24h);
  const charts = await mapLimit(uni, 3, (s) => candles(chain, s.address, { tf: '1h', limit: 200 }));
  const ranked = uni.map((s, i) => ({ s, m: Array.isArray(charts[i]) ? momentum(charts[i]) : null })).filter((r) => r.m).sort((a, b) => b.m.score - a.m.score);
  const rankOf = new Map(ranked.map((r, i) => [r.s.address, i + 1]));
  const eligible = (r) => r.m.r7 > P.minR7 && r.m.r3 > P.minR3;

  const marks = await pf.manageExits({ ...P.exits, prices: Object.fromEntries(uni.map((s) => [s.address, s.priceUsd])) });
  const last = pf.state.lastRebalance || 0;
  const due = Date.now() - last >= P.rebalanceHours * 3600_000;
  const actions = [];
  if (due) {
    for (const pos of pf.positions) {
      const rank = rankOf.get(pos.token.toLowerCase());
      const r = ranked[rank - 1];
      if (!rank || rank > P.keepWithin) { await pf.sell(pos.token, `rank ${rank || 'n/a'} is outside the top ${P.keepWithin}`); actions.push(`sold ${pos.symbol}`); }
      else if (!eligible(r)) { await pf.sell(pos.token, `lost momentum (7d ${pct(r.m.r7 * 100)})`); actions.push(`sold ${pos.symbol}`); }
    }
    for (const r of ranked.filter(eligible).slice(0, P.hold)) {
      if (pf.has(r.s.address)) continue;
      if (await pf.buy({ token: r.s.address, symbol: r.s.symbol, decimals: r.s.decimals, sizeUsd: CONFIG.maxTradeUsd, meta: { rank: rankOf.get(r.s.address), score: r.m.score } })) actions.push(`bought ${r.s.symbol}`);
    }
    pf.state.lastRebalance = Date.now();
    pf.save();
  }

  const nextIn = Math.max(0, ((pf.state.lastRebalance || 0) + P.rebalanceHours * 3600_000 - Date.now()) / 3600_000);
  const md = [
    `# Stock Rotation on Robinhood, ${new Date().toISOString()}`,
    `${stocks.length} stock tokens, ${uni.length} with ${usd(P.minVolume24h)}+ daily volume, ${ranked.length} with 100+ hours of candles. Hold the top ${P.hold}, keep while inside the top ${P.keepWithin}.`,
    due ? `**Rebalanced now:** ${actions.join(', ') || 'no change'}` : `Next rebalance in ${nextIn.toFixed(1)}h.`,
    '',
    table(['Rank', 'Stock', 'Price', '7d', '3d', 'Daily vol', 'Score', 'Eligible', 'Held'],
      ranked.slice(0, 12).map((r, i) => [i + 1, r.s.symbol, usd(r.m.price), pct(r.m.r7 * 100), pct(r.m.r3 * 100), `${(r.m.volDaily * 100).toFixed(2)}%`, r.m.score.toFixed(2), eligible(r) ? 'yes' : 'no', pf.has(r.s.address) ? 'yes' : ''])),
    '',
    `Book: ${pf.line(marks)}`,
  ].join('\n');
  writeReport('report.md', md);
  console.log(md);
}

if (import.meta.url === `file://${process.argv[1]}`) runAgent('stock-rotation', cycle, 3600);
