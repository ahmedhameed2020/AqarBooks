// Which /api/cron/* routes a Cloudflare Cron Trigger invocation should run.
//
// The schedules used to live in .github/workflows/*.yml as GitHub Actions
// cron jobs. GitHub bills every run as at least one full minute on private
// repositories (gate-hardware alone kept a runner busy around the clock), and
// its scheduler is best-effort: runs are delayed or dropped under load.
// Cloudflare Cron Triggers run inside the worker itself, are not billed per
// runner minute, and fire on time.
//
// Two triggers cover everything (see `triggers.crons` in wrangler.jsonc), which
// keeps us well under the account-wide Cron Trigger limit:
//
//   EVERY_MINUTE  gate-hardware every minute (the GitHub job emulated this by
//                 looping five times, a minute apart, inside a 5-minute run),
//                 gate-notifications every 5 minutes,
//                 payment-events every 10 minutes.
//   DAILY         03:00 lease-rent, 03:30 lease-expiry, 04:00 alert-digest
//                 (UTC, the same times the GitHub workflows used).
//
// This module is pure so the mapping can be unit-tested without a worker.

export const EVERY_MINUTE = "* * * * *";
export const DAILY = "0,30 3,4 * * *";

export type CronRoute =
  | "gate-hardware"
  | "gate-notifications"
  | "payment-events"
  | "lease-rent"
  | "lease-expiry"
  | "alert-digest";

/**
 * @param cron          the trigger expression Cloudflare reports (`controller.cron`)
 * @param scheduledTime the minute the trigger was scheduled for, in ms since epoch
 */
export function routesFor(cron: string, scheduledTime: number): CronRoute[] {
  const at = new Date(scheduledTime);
  const hour = at.getUTCHours();
  const minute = at.getUTCMinutes();

  if (cron === EVERY_MINUTE) {
    const routes: CronRoute[] = ["gate-hardware"];
    if (minute % 5 === 0) routes.push("gate-notifications");
    if (minute % 10 === 0) routes.push("payment-events");
    return routes;
  }

  if (cron === DAILY) {
    if (hour === 3 && minute === 0) return ["lease-rent"];
    if (hour === 3 && minute === 30) return ["lease-expiry"];
    if (hour === 4 && minute === 0) return ["alert-digest"];
    return []; // 04:30 is an unused slot of the shared expression
  }

  return [];
}
