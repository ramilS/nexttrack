export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;

  let score = 0;
  let searchFrom = 0;
  let streak = 0;

  for (const ch of q) {
    const idx = t.indexOf(ch, searchFrom);
    if (idx === -1) return null;
    streak = idx === searchFrom && searchFrom > 0 ? streak + 1 : 1;
    const isWordStart = idx === 0 || t[idx - 1] === ' ';
    score += streak + (isWordStart ? 3 : 0);
    searchFrom = idx + 1;
  }
  return score;
}
