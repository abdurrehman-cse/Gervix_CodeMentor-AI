import type { ComplexityAnalysis } from "../../lib/types";
const growth = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)", "O(2ⁿ)"];
export default function Complexity({ analysis, onLine }: { analysis: ComplexityAnalysis | null; onLine: (line: number) => void }) {
  if (!analysis) return <p className="muted">Analyze complexity to explore how this code scales.</p>;
  const normalized = analysis.time.replace(/\s/g, "").replace("^2", "²").replace("^n", "ⁿ");
  function operations(size: number) {
    if (normalized === "O(1)") return 1;
    if (normalized === "O(logn)") return Math.ceil(Math.log2(size));
    if (normalized === "O(n)") return size;
    if (normalized === "O(nlogn)") return Math.ceil(size * Math.log2(size));
    if (normalized === "O(n²)") return size * size;
    return null;
  }
  return <div className="complexity-content"><div className="metrics"><div><small>TIME COMPLEXITY</small><strong>{analysis.time}</strong></div><div><small>SPACE COMPLEXITY</small><strong>{analysis.space}</strong></div></div><h3>Why?</h3><p>{analysis.explanation}</p><div className="inline-actions">{analysis.lines.map((line, index) => <button key={`${line}:${index}`} className="location" onClick={() => onLine(line)}>Line {line}</button>)}</div><h3>Growth</h3><div className="growth">{growth.map(item => <span key={item} className={item.replace(/\s/g, "") === normalized ? "selected" : ""}>{item}</span>)}</div>{operations(10) !== null && <table><thead><tr><th>Input size</th><th>Relative operations</th></tr></thead><tbody>{[10, 100, 1000].map(size => <tr key={size}><td>n = {size.toLocaleString()}</td><td>~{operations(size)?.toLocaleString()}</td></tr>)}</tbody></table>}{normalized === "O(2ⁿ)" && <p>Doubling n from 10 to 20 grows 2ⁿ from 1,024 to 1,048,576. At n = 100 it is about 1.27 × 10³⁰.</p>}<small className="muted">Illustrative growth, not measured runtime. {analysis.caveat}</small></div>;
}
