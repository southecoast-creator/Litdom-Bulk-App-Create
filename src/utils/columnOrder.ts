/**
 * Litdom Batch Studio - Column order for the Word -> sheet step (pure, no DOM).
 */

export interface ColumnKey {
  style: string;
  /** 0-based occurrence of this style on its page */
  n: number;
}

/**
 * Merges every page's reading sequence into one global column order. A column never comes
 * before another that precedes it on any page (where pages disagree, the one seen first wins).
 */
export function orderColumnKeys(sequences: ColumnKey[][]): ColumnKey[] {
  const keyOf = (k: ColumnKey) => `${k.style}\u0000${k.n}`;
  const nodes = new Map<string, ColumnKey>();
  const firstSeen = new Map<string, number>();
  const edges = new Map<string, Set<string>>();
  const indeg = new Map<string, number>();
  let counter = 0;

  for (const seq of sequences) {
    seq.forEach((k, i) => {
      const id = keyOf(k);
      if (!nodes.has(id)) {
        nodes.set(id, k);
        firstSeen.set(id, counter++);
        edges.set(id, new Set());
        indeg.set(id, 0);
      }
      if (i > 0) {
        const prev = keyOf(seq[i - 1]);
        if (!edges.get(prev)!.has(id)) {
          edges.get(prev)!.add(id);
          indeg.set(id, (indeg.get(id) || 0) + 1);
        }
      }
    });
  }

  const remaining = new Set(nodes.keys());
  const out: ColumnKey[] = [];
  while (remaining.size > 0) {
    let pool = Array.from(remaining).filter((id) => (indeg.get(id) || 0) === 0);
    if (pool.length === 0) pool = Array.from(remaining); // conflicting pages: earliest seen wins
    const next = pool.reduce((a, b) => (firstSeen.get(a)! <= firstSeen.get(b)! ? a : b));
    remaining.delete(next);
    out.push(nodes.get(next)!);
    for (const to of edges.get(next)!) indeg.set(to, Math.max(0, (indeg.get(to) || 0) - 1));
  }
  return out;
}
