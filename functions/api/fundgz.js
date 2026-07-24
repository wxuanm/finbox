export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const t = url.searchParams.get('t') || '0';

  if (!code) {
    return new Response("Missing fund code", { status: 400 });
  }

  // 组装真实的东方财富数据源 URL
  const targetUrl = `https://fund.eastmoney.com/Data/FundCompare_Interface.aspx?t=${t}&bzdm=${code}&rt=${Date.now()}`;

  try {
    // 由 Cloudflare 的服务器发起请求
    const response = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data = await response.text();

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
