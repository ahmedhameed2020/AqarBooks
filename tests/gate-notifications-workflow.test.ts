import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/gate-notifications.yml", "utf8").replace(/\r\n/g, "\n");
const script = workflow.split("        run: |\n")[1].replace(/^ {10}/gm, "");
const bash = process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe") : "bash";

function run(httpStatus: number, transportFailure = false, secret = "test-cron-secret") {
  return spawnSync(bash, ["-c", `
    curl() {
      printf 'request\\n' >&2
      test "$*" = "-s -o /dev/null -w %{http_code} --connect-timeout 10 --max-time 30 -X POST https://aqarbooks.com/api/cron/gate-notifications -H Authorization: Bearer test-cron-secret -H Content-Length: 0" || return 99
      if [ "$TEST_TRANSPORT_FAILURE" = true ]; then return 28; fi
      printf '%s' "$TEST_HTTP_STATUS"
    }
    ${script}
  `], { encoding: "utf8", timeout: 10_000, env: { ...process.env, CRON_SECRET: secret, TEST_HTTP_STATUS: String(httpStatus), TEST_TRANSPORT_FAILURE: String(transportFailure) } });
}

describe("checked-in notification schedule", () => {
  it("sets five-minute cadence, no permissions, serial runs and a job timeout", () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("permissions: {}");
    expect(workflow).toContain("group: gate-notifications\n  cancel-in-progress: false");
    expect(workflow).toContain("timeout-minutes: 2");
    expect(workflow).toContain("CRON_SECRET: ${{ secrets.CRON_SECRET }}");
  });
  it.each([200, 401, 503, 500])("executes the actual bounded script and reports HTTP %s", (status) => {
    const result = run(status);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(status === 200 ? 0 : 1);
    expect(result.stderr).toBe("request\n");
    expect(result.stdout).toBe("");
  });
  it("fails on transport failure without printing credentials or bodies", () => {
    const result = run(200, true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(28);
    expect(result.stderr).toBe("request\n");
    expect(result.stdout).toBe("");
  });
  it("does not request the endpoint when the secret is missing", () => {
    const result = run(200, false, "");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });
});
