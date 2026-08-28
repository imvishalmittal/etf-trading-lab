export function previousCloseMetrics(history, currentPrice) {
  const rows = [...history].filter((row) => Number(row.close) > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 31 || !Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  const previousClose = Number(rows.at(-1).close);
  const closeThirtySessionsEarlier = Number(rows.at(-31).close);
  return {
    previousClose,
    closeThirtySessionsEarlier,
    dayReturnPct: ((currentPrice / previousClose) - 1) * 100,
    thirtySessionReturnPct: ((previousClose / closeThirtySessionsEarlier) - 1) * 100,
  };
}

export function buildPreCandidates({ instruments, prices, historyBySymbol, rules }) {
  const candidates = [];
  for (const instrument of instruments) {
    const currentPrice = Number(prices[instrument.symbol]?.lastPrice);
    const metrics = previousCloseMetrics(historyBySymbol[instrument.symbol] || [], currentPrice);
    if (!metrics) continue;
    if (metrics.dayReturnPct > rules.maximumDayReturnPct) continue;
    if (metrics.thirtySessionReturnPct > rules.maximumPreviousCloseThirtySessionReturnPct) continue;
    candidates.push({ ...instrument, currentPrice, ...metrics });
  }
  return candidates;
}

export function selectCandidate({ candidates, previousMarketSession, priorSignals, minimumVolume }) {
  const previousSignal = priorSignals.find((signal) => signal.date === previousMarketSession && signal.status === 'PURCHASED');
  const ranked = candidates
    .filter((candidate) => Number(candidate.volume) > minimumVolume)
    .sort((a, b) => a.thirtySessionReturnPct - b.thirtySessionReturnPct
      || a.dayReturnPct - b.dayReturnPct
      || b.volume - a.volume
      || a.symbol.localeCompare(b.symbol));
  const excluded = [];
  for (const candidate of ranked) {
    if (previousSignal && candidate.category === previousSignal.category) {
      excluded.push({ symbol: candidate.symbol, category: candidate.category, reason: 'CONSECUTIVE_CATEGORY' });
      continue;
    }
    return { selected: candidate, ranked, excluded };
  }
  return { selected: null, ranked, excluded };
}
