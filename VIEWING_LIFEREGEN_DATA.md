# Viewing Data in LifeRegen (Walter's System)

LifeRegen's system does not currently provide a portal for us to view what's stored on their side. However, we have a few options to verify or inspect data.

## Option 1: Query via API (on-demand)

We can query LifeRegen's `/shipments` endpoint anytime to see what they have for specific orders. This pulls live data directly from their system.

### Example: Check specific orders

```bash
curl -X POST "https://liferegen.fullstarsys.com/api/shipments" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: YOUR_LIFEREGEN_API_KEY" \
  -d '{"client_order_ids": ["L-21949", "L-21948"]}'
```

### Returns
- Customer name (per order)
- Shipment list (courier, tracking number, status, dispatch date, last update)

## Option 2: Pull a summary report (one-shot)

We can run a script that pulls the status of all recent orders and outputs a CSV or JSON for review. Useful for spot checks or audits.

## Option 3: Scheduled summary email (recurring)

We can set up a daily or weekly summary email automatically, e.g.:

- Total orders in LifeRegen
- Pending vs shipped breakdown
- Failed pushes (if any)
- Any orders missing tracking after X days

This requires a small extension to the middleware (Azure Function on a timer) and would deliver to whatever email you choose.

## Option 4: Direct access from LifeRegen

The cleanest long-term solution is to ask Walter for a portal/dashboard login on their side. That way you can browse and inspect orders on-demand without going through us.

## Recommendation

For now, on-demand API checks (Option 1) are sufficient. If you find yourself asking for status often, we should set up Option 3 (scheduled summary). For full visibility, request access from Walter (Option 4).
