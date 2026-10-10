package main

import (
 "encoding/json"
 "io"
 "log"
 "net/http"
 "os"
 "time"
 "codementor.ai/backend/internal/analyzer"
)
type request struct { Code string `json:"code"`; Language string `json:"language"`; Level string `json:"level"` }
func analyze(w http.ResponseWriter, r *http.Request) {
 w.Header().Set("Content-Type", "application/json")
 var input request
 decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 128*1024)); decoder.DisallowUnknownFields()
 if err := decoder.Decode(&input); err != nil { http.Error(w, "Invalid request or code too large", http.StatusBadRequest); return }
 if err := decoder.Decode(&struct{}{}); err != io.EOF { http.Error(w, "Expected one JSON object", http.StatusBadRequest); return }
 if input.Language != "javascript" || (input.Level != "beginner" && input.Level != "intermediate" && input.Level != "advanced") || input.Code == "" { http.Error(w, "Provide JavaScript code and a supported experience level", http.StatusBadRequest); return }
 json.NewEncoder(w).Encode(analyzer.Analyze(input.Code, input.Level))
}
func main() {
 mux := http.NewServeMux()
 mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { w.Header().Set("Content-Type", "application/json"); w.Write([]byte(`{"status":"ok","aiEnabled":false}`)) })
 mux.HandleFunc("POST /api/analyze", analyze)
 addr := os.Getenv("ADDR"); if addr == "" { addr = "127.0.0.1:8080" }
 server := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5*time.Second, ReadTimeout: 10*time.Second, WriteTimeout: 15*time.Second, IdleTimeout: 60*time.Second}
 log.Printf("CodeMentor API on %s", addr); log.Fatal(server.ListenAndServe())
}
