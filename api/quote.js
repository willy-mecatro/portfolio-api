// ============================================================
// BACKEND GRATUIT — À déployer sur Vercel
// ============================================================
// 1. Crée un compte sur https://vercel.com (gratuit)
// 2. Crée un nouveau projet "portfolio-api"
// 3. Crée le fichier api/quote.js avec ce code
// 4. Déploie avec : vercel deploy
// 5. Tu obtiens une URL comme : https://portfolio-api-xxx.vercel.app
// ============================================================

// Fichier : api/quote.js (sur Vercel)
export default async function handler(req, res) {
  // CORS — autorise ton app mobile
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbols } = req.query;

  if (!symbols) {
    return res.status(400).json({ error: 'symbols requis' });
  }

  try {
    const symbolList = symbols.split(',').map(s => s.trim());
    const results = {};

    for (const symbol of symbolList) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          results[symbol] = { error: `HTTP ${response.status}` };
          continue;
        }

        const data = await response.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (!meta) {
          results[symbol] = { error: 'Données indisponibles' };
          continue;
        }

        results[symbol] = {
          symbol,
          price: meta.regularMarketPrice,
          previousClose: meta.chartPreviousClose,
          currency: meta.currency,
          change: meta.regularMarketPrice - meta.chartPreviousClose,
          changePercent:
            ((meta.regularMarketPrice - meta.chartPreviousClose) /
              meta.chartPreviousClose) *
            100,
          marketState: meta.marketState, // REGULAR / PRE / POST / CLOSED
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        results[symbol] = { error: err.message };
      }
    }

    return res.status(200).json({ success: true, data: results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
