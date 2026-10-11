import ts from "typescript";
import type { AIAnalysis, MentorContext, Problem, TestCase } from "./types";
import { compilerDiagnostics } from "./diagnostics/compiler";
import { estimateComplexity } from "./complexity/estimate";
import { selectionContainsNode, selectionContainsRange } from "./selection-scope";

export function localAnalysis(context: MentorContext): AIAnalysis {
  const code = context.files.find(file => file.path === context.activeFile)?.content || "";
  const source = ts.createSourceFile(context.activeFile, code, ts.ScriptTarget.Latest, true, /\.tsx?$/.test(context.activeFile) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const problems: Problem[] = [];
  const inSelection = (node: ts.Node) => selectionContainsNode(source, context.selection, node);
  function add(node: ts.Node, details: Omit<Problem, "id" | "file" | "line" | "column" | "endLine" | "endColumn">) {
    if (!inSelection(node)) return;
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    const end = source.getLineAndCharacterOfPosition(node.getEnd());
    problems.push({ ...details, id: `${context.activeFile}:${node.pos}:${details.title}`, file: context.activeFile, line: start.line + 1, column: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1 });
  }
  const parseDiagnostics = (source as ts.SourceFile & { parseDiagnostics: ts.DiagnosticWithLocation[] }).parseDiagnostics;
  const semanticDiagnostics = parseDiagnostics.length ? [] : compilerDiagnostics(context);
  for (const diagnostic of [...parseDiagnostics, ...semanticDiagnostics]) {
    const position = diagnostic.start ?? 0;
    const start = source.getLineAndCharacterOfPosition(position);
    const end = source.getLineAndCharacterOfPosition(position + (diagnostic.length || 1));
    if (!selectionContainsRange(source, context.selection, position, position + (diagnostic.length || 1))) continue;
    const syntax = parseDiagnostics.includes(diagnostic as ts.DiagnosticWithLocation);
    problems.push({ id: `compiler:${diagnostic.code}:${position}`, file: context.activeFile, severity: "error", line: start.line + 1, column: start.character + 1, endLine: end.line + 1, endColumn: end.character + 1, title: syntax ? "Syntax error" : "Compiler diagnostic", description: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "), consequence: syntax ? "JavaScript cannot run until its syntax is valid." : "This operation conflicts with the values or names inferred by the compiler. Review the highlighted expression and verify your assumptions.", concept: syntax ? "Syntax" : "Names, types, and safe value access", hints: syntax ? ["Check the brackets and punctuation around this position."] : ["Trace where this value is declared and initialized.", "Check the value's type and whether it can be null or undefined.", "Compare this operation with the compiler's description."], question: syntax ? "Does each opening bracket have a closing bracket?" : "What values can reach this expression?" });
  }
  function visit(node: ts.Node) {
    if (ts.isForStatement(node) && node.incrementor && ts.isBinaryExpression(node.incrementor) && ts.isNumericLiteral(node.incrementor.right)) {
      const increment = node.incrementor;
      const amount = Number(node.incrementor.right.text);
      const initial = node.initializer && ts.isVariableDeclarationList(node.initializer) ? node.initializer.declarations[0]?.initializer : undefined;
      const noProgress = [ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken].includes(increment.operatorToken.kind) && amount === 0 || [ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken].includes(increment.operatorToken.kind) && amount === 1 || increment.operatorToken.kind === ts.SyntaxKind.AsteriskEqualsToken && initial && ts.isNumericLiteral(initial) && Number(initial.text) === 0;
      if (noProgress) add(increment, { severity: "warning", title: "Loop may not make progress", description: "The update can leave the loop variable unchanged.", consequence: "If the body does not change the condition or exit the loop, execution can continue indefinitely.", concept: "Loop progress and termination", hints: ["Trace the loop variable through its first two updates.", "Does this operation actually change its starting value?", "Identify what makes the condition eventually become false."], question: "What guarantees that each iteration moves toward termination?" });
    }
    if (ts.isForStatement(node) && node.condition && ts.isBinaryExpression(node.condition)) {
      const condition = node.condition;
      if (condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken && ts.isPropertyAccessExpression(condition.right) && condition.right.name.text === "length") {
        const index = condition.left.getText(source);
        const array = condition.right.expression.getText(source);
        let accessesArray = false;
        const inspect = (child: ts.Node) => { if (ts.isElementAccessExpression(child) && child.expression.getText(source) === array && child.argumentExpression.getText(source) === index) accessesArray = true; ts.forEachChild(child, inspect); };
        inspect(node.statement);
        if (accessesArray) add(condition, { severity: "warning", title: "Possible off-by-one error", description: `The condition ${condition.getText(source)} allows ${index} to equal ${array}.length.`, consequence: `For three elements, valid indexes are 0, 1, and 2. This loop also reads ${array}[3], which is undefined. Adding undefined produces NaN.`, concept: "Array indexing and loop boundaries", hints: ["Look carefully at the loop condition.", "What is the largest valid index of an array with three elements?", `Should ${index} ever equal ${array}.length?`], question: "Should the loop include the array's length as an index?", quickFix: { oldCode: condition.getText(source), newCode: `${index} < ${array}.length` } });
      }
    }
    if (ts.isIfStatement(node) && ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) add(node.expression, { severity: "warning", title: "Assignment inside a condition", description: "This condition changes a variable instead of comparing values.", consequence: "The assigned value determines whether the branch runs. This may be intentional; verify your intent.", concept: "Assignment versus comparison", hints: ["What does a single equals sign do?", "Should this condition change a value or compare two values?", "Review strict equality."], question: "Are you assigning or comparing?" });
    if (ts.isWhileStatement(node) && node.expression.kind === ts.SyntaxKind.TrueKeyword) add(node.expression, { severity: "warning", title: "Check loop termination", description: "This loop has a constant true condition.", consequence: "It must exit through a reachable break, return, or exception; otherwise it runs indefinitely.", concept: "Loop termination", hints: ["Trace how execution leaves this loop.", "Is an exit reachable for every input?"], question: "What guarantees that this loop stops?" });
    ts.forEachChild(node, visit);
  }
  visit(source);
  const tests: TestCase[] = [];
  function findSum(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.parent === source && node.name && node.parameters.length === 1 && node.body && inSelection(node)) {
      const parameter = node.parameters[0].name.getText(source);
      const statements = [...node.body.statements];
      const first = statements[0];
      if (first && ts.isIfStatement(first)) {
        const guard = first.expression.getText(source).replace(/\s/g, "");
        const returnStatement = ts.isBlock(first.thenStatement) ? first.thenStatement.statements[0] : first.thenStatement;
        if ([`${parameter}.length===0`, `${parameter}.length==0`, `!${parameter}.length`].includes(guard) && returnStatement && ts.isReturnStatement(returnStatement) && returnStatement.expression && ts.isNumericLiteral(returnStatement.expression) && returnStatement.expression.text === "0") statements.shift();
      }
      const [setup, loop, returned] = statements;
      const declaration = setup && ts.isVariableStatement(setup) ? setup.declarationList.declarations[0] : undefined;
      const accumulator = declaration?.name.getText(source);
      const loopBody = loop && (ts.isForStatement(loop) || ts.isForOfStatement(loop)) && ts.isBlock(loop.statement) ? loop.statement.statements : [];
      const expression = loopBody.length === 1 && ts.isExpressionStatement(loopBody[0]) ? loopBody[0].expression : undefined;
      const forOfValue = loop && ts.isForOfStatement(loop) && loop.expression.getText(source) === parameter && ts.isVariableDeclarationList(loop.initializer) ? loop.initializer.declarations[0]?.name.getText(source) : undefined;
      const accumulation = expression && ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken && expression.left.getText(source) === accumulator && (ts.isElementAccessExpression(expression.right) && expression.right.expression.getText(source) === parameter || forOfValue && expression.right.getText(source) === forOfValue);
      if (statements.length === 3 && declaration?.initializer && ts.isNumericLiteral(declaration.initializer) && declaration.initializer.text === "0" && accumulation && returned && ts.isReturnStatement(returned) && returned.expression?.getText(source) === accumulator) {
        const cases: [string, string, number[], string][] = [["Normal", "normal", [1, 2, 3], "Checks accumulation across several elements."], ["Empty", "empty", [], "An empty sum should preserve the additive identity, zero."], ["Single element", "minimum", [5], "Exposes a boundary error on the smallest nonempty array."], ["Duplicates", "duplicate", [2, 2, 2], "Each repeated value should contribute to the sum."], ["Negative values", "negative", [-3, -2, 1], "Checks addition of signed numbers."], ["Zero boundary", "boundary", [0], "Checks that zero is handled as a value."], ["Large input", "large input", Array.from({ length: 1000 }, (_, index) => index), "Checks a larger input without assuming a fixed array size."]];
        for (const [name, category, input, reason] of cases) tests.push({ id: `${node.name.text}:${category}`, name, category, functionName: node.name.text, args: [input], expected: input.reduce((total, number) => total + number, 0), reason, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, findSum);
  }
  findSum(source);
  return { problems, tests, complexity: estimateComplexity(source, context), explanation: tests.length ? "Local checks found a numeric accumulator. Generated tests assume the intended contract is the sum of the input numbers; verify that contract before treating failures as bugs." : "Local compiler and pattern checks completed. The absence of a diagnostic does not establish correctness; confirm the intended behavior and test the result.", provider: "Local AST checks (limited, no AI configured)" };
}
