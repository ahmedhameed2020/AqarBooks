import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ rpc: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/env/server", () => ({ serverEnv: { CRON_SECRET: "test-cron-secret" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/gates/hardware/process-command", () => ({ processGateHardwareCommand: state.process }));
import { POST } from "@/app/api/cron/gate-hardware/route";

// Execute the checked-in job script with network and waits replaced by shell
// functions. This validates its real exit/continue behavior without dispatching.
function runWorkflow(httpStatus: number, transportFailure = false) {
  const workflow = readFileSync(".github/workflows/gate-hardware.yml", "utf8").replace(/\r\n/g, "\n");
  const script = workflow.split(/        run: \|\r?\n/)[1].replace(/^ {10}/gm, "");
  const bash = process.platform === "win32" ? join(process.env.ProgramFiles ?? "C:/Program Files", "Git/bin/bash.exe") : "bash";
  return spawnSync(bash, ["-c", `
    curl() { printf 'request\\n' >&2; if [ "$TEST_TRANSPORT_FAILURE" = true ]; then return 28; fi; printf '%s' "$TEST_HTTP_STATUS"; }
    sleep() { :; }
    ${script}
  `], { encoding: "utf8", timeout: 10_000, env: { ...process.env, CRON_SECRET: "test-cron-secret", TEST_HTTP_STATUS: String(httpStatus), TEST_TRANSPORT_FAILURE: String(transportFailure) } });
}

describe("hardware schedule failure reporting", () => {
  beforeEach(() => { vi.resetAllMocks(); state.rpc.mockResolvedValue({ data: [{ id: "command" }, { id: "later" }], error: null }); });
  it("fails the job visibly when a processor failure is reported, after all five scheduled calls", async () => {
    state.process.mockRejectedValueOnce(new Error("hardware_completion_failed")).mockResolvedValueOnce("DEAD");
    const response = await POST(new NextRequest("http://localhost/api/cron/gate-hardware", { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }));
    expect(await response.json()).toMatchObject({ claimed: 2, failed: 1, dead: 1 });
    expect(state.process).toHaveBeenCalledTimes(2);
    const result = runWorkflow(response.status);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.match(/request/g)).toHaveLength(5);
  });
  it.each(["FAILED", "DEAD", "STALE"])("keeps the job successful for expected %s outcomes", async (outcome) => {
    state.process.mockResolvedValue(outcome);
    const response = await POST(new NextRequest("http://localhost/api/cron/gate-hardware", { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }));
    expect(response.status).toBe(200);
    const result = runWorkflow(response.status);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr.match(/request/g)).toHaveLength(5);
  });
  it("records transport failures and still attempts every scheduled call", () => {
    const result = runWorkflow(0, true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr.match(/request/g)).toHaveLength(5);
  });
});
