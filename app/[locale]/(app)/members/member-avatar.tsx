import { cn } from "@/lib/utils";

// Stable per-member color: hashes the id (not the name, which could repeat)
// into a fixed palette so the same member always gets the same color across
// renders/sessions. Decorative identity coloring, not a data encoding, so it
// doesn't need the categorical-palette validator.
const PALETTE = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
];

function hashToIndex(id: string, length: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MemberAvatar({ id, name, className }: { id: string; name: string; className?: string }) {
  const colorClass = PALETTE[hashToIndex(id, PALETTE.length)];
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        colorClass,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
