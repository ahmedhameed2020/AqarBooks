import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(...path.split("/")), "utf8");

describe("dashboard navigation", () => {
  it("links the occupancy widget to the units index route", () => {
    const widget = read("app/[locale]/(app)/dashboard/occupancy-widget.tsx");

    expect(widget).toContain('href="/property"');
    expect(widget).not.toContain('href="/property/units"');
  });
});
