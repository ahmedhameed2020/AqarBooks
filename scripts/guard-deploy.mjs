// Deploys run from CI only.
//
// This exists because production was deployed by hand from whichever worktree
// a session happened to be sitting in. On 2026-08-22 the live site was serving
// an unmerged branch that was 52 commits behind master: /en/onboarding,
// /en/terms and /en/privacy 404'd for real visitors, while three platform
// routes existed only in production and nowhere on master.
//
// This is a SOFT guard. GITHUB_ACTIONS can be set by anyone, and there is no
// way to revoke deploy ability from a machine that is `wrangler login`'d --
// that auth is needed for `preview` and `wrangler secret` regardless. It is
// not meant to stop a determined human. It is meant to stop an agent session
// helpfully running `npm run deploy` from a stale worktree, which is what
// actually caused the incident. A hard failure with a clear instruction is
// something an agent reports rather than circumvents.
//
// Note this guards the `npm run deploy` path via npm's `predeploy` hook. CI
// invokes `npx opennextjs-cloudflare deploy` directly and is unaffected.

if (!process.env.GITHUB_ACTIONS) {
  console.error(
    [
      "",
      "  Refusing to deploy from a local machine.",
      "",
      "  Deploys happen in CI, from master only:",
      "    .github/workflows/deploy.yml",
      "",
      "  To ship a change: merge it to master and push. CI builds and deploys,",
      "  then smoke-checks the route table.",
      "",
      "  To try a build locally without deploying, use:",
      "    npm run preview",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
