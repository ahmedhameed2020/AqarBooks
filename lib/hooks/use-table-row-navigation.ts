"use client";

import { useCallback, useRef, useState } from "react";

// Shared arrow-key/Enter row navigation for /property and /members tables:
// ArrowDown/ArrowUp move focus between rows, Enter opens the focused row
// (drawer). Attach `onKeyDown` + a ref (via setRowRef) + onFocus to each row.
export function useTableRowNavigation<T>(rows: T[], onOpen: (row: T) => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = Math.min(i + 1, rows.length - 1);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = Math.max(i - 1, 0);
          rowRefs.current[next]?.focus();
          return next;
        });
      } else if (e.key === "Enter") {
        const row = rows[activeIndex];
        if (row) {
          e.preventDefault();
          onOpen(row);
        }
      }
    },
    [rows, activeIndex, onOpen],
  );

  function setRowRef(index: number) {
    return (el: HTMLTableRowElement | null) => {
      rowRefs.current[index] = el;
    };
  }

  return { activeIndex, setActiveIndex, onKeyDown, setRowRef };
}
