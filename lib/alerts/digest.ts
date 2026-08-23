import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env/server";
import { escapeHtml } from "@/lib/reports/html-escape";
import { getOperationalAlerts, type OperationalAlert } from "@/lib/alerts/operational-alerts";

// The nightly digest.
//
// One email per organization per day, not one per alert. Per-alert mail would
// reintroduce everything the derived design avoids: the same lease shouting
// every morning, and a growing pile of "did we already send this" bookkeeping.
// A digest is idempotent by its own shape -- there is exactly one per day, and
// alert_digest_runs enforces it with a unique key rather than trusting the job
// not to run twice.
//
// The job has no session, so alerts are derived through the admin client, which
// bypasses RLS. Safety therefore moves to the recipient list: only staff who
// hold finance.dues.read receive it, because the digest states outstanding
// balances. Anyone without that permission is not mailed at all rather than
// mailed a redacted version -- a half-empty digest teaches people to ignore it.

export interface DigestOutcome {
  organizationId: string;
  organizationName: string;
  status: "SENT" | "SKIPPED" | "FAILED";
  recipients: number;
  alerts: number;
  error?: string;
}

/** Staff allowed to see financial alerts, with a deliverable address. */
async function resolveRecipients(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<{ email: string; name: string }[]> {
  const { data: memberships } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .neq("status", "suspended");

  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const recipients: { email: string; name: string }[] = [];

  for (const userId of userIds) {
    const { data: permitted } = await admin.rpc("has_permission", {
      p_user_id: userId,
      p_organization_id: organizationId,
      p_permission_key: "finance.dues.read",
    });
    if (!permitted) continue;

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    // Placeholder identities minted for owners with no address of their own are
    // not deliverable, and are not staff anyway.
    if (!email || email.endsWith("@invite.aqarbooks.local")) continue;

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    recipients.push({ email, name: profile?.full_name || email });
  }

  return recipients;
}

function renderDigestHtml(
  organizationName: string,
  alerts: OperationalAlert[],
  siteUrl: string,
): string {
  const rows = alerts
    .map((a) => {
      const tone =
        a.severity === "CRITICAL" ? "#dc2626" : a.severity === "WARNING" ? "#d97706" : "#64748b";
      return `      <tr>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;">${escapeHtml(a.titleAr)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(a.bodyAr)}</div>
          <a href="${escapeHtml(siteUrl)}/ar${escapeHtml(a.href)}" style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;color:#4f46e5;text-decoration:none;">${escapeHtml(a.actionAr)} ←</a>
        </td>
        <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;white-space:nowrap;">
          <span style="font-size:10px;font-weight:700;color:${tone};">${
            a.severity === "CRITICAL" ? "عاجل" : a.severity === "WARNING" ? "تحذير" : "للعلم"
          }</span>
        </td>
      </tr>`;
    })
    .join("\n");

  const printedOn = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>ملخص التنبيهات اليومي</title></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 20px;border-bottom:2px solid #4f46e5;">
      <div style="font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(organizationName)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">ملخص التنبيهات التشغيلية · ${escapeHtml(printedOn)}</div>
    </div>

    <div style="padding:14px 20px;font-size:12.5px;color:#334155;">
      لديك <strong>${alerts.length}</strong> تنبيه يحتاج انتباهك اليوم.
    </div>

    <table style="width:100%;border-collapse:collapse;">
      <tbody>
${rows}
      </tbody>
    </table>

    <div style="padding:16px 20px;">
      <a href="${escapeHtml(siteUrl)}/ar/notifications" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:12px;font-weight:700;padding:9px 16px;border-radius:9px;text-decoration:none;">فتح كل التنبيهات</a>
    </div>

    <div style="padding:12px 20px;border-top:1px solid #e2e8f0;font-size:10.5px;color:#94a3b8;line-height:1.6;">
      تُشتق هذه التنبيهات من دفاترك لحظة إرسال الرسالة، ويختفي التنبيه تلقائيًا بمجرد زوال سببه.
      لضبط العتبات أو إيقاف نوع من التنبيهات، افتح صفحة التنبيهات في النظام.
    </div>
  </div>
</body>
</html>`;
}

async function sendViaResend(
  to: string[],
  subject: string,
  html: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = serverEnv.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured" };

  // Called over plain fetch rather than the SDK: this runs on the Workers
  // runtime, where one HTTPS POST is the whole integration and a dependency
  // would only add bundle weight.
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: serverEnv.RESEND_FROM,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Truncated: provider errors can be long, and this string lands in a table
    // that staff can read.
    return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
  }

  return { ok: true };
}

/**
 * Builds and sends today's digest for every active organization.
 * Safe to call more than once a day -- the second call finds the run already
 * recorded and does nothing.
 */
export async function runDailyDigest(): Promise<DigestOutcome[]> {
  const admin = createAdminClient();
  const siteUrl = serverEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const runDate = new Date().toISOString().slice(0, 10);

  const { data: organizations } = await admin
    .from("organizations")
    .select("id, name")
    .eq("status", "ACTIVE");

  const outcomes: DigestOutcome[] = [];

  for (const org of organizations ?? []) {
    // Idempotency gate. Checked before any work so a retry is cheap.
    const { data: existing } = await admin
      .from("alert_digest_runs")
      .select("id")
      .eq("organization_id", org.id)
      .eq("run_date", runDate)
      .maybeSingle();

    if (existing) continue;

    let outcome: DigestOutcome = {
      organizationId: org.id,
      organizationName: org.name,
      status: "SKIPPED",
      recipients: 0,
      alerts: 0,
    };

    try {
      // userId null: dismissals are one person's reading state and must not
      // decide what a shared email contains.
      const alerts = await getOperationalAlerts(org.id, null, admin);
      outcome.alerts = alerts.length;

      if (alerts.length === 0) {
        // Silence is the correct output when nothing is wrong. A daily "all
        // clear" trains people to delete the digest unread.
        outcome.status = "SKIPPED";
      } else {
        const recipients = await resolveRecipients(admin, org.id);
        outcome.recipients = recipients.length;

        if (recipients.length === 0) {
          outcome.status = "SKIPPED";
        } else {
          const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
          const subject = critical
            ? `${org.name}: ${critical} تنبيه عاجل و${alerts.length - critical} تنبيه آخر`
            : `${org.name}: ${alerts.length} تنبيه يحتاج المتابعة`;

          const sent = await sendViaResend(
            recipients.map((r) => r.email),
            subject,
            renderDigestHtml(org.name, alerts, siteUrl),
          );

          if (sent.ok) {
            outcome.status = "SENT";
          } else {
            outcome.status = "FAILED";
            outcome.error = sent.error;
          }
        }
      }
    } catch (err) {
      outcome = {
        ...outcome,
        status: "FAILED",
        error: (err as Error).message.slice(0, 300),
      };
    }

    await admin.from("alert_digest_runs").insert({
      organization_id: org.id,
      run_date: runDate,
      status: outcome.status,
      recipients_count: outcome.recipients,
      alerts_count: outcome.alerts,
      error_message: outcome.error ?? null,
    });

    outcomes.push(outcome);
  }

  return outcomes;
}
