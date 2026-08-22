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
Your task is to write courteous, effective, professional payment reminder message templates (WhatsApp & Email) in Arabic for property owners/members.

CRITICAL FINANCIAL SAFETY RULE:
Never invent or write arbitrary numbers. Use these EXACT placeholder tokens in your output:
- [MEMBER_NAME] for member name
- [UNIT_CODE] for unit code
- [AMOUNT] for the exact balance amount
- [CURRENCY] for the currency code
- [ORG_NAME] for organization/community name
- [PAYMENT_LINK] for the direct payment URL

Guidelines:
- If overdue < 30 days: Use a friendly, courteous reminder tone thanking them for their valued membership.
- If overdue 30-90 days: Use a professional, firm tone mentioning [AMOUNT] [CURRENCY], [UNIT_CODE], and payment deadline.
- If overdue > 90 days: Use an urgent, formal tone requesting prompt settlement via [PAYMENT_LINK] to avoid service disruption or late penalties.
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
Generate payment reminder template for:
- Member: [MEMBER_NAME]
- Unit: [UNIT_CODE]
- Outstanding Balance: [AMOUNT] [CURRENCY]
- Days Overdue: ${days} days
- Property: [ORG_NAME]
- Payment Link: [PAYMENT_LINK]

Tone category: ${tone}

Output JSON schema:
{
  "whatsappMessage": "نص رسالة الواتساب متضمناً [MEMBER_NAME] و [AMOUNT] [CURRENCY] و [PAYMENT_LINK]",
  "emailSubject": "عنوان البريد الإلكتروني متضمناً [UNIT_CODE] و [ORG_NAME]",
  "emailBody": "نص البريد الإلكتروني الرسمي متضمناً الـ Placeholders",
  "tone": "FRIENDLY | FORMAL | URGENT"
}
`;

  // Deterministic token injector function (Guarantees zero-hallucination math)
  const injectDeterministicTokens = (text: string) => {
    const formattedAmount = input.balance.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return text
      .replace(/\[MEMBER_NAME\]/g, input.memberName)
      .replace(/\[UNIT_CODE\]/g, input.unitCode || (isAr ? "كافة الوحدات" : "All Units"))
      .replace(/\[AMOUNT\]/g, formattedAmount)
      .replace(/\[CURRENCY\]/g, input.currency)
      .replace(/\[ORG_NAME\]/g, input.organizationName)
      .replace(/\[PAYMENT_LINK\]/g, input.paymentLink || "https://aqarbooks.com/portal/payments");
  };

  // Fallback template
  const fallbackWa = isAr
    ? `السلام عليكم أ/ [MEMBER_NAME]،\nنود تذكير سيادتكم بوجود مستحقات صيانة/خدمات قدرها *[AMOUNT] [CURRENCY]* للوحدة *[UNIT_CODE]* في *[ORG_NAME]*.\n\n💳 يمكنك السداد الإلكتروني الفوري عبر الرابط:\n[PAYMENT_LINK]\n\nشاكرين لتعاونكم الدائم.`
    : `Dear [MEMBER_NAME],\nThis is a friendly reminder that an outstanding balance of [AMOUNT] [CURRENCY] is due for unit [UNIT_CODE] at [ORG_NAME].\n\nYou can pay online at: [PAYMENT_LINK]\n\nThank you for your cooperation.`;

  const fallbackEmailSubject = isAr
    ? `تذكير بمستحقات الوحدة ([UNIT_CODE]) — [ORG_NAME]`
    : `Statement of Due Balance for Unit [UNIT_CODE] — [ORG_NAME]`;

  const fallbackEmailBody = isAr
    ? `السيد/ة [MEMBER_NAME] المحترم/ة،\n\nتحية طيبة وبعد،\n\nنود إحاطتكم علماً بأن إجمالي الرصيد المستحق على وحدتكم ([UNIT_CODE]) يبلغ [AMOUNT] [CURRENCY].\nيرجى التكرم بسداد المبلغ المطلوب عبر بوابة الدفع الإلكتروني أو التحويل البنكي المعتمد:\n[PAYMENT_LINK]\n\nمع خالص التقدير،\nإدارة [ORG_NAME]`
    : `Dear [MEMBER_NAME],\n\nPlease be advised that the current outstanding balance for unit [UNIT_CODE] is [AMOUNT] [CURRENCY].\nKindly settle this balance at your earliest convenience via: [PAYMENT_LINK]\n\nBest regards,\n[ORG_NAME] Management`;

  const aiResult = await generateStructuredAi<SmartDunningDraft>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "SMART_DUNNING",
    modelTier: "fast",
    temperature: 0.1,
  });

  if (aiResult.success && aiResult.data?.whatsappMessage) {
    return {
      whatsappMessage: injectDeterministicTokens(aiResult.data.whatsappMessage),
      emailSubject: injectDeterministicTokens(aiResult.data.emailSubject || fallbackEmailSubject),
      emailBody: injectDeterministicTokens(aiResult.data.emailBody || fallbackEmailBody),
      tone: aiResult.data.tone || tone,
    };
  }

  return {
    whatsappMessage: injectDeterministicTokens(fallbackWa),
    emailSubject: injectDeterministicTokens(fallbackEmailSubject),
    emailBody: injectDeterministicTokens(fallbackEmailBody),
    tone,
  };
}
