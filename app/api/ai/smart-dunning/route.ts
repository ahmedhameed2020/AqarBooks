import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateSmartDunningDraft, type DunningDraftInput } from "@/lib/ai/smart-dunning";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const input = body?.input as DunningDraftInput;
    const locale = (body?.locale as string) || "ar";

    if (!input || !input.memberName) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const draft = await generateSmartDunningDraft(input, locale);
    return NextResponse.json(draft);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
