package analyzer

import (
 "regexp"
 "strings"
)

type Diagnostic struct {
 RuleID string `json:"ruleId"`
 Line int `json:"line"`
 Column int `json:"column"`
 Category string `json:"category"`
 Message string `json:"message"`
 Explanation string `json:"explanation"`
 Hint string `json:"hint"`
}
type Result struct {
 Diagnostics []Diagnostic `json:"diagnostics"`
 Provider string `json:"provider"`
 Scope string `json:"scope"`
}
type rule struct { id, category, message string; pattern *regexp.Regexp; explanations, hints [3]string }
var rules = []rule{
 {"array-boundary", "possible logic error", "Check this array boundary", regexp.MustCompile(`for\s*\([^;]*;[^;]*<=\s*[A-Za-z_$][\w$]*\.length\s*;`), [3]string{"Arrays start at index zero. An array of length 3 has indices 0, 1, and 2. This loop may also visit index 3; reading it returns undefined, which can make a numeric sum NaN. Check whether you intended this inclusive boundary.", "The inclusive length boundary may visit an index outside the array.", "Possible off-by-one at the inclusive length bound."}, [3]string{"Trace the loop using an array with one item. Which indices will it visit?", "Compare the last valid index with length.", "Inspect the upper bound."}},
 {"conditional-assignment", "possible logic error", "Assignment inside a condition", regexp.MustCompile(`if\s*\(\s*[A-Za-z_$][\w$]*\s*=[^=]`), [3]string{"A single equals sign assigns a value. Inside an if condition, that changes the variable and tests the assigned value. If your goal was comparison, review the equality operators. Assignment can be intentional, so confirm your intent.", "This condition assigns a value; verify whether comparison was intended.", "Conditional assignment: confirm intent."}, [3]string{"What should the condition do: change the value or compare it?", "Review the operator in the condition.", "Check operator intent."}},
}
func Analyze(code, level string) Result {
 result := Result{Diagnostics: []Diagnostic{}, Provider: "deterministic-rules", Scope: "Limited JavaScript pattern checks; code is not executed."}
 index := 0
 if level == "intermediate" { index = 1 }; if level == "advanced" { index = 2 }
 for number, line := range strings.Split(code, "\n") {
  if strings.HasPrefix(strings.TrimSpace(line), "//") { continue }
  for _, r := range rules { if match := r.pattern.FindStringIndex(line); match != nil {
   result.Diagnostics = append(result.Diagnostics, Diagnostic{r.id, number+1, match[0]+1, r.category, r.message, r.explanations[index], r.hints[index]})
  } }
 }
 return result
}
