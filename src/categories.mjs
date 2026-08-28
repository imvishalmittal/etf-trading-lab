const OVERRIDES = Object.freeze({
  ABSLMSCIN: 'BROAD_MARKET', ABSLBANETF: 'BANKING_FINANCIAL', BBNPNBETF: 'BANKING_FINANCIAL',
  BFSI: 'BANKING_FINANCIAL', BSE500IETF: 'BROAD_MARKET', CASHIETF: 'DEBT_LIQUID',
  CEMNTGROWW: 'METALS_MATERIALS', COMMOIETF: 'METALS_MATERIALS', CONSUMIETF: 'FMCG_CONSUMPTION',
  DIVIDEND: 'FACTOR', DIVOPPBEES: 'FACTOR', ECAPINSURE: 'BANKING_FINANCIAL', ELMDIV: 'FACTOR',
  EVIETF: 'AUTO', FINIETF: 'BANKING_FINANCIAL', GSEC10IETF: 'DEBT_LIQUID', GSEC5IETF: 'DEBT_LIQUID',
  GROWWHOSPI: 'HEALTHCARE_PHARMA', GROWWNET: 'TECHNOLOGY_IT', GROWWRAIL: 'INFRA_REALTY',
  HYBRIDETF: 'MULTI_ASSET', HDFCBSE500: 'BROAD_MARKET', ICICIB22: 'PSU_DEFENCE',
  INSUREIETF: 'BANKING_FINANCIAL', ITIETF: 'TECHNOLOGY_IT', JUNIORBEES: 'BROAD_MARKET',
  LARGEMID50: 'BROAD_MARKET', LIQGRWBEES: 'DEBT_LIQUID', MANUFGBEES: 'INDUSTRIAL_MANUFACTURING',
  MID150BEES: 'BROAD_MARKET', MIDSELIETF: 'BROAD_MARKET', MOGSEC: 'DEBT_LIQUID',
  MASPTOP50: 'GLOBAL', MOIPO: 'FACTOR', MOM30IETF: 'FACTOR', MSCI360: 'BROAD_MARKET',
  MSCIADD: 'BROAD_MARKET', MSCIINDIA: 'BROAD_MARKET', NETF: 'BROAD_MARKET',
  NEXT50ETF: 'BROAD_MARKET', NEXT50IETF: 'BROAD_MARKET', NV20BEES: 'FACTOR', NV20IETF: 'FACTOR',
  PVTBANIETF: 'BANKING_FINANCIAL', QUAL30IETF: 'FACTOR', SELECTIPO: 'FACTOR',
  SBILIQETF: 'DEBT_LIQUID', SBINEQWETF: 'FACTOR', SBISMLETF: 'BROAD_MARKET', SBIVALETF: 'FACTOR',
  SHARIABEES: 'FACTOR', SMALLIETF: 'BROAD_MARKET', SNXT30BEES: 'BROAD_MARKET',
  TECH: 'TECHNOLOGY_IT', TNIDETF: 'TECHNOLOGY_IT', TOP15IETF: 'FACTOR', VAL30IETF: 'FACTOR',
});

const words = (value) => ` ${String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ')} `;
const containsAny = (text, terms) => terms.some((term) => text.includes(` ${term} `) || text.includes(term));

export function classifyEtf({ symbol, name }) {
  const key = String(symbol || '').toUpperCase();
  if (OVERRIDES[key]) return OVERRIDES[key];
  const text = `${words(key)}${words(name)}`;
  const match = (category, terms) => (containsAny(text, terms) ? category : null);
  return match('GOLD', ['GOLD'])
    || match('SILVER', ['SILVER'])
    || match('DEBT_LIQUID', ['LIQUID', 'GILT', 'SDL', 'BOND', 'MONEY MARKET', 'OVERNIGHT', 'T BILL'])
    || match('BANKING_FINANCIAL', ['BANK', 'BANKING', 'FINANCE', 'FINANCIAL', 'PVTBANK'])
    || match('HEALTHCARE_PHARMA', ['HEALTH', 'HEALTHCARE', 'PHARMA', 'PHARMACEUTICAL'])
    || match('TECHNOLOGY_IT', ['INFORMATION TECHNOLOGY', 'TECHNOLOGY', 'DIGITAL', 'ITETF', 'ITBEES'])
    || match('FMCG_CONSUMPTION', ['FMCG', 'CONSUMER', 'CONSUMPTION'])
    || match('AUTO', ['AUTO', 'AUTOMOBILE', 'EV'])
    || match('ENERGY_POWER', ['ENERGY', 'POWER', 'OIL', 'GAS'])
    || match('INFRA_REALTY', ['INFRA', 'INFRASTRUCTURE', 'REALTY', 'HOUSING', 'RAIL'])
    || match('METALS_MATERIALS', ['METAL', 'COMMODITY', 'CEMENT'])
    || match('PSU_DEFENCE', ['PSU', 'CPSE', 'DEFENCE', 'DEFENSE'])
    || match('GLOBAL', ['NASDAQ', 'HANG SENG', 'HANGSENG', 'CHINA', 'JAPAN', 'FANG', 'US 100', 'MON100'])
    || match('FACTOR', ['MOMENTUM', 'LOW VOL', 'LOWVOL', 'QUALITY', 'ALPHA', 'VALUE', 'EQUAL WEIGHT'])
    || match('BROAD_MARKET', ['NIFTY', 'SENSEX', 'MIDCAP', 'MID CAP', 'SMALLCAP', 'SMALL CAP', 'LARGECAP', 'LARGE CAP'])
    || `UNCLASSIFIED:${key}`;
}

export function isEtfInstrument(instrument) {
  const symbol = String(instrument.trading_symbol || '').toUpperCase();
  const identity = `${words(symbol)}${words(instrument.name)}`;
  const isCashEquity = String(instrument.instrument_type || '').toUpperCase() === 'EQ';
  const isEtf = /\bETF\b/.test(identity)
    || identity.includes(' EXCHANGE TRADED FUND ')
    || identity.includes(' BEES ')
    || /(?:ETF|BEES)$/.test(symbol);
  return instrument.exchange === 'NSE'
    && instrument.segment === 'CASH'
    && isCashEquity
    && isEtf
    && (!instrument.buy_allowed || String(instrument.buy_allowed) === '1');
}
