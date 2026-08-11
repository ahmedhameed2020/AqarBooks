"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, X } from "lucide-react";

export type SidebarSubItem = {
  href: string;
  labelAr: string;
  labelEn: string;
};

export type SidebarNavItem = {
  href: string;
  labelAr: string;
  labelEn: string;
  // A rendered icon element (e.g. <User className="size-4" />), not a
  // component reference -- passing the bare component type (a forwardRef
  // object) from a Server Component to this Client Component isn't
  // serializable by React; an already-created element is.
  icon: React.ReactNode;
  // Closely related destinations nested one level under this item (e.g.
  // "Chart of Accounts" -> "Journal Entries"), so a themed area reads as
  // one scannable row instead of N flat siblings competing for attention.
  subItems?: SidebarSubItem[];
};

export type SidebarNavGroup = {
  key: string;
  labelAr?: string;
  labelEn?: string;
  items: SidebarNavItem[];
};

export type SidebarWorkspace = {
  key: string;
  labelAr: string;
  labelEn: string;
  groups: SidebarNavGroup[];
};

const GROUP_STORAGE_KEY = "resortos-sidebar-collapsed-groups";
const SUBITEM_STORAGE_KEY = "resortos-sidebar-open-subitems";
const WORKSPACE_STORAGE_KEY = "resortos-sidebar-workspace";

function itemMatches(pathname: string, item: SidebarNavItem): boolean {
  if (pathname === item.href) return true;
  return item.subItems?.some((sub) => pathname === sub.href) ?? false;
}

function NavRow({
  item,
  locale,
  isAr,
  pathname,
  forceOpen,
  openSubKeys,
  onToggleSub,
}: {
  item: SidebarNavItem;
  locale: Locale;
  isAr: boolean;
  pathname: string;
  forceOpen: boolean;
  openSubKeys: Set<string>;
  onToggleSub: (href: string) => void;
}) {
  const isActive = itemMatches(pathname, item);
  const hasSubItems = Boolean(item.subItems?.length);
  const hasActiveSub = item.subItems?.some((sub) => pathname === sub.href) ?? false;
  const isSubOpen = forceOpen || hasActiveSub || openSubKeys.has(item.href);

  return (
    <div>
      <div className="group relative flex items-center">
        <span
          className={cn(
            "absolute inset-y-1.5 start-0 w-0.5 rounded-e-full transition-opacity",
            isActive ? "bg-sidebar-primary opacity-100" : "opacity-0",
          )}
        />
        <Link
          href={item.href}
          locale={locale}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isActive
              ? "bg-sidebar-primary/15 text-sidebar-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-white/[0.05] hover:text-sidebar-foreground",
          )}
        >
          <span className={cn("shrink-0", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/55")}>
            {item.icon}
          </span>
          <span className="truncate">{isAr ? item.labelAr : item.labelEn}</span>
        </Link>
        {hasSubItems && (
          <button
            type="button"
            onClick={() => onToggleSub(item.href)}
            aria-label={isSubOpen ? (isAr ? "طي" : "Collapse") : (isAr ? "توسيع" : "Expand")}
            className="me-1 flex size-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/45 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground/80"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", isSubOpen && "rotate-180")} />
          </button>
        )}
      </div>

      {hasSubItems && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: isSubOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="ms-[27px] mt-0.5 space-y-0.5 border-s border-sidebar-border ps-2.5">
              {item.subItems!.map((sub) => {
                const subActive = pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    locale={locale}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                      subActive
                        ? "text-sidebar-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1 shrink-0 rounded-full",
                        subActive ? "bg-sidebar-primary" : "bg-sidebar-foreground/35",
                      )}
                    />
                    <span className="truncate">{isAr ? sub.labelAr : sub.labelEn}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppSidebar({
  workspaces,
  locale,
  footer,
}: {
  // 1 workspace: rendered directly, no switcher (the common case -- most
  // accounts are either a tenant member or a platform admin, not both).
  // 2+ workspaces: a segmented switcher lets the account move between
  // clearly separate contexts instead of blending both navs into one list.
  workspaces: SidebarWorkspace[];
  locale: Locale;
  footer?: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [openSubKeys, setOpenSubKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState(workspaces[0]?.key);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Restoring sidebar UI state from localStorage is inherently a post-mount,
  // client-only sync (the server has no localStorage to read), not a value
  // the initial render depends on -- both server and the client's
  // pre-effect render already agree on the default (all expanded/closed,
  // first workspace active).
  useEffect(() => {
    try {
      const rawGroups = localStorage.getItem(GROUP_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (rawGroups) setCollapsedKeys(new Set(JSON.parse(rawGroups)));
      const rawSubItems = localStorage.getItem(SUBITEM_STORAGE_KEY);
      if (rawSubItems) setOpenSubKeys(new Set(JSON.parse(rawSubItems)));
      const storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (storedWorkspace && workspaces.some((w) => w.key === storedWorkspace)) {
        setActiveWorkspaceKey(storedWorkspace);
      }
    } catch {
      // ignore malformed storage
    }
    // Only ever read on mount -- workspaces is a stable prop shape per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleGroup(key: string) {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleSubItem(href: string) {
    setOpenSubKeys((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      try {
        localStorage.setItem(SUBITEM_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function switchWorkspace(key: string) {
    setActiveWorkspaceKey(key);
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, key);
    } catch {
      // ignore
    }
  }

  const activeWorkspace =
    workspaces.find((w) => w.key === activeWorkspaceKey) ?? workspaces[0];

  const searching = query.trim().length > 0;
  const visibleGroups = useMemo(() => {
    const groups = activeWorkspace?.groups ?? [];
    if (!searching) return groups;
    const needle = query.trim().toLowerCase();
    const matches = (s: string) => s.toLowerCase().includes(needle);
    return groups
      .map((g) => ({
        ...g,
        items: g.items
          .map((item) => {
            const parentHit = matches(isAr ? item.labelAr : item.labelEn);
            const subHits = item.subItems?.filter((s) => matches(isAr ? s.labelAr : s.labelEn));
            if (parentHit) return item;
            if (subHits?.length) return { ...item, subItems: subHits };
            return null;
          })
          .filter((x): x is SidebarNavItem => x !== null),
      }))
      .filter((g) => g.items.length > 0);
  }, [activeWorkspace, query, searching, isAr]);

  return (
    <aside className="flex w-full shrink-0 flex-col bg-[linear-gradient(180deg,var(--sidebar)_0%,oklch(0.12_0.018_250)_100%)] text-sidebar-foreground md:h-[calc(100vh-3.5rem)] md:w-64">
      <div className="relative px-3 pt-3 pb-2">
        <div className="absolute inset-x-3 top-0 h-px bg-sidebar-primary/60" />

        {workspaces.length > 1 && (
          <div className="mb-2.5 grid grid-cols-2 gap-0.5 rounded-md bg-white/[0.04] p-0.5">
            {workspaces.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => switchWorkspace(w.key)}
                className={cn(
                  "rounded px-2 py-1.5 text-xs font-medium transition-colors",
                  activeWorkspace?.key === w.key
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                )}
              >
                {isAr ? w.labelAr : w.labelEn}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isAr ? "بحث سريع..." : "Quick search..."}
            className="h-8 w-full rounded-md border border-sidebar-border bg-white/[0.04] ps-8 pe-12 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none transition-colors focus:border-sidebar-primary/60 focus:bg-white/[0.07]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-sidebar-foreground/50 hover:text-sidebar-foreground"
              aria-label={isAr ? "مسح" : "Clear"}
            >
              <X className="size-3" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute end-1.5 top-1/2 -translate-y-1/2 rounded border border-sidebar-border bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/45">
              &#8984;K
            </kbd>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {visibleGroups.map((group) => {
          const hasLabel = Boolean(group.labelAr || group.labelEn);
          const isOpen = searching || !collapsedKeys.has(group.key);
          return (
            <div key={group.key}>
              {hasLabel && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="mt-3 mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider text-sidebar-foreground/45 uppercase transition-colors hover:bg-white/[0.05] hover:text-sidebar-foreground/80"
                >
                  <span>{isAr ? group.labelAr : group.labelEn}</span>
                  <ChevronDown className={cn("size-3 transition-transform", !isOpen && "-rotate-90")} />
                </button>
              )}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="space-y-0.5 overflow-hidden">
                  {group.items.map((item) => (
                    <NavRow
                      key={item.href}
                      item={item}
                      locale={locale}
                      isAr={isAr}
                      pathname={pathname}
                      forceOpen={searching}
                      openSubKeys={openSubKeys}
                      onToggleSub={toggleSubItem}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {searching && visibleGroups.length === 0 && (
          <p className="px-3 pt-6 text-center text-xs text-sidebar-foreground/50">
            {isAr ? "لا توجد نتائج" : "No results"}
          </p>
        )}
      </nav>

      {footer && <div className="border-t border-sidebar-border p-3">{footer}</div>}
    </aside>
  );
}
