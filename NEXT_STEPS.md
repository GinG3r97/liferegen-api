# What's Next

## Completed (April 13, 2026)

- [x] Middleware built on Azure Functions (Node.js)
- [x] OrderPush: Shopify webhook -> LifeRegen order creation (real-time)
- [x] TrackingSync: LifeRegen tracking -> Shopify fulfillment (daily 18:00 HKT)
- [x] RetryHandler: Failed API calls retry via queue
- [x] Validation: Warns on missing phone, address, customer name
- [x] China customs: Resident ID (ID_IDCard) mapping
- [x] Tested end-to-end with staging store (test-order-1074 confirmed)
- [x] LifeRegen UAT API key received and working

## Next Steps

### 1. Build TrackingWebhook endpoint
- LifeRegen offered to push tracking updates to our endpoint (real-time)
- Build a new Azure Function to receive tracking pushes from LifeRegen
- This replaces daily polling with instant updates
- Need to share permanent URL with SiuFung

### 2. Deploy to Azure
- Create Azure Function App
- Configure Application Settings (API keys)
- Deploy code
- Get permanent URL for webhooks

### 3. Update Shopify webhook URL
- Replace ngrok URL with permanent Azure URL
- Re-register orders/create webhook

### 4. Share endpoint with LifeRegen
- Send SiuFung the permanent Azure URL for tracking webhook
- Confirm payload format with them

### 5. Set up monitoring and alerts
- Azure Monitor for function health
- Alert rules for failures (email/SMS/Teams)
- Log Analytics for debugging

### 6. UAT testing
- Test with multiple orders
- Test edge cases (missing phone, missing address, duplicate orders)
- Test tracking flow end-to-end with real shipments
- Confirm customer receives tracking email from Shopify

### 7. Go live
- Get PROD API key from LifeRegen
- Point to live Shopify store
- Update webhook to live store
- Monitor first batch of real orders

## Credentials to rotate before production
- Shopify Client Secret
- Shopify Access Token
- LifeRegen API Key (will get PROD key from SiuFung)
- ngrok auth token (remove, not needed in production)
