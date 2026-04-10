module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbols, ticker, interval, range } = req.query;

  if (ticker) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval || '1d'}&range=${range || '1mo'}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result) return res.status(200).json({ error: 'No data' });

      const timestamps = result.timestamp || [];
      const closes = result.indicators?.quote?.[0]?.close || [];
      const points = timestamps
        .map((t, i) => ({ time: t * 1000, price: closes[i] }))
        .filter(p => p.price != null);

      return res.status(200).json({ success: true, data: points });
    } catch (err) {
      return res.status(200).json({ error: err.message });
    }
  }

  if (!symbols) return res.status(400).json({ error: 'symbols requis' });

  try {
    const symbolList = symbols.split(',').map(s => s.trim());
    const results = {};
    for (const symbol of symbolList) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        });
        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) { results[symbol] = { error: 'No data' }; continue; }
        results[symbol] = {
          symbol,
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose,
          currency: meta.currency,
          change: meta.regularMarketPrice - meta.chartPreviousClose,
          changePercent: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
          timestamp: new Date().toISOString(),
        };
      } catch (err) { results[symbol] = { error: err.message }; }
    }
    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
