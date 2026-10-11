let windowStart = 0;
let requests = 0;
let running = 0;
export function acquireMentorRequest(now = Date.now()): (() => void) | null {
  if (now - windowStart >= 60000) { windowStart = now; requests = 0; }
  if (running >= 4 || requests >= 30) return null;
  running += 1;
  requests += 1;
  let released = false;
  return () => { if (!released) { released = true; running -= 1; } };
}
