import ts from "typescript";
import { localAnalysis } from "../local-analysis";
import type { AIAnalysis, MentorContext } from "../types";

export function localMentor(context: MentorContext): AIAnalysis {
  const referenced = context.files.filter(file => file.kind === "file" && (context.question.includes(file.path) || context.question.includes(file.path.split("/").at(-1) || file.path)));
  const selected = referenced.length === 1 && referenced[0].path !== context.activeFile ? { ...context, activeFile: referenced[0].path, selection: { text: "", startLine: 1, endLine: 1 } } : context;
  const result = localAnalysis(selected);
  if (!["chat", "explain", "optimize", "hint"].includes(context.action)) return result;
  const file = selected.files.find(file => file.path === selected.activeFile)!;
  const question = context.question.toLowerCase();
  const problem = result.problems[0];
  if (context.action === "hint" || /\bhint\b|\bclue\b/.test(question)) {
    const used = Math.max(context.hintsUsed?.count || 0, context.messages.filter(message => message.role === "assistant" && message.content.startsWith("Hint ")).length);
    result.explanation = problem ? `Hint ${Math.min(used + 1, problem.hints.length)} for ${problem.file}:${problem.line}: ${problem.hints[Math.min(used, problem.hints.length - 1)]}` : `No supported diagnostic was found in ${file.path}. Trace the selected code with the smallest valid input, then an empty input. Record what each variable becomes. Local checks cannot infer every intended contract.`;
  } else if (/complexity|o\(.*\)|\bscal|\befficient|\boptimiz/.test(question) || context.action === "optimize") {
    result.explanation = `${file.path}: estimated time ${result.complexity?.time}, auxiliary space ${result.complexity?.space}.\n${result.complexity?.explanation}\n${result.complexity?.caveat}${context.action === "optimize" ? "\nBefore changing the algorithm, identify repeated work and decide whether storing intermediate results would trade extra memory for less time." : ""}`;
  } else if (/\btest|\bedge|\bempty|\bboundary/.test(question)) {
    result.explanation = result.tests.length ? `For ${file.path}, review these candidate tests under the numeric-sum contract:\n${result.tests.map(test => `${test.name}: ${test.reason}`).join("\n")}\nRun them to obtain actual results. Generated expectations are assumptions about intended behavior, not proof.` : `For ${file.path}, first specify the intended output. Try an empty input, one element, values at each boundary, duplicates, and invalid types when the contract defines their handling. General expected-output generation requires a configured AI provider or a supplied specification.`;
  } else if (problem && context.action !== "explain") {
    result.explanation = `${problem.file}:${problem.line} — ${problem.title}\n${problem.description}\n${problem.consequence}\nConcept: ${problem.concept}\nThink about it: ${problem.question}`;
  } else {
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const steps: string[] = [];
    function visit(node: ts.Node) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (selected.selection.text && (line < selected.selection.startLine || line > selected.selection.endLine)) { ts.forEachChild(node, visit); return; }
      if (ts.isFunctionDeclaration(node)) steps.push(`Line ${line}: ${node.name?.text || "This function"} accepts ${node.parameters.map(parameter => parameter.name.getText(source)).join(", ") || "no parameters"}.`);
      if (ts.isVariableStatement(node)) steps.push(`Line ${line}: initialize ${node.declarationList.declarations.map(declaration => declaration.getText(source)).join(", ")}. These values establish the initial state.`);
      if (ts.isForStatement(node)) steps.push(`Line ${line}: repeat while ${node.condition?.getText(source) || "the loop has no condition"}; after each iteration, execute ${node.incrementor?.getText(source) || "no increment expression"}.`);
      if (ts.isIfStatement(node)) steps.push(`Line ${line}: choose a branch based on ${node.expression.getText(source)}.`);
      if (ts.isReturnStatement(node)) steps.push(`Line ${line}: return ${node.expression?.getText(source) || "undefined"} to the caller.`);
      ts.forEachChild(node, visit);
    }
    visit(source);
    result.explanation = `${file.path}${selected.selection.text ? `, lines ${selected.selection.startLine}–${selected.selection.endLine}` : ""}:\n${steps.slice(0, 16).join("\n") || "Trace the expressions in order and record how the state changes."}${problem ? `\nCheck line ${problem.line}: ${problem.description}\n${problem.question}` : "\nWhat result should this code produce for the smallest input?"}\nThis explanation comes from local syntax inspection; it does not prove the program's behavior.`;
  }
  if (referenced.length > 1) result.explanation = referenced.map(file => { const analysis = localAnalysis({ ...context, activeFile: file.path, selection: { text: "", startLine: 1, endLine: 1 } }); return `${file.path}: ${analysis.problems.map(problem => `${problem.title} at line ${problem.line}`).join("; ") || "no supported local diagnostic"}; estimated time ${analysis.complexity?.time}, space ${analysis.complexity?.space}.`; }).join("\n") + "\nThese are local observations. Semantic comparison across files requires the AI provider.";
  return result;
}
