# OmniRoute WebReady

Cloudflare-native AI router. Static frontend on Pages, routing engine on Workers.

## How it works

```
Browser → CF Pages (static dashboard)
              ↓
         /v1/* calls
              ↓
         CF Worker (routing engine)
              ↓
         Upstream AI providers (free tiers)
```

No separate backend server. Everything runs on Cloudflare.

## Setup

1. Create a D1 database: `npx wrangler d1 create omniroute-db`
2. Copy the database ID into `wrangler.toml`
3. Run schema: `npx wrangler d1 execute omniroute-db --file=./schema.sql`
4. Deploy: `npx wrangler pages deploy .`

## Environment secrets

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put DEFAULT_API_KEY
```
