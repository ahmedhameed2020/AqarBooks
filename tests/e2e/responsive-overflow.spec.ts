/**
 * Responsive conformance probe.
 *
 * Loads every publicly reachable route in both locales at the five audit
 * widths and asserts the two things that cannot be verified statically:
 *
 *   1. the document never scrolls horizontally, and
 *   2. no individual element is wider than the viewport.
 *
 * Arabic is checked as its own locale rather than assumed to mirror English:
 * the mobile sidebar parks itself off-canvas with `translate-x-full` in RTL,
 * which pushes a 285px box past the *right* edge and grows the document --
 * an overflow that simply does not exist in the LTR build.
 */
import { test, expect } from "@playwright/test";

const WIDTHS = [320, 375, 768, 1024, 1440];

const ROUTES = [
  "/",
  "/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/verify-email",
  "/contact",
  "/demo",
  "/privacy",
  "/terms",
];

const LOCALES = ["ar", "en"];

for (const locale of LOCALES) {
  for (const route of ROUTES) {
    const path = `/${locale}${route === "/" ? "" : route}`;
    test(`no horizontal overflow: ${path}`, async ({ page }) => {
      const failures: string[] = [];

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path, { waitUntil: "domcontentloaded" });
        // Let fonts/layout settle; Cairo swapping in shifts measured widths.
        await page.waitForTimeout(400);

        const result = await page.evaluate(() => {
          const de = document.documentElement;
          const vw = de.clientWidth;
          const offenders: { tag: string; cls: string; right: number }[] = [];

          for (const el of Array.from(document.body.querySelectorAll("*"))) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none") continue;
            // Only report the element itself overflowing, not a child of an
            // element that legitimately scrolls (tables, tab rails).
            let inScroller = false;
            let p = el.parentElement;
            while (p && p !== document.body) {
              const ps = getComputedStyle(p);
              if (ps.overflowX === "auto" || ps.overflowX === "scroll" || ps.overflowX === "hidden" || ps.overflowX === "clip") {
                inScroller = true;
                break;
              }
              p = p.parentElement;
            }
            if (inScroller) continue;
            const overflowRight = r.right - vw;
            const overflowLeft = -r.left;
            const worst = Math.max(overflowRight, overflowLeft);
            if (worst > 1) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.getAttribute("class") || "").slice(0, 120),
                right: Math.round(worst),
              });
            }
          }

          return {
            docScroll: de.scrollWidth - de.clientWidth,
            bodyScroll: document.body.scrollWidth - de.clientWidth,
            vw,
            offenders: offenders.slice(0, 5),
          };
        });

        if (result.docScroll > 1) {
          failures.push(
            `${width}px: document scrolls ${result.docScroll}px. ` +
              `First offenders: ${JSON.stringify(result.offenders)}`
          );
        } else if (result.offenders.length) {
          failures.push(
            `${width}px: ${result.offenders.length} element(s) exceed the viewport: ` +
              JSON.stringify(result.offenders)
          );
        }
      }

      expect(failures.join("\n"), `overflow at ${path}`).toBe("");
    });
  }
}
