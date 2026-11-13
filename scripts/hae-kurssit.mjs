// Hakee ETF-kurssit (Xetra, EUR) ja tallentaa ne tiedostoon prices.json.
// Uuden rahaston saa mukaan lisäämällä rivin alle: 'TUNNUS': 'TUNNUS.DE'
const RAHASTOT = {
  IUSQ: 'IUSQ.DE',
  SPYI: 'SPYI.DE',
};

import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../prices.json', import.meta.url);
let data = { prices: {} };
try { data = JSON.parse(await readFile(FILE, 'utf8')); data.prices ||= {}; } catch {}

async function hae(symbol) {
  let viimeisinVirhe;
  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (saastot-kurssihaku)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const meta = (await r.json())?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!meta || !isFinite(price) || price <= 0) throw new Error('kurssi puuttuu vastauksesta');
      if (meta.currency && meta.currency !== 'EUR') throw new Error(`väärä valuutta ${meta.currency}`);
      const date = new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString().slice(0, 10);
      return { price: Math.round(price * 10000) / 10000, date, source: 'Xetra (Yahoo Finance)' };
    } catch (e) { viimeisinVirhe = e; }
  }
  throw viimeisinVirhe;
}

let onnistui = 0;
for (const [tunnus, symbol] of Object.entries(RAHASTOT)) {
  try {
    const uusi = await hae(symbol);
    const vanha = data.prices[tunnus];
    // Hylätään yli 25 %:n hyppy edelliseen (todennäköisesti virheellinen tieto tai osakesplit).
    if (vanha && Math.abs(uusi.price / vanha.price - 1) > 0.25) {
      console.log(`${tunnus}: hylätty epäilyttävä kurssi ${uusi.price} (edellinen ${vanha.price})`);
      continue;
    }
    data.prices[tunnus] = uusi;
    onnistui++;
    console.log(`${tunnus}: ${uusi.price} € (${uusi.date})`);
  } catch (e) {
    console.log(`${tunnus}: haku epäonnistui – ${e.message}`);
  }
}

if (onnistui) {
  data.updated = new Date().toISOString();
  await writeFile(FILE, JSON.stringify(data, null, 2) + '\n');
}
if (!onnistui && Object.keys(RAHASTOT).length) process.exitCode = 1;
