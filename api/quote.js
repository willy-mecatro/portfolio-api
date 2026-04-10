module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbols, ticker, interval, range } = req.query;

  // ── Taux de change vers EUR ──────────────────────────────
  async function getRate(currency) {
    if (!currency || currency === 'EUR') return 1;
    try {
      const pair = `${currency}EUR=X`;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${pair}?interval=1d&range=1d`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const d = await r.json();
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      return price || 1;
    } catch (_) { return 1; }
  }

  // Devises qui ne sont pas en EUR
  const NON_EUR = {
    'HKD': true, // Hong Kong → Xiaomi, BYD
    'GBp': true, // Pence sterling → Sylvania
    'GBP': true,
    'USD': true, // Dollar → Nubank
    'JPY': true,
    'CHF': true,
  };

  // ── HISTORIQUE pour graphiques ───────────────────────────
  if (ticker) {
    try {
      const map = {
        '1d':  { interval: '5m',  range: '1d'  },
        '1wk': { interval: '1h',  range: '5d'  },
        '1mo': { interval: '1d',  range: '1mo' },
        '6mo': { interval: '1wk', range: '6mo' },
        '1y':  { interval: '1wk', range: '1y'  },
        '5y':  { interval: '1mo', range: '5y'  },
      };
      const iv = interval || '1d';
      const rg = range || '1mo';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${iv}&range=${rg}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      });
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) return res.status(200).json({ error: 'No data' });

      const currency = result.meta?.currency;
      const rate = NON_EUR[currency] ? await getRate(currency) : 1;
      // GBp = pence → diviser par 100 pour avoir GBP, puis convertir
      const penceRate = currency === 'GBp' ? rate / 100 : rate;

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points = timestamps
        .map((t, i) => ({
          time: t * 1000,
          price: closes[i] != null ? closes[i] * penceRate : null
        }))
        .filter(p => p.price != null);

      return res.status(200).json({ success: true, data: points, currency: 'EUR', originalCurrency: currency });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  // ── COURS EN TEMPS RÉEL ──────────────────────────────────
  if (!symbols) return res.status(400).json({ error: 'symbols requis' });

  try {
    const symbolList = symbols.split(',').map(s => s.trim());
    const results = {};

    // Récupère d'abord tous les cours
    const rawData = {};
    await Promise.all(symbolList.map(async (symbol) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        });
        if (!response.ok) { rawData[symbol] = { error: `HTTP ${response.status}` }; return; }
        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) { rawData[symbol] = { error: 'No data' }; return; }
        rawData[symbol] = {
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose,
          currency: meta.currency,
        };
      } catch (err) {
        rawData[symbol] = { error: err.message };
      }
    }));

    // Trouve les devises uniques à convertir
    const currencies = [...new Set(
      Object.values(rawData)
        .filter(d => !d.error && NON_EUR[d.currency])
        .map(d => d.currency)
    )];

    // Récupère les taux en parallèle
    const rates = {};
    await Promise.all(currencies.map(async (cur) => {
      rates[cur] = await getRate(cur);
    }));

    // Construit les résultats finaux convertis en EUR
    for (const symbol of symbolList) {
      const raw = rawData[symbol];
      if (raw.error) { results[symbol] = { error: raw.error }; continue; }

      let rate = 1;
      if (raw.currency === 'GBp') {
        // GBp = pence britanniques → diviser par 100 pour GBP, puis convertir en EUR
        rate = (rates['GBp'] || rates['GBP'] || 1) / 100;
      } else if (NON_EUR[raw.currency]) {
        rate = rates[raw.currency] || 1;
      }

      const priceEUR = raw.price * rate;
      const prevCloseEUR = raw.previousClose * rate;
      const change = priceEUR - prevCloseEUR;
      const changePercent = prevCloseEUR > 0 ? (change / prevCloseEUR) * 100 : 0;

      results[symbol] = {
        symbol,
        price: priceEUR,
        previousClose: prevCloseEUR,
        currency: 'EUR',
        originalCurrency: raw.currency,
        originalPrice: raw.price,
        change,
        changePercent,
        timestamp: new Date().toISOString(),
      };
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
