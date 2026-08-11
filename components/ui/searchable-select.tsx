"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectItem = { value: string; label: string; sublabel?: string };

// A lightweight custom combobox (not base-ui's Combobox/Autocomplete
// primitives -- those are built for multi-select/virtualized lists; this is
// a simpler single-select-with-search field that still submits through a
// plain form via a hidden <input name=...>, so it drops into existing
// server actions unchanged.
export function SearchableSelect({
  name,
  items,
  placeholder,
  emptyLabel,
  defaultValue,
  value,
  onValueChange,
  required,
  error,
}: {
  name: string;
  items: SearchableSelectItem[];
  placeholder: string;
  emptyLabel: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selectedValue = value ?? internalValue;
  const selectedItem = items.find((i) => i.value === selectedValue);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectItem(item: SearchableSelectItem) {
    setInternalValue(item.value);
    onValueChange?.(item.value);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered[highlighted]) selectItem(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selectedValue} required={required} />
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
          error && "border-destructive",
        )}
      >
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={open ? query : (selectedItem?.label ?? "")}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
        />
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {filtered.length ? (
            filtered.map((item, i) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === selectedValue}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectItem(item)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-sm",
                  i === highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span className="min-w-0 truncate">
                  {item.label}
                  {item.sublabel && <span className="ms-1.5 text-xs text-muted-foreground">{item.sublabel}</span>}
                </span>
                {item.value === selectedValue && <Check className="size-3.5 shrink-0" />}
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
