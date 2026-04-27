const http = require("http");
const axios = require("axios");

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const STORE = process.env.SHOPIFY_STORE || "liferegen-8349";
const SCOPES = "read_orders,write_fulfillments,read_fulfillments,read_assigned_fulfillment_orders,write_assigned_fulfillment_orders,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders";
const REDIRECT_URI = "http://localhost:3000/callback";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing env vars. Set SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET");
  process.exit(1);
}

// Step 1: Open browser to authorize
const authUrl = `https://${STORE}.myshopify.com/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}`;

console.log("\n=== Shopify OAuth Token Generator ===\n");
console.log("Open this URL in your browser:\n");
console.log(authUrl);
console.log("\nWaiting for callback...\n");

// Step 2: Listen for the callback
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith("/callback")) return;

  const url = new URL(req.url, "http://localhost:3000");
  const code = url.searchParams.get("code");

  if (!code) {
    res.writeHead(400);
    res.end("No code received");
    return;
  }

  console.log("Authorization code received. Exchanging for access token...\n");

  try {
    // Step 3: Exchange code for access token
    const response = await axios.post(
      `https://${STORE}.myshopify.com/admin/oauth/access_token`,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
      }
    );

    const accessToken = response.data.access_token;

    console.log("=== SUCCESS ===\n");
    console.log("Your Shopify Admin API Access Token:\n");
    console.log(accessToken);
    console.log("\nPaste this token into local.settings.json as SHOPIFY_ACCESS_TOKEN");
    console.log("\n================\n");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<h1>Success!</h1><p>Access token printed in your terminal. You can close this tab.</p>");
  } catch (error) {
    console.error("Error exchanging code:", error.response?.data || error.message);
    res.writeHead(500);
    res.end("Error exchanging code for token");
  }

  server.close();
});

server.listen(3000, () => {
  console.log("Callback server running on http://localhost:3000");
});
