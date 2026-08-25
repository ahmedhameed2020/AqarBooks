/**
 * Generates the seed plan for review, and checks it against the story.
 *
 * Unlike `demo-seed.manual.test.ts`, this always runs: it needs no database,
 * no credentials and no provisioned tenant. That is the point -- the plan has
 * to be reviewable before the first database write, and the dry run cannot be,
 * because the dry run's guard requires the demo organization to already exist.
 *
 * The report is written to `test-results/demo-seed-plan.txt`; vitest suppresses
 * console output in this repository, so printing it would put it nowhere.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildSeedPlan, renderSeedPlan } from "../scripts/demo/demo-plan";
import { DEMO_STORY } from "../lib/demo/story";

describe("demo seed plan", () => {
  it("writes the plan for review", () => {
    const plan = buildSeedPlan();
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/demo-seed-plan.txt", renderSeedPlan(plan), "utf8");

    expect(plan.organization).toBe(DEMO_STORY.organization.nameEn);
    expect(plan.slug).toBe(DEMO_STORY.organization.slug);
  });

  it("plans exactly what the story advertises", () => {
    // The entry page prints these counts to a visitor before they sign in. A
    // plan that disagrees with them means the page is promising a portfolio
    // the seed does not build.
    const plan = buildSeedPlan();
    const find = (stage: string) => plan.objects.find((o) => o.stage === stage)!;

    expect(find("properties").count).toBe(DEMO_STORY.headline.properties);
    expect(find("buildings").count).toBe(DEMO_STORY.headline.buildings);
    expect(find("units").count).toBe(DEMO_STORY.headline.units);
  });

  it("states plainly that no financial stage is implemented", () => {
    // This assertion is the honest half of the report. It fails once the
    // financial stages land, which is the prompt to update the plan rather
    // than let it keep claiming a gap that has closed.
    const plan = buildSeedPlan();
    expect(plan.notImplemented.length).toBeGreaterThan(0);
    expect(plan.notImplemented.join(" ")).toMatch(/issue_dues/);
    expect(plan.notImplemented.join(" ")).toMatch(/record_payment/);
  });
});
