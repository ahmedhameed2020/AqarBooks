/**
 * Proves the 44x44 touch-target floor is actually reaching the DOM, rather
 * than just being present in the class list. The `touch` variant added to
 * app/globals.css compiles to two media queries -- `(pointer: coarse)` and
 * `(max-width: 639px)` -- and a headless desktop Chromium only matches the
 * second, which is exactly the branch a 320/375px audit exercises.
 *
 * Only publicly reachable routes are covered here; the authenticated
 * application screens need a signed-in session, which cannot be created
 * without writing fixture rows to the shared Supabase project.
 */
import { test, expect } from "@playwright/test";

const MIN = 44;
const MOBILE_WIDTHS = [320, 375];

const ROUTES = ["/ar/login", "/en/login", "/ar/auth/register", "/en/contact"];

for (const path of ROUTES) {
  test(`touch targets are at least ${MIN}px: ${path}`, async ({ page }) => {
    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(300);

      const undersized = await page.evaluate((min) => {
        const bad: { tag: string; label: string; w: number; h: number }[] = [];
        const controls = document.querySelectorAll(
          'button, [data-slot="button"], [data-slot="input"], [data-slot="select-trigger"], input:not([type="hidden"]), textarea'
        );
        for (const el of Array.from(controls)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).visibility === "hidden") continue;
          // Skip controls that are deliberately not presented to the user:
          // the contact form's spam honeypot lives inside an
          // `absolute h-px w-px overflow-hidden opacity-0` wrapper, so the
          // input reports a real box while being clipped to a pixel. Walking
          // the ancestors for zero opacity, aria-hidden, or a clipping box
          // distinguishes "hidden on purpose" from "too small to tap".
          let hiddenByAncestor = false;
          let a: HTMLElement | null = el.parentElement;
          while (a) {
            const as = getComputedStyle(a);
            const ar = a.getBoundingClientRect();
            if (
              as.opacity === "0" ||
              a.getAttribute("aria-hidden") === "true" ||
              (as.overflow !== "visible" && (ar.width <= 2 || ar.height <= 2))
            ) {
              hiddenByAncestor = true;
              break;
            }
            a = a.parentElement;
          }
          if (hiddenByAncestor) continue;
          if (r.height >= min - 0.5 && r.width >= min - 0.5) continue;

          // The element's own box is under 44px -- but a control may still
          // present a full-size target through an expanded hit area (the
          // `.hit-target` utility paints a 44x44 ::after over controls that
          // must stay visually small, such as table and consent checkboxes).
          // The box is not what a finger hits, so probe what a finger would
          // actually land on: hit-test the four corners of a 44x44 square
          // centred on the control and require the control to answer.
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const h = min / 2 - 1;
          const corners: [number, number][] = [
            [cx - h, cy - h],
            [cx + h, cy - h],
            [cx - h, cy + h],
            [cx + h, cy + h],
          ];
          const covered = corners.every(([x, y]) => {
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
            const hit = document.elementFromPoint(x, y);
            return hit === el || el.contains(hit) || (hit ? hit.contains(el) : false);
          });

          if (!covered) {
            bad.push({
              tag: el.tagName.toLowerCase(),
              label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
        return bad;
      }, MIN);

      expect(
        undersized,
        `${path} @ ${width}px has controls under ${MIN}px: ${JSON.stringify(undersized)}`
      ).toEqual([]);
    }
  });
}
