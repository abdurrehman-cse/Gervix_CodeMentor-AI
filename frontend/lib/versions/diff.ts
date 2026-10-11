export type DiffLine = { kind: "added" | "removed" | "unchanged"; text: string };
export function lineDiff(previous: string, next: string): DiffLine[] {
  const before = previous === "" ? [] : previous.split("\n"), after = next === "" ? [] : next.split("\n");
  if (before.length * after.length > 250000) return [...before.map(text => ({ kind: "removed" as const, text })), ...after.map(text => ({ kind: "added" as const, text }))];
  const rows = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left--) for (let right = after.length - 1; right >= 0; right--) rows[left][right] = before[left] === after[right] ? rows[left + 1][right + 1] + 1 : Math.max(rows[left + 1][right], rows[left][right + 1]);
  const result: DiffLine[] = [];
  let left = 0, right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) { result.push({ kind: "unchanged", text: before[left++] }); right++; }
    else if (right < after.length && (left === before.length || rows[left][right + 1] >= rows[left + 1][right])) result.push({ kind: "added", text: after[right++] });
    else result.push({ kind: "removed", text: before[left++] });
  }
  return result;
}
