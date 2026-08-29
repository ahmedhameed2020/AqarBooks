# Deployment (Cloudflare Workers)

AqarBooks deploys to **Cloudflare Workers** via the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare).

## Why this exists

Before this setup the repository had no deployment adapter at all. `package.json`
ran a plain `next build`, which leaves only a `.next/` directory — not something
Cloudflare can serve. Builds could go green and still publish nothing, which is
why the dashboard reported **"No deployment available."**

`next build` alone is not deployable. The Worker bundle is produced by
`opennextjs-cloudflare build`, which wraps `next build` and emits
`.open-next/worker.js` plus `.open-next/assets`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server. Fastest feedback loop; runs in Node, not `workerd`. |
| `npm run build` | **Produces the deployable Worker bundle** (`opennextjs-cloudflare build`). This is what CI runs. |
| `npm run build:next` | Plain `next build`. Useful for checking compilation only — output is *not* deployable. |
| `npm run preview` | Builds the Worker bundle and serves it locally in the real `workerd` runtime. Use this to verify behaviour before deploying. |
| `npm run deploy` | Builds and deploys to Cloudflare. |
| `npm run cf-typegen` | Regenerates `cloudflare-env.d.ts` from `wrangler.jsonc` bindings. |

`npm run dev` runs in Node.js, so it will not catch Workers-runtime errors.
Anything runtime-sensitive should be checked with `npm run preview`.

## Workers Builds configuration (and the recursion trap)

Cloudflare Workers Builds runs two steps: a **build command** (defaults to
`npm run build`) and a **deploy command** (defaults to `npx wrangler deploy`,
or `npx wrangler versions upload` on non-production branches).

`npm run build` is therefore deliberately wired to `opennextjs-cloudflare build`,
so that Cloudflare's *default* build command produces `.open-next/worker.js`
and no dashboard configuration is required. When `npm run build` was left as a
plain `next build`, the deploy step failed with:

```
✘ [ERROR] The entry-point file at ".open-next/worker.js" was not found.
```

⚠️ **This creates a recursion hazard.** OpenNext builds the Next.js app by
shelling out to the package manager's build script — `buildNextjsApp()` uses
`config.buildCommand ?? "npm run build"`. With `npm run build` pointing back at
`opennextjs-cloudflare build`, that recurses infinitely (observed: 178 nested
builds and ~185 runaway processes before being killed).

`open-next.config.ts` therefore sets:

```ts
buildCommand: "npx next build",
```

**Do not remove that line while `npm run build` runs the OpenNext build.**
Changing either one requires changing the other.

## Environment variables

There are two distinct classes, and the difference matters.

### Build-time (must be set as **build** variables)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`NEXT_PUBLIC_*` values are **inlined into the JavaScript bundle by `next build`**.
Setting them only as runtime secrets has no effect — the values are already baked
in by then. On Cloudflare Workers Builds these go in
**Settings → Build → Build variables and secrets**.

### Runtime (set as **secrets**)

- `SUPABASE_SERVICE_ROLE_KEY`

Read from `process.env` at request time. The adapter copies the Worker `env`
into `process.env` before the Next server module is loaded, so a normal Worker
secret resolves correctly. Set it with:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Never expose the service-role key to the client or prefix it with `NEXT_PUBLIC_`.

### ⚠️ Placeholder defaults fail silently

`lib/env/client.ts` and `lib/env/server.ts` fall back to placeholder values
(`https://placeholder-project.supabase.co`, `placeholder-anon-key`,
`placeholder-service-role-key`) when the variables are unset. This exists so
`next build` can succeed without credentials.

The consequence: **a deployment with missing variables will build and boot
successfully, then fail at runtime against a Supabase project that does not
exist.** If a deployed environment shows auth or data errors, verify the
variables are actually set before debugging anything else.

For local work, put real values in `.dev.vars` (gitignored) for
`npm run preview`, and `.env.local` for `npm run dev`.

## Why `middleware.ts` and not `proxy.ts`

Next.js 16 renamed the `middleware` convention to `proxy`, and this repository
originally used `proxy.ts`. That file has been renamed back to `middleware.ts`
deliberately.

In Next 16, `next build` pins **any file named `proxy.*` to the Node.js runtime**,
unconditionally — the check is `staticInfo.runtime === 'nodejs' || isProxyFile(page)`,
and the `runtime` segment-config option is rejected inside proxy files, so there
is no way to opt back out. The OpenNext Cloudflare adapter only supports **edge**
middleware and hard-fails the build with:

```
ERROR Node.js middleware is not currently supported. Consider switching to Edge Middleware.
```

The deprecated `middleware.*` filename is still recognised by Next 16 and still
compiles to edge middleware, so it is currently the only way to run this
middleware on Cloudflare. The logic itself (next-intl routing + Supabase session
check) uses no Node built-ins and is edge-safe.

**This is a known deprecation.** Next.js will eventually remove the `middleware`
convention. Revisit when the adapter gains Node.js middleware support, and track:
- Next 16 proxy reference: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- Adapter guard: `node_modules/@opennextjs/cloudflare/dist/cli/build/utils/middleware.js`

## Configuration files

- `wrangler.jsonc` — Worker name, entrypoint (`.open-next/worker.js`), assets
  binding, `nodejs_compat` flag and compatibility date. The `nodejs_compat` flag
  and a compatibility date of `2024-09-23` or later are both required.
- `open-next.config.ts` — adapter configuration; currently defaults. Caching
  overrides (R2/KV incremental cache, D1 tag cache) would go here.
- `next.config.ts` — calls `initOpenNextCloudflareForDev()` so `next dev` can
  access Cloudflare bindings through `getCloudflareContext()`.

## Bundle size ⚠️

Workers enforce a compressed-bundle limit: **3 MB on the free plan**, 10 MB on
paid. Check the current size with:

```bash
npx wrangler deploy --dry-run
# Total Upload: ... / gzip: <this number is what counts>
```

**The current bundle is ~2662 KiB gzipped against a 3072 KiB limit — about
410 KiB of headroom.** Treat this as a live constraint, not a footnote: a
moderately sized dependency added to server-reachable code can break deploys
with a hard size error.

It briefly sat at ~2971 KiB (only ~100 KiB of headroom) when `exceljs` was a
normal import in `app/[locale]/(app)/property/csv.ts`. The deploy target
flattens every reachable import into one script, so a dynamic `import()` does
**not** reduce total size. `exceljs` is now fetched from `esm.sh` at call time
with a type-only local import, which removes it from the bundle entirely; it
lives in `devDependencies` purely for its types.

Tradeoff of that approach, worth knowing: XLSX export now depends on a
third-party CDN being reachable from the user's browser at click time, with no
Subresource Integrity pinning. It only runs client-side after a button click, so
it cannot break SSR or the Worker itself — but it will fail in offline or
strict-CSP environments.

If the limit is hit again, the options in rough order of effort:

1. **Upgrade to Workers Paid** — raises the limit to 10 MB. Least effort.
2. **Generate CSV instead of XLSX** where possible — `lib/csv.ts` needs no
   library at all.
3. Externalize another heavy client-only dependency the same way.
4. Store large static data in KV/R2/Workers Static Assets rather than bundling.

Note also the **1 second Worker startup limit**: global scope must parse and
execute within it, and larger bundles eat into that budget.

## Two dependency traps that have each broken this build

Both of these produced a red Cloudflare build that looked unrelated to its real
cause. Check them first if `npm ci` or the bundling step fails in CI.

**1. Never hand-prune `package-lock.json` — regenerate it.** The root pins
`@swc/helpers@0.5.15`, while `next-intl` needs `>=0.5.17`, so a correct lockfile
must contain a *nested* `node_modules/next-intl/node_modules/@swc/helpers`
(0.5.23). Editing or partially pruning the lockfile drops that entry, and CI
dies with:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: @swc/helpers@0.5.23 from lock file
```

This has happened twice. Verify after any lockfile change:

```bash
node -e "console.log(require('./package-lock.json').packages['node_modules/next-intl/node_modules/@swc/helpers'].version)"
```

**2. `esbuild` must stay an explicit `devDependency`.**
`@opennextjs/cloudflare` imports `esbuild` at runtime in
`dist/cli/build/bundle-server.js` but declares it only as its *own*
devDependency (`^0.27.0`), so it is never installed for consumers — it silently
relies on some other package hoisting an `esbuild` to the project root. When
that hoisting stopped happening, the build failed with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esbuild' imported from
node_modules/@opennextjs/cloudflare/dist/cli/build/bundle-server.js
```

Declaring `esbuild` directly makes root placement deterministic instead of
incidental. Do not remove it as an "unused" dependency — nothing in this
repo's own source imports it. Note also that `npm install --package-lock-only`
does not dedupe/hoist identically to a real `npm install`, so prefer a full
install when regenerating the lockfile.
