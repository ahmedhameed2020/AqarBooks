/**
 * The gradient lives in CSS, not in an SVG <defs>. An SVG paint server needs a
 * document-unique id, and two LogoMarks on one page produced a duplicate id --
 * the second instance resolved to the first one's gradient, which was inside a
 * `display:none` container at mobile widths, so it painted nothing.
 */
export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] bg-gradient-to-br from-blue-600 to-sky-500 text-white ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[58%]" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="13" width="4" height="8" rx="1.2" fill="currentColor" fillOpacity="0.8" />
        <rect x="10" y="8" width="4" height="13" rx="1.2" fill="currentColor" />
        <rect x="17" y="3" width="4" height="18" rx="1.2" fill="currentColor" fillOpacity="0.8" />
      </svg>
    </span>
  );
}
