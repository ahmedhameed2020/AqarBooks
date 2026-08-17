This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

This app deploys to **Cloudflare Workers** using the
[OpenNext Cloudflare adapter](https://opennext.js.org/cloudflare).

```bash
npm run preview   # build + run locally in the Workers runtime
npm run deploy    # build + deploy to Cloudflare
```

`npm run build` produces the deployable Worker bundle (`.open-next/worker.js`),
which is what Cloudflare's build step runs. Use `npm run build:next` for a plain
Next.js compile check — its output is not deployable on its own.

See [docs/deployment.md](docs/deployment.md) for required environment variables
(including the build-time vs. runtime distinction, which is easy to get wrong)
and configuration details.
