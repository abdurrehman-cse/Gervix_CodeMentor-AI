import { NextResponse } from "next/server";
import { getMentorAnalysis } from "../../../lib/ai/provider";
import { validContext } from "../../../lib/ai/context";
import { attachProvenance, contentHash } from "../../../lib/versions/snapshots";
import { validateAnalysis } from "../../../lib/ai-validation";
import { acquireMentorRequest } from "../../../lib/ai/request-limits";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 350000) return NextResponse.json({ error: "Workspace is too large. Keep files under 300 KB total." }, { status: 413 });
    let context: unknown;
    try { context = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid workspace JSON." }, { status: 400 }); }
    if (!validContext(context)) return NextResponse.json({ error: "Invalid workspace request." }, { status: 400 });
    if (!context.provenance) return NextResponse.json({ error: "A submitted source version is required. Reanalyze Latest Code." }, { status: 400 });
    if (context.provenance) {
      const source = context.provenance;
      if (source.activeFile !== context.activeFile || !Object.keys(source.files).includes(context.activeFile)) return NextResponse.json({ error: "Invalid analysis provenance." }, { status: 400 });
      for (const file of context.files.filter(file => file.kind === "file")) if (source.files[file.path] !== await contentHash(file.content)) return NextResponse.json({ error: "Snapshot checksum mismatch." }, { status: 400 });
      if (Object.keys(source.files).length !== context.files.filter(file => file.kind === "file").length) return NextResponse.json({ error: "Snapshot files do not match provenance." }, { status: 400 });
    }
    const release = acquireMentorRequest();
    if (!release) return NextResponse.json({ error: "The mentor is busy. Please wait a minute and retry; your code is safe." }, { status: 429, headers: { "Retry-After": "60" } });
    let generated;
    try { generated = await getMentorAnalysis(context, request.signal); } finally { release(); }
    const analysis = { ...validateAnalysis(generated, context), provider: generated.provider };
    return NextResponse.json(context.provenance ? attachProvenance(analysis, context.provenance) : analysis);
  } catch (error) {
    const timeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    const message = error instanceof Error && /^(AI configuration|The AI provider|The AI response)/.test(error.message) ? error.message : "The analysis response could not be read. Your code is safe; try again.";
    return NextResponse.json({ error: timeout ? "AI analysis stopped or timed out. Your code is safe; try again." : message }, { status: 502 });
  }
}
