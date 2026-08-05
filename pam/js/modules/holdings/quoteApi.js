export async function fetchQuotes(holdings) {
    const items = holdings
        .filter(holding => ['CN', 'Fund'].includes(holding.market) && holding.symbol)
        .map(holding => `${holding.market}:${holding.symbol}`);
    const uniqueItems = [...new Set(items)];
    if (uniqueItems.length === 0) return { quotes: [], failedItems: [] };

    const response = await fetch(`/api/quotes?items=${encodeURIComponent(uniqueItems.join(','))}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Quote refresh failed');
    return data;
}
