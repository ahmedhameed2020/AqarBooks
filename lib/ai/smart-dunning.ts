import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt } from "./governance";

export type DunningDraftInput = {
  memberName: string;
  unitCode?: string;
  balance: number;
  currency: string;
  organizationName: string;
  daysOverdue?: number;
  paymentLink?: string;
};

export type SmartDunningDraft = {
  whatsappMessage: string;
  emailSubject: string;
  emailBody: string;
  tone: "FRIENDLY" | "FORMAL" | "URGENT";
};

const SYSTEM_PROMPT = `
You are the AqarBooks Smart Dunning & Customer Relations Specialist.
Your task is to write courteous, effective, professional payment reminder messages (WhatsApp & Email) in Arabic for property owners/members.

Guidelines:
- If overdue < 30 days: Use a friendly, courteous reminder tone thanking them for their valued membership.
- If overdue 30-90 days: Use a professional, firm tone mentioning the due amount, unit code, and payment deadline.
- If overdue > 90 days: Use an urgent, formal tone requesting prompt settlement to avoid service disruption or late penalties.
- Include unit code, exact amount, and direct payment link if provided.
- Avoid aggressive or offensive language; preserve professional business relations.
`;

export async function generateSmartDunningDraft(
  input: DunningDraftInput,
  locale: string = "ar"
): Promise<SmartDunningDraft> {
  const isAr = locale === "ar";
  const days = input.daysOverdue ?? 15;
  const tone: "FRIENDLY" | "FORMAL" | "URGENT" = days > 90 ? "URGENT" : days > 30 ? "FORMAL" : "FRIENDLY";

  const prompt = `
Generate payment reminder draft for:
- Member Name: ${sanitizePrompt(input.memberName)}
- Unit Code: ${input.unitCode || "All Units"}
- Outstanding Balance: ${input.balance.toLocaleString()} ${input.currency}
- Days Overdue: ${days} days
- Property / Community Name: ${input.organizationName}
- Payment Link: ${input.paymentLink || "https://aqarbooks.com/portal/payments"}

Output JSON schema:
{
  "whatsappMessage": "نص رسالة الواتساب المنسقة مع إيموجي خفيف والروابط",
  "emailSubject": "عنوان البريد الإلكتروني الرسمي",
  "emailBody": "نص البريد الإلكتروني الرسمي المنسق",
  "tone": "FRIENDLY | FORMAL | URGENT"
}
`;

  // Fallback template
  const fallbackWa = isAr
    ? `السلام عليكم أ/ ${input.memberName}،\nنود تذكير سيادتكم بوجود مستحقات صيانة/خدمات قدرها *${input.balance.toLocaleString()} ${input.currency}* للوحدة *${input.unitCode || ""}* في *${input.organizationName}*.\n\n💳 يمكنك السداد الإلكتروني الفوري عبر الرابط:\n${input.paymentLink || "https://aqarbooks.com/portal/payments"}\n\nشاكرين لتعاونكم الدائم.`
    : `Dear ${input.memberName},\nThis is a friendly reminder that an outstanding balance of ${input.balance.toLocaleString()} ${input.currency} is due for unit ${input.unitCode || ""} at ${input.organizationName}.\n\nYou can pay online at: ${input.paymentLink || "https://aqarbooks.com/portal/payments"}\n\nThank you for your cooperation.`;

  const fallbackEmailSubject = isAr
    ? `تذكير بمستحقات الوحدة (${input.unitCode || ""}) — ${input.organizationName}`
    : `Statement of Due Balance for Unit ${input.unitCode || ""} — ${input.organizationName}`;

  const fallbackEmailBody = isAr
    ? `السيد/ة ${input.memberName} المحترم/ة،\n\nتحية طيبة وبعد،\n\nنود إحاطتكم علماً بأن إجمالي الرصيد المستحق على وحدتكم (${input.unitCode || ""}) يبلغ ${input.balance.toLocaleString()} ${input.currency}.\nيرجى التكرم بسداد المبلغ المطلوب عبر بوابة الدفع الإلكتروني أو التحويل البنكي المعتمد.\n\nمع خالص التقدير،\nإدارة ${input.organizationName}`
    : `Dear ${input.memberName},\n\nPlease be advised that the current outstanding balance for unit ${input.unitCode || ""} is ${input.balance.toLocaleString()} ${input.currency}.\nKindly settle this balance at your earliest convenience.\n\nBest regards,\n${input.organizationName} Management`;

  const aiResult = await generateStructuredAi<SmartDunningDraft>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "SMART_DUNNING",
    modelTier: "fast",
    temperature: 0.2,
  });

  if (aiResult.success && aiResult.data?.whatsappMessage) {
    return {
      whatsappMessage: aiResult.data.whatsappMessage,
      emailSubject: aiResult.data.emailSubject || fallbackEmailSubject,
      emailBody: aiResult.data.emailBody || fallbackEmailBody,
      tone: aiResult.data.tone || tone,
    };
  }

  return {
    whatsappMessage: fallbackWa,
    emailSubject: fallbackEmailSubject,
    emailBody: fallbackEmailBody,
    tone,
  };
}
