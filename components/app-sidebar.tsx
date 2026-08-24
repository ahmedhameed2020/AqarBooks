"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import {
  Search,
  ChevronDown,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  LogOut,
  Settings,
  ShieldCheck,
  Building2,
  Star,
} from "lucide-react";
import { LogoMark } from "@/components/marketing/logo-mark";

export type SidebarSubItem = {
  href: string;
  labelAr: string;
  labelEn: string;
  /**
   * Consumed on the server by filterNavByPermission and never read here. An
   * entry the viewer may not open is removed from the tree before it is sent,
   * so this field only ever describes items they already passed.
   */
  permission?: string;
};

export type SidebarNavItem = {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: React.ReactNode;
  subItems?: SidebarSubItem[];
  permission?: string;
  /**
   * Live count shown beside the label. Present only where a number changes
   * what someone does next -- an unread-style dot on every branch is noise.
   */
  badge?: number;
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

export interface UserSidebarProfile {
  name?: string;
  email?: string;
  role?: string;
  orgName?: string;
  isSuperAdmin?: boolean;
}

const PINNED_STORAGE_KEY = "aqarbooks-sidebar-pinned";
const COLLAPSED_STORAGE_KEY = "aqarbooks-sidebar-is-collapsed";
const GROUP_STORAGE_KEY = "aqarbooks-sidebar-collapsed-groups";
const SUBITEM_STORAGE_KEY = "aqarbooks-sidebar-open-subitems";
const WORKSPACE_STORAGE_KEY = "aqarbooks-sidebar-workspace";

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
  isCollapsed,
  isPinned,
  onTogglePin,
}: {
  item: SidebarNavItem;
  locale: Locale;
  isAr: boolean;
  pathname: string;
  forceOpen: boolean;
  openSubKeys: Set<string>;
  onToggleSub: (href: string) => void;
  isCollapsed: boolean;
  isPinned: boolean;
  onTogglePin: (href: string) => void;
}) {
  const isActive = itemMatches(pathname, item);
  const hasSubItems = Boolean(item.subItems?.length);
  const hasActiveSub = item.subItems?.some((sub) => pathname === sub.href) ?? false;
  const isSubOpen = forceOpen || hasActiveSub || openSubKeys.has(item.href);

  // In collapsed mode: render icon with hover tooltip popover
  if (isCollapsed) {
    return (
      <div className="group relative flex justify-center py-1">
        <Link
          href={item.href}
          locale={locale}
          title={isAr ? item.labelAr : item.labelEn}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-xl transition-all",
            isActive
              ? "bg-[#07425d] text-white shadow-md shadow-[#07425d]/40 font-bold border border-[#1b60b9]/40"
              : "text-sidebar-foreground/70 hover:bg-white/[0.08] hover:text-white"
          )}
        >
          <span className={cn("shrink-0", isActive ? "text-sky-300" : "text-sidebar-foreground/70")}>{item.icon}</span>
          {item.badge ? (
            <span
              className="absolute -top-0.5 -end-0.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-sidebar"
              aria-label={isAr ? `${item.badge} بند متأخر` : `${item.badge} overdue`}
            />
          ) : null}
        </Link>

        {/* Floating popover on hover in collapsed mode */}
        <div
          className={cn(
            "pointer-events-none absolute z-50 invisible opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100",
            isAr ? "end-full me-2.5" : "start-full ms-2.5",
            "top-0 min-w-44 rounded-xl border border-slate-700/80 bg-slate-900/95 p-2 shadow-xl backdrop-blur-md"
          )}
        >
          <div className="px-2 py-1 text-xs font-bold text-white border-b border-slate-800 flex items-center justify-between gap-2">
            <span>{isAr ? item.labelAr : item.labelEn}</span>
          </div>
          {hasSubItems && (
            <div className="mt-1 space-y-0.5">
              {item.subItems!.map((sub) => {
                const subActive = pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    locale={locale}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
                      subActive
                        ? "text-sky-200 font-bold bg-[#07425d]/80 border border-[#1b60b9]/40"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full shrink-0",
                        subActive ? "bg-sky-400" : "bg-slate-500"
                      )}
                    />
                    <span className="truncate">{isAr ? sub.labelAr : sub.labelEn}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Expanded mode: standard full row with expandable children
  return (
    <div>
      <div className="group relative flex items-center">
        <span
          className={cn(
            "absolute inset-y-1.5 start-0 w-0.5 rounded-e-full transition-opacity",
            isActive ? "bg-[#1b60b9] opacity-100" : "opacity-0"
          )}
        />
        <Link
          href={item.href}
          locale={locale}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all",
            isActive
              ? "bg-[#07425d] text-white font-bold shadow-xs border border-[#1b60b9]/30"
              : "text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-white"
          )}
        >
          <span className={cn("shrink-0", isActive ? "text-sky-300" : "text-sidebar-foreground/55")}>
            {item.icon}
          </span>
          <span className="truncate">{isAr ? item.labelAr : item.labelEn}</span>
          {/* Only rendered when there is something to count. A zero badge is a
              claim that nothing needs doing, dressed as an alarm. */}
          {item.badge ? (
            <span
              className="ms-auto shrink-0 rounded-md bg-rose-500/20 px-1.5 py-px font-mono text-[10px] font-bold text-rose-300 tabular-nums"
              aria-label={isAr ? `${item.badge} بند متأخر` : `${item.badge} overdue`}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={() => onTogglePin(item.href)}
          aria-label={
            isPinned
              ? isAr ? "إزالة من المثبّتة" : "Unpin"
              : isAr ? "تثبيت في الأعلى" : "Pin to top"
          }
          className={cn(
            "me-0.5 flex size-6 shrink-0 items-center justify-center rounded transition-all hover:bg-white/[0.06]",
            isPinned
              ? "text-amber-400/80 hover:text-amber-300"
              : "text-sidebar-foreground/0 group-hover:text-sidebar-foreground/45 focus-visible:text-sidebar-foreground/45 hover:!text-sidebar-foreground/80",
          )}
        >
          <Star className={cn("size-3.5", isPinned && "fill-current")} />
        </button>
        {hasSubItems && (
          <button
            type="button"
            onClick={() => onToggleSub(item.href)}
            aria-label={isSubOpen ? (isAr ? "طي" : "Collapse") : (isAr ? "توسيع" : "Expand")}
            className="me-1 flex size-6 shrink-0 items-center justify-center rounded text-sidebar-foreground/45 transition-colors hover:bg-white/[0.06] hover:text-sidebar-foreground/80 cursor-pointer"
          >
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", isSubOpen && "rotate-180")} />
          </button>
        )}
      </div>

      {hasSubItems && (
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: isSubOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="ms-[22px] mt-0.5 space-y-0.5 border-s border-sidebar-border/60 ps-2.5">
              {item.subItems!.map((sub) => {
                const subActive = pathname === sub.href;
                return (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    locale={locale}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                      subActive
                        ? "text-sky-200 font-bold bg-[#07425d]/70 border border-[#1b60b9]/30"
                        : "text-sidebar-foreground/65 hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        subActive ? "bg-sky-400" : "bg-sidebar-foreground/35"
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
  userProfile,
  signOutAction,
  footer,
}: {
  workspaces: SidebarWorkspace[];
  locale: Locale;
  userProfile?: UserSidebarProfile;
  signOutAction?: () => Promise<void>;
  footer?: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [openSubKeys, setOpenSubKeys] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  // Fifty-three destinations means an accountant who lives in four screens
  // still walks the tree every morning. Pinning is the cheapest fix for that,
  // and it is per browser rather than per account because it is a workspace
  // preference, not a property of the person.
  const [pinned, setPinned] = useState<string[]>([]);
  const [activeWorkspaceKey, setActiveWorkspaceKey] = useState(workspaces[0]?.key);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Sync state from localStorage on mount
  useEffect(() => {
    try {
      const storedCollapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (storedCollapsed !== null) setIsCollapsed(storedCollapsed === "true");

      const rawGroups = localStorage.getItem(GROUP_STORAGE_KEY);
      if (rawGroups) setCollapsedKeys(new Set(JSON.parse(rawGroups)));

      const rawSubItems = localStorage.getItem(SUBITEM_STORAGE_KEY);
      if (rawSubItems) setOpenSubKeys(new Set(JSON.parse(rawSubItems)));

      const rawPinned = localStorage.getItem(PINNED_STORAGE_KEY);
      if (rawPinned) {
        const parsed = JSON.parse(rawPinned);
        if (Array.isArray(parsed)) setPinned(parsed.filter((h): h is string => typeof h === "string"));
      }

      const storedWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (storedWorkspace && workspaces.some((w) => w.key === storedWorkspace)) {
        setActiveWorkspaceKey(storedWorkspace);
      }
    } catch {
      // ignore
    }
  }, [workspaces]);

  function togglePinned(href: string) {
    setPinned((prev) => {
      const next = prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href];
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // A browser refusing storage should cost the pin, not the click.
      }
      return next;
    });
  }

  // Keyboard shortcut for search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isCollapsed) setIsCollapsed(false);
        setTimeout(() => searchRef.current?.focus(), 50);
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isCollapsed]);

  const [mobileOpen, setMobileOpen] = useState(false);

  // Mobile sidebar toggle event listener from header
  useEffect(() => {
    const handleToggle = () => setMobileOpen((prev) => !prev);
    const handleClose = () => setMobileOpen(false);

    window.addEventListener("aqarbooks:toggle-mobile-sidebar", handleToggle);
    window.addEventListener("aqarbooks:close-mobile-sidebar", handleClose);

    return () => {
      window.removeEventListener("aqarbooks:toggle-mobile-sidebar", handleToggle);
      window.removeEventListener("aqarbooks:close-mobile-sidebar", handleClose);
    };
  }, []);

  // Auto-close on page navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleSidebarCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

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
  const pinnedItems = useMemo(() => {
    const all = activeWorkspace?.groups.flatMap((g) => g.items) ?? [];
    return pinned
      .map((href) => all.find((item) => item.href === href))
      .filter((item): item is SidebarNavItem => Boolean(item));
  }, [activeWorkspace, pinned]);

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

  const userDisplayName = userProfile?.name || (isAr ? "مستخدم AqarBooks" : "AqarBooks User");
  const userInitials = (userDisplayName[0] || "U").toUpperCase();

  // Collapsed icon-only mode is strictly a desktop-only concept.
  // When viewed on mobile (in the slide-over drawer), the sidebar is ALWAYS full-width with all labels and cards.
  const isDesktopMini = isCollapsed && !mobileOpen;

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "flex shrink-0 flex-col bg-gradient-to-b from-[#052636] via-[#041d28] to-[#02131b] text-sidebar-foreground border-e border-[#07425d]/40 overflow-hidden transition-all duration-300 ease-in-out",
          // Desktop (Sticky beside main)
          "md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:self-start md:translate-x-0 md:z-30",
          isCollapsed ? "md:w-[68px]" : "md:w-[260px]",
          // Mobile Drawer (Off-canvas slide over)
          "fixed inset-y-0 start-0 z-50 h-full w-[300px] sm:w-[330px] max-w-[88vw] shadow-2xl md:shadow-none",
          "max-md:transition-[transform,visibility] max-md:duration-300",
          mobileOpen
            ? "translate-x-0 visible"
            : isAr
            ? "translate-x-full max-md:invisible max-md:delay-300 md:translate-x-0"
            : "-translate-x-full max-md:invisible max-md:delay-300 md:translate-x-0"
        )}
      >
        {/* ──────────────────────────────────────────────────────────────────────────
            MOBILE-ONLY BRAND & CLOSE HEADER
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#02131b]/90 px-3.5 py-3 md:hidden">
          <div className="flex items-center gap-2.5">
            <LogoMark variant="app-icon" className="size-9 shadow-md" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black tracking-tight text-white font-heading">
                  AqarBooks
                </span>
                <span className="inline-flex rounded-md bg-[#1b60b9]/30 text-sky-200 border border-[#1b60b9]/40 text-[9px] font-black px-1.5 py-0.2">
                  ERP
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-300 -mt-0.5">
                {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            title={isAr ? "إغلاق القائمة" : "Close Menu"}
            className="flex size-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] text-slate-300 hover:bg-white/[0.15] hover:text-white transition-colors cursor-pointer"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* ──────────────────────────────────────────────────────────────────────────
            HEADER & SEARCH / COLLAPSE CONTROLS
            ────────────────────────────────────────────────────────────────────────── */}
        <div className="relative px-2.5 pt-3 pb-2">
          {/* Desktop Collapse & Workspace Switcher Row */}
          <div className={cn("flex items-center pb-2", isDesktopMini ? "justify-center" : "justify-between px-1")}>
            {!isDesktopMini && workspaces.length > 1 && (
              <div className="flex-1 grid grid-cols-2 gap-0.5 rounded-xl bg-white/[0.04] p-1 me-2 border border-white/[0.05]">
                {workspaces.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    onClick={() => switchWorkspace(w.key)}
                    className={cn(
                      "rounded-lg px-2 py-1.5 text-[11px] font-bold transition-all cursor-pointer truncate text-center",
                      activeWorkspace?.key === w.key
                        ? "bg-[#07425d] text-white shadow-xs border border-[#1b60b9]/40"
                        : "text-sidebar-foreground/65 hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    {isAr ? w.labelAr : w.labelEn}
                  </button>
                ))}
              </div>
            )}

            <div className="hidden md:flex items-center gap-1">
              {/* Desktop Collapse Button */}
              <button
                type="button"
                onClick={toggleSidebarCollapse}
                title={isCollapsed ? (isAr ? "توسيع السايدبار" : "Expand Sidebar") : (isAr ? "تصغير السايدبار (Mini)" : "Collapse Sidebar")}
                className="size-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border/60 bg-white/[0.04] text-sidebar-foreground/70 hover:bg-white/[0.1] hover:text-white transition-colors cursor-pointer"
              >
                {isCollapsed ? (
                  <PanelLeftOpen className={cn("size-4", isAr && "rotate-180")} />
                ) : (
                  <PanelLeftClose className={cn("size-4", isAr && "rotate-180")} />
                )}
              </button>
            </div>
          </div>

        {/* Search Bar (Expanded) or Quick Search Icon (Collapsed) */}
        {!isDesktopMini ? (
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sidebar-foreground/45" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? "بحث في النظام..." : "Search..."}
              className="h-8.5 w-full rounded-xl border border-sidebar-border/60 bg-white/[0.04] ps-8 pe-12 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none transition-colors focus:border-[#1b60b9]/80 focus:bg-white/[0.07]"
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
                ⌘K
              </kbd>
            )}
          </div>
        ) : (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              title={isAr ? "بحث (⌘K)" : "Search (⌘K)"}
              className="flex size-9 items-center justify-center rounded-xl bg-white/[0.04] border border-sidebar-border/60 text-sidebar-foreground/60 hover:text-white hover:bg-white/[0.08]"
            >
              <Search className="size-4" />
            </button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          NAVIGATION GROUPS & ITEMS
          ────────────────────────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4 sidebar-scrollbar">
        {!searching && !isDesktopMini && pinnedItems.length > 0 && (
          <div className="pb-2">
            <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
              {isAr ? "المثبّتة" : "Pinned"}
            </p>
            <div className="space-y-0.5">
              {pinnedItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <div key={`pin-${item.href}`} className="group relative flex items-center">
                    <Link
                      href={item.href}
                      locale={locale}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-all",
                        active
                          ? "bg-[#07425d] font-bold text-white shadow-xs border border-[#1b60b9]/30"
                          : "text-sidebar-foreground/75 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <span className={cn("shrink-0", active ? "text-sky-300" : "text-sidebar-foreground/55")}>
                        {item.icon}
                      </span>
                      <span className="truncate">{isAr ? item.labelAr : item.labelEn}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => togglePinned(item.href)}
                      aria-label={isAr ? "إزالة من المثبّتة" : "Unpin"}
                      className="me-1 flex size-6 shrink-0 items-center justify-center rounded text-amber-400/80 transition-colors hover:bg-white/[0.06] hover:text-amber-300"
                    >
                      <Star className="size-3.5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mx-2.5 mt-2 border-b border-sidebar-border/60" />
          </div>
        )}

        {visibleGroups.map((group) => {
          const hasLabel = Boolean(group.labelAr || group.labelEn);
          const isOpen = searching || !collapsedKeys.has(group.key);
          return (
            <div key={group.key} className="pt-1">
              {!isDesktopMini && hasLabel && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="mt-2.5 mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-bold tracking-wider text-sidebar-foreground/45 uppercase transition-colors hover:bg-white/[0.04] hover:text-sidebar-foreground/80 cursor-pointer"
                >
                  <span>{isAr ? group.labelAr : group.labelEn}</span>
                  <ChevronDown className={cn("size-3 transition-transform duration-200", !isOpen && "-rotate-90")} />
                </button>
              )}

              {/* In collapsed mode, draw a small separator line between groups */}
              {isDesktopMini && hasLabel && (
                <div className="my-2 border-t border-sidebar-border/40 mx-2" />
              )}

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isDesktopMini ? "grid-rows-1" : isOpen ? "grid-rows-1" : "grid-rows-0"
                )}
                style={{ gridTemplateRows: isDesktopMini || isOpen ? "1fr" : "0fr" }}
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
                      isCollapsed={isDesktopMini}
                      isPinned={pinned.includes(item.href)}
                      onTogglePin={togglePinned}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {searching && visibleGroups.length === 0 && !isDesktopMini && (
          <p className="px-3 pt-6 text-center text-xs text-sidebar-foreground/50">
            {isAr ? "لا توجد نتائج" : "No results"}
          </p>
        )}
      </nav>

      {/* ──────────────────────────────────────────────────────────────────────────
          UPGRADED USER FOOTER CARD
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="border-t border-[#07425d]/40 bg-[#02131b]/60 p-2.5 max-md:pb-6">
        {!isDesktopMini ? (
          <div className="space-y-2">
            {/* User Profile Info Card */}
            <Link
              href="/account"
              locale={locale}
              className="flex items-center gap-3 rounded-2xl p-2 transition-all bg-white/[0.03] hover:bg-[#07425d]/40 border border-white/[0.06] group"
            >
              {/* Dynamic Avatar */}
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#07425d] to-[#1b60b9] text-xs font-black text-white shadow-sm">
                <span>{userInitials}</span>
                <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-emerald-500 border border-[#041d28]" />
              </div>

              {/* User details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-bold text-white group-hover:text-sky-200 transition-colors">
                    {userDisplayName}
                  </p>
                </div>
                <p className="truncate text-[11px] text-sidebar-foreground/55 font-mono">
                  {userProfile?.email || "user@aqarbooks.com"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] text-sky-200 font-bold bg-[#07425d] px-1.5 py-0.2 rounded border border-[#1b60b9]/50">
                    {userProfile?.isSuperAdmin ? (isAr ? "مسؤول عام" : "Admin") : userProfile?.role || (isAr ? "مالك" : "Owner")}
                  </span>
                  {userProfile?.orgName && (
                    <span className="truncate text-[10px] text-sidebar-foreground/45">
                      • {userProfile.orgName}
                    </span>
                  )}
                </div>
              </div>
            </Link>

            {/* Quick Action Footer Buttons */}
            <div className="flex items-center gap-1.5 pt-1">
              <Link
                href="/account"
                locale={locale}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-sidebar-border/60 bg-white/[0.04] py-1.5 text-[11px] font-bold text-sidebar-foreground hover:bg-[#07425d]/60 hover:text-white transition-colors"
              >
                <Settings className="size-3.5 text-sky-400" />
                <span>{isAr ? "حسابي والأمان" : "Account"}</span>
              </Link>

              {signOutAction && (
                <form action={signOutAction} className="shrink-0">
                  <button
                    type="submit"
                    title={isAr ? "تسجيل الخروج" : "Sign Out"}
                    className="flex size-8 items-center justify-center rounded-xl border border-sidebar-border/60 bg-white/[0.04] text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors cursor-pointer"
                  >
                    <LogOut className="size-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* Collapsed Mini Footer */
          <div className="flex flex-col items-center gap-2 py-1">
            <Link
              href="/account"
              locale={locale}
              title={`${userDisplayName} (${userProfile?.email}) - ${isAr ? "إعدادات الحساب" : "Account Settings"}`}
              className="relative flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[#07425d] to-[#1b60b9] text-xs font-black text-white shadow-sm hover:scale-105 transition-transform"
            >
              <span>{userInitials}</span>
              <span className="absolute -bottom-0.5 -end-0.5 size-2.5 rounded-full bg-emerald-500 border border-[#041d28]" />
            </Link>

            {signOutAction && (
              <form action={signOutAction}>
                <button
                  type="submit"
                  title={isAr ? "تسجيل الخروج" : "Sign Out"}
                  className="flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="size-3.5" />
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
