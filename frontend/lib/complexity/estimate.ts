import ts from "typescript";
import type { ComplexityAnalysis, MentorContext } from "../types";
export function estimateComplexity(source: ts.SourceFile, context: MentorContext): ComplexityAnalysis {
  const functions = source.statements.filter(ts.isFunctionDeclaration);
  const root = functions.length === 1 && !context.selection.text ? functions[0].body || source : source;
  const lines: number[] = [];
  const reasons: string[] = [];
  let uncertain = functions.length > 1 && !context.selection.text;
  let allocations = false;
  let linearDepth = 0, logarithmicDepth = 0, highestLinear = 0, highestLogarithmic = 0;
  function selected(node: ts.Node) { const start = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1; const end = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1; return !context.selection.text || start >= context.selection.startLine && end <= context.selection.endLine; }
  function visit(node: ts.Node) {
    if (node !== root && ts.isFunctionDeclaration(node)) { uncertain = true; return; }
    const loop = ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);
    let factor: "constant" | "linear" | "logarithmic" | "unknown" = "constant";
    if (loop && selected(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      lines.push(line);
      if (ts.isForStatement(node)) {
        const initializer = node.initializer && ts.isVariableDeclarationList(node.initializer) ? node.initializer.declarations[0]?.initializer : undefined;
        const bound = node.condition && ts.isBinaryExpression(node.condition) ? node.condition.right : undefined;
        const increment = node.incrementor;
        if (initializer && ts.isNumericLiteral(initializer) && bound && ts.isNumericLiteral(bound)) factor = "constant";
        else if (increment && (ts.isPostfixUnaryExpression(increment) || ts.isPrefixUnaryExpression(increment))) factor = "linear";
        else if (increment && ts.isBinaryExpression(increment)) {
          const operator = increment.operatorToken.kind;
          if ([ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken].includes(operator) && ts.isNumericLiteral(increment.right) && Number(increment.right.text) > 0) factor = "linear";
          else if ([ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken].includes(operator) && ts.isNumericLiteral(increment.right) && Number(increment.right.text) > 1) factor = "logarithmic";
          else if (operator === ts.SyntaxKind.EqualsToken && ts.isBinaryExpression(increment.right) && [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(increment.right.operatorToken.kind) && ts.isNumericLiteral(increment.right.right) && Number(increment.right.right.text) > 1) factor = "logarithmic";
          else factor = "unknown";
        } else factor = "unknown";
      } else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) factor = "linear";
      else factor = "unknown";
      if (factor === "unknown") uncertain = true;
      if (factor === "linear") linearDepth++;
      if (factor === "logarithmic") logarithmicDepth++;
      reasons.push(`Line ${line}: ${factor === "constant" ? "fixed numeric loop bounds; constant relative to input size" : factor === "linear" ? "linear-step traversal, assuming its bound scales with input size" : factor === "logarithmic" ? "geometric updates, assuming a positive starting value and progress toward termination" : "termination and iteration count need further reasoning"}.`);
    }
    if (selected(node)) {
      if (ts.isCallExpression(node) && !node.expression.getText(source).startsWith("console.") && !node.expression.getText(source).startsWith("Math.")) uncertain = true;
      if (ts.isNewExpression(node) || ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node) || ts.isSpreadElement(node)) allocations = true;
      if (linearDepth > highestLinear || linearDepth === highestLinear && logarithmicDepth > highestLogarithmic) { highestLinear = linearDepth; highestLogarithmic = logarithmicDepth; }
    }
    ts.forEachChild(node, visit);
    if (loop && selected(node)) { if (factor === "linear") linearDepth--; if (factor === "logarithmic") logarithmicDepth--; }
  }
  visit(root);
  const linear = highestLinear === 0 ? "" : highestLinear === 1 ? "n" : highestLinear === 2 ? "n²" : `n^${highestLinear}`;
  const logarithmic = highestLogarithmic === 0 ? "" : highestLogarithmic === 1 ? "log n" : `(log n)^${highestLogarithmic}`;
  const time = uncertain ? "Unknown" : `O(${[linear, logarithmic].filter(Boolean).join(" ") || "1"})`;
  const space = allocations || uncertain ? "Unknown" : "O(1)";
  return { time, space, lines, explanation: `${root !== source ? `Scope: ${functions[0].name?.text || "current function"}.\n` : ""}${reasons.join("\n") || "No loops were found in this scope."}\n${uncertain ? "Calls, nested functions, or loop bounds prevent a confident local estimate." : `Combining nested traversal costs gives ${time}.`}${space === "O(1)" ? " Scalar bookkeeping uses constant auxiliary space, excluding the input." : " Inspect allocations and call depth to determine auxiliary space."}`, caveat: "Static estimate, not measured performance or a termination proof. Assumes valid inputs, progress toward termination, input-dependent bounds of size n, and constant-time primitive operations." };
}
