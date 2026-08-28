function aggregateCashFlows(cashFlows) {
  const byDate = new Map();
  for (const flow of cashFlows) byDate.set(flow.date, (byDate.get(flow.date) || 0) + Number(flow.amount));
  return [...byDate.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date));
}

export function xirr(cashFlows) {
  const flows = aggregateCashFlows(cashFlows).filter((flow) => Number.isFinite(flow.amount));
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const origin = new Date(`${flows[0].date}T00:00:00Z`);
  const npv = (rate) => flows.reduce((sum, flow) => {
    const days = (new Date(`${flow.date}T00:00:00Z`) - origin) / 86_400_000;
    return sum + flow.amount / ((1 + rate) ** (days / 365));
  }, 0);
  let low = -0.999999;
  let high = 1;
  let lowValue = npv(low);
  let highValue = npv(high);
  for (let i = 0; i < 80 && Math.sign(lowValue) === Math.sign(highValue); i += 1) {
    high *= 2;
    highValue = npv(high);
  }
  if (![lowValue, highValue].every(Number.isFinite) || Math.sign(lowValue) === Math.sign(highValue)) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 1e-8) return mid;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = mid;
      lowValue = value;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}
