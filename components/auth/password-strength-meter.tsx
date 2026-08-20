"use client";

function getStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4);
}

const LEVELS = [
  { barColor: "bg-slate-200", textColor: "text-slate-400", labelAr: "", labelEn: "" },
  { barColor: "bg-red-500", textColor: "text-red-600", labelAr: "ضعيفة", labelEn: "Weak" },
  { barColor: "bg-amber-500", textColor: "text-amber-600", labelAr: "مقبولة", labelEn: "Fair" },
  { barColor: "bg-blue-600", textColor: "text-blue-600", labelAr: "جيدة", labelEn: "Good" },
  { barColor: "bg-emerald-600", textColor: "text-emerald-600", labelAr: "قوية", labelEn: "Strong" },
] as const;

export function PasswordStrengthMeter({ password, isAr }: { password: string; isAr: boolean }) {
  if (!password) return null;
  const strength = getStrength(password);
  const level = LEVELS[strength];

  return (
    <div className="flex items-center gap-2 pt-1" aria-hidden="true">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < strength ? level.barColor : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <span className={`text-[10px] font-bold shrink-0 ${level.textColor}`}>
        {isAr ? level.labelAr : level.labelEn}
      </span>
    </div>
  );
}
