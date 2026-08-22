export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-500 text-white font-black shadow-md shadow-purple-600/30 transition-transform ${className}`}
    >
      <span className="text-[60%] font-black tracking-tight leading-none select-none font-sans drop-shadow-xs">
        A
      </span>
    </span>
  );
}
