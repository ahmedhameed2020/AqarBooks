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

**The current bundle is ~2971 KiB gzipped against a 3072 KiB limit — about
100 KiB (3%) of headroom.** This is tight enough to treat as a live constraint,
not a footnote: the next moderately sized dependency added to server-reachable
code will break deploys with a hard size error.

The single largest contributor is `exceljs` (~624 KiB gzipped), imported by
`app/[locale]/(app)/property/csv.ts`. Because that import is reachable from
server code, it is bundled into the Worker itself rather than served as a static
asset.

If the limit is hit, the options in rough order of effort:

1. **Upgrade to Workers Paid** — raises the limit to 10 MB. Least effort.
2. **Move spreadsheet generation out of the Worker** — a separate service, or
   generate CSV (which needs no library) instead of XLSX.
3. **Dynamically import `exceljs`** inside the route handler. This keeps it out
   of the startup path, though it still counts toward total bundle size.
4. Store large static data in KV/R2/Workers Static Assets rather than bundling.

Note also the **1 second Worker startup limit**: global scope must parse and
execute within it, and larger bundles eat into that budget.
