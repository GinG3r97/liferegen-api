# Tracking Webhook API

## Purpose

Push tracking updates to this endpoint whenever a shipment status or tracking number changes. This will automatically fulfill the matching Shopify order and notify the customer.

## Endpoint

```
POST https://liferegen-api-dev-ejb4cxdrf0cacyag.westus2-01.azurewebsites.net/api/trackingwebhook?code=YOUR_FUNCTION_KEY
```

*(Function key will be provided separately for security)*

## Authentication

The function key is embedded in the URL as a query parameter (`?code=...`). Keep this URL confidential.

## Request

### Headers

```
Content-Type: application/json
```

### Body

```json
{
  "client_order_id": "test-order-1074",
  "customer_name": "富城 郭",
  "shipments": [
    {
      "courier": "SF Express",
      "waybill": "SFTEST12345",
      "shipping_status": 2,
      "dispatch_date": "2026-04-13",
      "last_update": "2026-04-13 22:25:33",
      "tpl_remark": ""
    }
  ]
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `client_order_id` | string | Yes | Order ID from Shopify |
| `customer_name` | string | No | Customer name |
| `shipments` | array | Yes | Array of shipment objects |
| `shipments[].courier` | string | Yes | Carrier name (e.g., "SF Express") |
| `shipments[].waybill` | string | Yes | Tracking number |
| `shipments[].shipping_status` | number | No | Status code (2=shipped, 3=in transit, 5=delivered, 6=issue) |
| `shipments[].dispatch_date` | string | No | Date shipment left warehouse |
| `shipments[].last_update` | string | No | Last status update timestamp |
| `shipments[].tpl_remark` | string | No | Carrier remarks |

## Behavior on Repeat Requests

The endpoint is **idempotent and supports updates**. POST is the correct method for both new tracking and updates.

| Scenario | Behavior |
|---|---|
| First call (new tracking) | Creates fulfillment, sends customer email |
| Same tracking number resent | Returns 200, no action (`action: "no_change"`) |
| Different tracking number | Updates existing fulfillment, sends customer email |

## Response

### Success - New fulfillment created (200)

```json
{
  "success": true,
  "action": "created",
  "order_id": "test-order-1074",
  "tracking_number": "SFTEST12345",
  "courier": "SF Express"
}
```

### Success - Tracking updated (200)

```json
{
  "success": true,
  "action": "updated",
  "order_id": "test-order-1074",
  "previous_tracking": "SFTEST12345",
  "new_tracking": "SFTEST99999",
  "courier": "SF Express"
}
```

### Success - No change needed (200)

```json
{
  "success": true,
  "action": "no_change",
  "message": "Tracking number already up to date"
}
```

### Order Not Found (404)

```json
{
  "success": false,
  "error": "Order test-order-1074 not found in Shopify"
}
```

### Error (500)

```json
{
  "success": false,
  "error": "error message"
}
```

## Sample Request (cURL)

```bash
curl -X POST "https://liferegen-api-dev-ejb4cxdrf0cacyag.westus2-01.azurewebsites.net/api/trackingwebhook?code=YOUR_FUNCTION_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "client_order_id": "test-order-1074",
    "customer_name": "富城 郭",
    "shipments": [
      {
        "courier": "SF Express",
        "waybill": "SFTEST12345",
        "shipping_status": 2,
        "dispatch_date": "2026-04-13",
        "last_update": "2026-04-13 22:25:33"
      }
    ]
  }'
```

## What Happens After

1. We receive the tracking info
2. We find the matching order in Shopify
3. We create a fulfillment with the tracking number
4. Shopify automatically sends the customer a shipping confirmation email with tracking

## Retry Policy

If you receive a 5xx error, retry after 30 seconds (up to 3 times).
If you receive a 404, the order may not exist in Shopify yet — retry after 5 minutes.
