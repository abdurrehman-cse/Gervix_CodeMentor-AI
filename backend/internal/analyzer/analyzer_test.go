package analyzer
import "testing"
func TestBoundaryAndLevels(t *testing.T) {
 code := "function sum(a) {\n for (let i=0; i <= a.length; i++) {}\n}"
 beginner := Analyze(code, "beginner")
 advanced := Analyze(code, "advanced")
 if len(beginner.Diagnostics) != 1 || beginner.Diagnostics[0].Line != 2 { t.Fatal("expected boundary warning on line 2") }
 if beginner.Diagnostics[0].Explanation == advanced.Diagnostics[0].Explanation { t.Fatal("guidance must reflect experience") }
 if len(Analyze("for (let i=0; i < a.length; i++) {}", "beginner").Diagnostics) != 0 { t.Fatal("exclusive boundary should not match") }
}
func TestAssignment(t *testing.T) {
 if len(Analyze("if (x = 2) {}", "beginner").Diagnostics) != 1 { t.Fatal("missing assignment warning") }
 if len(Analyze("if (x === 2) {}", "beginner").Diagnostics) != 0 { t.Fatal("comparison incorrectly flagged") }
}
