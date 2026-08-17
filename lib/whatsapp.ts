// Egyptian-market phone normalization: strips everything but digits, then
// maps a local "0xxxxxxxxxx" (11 digits) to the +20 country code so wa.me
// gets a number it accepts. Numbers already given with a country code
// (12+ digits, no leading 0) are passed through as-is.
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 11) return `20${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
