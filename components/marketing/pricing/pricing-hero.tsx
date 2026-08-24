import type { Locale } from "@/i18n/routing";
import { getPricingCopy } from "./pricing-copy";
import { DraftingGrid, SectionEyebrow } from "./pricing-primitives";

/* Restrained architectural/ledger geometry: a block of property units
   resolving through a single posting node into balanced ledger rows. Purely
   decorative, label-free (so it needs no mirroring in RTL) and static -- no
   animation, no gradient, no floating decoration. */
function LedgerGeometry() {
  const units = Array.from({ length: 12 }, (_, i) => i);

  return (
    <svg
      viewBox="0 0 320 300"
      role="presentation"
      aria-hidden="true"
      className="h-auto w-full max-w-[340px]"
    >
      {/* Property units */}
      <g>
        {units.map((i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          return (
            <rect
              key={i}
              x={44 + col * 60}
              y={16 + row * 30}
              width={48}
              height={20}
              rx={3}
              fill={row === 1 && col === 1 ? "#07425d" : "#ffffff"}
              stroke={row === 1 && col === 1 ? "#07425d" : "#cbd5e1"}
              strokeWidth={1}
            />
          );
        })}
      </g>

      {/* Convergence to a single posting node */}
      <path
        d="M68 106 L160 150 M128 106 L160 150 M188 106 L160 150 M248 106 L160 150"
        stroke="#cbd5e1"
        strokeWidth={1}
        fill="none"
      />
      <circle cx={160} cy={154} r={7} fill="#ffffff" stroke="#07425d" strokeWidth={1.5} />
      <circle cx={160} cy={154} r={2.5} fill="#07425d" />
      <path d="M160 161 L160 184" stroke="#cbd5e1" strokeWidth={1} />

      {/* Balanced ledger rows: account label rail, debit column, credit column */}
      <g>
        {[0, 1, 2, 3].map((r) => (
          <g key={r}>
            <rect
              x={30}
              y={188 + r * 26}
              width={260}
              height={20}
              rx={3}
              fill={r === 0 ? "#f8fafc" : "#ffffff"}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <rect x={40} y={195 + r * 26} width={78} height={6} rx={3} fill="#cbd5e1" />
            <rect
              x={168}
              y={195 + r * 26}
              width={44}
              height={6}
              rx={3}
              fill={r % 2 === 0 ? "#07425d" : "#e2e8f0"}
            />
            <rect
              x={228}
              y={195 + r * 26}
              width={44}
              height={6}
              rx={3}
              fill={r % 2 === 0 ? "#e2e8f0" : "#1b60b9"}
            />
          </g>
        ))}
      </g>

      {/* Balance rule */}
      <path d="M30 296 L290 296" stroke="#07425d" strokeWidth={1.5} strokeOpacity={0.5} />
    </svg>
  );
}

export function PricingHero({ locale }: { locale: Locale }) {
  const copy = getPricingCopy(locale);

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-white">
      <DraftingGrid className="opacity-70" />

      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-12 lg:gap-10 lg:py-24">
        <div className="lg:col-span-7">
          <SectionEyebrow>{copy.hero.eyebrow}</SectionEyebrow>

          <h1 className="mt-6 max-w-2xl text-3xl leading-[1.25] font-black text-slate-950 font-heading sm:text-4xl lg:text-[2.9rem]">
            {copy.hero.headline}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed font-medium text-slate-600 sm:text-lg">
            {copy.hero.support}
          </p>

          <ul className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold text-slate-700 sm:text-[13px]">
            {copy.hero.trust.map((item, i) => (
              <li key={item} className="flex items-center gap-3">
                {i > 0 && (
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                )}
                <span className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden justify-center md:flex lg:col-span-5 lg:justify-end">
          <div className="w-full max-w-[340px] rounded-3xl border border-slate-200/90 bg-[#FAFAFA] p-7 shadow-sm">
            <LedgerGeometry />
          </div>
        </div>
      </div>
    </section>
  );
}
