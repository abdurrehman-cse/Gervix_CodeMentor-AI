import { NextResponse } from "next/server";
import { getMentorAnalysis } from "../../../lib/ai/provider";
import { validContext } from "../../../lib/ai/context";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 350000) return NextResponse.json({ error: "Workspace is too large. Keep files under 300 KB total." }, { status: 413 });
    let context: unknown;
    try { context = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid workspace JSON." }, { status: 400 }); }
    if (!validContext(context)) return NextResponse.json({ error: "Invalid workspace request." }, { status: 400 });
    return NextResponse.json(await getMentorAnalysis(context, request.signal));
  } catch (error) {
    const timeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
    const message = error instanceof Error && /^(AI configuration|The AI provider|The AI response)/.test(error.message) ? error.message : "The analysis response could not be read. Your code is safe; try again.";
    return NextResponse.json({ error: timeout ? "AI analysis stopped or timed out. Your code is safe; try again." : message }, { status: 502 });
  }
}
