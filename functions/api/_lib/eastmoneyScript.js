// Shared helpers for parsing Eastmoney JavaScript payloads (e.g. pingzhongdata/<code>.js).
// Lives under `_lib` so Cloudflare Pages does not route it as an endpoint.

export function extractStringVar(script, name) {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*"([^"]*)"`));
  return match ? match[1] : '';
}

export function extractJsonVar(script, name) {
  const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*`));
  if (!match) return null;

  const valueStart = match.index + match[0].length;
  const firstChar = script[valueStart];
  const closingChar = firstChar === '[' ? ']' : firstChar === '{' ? '}' : '';
  if (!closingChar) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let index = valueStart; index < script.length; index += 1) {
    const char = script[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === firstChar) depth += 1;
    if (char === closingChar) depth -= 1;

    if (depth === 0) {
      try {
        return JSON.parse(script.slice(valueStart, index + 1));
      } catch (error) {
        return null;
      }
    }
  }

  return null;
}

// Formats an epoch-millisecond timestamp as YYYY-MM-DD in Asia/Shanghai.
export function formatShanghaiDate(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}
