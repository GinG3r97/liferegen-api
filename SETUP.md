# LifeRegen Integration - Local Setup

## Prerequisites

### 1. Node.js (v18+)

```bash
# macOS
brew install node

# Windows
# Download from https://nodejs.org

# Verify
node -v
npm -v
```

### 2. Azure Functions Core Tools (v4)

```bash
# macOS
brew tap azure/functions
brew install azure-functions-core-tools@4

# Windows
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# Verify
func --version
```

### 3. Azurite (Azure Storage Emulator)

```bash
npm install -g azurite
```

### 4. ngrok (for local webhook testing)

```bash
npm install -g ngrok
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

Sign up at ngrok.com to get your auth token.

## Project Setup

### 1. Install dependencies

```bash
cd liferegen-integration
npm install
```

### 2. Configure local settings

Create `local.settings.json` in the project root (this file is gitignored):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "SHOPIFY_STORE": "liferegenstaging1",
    "SHOPIFY_ACCESS_TOKEN": "YOUR_SHOPIFY_ACCESS_TOKEN",
    "SHOPIFY_CLIENT_ID": "YOUR_CLIENT_ID",
    "SHOPIFY_CLIENT_SECRET": "YOUR_CLIENT_SECRET",
    "SHOPIFY_WEBHOOK_SECRET": "",
    "LIFEREGEN_API_URL": "https://liferegen.fullstarsys.com/api",
    "LIFEREGEN_API_KEY": "YOUR_LIFEREGEN_API_KEY"
  }
}
```

### 3. Get Shopify access token

```bash
npm run get-token
```

Open the URL it prints in your browser, authorize the app, and paste the token into `local.settings.json`.

## Running Locally

### 1. Start Azurite (in a separate terminal)

```bash
azurite --silent
```

### 2. Start Azure Functions

```bash
func start
```

You should see:

```
OrderPush:         [POST] http://localhost:7071/api/OrderPush
TrackingSyncManual:[POST] http://localhost:7071/api/tracking-sync
RetryHandler:      queueTrigger
TrackingSync:      timerTrigger
```

### 3. Start ngrok (for Shopify webhooks)

```bash
ngrok http 7071
```

Copy the public URL and register the Shopify webhook:

```bash
curl -X POST "https://liferegenstaging1.myshopify.com/admin/api/2026-04/webhooks.json" \
  -H "X-Shopify-Access-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "https://YOUR_NGROK_URL/api/OrderPush",
      "format": "json"
    }
  }'
```

## Testing

### Test OrderPush (send a test order to LifeRegen)

```bash
curl -X POST http://localhost:7071/api/OrderPush \
  -H "Content-Type: application/json" \
  -d '{
    "id": 99999,
    "name": "TEST-001",
    "created_at": "2026-04-13T12:00:00+08:00",
    "shipping_address": {
      "name": "Test Customer",
      "address1": "123 Test Street",
      "city": "Hong Kong",
      "country": "Hong Kong",
      "phone": "+85212345678"
    },
    "line_items": [
      {
        "sku": "TEST-SKU-001",
        "name": "Test Product",
        "quantity": 1,
        "price": "99.00"
      }
    ]
  }'
```

### Test TrackingSync (check LifeRegen for tracking updates)

```bash
curl -X POST http://localhost:7071/api/tracking-sync
```

## Project Structure

```
liferegen-integration/
├── host.json                  # Azure Functions config
├── local.settings.json        # API keys (gitignored)
├── package.json
├── .gitignore
├── scripts/
│   └── get-shopify-token.js   # OAuth helper
└── src/
    ├── shared/
    │   ├── api.js              # LifeRegen + Shopify API clients
    │   └── mappers.js          # Data mapping logic
    └── functions/
        ├── OrderPush.js        # Shopify webhook -> LifeRegen
        ├── TrackingSync.js     # LifeRegen tracking -> Shopify (daily 18:00 HKT)
        └── RetryHandler.js     # Retry failed API calls
```

## API Credentials

| Service | Key | Where to get |
|---|---|---|
| Shopify Access Token | `npm run get-token` | OAuth flow |
| Shopify Client ID | Dev Dashboard | dev.shopify.com/dashboard |
| Shopify Client Secret | Dev Dashboard | dev.shopify.com/dashboard |
| LifeRegen API Key | SiuFung | Contact LifeRegen team |
