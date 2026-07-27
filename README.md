# InsightFS

Governed Oracle intelligence and dashboard workspace for IFS.

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

## Phase 2: Oracle data sources

Copy `.env.example` to `.env`, configure `DATABASE_URL`, and create a 32-byte credential-encryption key. Do not commit the generated key.

```bash
openssl rand -base64 32
npm run db:migrate
```

Oracle connections use node-oracledb Thin Mode with bounded per-data-source pools. Data source accounts should be read-only and only receive `CREATE SESSION` plus `SELECT` access to the required application objects and Oracle `ALL_*` metadata views. Avoid `SELECT ANY TABLE` unless separately approved.

## Phase 4: Guided Dashboard Builder

Phase 4 provides a persistent guided wizard, responsive block canvas, published Business Context and KPI locking, structured query plans, safe Oracle previews, validation, AI recommendations with explicit acceptance, review, versioning, and immutable publication snapshots.

AI runs only from server routes and reads `AI_PROVIDER`, `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` from `.env`. Never expose `AI_API_KEY` through a public environment variable. See [Phase 4 architecture and operations](docs/phase-4-guided-dashboard-builder.md).

Published dashboards and approved/certified KPIs are immutable. Use **Create new version** to open an editable draft; existing dashboards continue using their locked KPI and Business Context versions.

```bash
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run build
```

## Reverse proxy deployment

For production behind Nginx or another reverse proxy, configure the public URL as an allowed origin and preserve the original host and protocol. This keeps CSRF protection enabled for API requests.

```env
TRUSTED_ORIGINS=https://tpad.rattanan.dev
```

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
