export function normalizeFundCodes(input: string | string[]): string[] {
  const rawCodes = Array.isArray(input) ? input : input.split(/[，,\s]+/);
  const seen = new Set<string>();
  const codes: string[] = [];

  rawCodes.forEach(item => {
    const code = String(item).trim();
    if (!/^\d{6}$/.test(code) || seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  });

  return codes;
}

export function normalizeStockSymbols(input: string | string[]): string[] {
  const rawSymbols = Array.isArray(input) ? input : input.split(/[，,\s]+/);
  const seen = new Set<string>();
  const symbols: string[] = [];

  rawSymbols.forEach(item => {
    const rawSymbol = String(item).trim().toLowerCase();
    const match = rawSymbol.match(/^(sh|sz)\d{6}$/);
    if (!match) return;

    if (seen.has(rawSymbol)) return;
    seen.add(rawSymbol);
    symbols.push(rawSymbol);
  });

  return symbols;
}

export function chunkCodes(codes: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < codes.length; index += size) {
    chunks.push(codes.slice(index, index + size));
  }
  return chunks;
}
