// Backlog batch push: send unfulfilled Shopify orders since March 22, 2026 to LifeRegen
// Excludes USA orders.
//
// Usage:
//   SHOPIFY_STORE=liferegen-8349 \
//   SHOPIFY_ACCESS_TOKEN=shpat_xxx \
//   LIFEREGEN_API_URL=https://liferegen.fullstarsys.com/api \
//   LIFEREGEN_API_KEY=xxx \
//   node scripts/backlog-push.js

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const LIFEREGEN_API_URL = process.env.LIFEREGEN_API_URL;
const LIFEREGEN_API_KEY = process.env.LIFEREGEN_API_KEY;

if (!SHOPIFY_STORE || !SHOPIFY_ACCESS_TOKEN || !LIFEREGEN_API_URL || !LIFEREGEN_API_KEY) {
  console.error("Missing env vars. Set SHOPIFY_STORE, SHOPIFY_ACCESS_TOKEN, LIFEREGEN_API_URL, LIFEREGEN_API_KEY");
  process.exit(1);
}

const START_DATE = "2026-03-22T00:00:00-07:00"; // March 22, 2026 (Pacific Time)

const shopify = axios.create({
  baseURL: `https://${SHOPIFY_STORE}.myshopify.com/admin/api/2026-04`,
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
  },
});

const lifeRegen = axios.create({
  baseURL: LIFEREGEN_API_URL,
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": LIFEREGEN_API_KEY,
  },
});

function mapShopifyOrderToLifeRegen(order) {
  const shipping = order.shipping_address || {};
  const addressParts = [
    shipping.address1,
    shipping.address2,
    shipping.city,
    shipping.province,
    shipping.zip,
    shipping.country,
  ].filter(Boolean);

  const items = (order.line_items || []).map((item) => ({
    client_sku: item.sku || item.variant_id?.toString() || "NO_SKU",
    product_name: item.name || item.title,
    quantity: item.quantity,
    unit_price: parseFloat(item.price) || 0,
  }));

  const residentId =
    order.note_attributes?.find((a) => a.name === "Resident ID number")?.value ||
    "";
  const nameOnId =
    order.note_attributes?.find((a) => a.name === "name_IDCard")?.value || "";

  return {
    client_order_id: order.name || order.id.toString(),
    client_order_datetime: order.created_at,
    customer_name: shipping.name || `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim(),
    mobile: shipping.phone || order.phone || "",
    ID_IDCard: residentId,
    name_IDCard: nameOnId || shipping.name || "",
    addr_detail: addressParts.join(", "),
    items: items,
    total_weight: order.total_weight ? order.total_weight / 1000 : undefined,
    client_remark: order.note || "",
  };
}

async function fetchAllUnfulfilledOrders() {
  console.log(`Fetching unfulfilled orders since ${START_DATE}...`);

  const orders = [];
  let url = `/orders.json?status=any&fulfillment_status=unfulfilled&created_at_min=${encodeURIComponent(START_DATE)}&limit=250`;

  while (url) {
    const response = await shopify.get(url);
    orders.push(...response.data.orders);

    // Check Link header for pagination
    const linkHeader = response.headers.link;
    const nextMatch = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      url = nextUrl.pathname.replace("/admin/api/2026-04", "") + nextUrl.search;
    } else {
      url = null;
    }

    console.log(`Fetched ${orders.length} orders so far...`);
  }

  return orders;
}

async function main() {
  const startTime = Date.now();
  console.log("=== Backlog Batch Push ===");
  console.log(`Started: ${new Date().toISOString()}`);

  const allOrders = await fetchAllUnfulfilledOrders();
  console.log(`\nTotal unfulfilled orders found: ${allOrders.length}\n`);

  // Filter out USA
  const filteredOrders = allOrders.filter((order) => {
    const country = order.shipping_address?.country_code || order.shipping_address?.country;
    const isUS = country === "US" || country === "USA" || country === "United States";
    return !isUS;
  });

  console.log(`After USA filter: ${filteredOrders.length} orders to push\n`);

  const results = {
    success: [],
    duplicate: [],
    failed: [],
  };

  for (let i = 0; i < filteredOrders.length; i++) {
    const order = filteredOrders[i];
    const orderId = order.name || order.id;

    try {
      const lifeRegenOrder = mapShopifyOrderToLifeRegen(order);
      const response = await lifeRegen.post("/orders", lifeRegenOrder);

      results.success.push({
        order_id: orderId,
        liferegen_id: response.data.system_order_id,
      });
      console.log(`[${i + 1}/${filteredOrders.length}] ✅ ${orderId} → LifeRegen ID ${response.data.system_order_id}`);
    } catch (err) {
      const status = err.response?.status;
      if (status === 409) {
        results.duplicate.push(orderId);
        console.log(`[${i + 1}/${filteredOrders.length}] ⏭️  ${orderId} (duplicate, skipping)`);
      } else {
        results.failed.push({
          order_id: orderId,
          error: err.response?.data?.message || err.message,
        });
        console.log(`[${i + 1}/${filteredOrders.length}] ❌ ${orderId} - ${err.message}`);
      }
    }

    // Small delay to avoid hammering the API
    await new Promise((r) => setTimeout(r, 200));
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n=== Summary ===");
  console.log(`Total orders processed: ${filteredOrders.length}`);
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⏭️  Duplicate: ${results.duplicate.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏱️  Duration: ${duration}s`);

  // Save report
  const reportPath = path.join(__dirname, `backlog-report-${Date.now()}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        started: new Date(startTime).toISOString(),
        ended: new Date().toISOString(),
        duration_seconds: parseFloat(duration),
        total_fetched: allOrders.length,
        total_after_usa_filter: filteredOrders.length,
        success: results.success.length,
        duplicate: results.duplicate.length,
        failed: results.failed.length,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n📄 Report saved: ${reportPath}`);
}

main().catch((err) => {
  console.error("Backlog push failed:", err.message);
  process.exit(1);
});
