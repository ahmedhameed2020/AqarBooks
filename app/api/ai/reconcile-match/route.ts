import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { scoreBankReconciliationMatch, interpretBankMemoAi, type StatementLineCandidate } from "@/lib/ai/bank-reconciliation";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const statementId = body?.statementId as string;
    const organizationId = body?.organizationId as string;

    if (!statementId) {
      return NextResponse.json({ error: "MISSING_STATEMENT_ID" }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch statement lines
    const { data: lines } = await supabase
      .from("bank_statement_lines")
      .select("id, line_date, description, reference, amount, matched_journal_entry_line_id")
      .eq("statement_id", statementId)
      .is("matched_journal_entry_line_id", null)
      .order("line_date");

    const unmatchedLines = lines || [];
    if (unmatchedLines.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        summary: { strongMatches: 0, suggestedMatches: 0, needsReview: 0, unmatched: 0 },
      });
    }

    // 2. Fetch match candidates via RPC
    const candidateResults = await Promise.all(
      unmatchedLines.map((l) =>
        supabase.rpc("get_bank_match_candidates", {
          p_statement_line_id: l.id,
          p_date_tolerance_days: 30,
        })
      )
    );

    // 3. Process matches and calculate scores
    const matchResults = await Promise.all(
      unmatchedLines.map(async (l, idx) => {
        const rawCandidates = candidateResults[idx]?.data || [];
        const candidates: StatementLineCandidate[] = rawCandidates.map((c: any) => ({
          id: c.journal_entry_line_id,
          entryNumber: String(c.entry_number ?? ""),
          entryDate: c.entry_date,
          amount: c.amount,
          description: c.description,
        }));

        let interpretedMemo;
        if (l.description && l.description.length > 5) {
          interpretedMemo = await interpretBankMemoAi(l.description);
        }

        return scoreBankReconciliationMatch(
          {
            id: l.id,
            lineDate: l.line_date,
            amount: l.amount,
            description: l.description,
            reference: l.reference,
          },
          candidates,
          interpretedMemo
        );
      })
    );

    const strongMatches = matchResults.filter((r) => r.tier === "STRONG_MATCH");
    const suggestedMatches = matchResults.filter((r) => r.tier === "SUGGESTED_MATCH");
    const needsReview = matchResults.filter((r) => r.tier === "NEEDS_REVIEW");
    const unmatched = matchResults.filter((r) => r.tier === "UNMATCHED");

    return NextResponse.json({
      success: true,
      results: matchResults,
      summary: {
        strongCount: strongMatches.length,
        suggestedCount: suggestedMatches.length,
        needsReviewCount: needsReview.length,
        unmatchedCount: unmatched.length,
        bulkApprovableCandidateIds: strongMatches
          .filter((m) => m.candidateId)
          .map((m) => ({ lineId: m.statementLineId, journalLineId: m.candidateId! })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
