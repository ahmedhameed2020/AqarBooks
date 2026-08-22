import { generateStructuredAi } from "./gateway-client";
import { sanitizePrompt } from "./governance";

export type TargetField = 
  | "code" 
  | "building_code" 
  | "zone_code" 
  | "unit_type" 
  | "floor_number" 
  | "area" 
  | "owner_full_name" 
  | "owner_phone" 
  | "owner_email" 
  | "share_percentage"
  | "full_name"
  | "phone"
  | "email"
  | "national_id"
  | "notes"
  | "ignore";

export type ColumnMappingResult = {
  mappings: Record<string, TargetField>;
  confidence: number;
  explanationAr: string;
};

const SYSTEM_PROMPT = `
You are the AqarBooks AI Import & Schema Mapping Engine.
Your job is to inspect raw column headers from user-uploaded Excel/CSV spreadsheets (which may be in Arabic, English, colloquial dialect, abbreviations, or messy text) and map them accurately to canonical AqarBooks database fields.

Available Target Fields for Units:
- "code": Unit number/code (e.g. رقم الوحدة, كود الوحدة, شاليه, الشقة, Unit No, Villa #, رقم العقار)
- "building_code": Building code/name (e.g. المبنى, رقم العمارة, بلوك, Building, Block)
- "zone_code": Zone/Phase (e.g. المنطقة, المرحلة, Zone, Phase, Sector)
- "unit_type": Property type (e.g. نوع الوحدة, النوع, Type, شقة/فيلا/دوبلكس)
- "floor_number": Floor (e.g. الدور, الطابق, Floor)
- "area": Surface area in m2 (e.g. المساحة, مساحة بالمتر, Area, Sqm)
- "owner_full_name": Owner name (e.g. المالك, اسم العميل, اسم المشتري, Owner Name, Client)
- "owner_phone": Owner phone (e.g. التليفون, موبايل, رقم الهاتف, Phone, Mobile)
- "owner_email": Owner email (e.g. الإيميل, البريد, Email)
- "share_percentage": Ownership share % (e.g. نسبة الملكية, النسبة, Share %)

Available Target Fields for Members/Clients:
- "full_name": Full Name (e.g. الاسم, اسم العضو, Full Name)
- "phone": Primary phone (e.g. المحمول, الهاتف, Mobile)
- "email": Email (e.g. الإيميل, Email)
- "national_id": National ID or Passport (e.g. الرقم القومي, الهوية, National ID)
- "notes": Notes/Memo (e.g. ملاحظات, Notes)

If a column does not match any known field, map it to "ignore".
Output only strict JSON conforming to the requested schema.
`;

export async function mapImportHeadersAi(
  headers: string[],
  sampleRows?: string[][]
): Promise<ColumnMappingResult> {
  const sanitizedHeaders = headers.map(sanitizePrompt);
  const sampleSnippet = sampleRows?.slice(0, 3).map((r) => r.join(" | ")).join("\n") || "";

  const prompt = `
Raw Column Headers:
${JSON.stringify(sanitizedHeaders)}

Sample Data Rows (for context):
${sampleSnippet}

Please provide the best column mapping for AqarBooks import.
Format your output as a JSON object:
{
  "mappings": {
    "<original_header>": "<target_field>"
  },
  "confidence": 0.95,
  "explanationAr": "تم التعرف بنجاح على أعمدة رقم الوحدة والمالك ورقم الهاتف."
}
`;

  // Fallback heuristic mapper if AI is offline or key missing
  const fallbackMappings: Record<string, TargetField> = {};
  for (const h of headers) {
    const norm = h.trim().toLowerCase();
    if (/وحدة|شاليه|شقة|فيلا|unit|code|apt|villa/i.test(norm)) fallbackMappings[h] = "code";
    else if (/عمارة|مبنى|بلوك|building|block/i.test(norm)) fallbackMappings[h] = "building_code";
    else if (/منطقة|مرحلة|قطاع|zone|phase|sector/i.test(norm)) fallbackMappings[h] = "zone_code";
    else if (/نوع|type/i.test(norm)) fallbackMappings[h] = "unit_type";
    else if (/دور|طابق|floor/i.test(norm)) fallbackMappings[h] = "floor_number";
    else if (/مساحة|area|sqm|m2/i.test(norm)) fallbackMappings[h] = "area";
    else if (/مالك|عميل|مشتري|owner|client|buyer/i.test(norm)) fallbackMappings[h] = "owner_full_name";
    else if (/تليفون|موبايل|هاتف|phone|mobile|tel/i.test(norm)) fallbackMappings[h] = "owner_phone";
    else if (/بريد|إيميل|ايميل|email|mail/i.test(norm)) fallbackMappings[h] = "owner_email";
    else if (/نسبة|حصة|share/i.test(norm)) fallbackMappings[h] = "share_percentage";
    else fallbackMappings[h] = "ignore";
  }

  const aiResult = await generateStructuredAi<ColumnMappingResult>({
    systemPrompt: SYSTEM_PROMPT,
    prompt,
    taskType: "IMPORT_MAPPING",
    modelTier: "fast",
    temperature: 0.1,
  });

  if (aiResult.success && aiResult.data?.mappings) {
    return {
      mappings: aiResult.data.mappings,
      confidence: aiResult.data.confidence ?? 0.9,
      explanationAr: aiResult.data.explanationAr || "تم تحليل وتعيين الأعمدة بالذكاء الاصطناعي.",
    };
  }

  return {
    mappings: fallbackMappings,
    confidence: 0.75,
    explanationAr: "تم التعيين التلقائي عبر القواعد المحاسبية الذكية.",
  };
}

/**
 * Cleans and normalizes phone numbers into E.164 standard.
 * e.g., '01012345678' -> '+201012345678'
 */
export function normalizePhoneNumber(raw: string): { phone: string; isValidWhatsApp: boolean } {
  if (!raw) return { phone: "", isValidWhatsApp: false };
  const cleaned = raw.replace(/[^\d+]/g, "").trim();

  // Egyptian domestic number starting with 01
  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return { phone: `+2${cleaned}`, isValidWhatsApp: true };
  }
  // Egyptian number with country code without plus
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return { phone: `+${cleaned}`, isValidWhatsApp: true };
  }
  // Already in international format
  if (/^\+\d{10,15}$/.test(cleaned)) {
    return { phone: cleaned, isValidWhatsApp: true };
  }

  return { phone: cleaned, isValidWhatsApp: cleaned.length >= 10 };
}
