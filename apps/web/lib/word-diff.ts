export type DiffPart = { value: string; type: 'equal' | 'added' | 'removed' };

// Splits text into word and whitespace tokens, keeping whitespace as its own
// tokens so re-joining the parts reproduces the original text exactly.
function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}

// Word-level diff via a longest-common-subsequence table (YouTrack-style
// red/green history diff). Consecutive tokens of the same kind are merged so the
// output renders as a few spans, not one per word.
export function wordDiff(from: string, to: string): DiffPart[] {
  const a = tokenize(from);
  const b = tokenize(to);
  const m = a.length;
  const n = b.length;

  // dp[i][j] = LCS length of a[i:] and b[j:]. The table is pre-sized to
  // (m+1)×(n+1) and every index below stays within the loop bounds, so the
  // non-null assertions are provably safe (needed only for noUncheckedIndexedAccess).
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const parts: DiffPart[] = [];
  const push = (value: string, type: DiffPart['type']): void => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.value += value;
    else parts.push({ value, type });
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push(a[i]!, 'equal');
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push(a[i]!, 'removed');
      i++;
    } else {
      push(b[j]!, 'added');
      j++;
    }
  }
  while (i < m) push(a[i++]!, 'removed');
  while (j < n) push(b[j++]!, 'added');

  return parts;
}
