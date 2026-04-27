# LifeRegen Integration

Middleware connecting Shopify Plus to LifeRegen 3PL (Hong Kong warehouse) on Azure Functions.

## Overview

```
Shopify Plus  ─────►  Azure Functions  ─────►  LifeRegen 3PL
   (orders)             (this repo)             (warehouse)
        ◄──────────────  fulfillment  ◄──────────  (tracking)
```

**Two flows:**

1. **Order Push (real-time):** Shopify webhook on `orders/create` → push order to LifeRegen.
2. **Tracking Sync (real-time + daily):** LifeRegen pushes tracking via webhook (or daily polling fallback) → create/update Shopify fulfillment with tracking number.

## Features

### Deployed and Working

- **OrderPush** (HTTP) — Shopify orders push to LifeRegen in real-time
- **TrackingSync** (timer, daily 18:00 HKT) — polls LifeRegen for tracking updates and pushes back to Shopify
- **TrackingWebhook** (HTTP) — receives real-time tracking pushes from LifeRegen
- **TrackingSyncManual** (HTTP) — manual trigger of tracking sync
- **RetryHandler** (queue) — retries failed API calls
- **Multiple tracking numbers** per order (when packages split)
- **Mixed couriers** per order (e.g., SF Express + DHL)
- **US orders excluded** automatically
- **Validation & warnings** for missing data (phone, address, ID card)
- **Resident ID (ID_IDCard)** mapping for China customs
- **Idempotent webhook** — duplicate or update tracking handled cleanly
- **Customer notification toggle** via env var
- **Azure Monitor email alerts** for HTTP 5xx errors

### Environments

| Environment | Function App | Shopify Store |
|---|---|---|
| **Development / UAT** | `liferegen-api-dev` | `liferegenstaging1` |
| **Production** | `liferegen-api-prod` | `liferegen-8349` |

## Project Structure

```
liferegen-integration/
├── host.json                  # Azure Functions config
├── local.settings.json        # API keys (gitignored)
├── package.json
├── .gitignore
├── scripts/
│   ├── get-shopify-token.js   # OAuth helper
│   └── backlog-push.js        # One-shot batch push of historical orders
└── src/
    ├── shared/
    │   ├── api.js              # LifeRegen + Shopify API clients
    │   └── mappers.js          # Data mapping logic
    └── functions/
        ├── OrderPush.js        # Shopify webhook -> LifeRegen
        ├── TrackingSync.js     # LifeRegen tracking -> Shopify
        ├── TrackingWebhook.js  # Receives real-time tracking from LifeRegen
        └── RetryHandler.js     # Retries failed API calls
```

## Setup

See [SETUP.md](./SETUP.md) for full local development setup (Node, Azure Functions Core Tools, Azurite, ngrok).

## Backlog Push

For pushing historical orders (one-time operation):

```bash
SHOPIFY_STORE=liferegen-8349 \
SHOPIFY_ACCESS_TOKEN=shpat_xxx \
LIFEREGEN_API_URL=https://liferegen.fullstarsys.com/api \
LIFEREGEN_API_KEY=xxx \
node scripts/backlog-push.js
```

The script:
- Fetches all unfulfilled orders since `2026-03-22` (configurable via `START_DATE`)
- Excludes USA orders
- Pushes to LifeRegen sequentially (200ms delay between requests)
- Skips duplicates (handled by LifeRegen 409 response)
- Saves report to `scripts/backlog-report-{timestamp}.json`

For long runs (>10 min), use **Azure Cloud Shell** so it survives PC shutdown.

## Environment Variables

Required in both Function Apps and `local.settings.json`:

| Name | Purpose |
|---|---|
| `SHOPIFY_STORE` | e.g. `liferegen-8349` (the store handle) |
| `SHOPIFY_ACCESS_TOKEN` | from `scripts/get-shopify-token.js` |
| `SHOPIFY_CLIENT_ID` | from Shopify Dev Dashboard |
| `SHOPIFY_CLIENT_SECRET` | from Shopify Dev Dashboard |
| `LIFEREGEN_API_URL` | `https://liferegen.fullstarsys.com/api` |
| `LIFEREGEN_API_KEY` | from LifeRegen team |
| `NOTIFY_CUSTOMER_ON_UPDATE` | `true` for prod (sends update emails), `false` for dev |
| `AzureWebJobsStorage` | Azure Storage connection (auto-set in cloud, `UseDevelopmentStorage=true` locally) |

## API Documentation

- [TRACKING_WEBHOOK_API.md](./TRACKING_WEBHOOK_API.md) — endpoint spec for LifeRegen to push tracking updates

## Monitoring

- Azure Monitor alert configured on `liferegen-api-dev` for HTTP 5xx errors → emails `orderinfo@liferegen.com`
- Same alert needs to be configured on `liferegen-api-prod`

## Status

- Production deployed and working end-to-end
- Webhook registered on production Shopify store
- Backlog push pending (~1,760 orders to push)
