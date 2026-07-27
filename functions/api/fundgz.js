export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const t = url.searchParams.get('t') || '0';

  if (!code) {
    return new Response("Missing fund code", { status: 400 });
  }

  try {
    const codes = code.split(',').map(item => item.trim()).filter(Boolean);
    const data = codes.length > 1 && t === '0'
      ? await fetchBatchFundInfo(codes, t)
      : await fetchFundInfo(code, t);

    // 将数据返回给前端网页
    return new Response(data, {
      headers: {
        "Content-Type": "application/javascript;charset=utf-8",
        "Access-Control-Allow-Origin": "*", 
      }
    });
  } catch (e) {
    return new Response("Error fetching data", { status: 500 });
  }
}

async function fetchFundInfo(code, t) {
  const targetUrl = `https://fund.eastmoney.com/Data/FundCompare_Interface.aspx?t=${t}&bzdm=${encodeURIComponent(code)}&rt=${Date.now()}`;
  const response = await fetch(targetUrl, {
    headers: {
      'Referer': 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  return response.text();
}

async function fetchBatchFundInfo(codes, t) {
  const chunks = [];
  for (let index = 0; index < codes.length; index += 10) {
    chunks.push(codes.slice(index, index + 10));
  }

  const responses = await Promise.all(chunks.map(async chunk => {
    const data = await fetchFundInfo(chunk.join(','), t);
    const match = data.match(/var\s+fundinfo\s*=\s*(\[[\s\S]*?\]);?/);
    if (!match) return [];

    try {
      return JSON.parse(match[1]);
    } catch (error) {
      return [];
    }
  }));

  return `var fundinfo = ${JSON.stringify(responses.flat())};`;
}
