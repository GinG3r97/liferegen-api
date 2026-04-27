const { app } = require("@azure/functions");
const { createLifeRegenClient, createShopifyClient } = require("../shared/api");
const { mapShopifyOrderToLifeRegen } = require("../shared/mappers");

app.http("OrderPush", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.log("OrderPush triggered - received Shopify webhook");

    try {
      const shopifyOrder = await request.json();

      context.log(`Processing order: ${shopifyOrder.name || shopifyOrder.id}`);

      // Skip USA orders — not handled by LifeRegen
      const shippingCountry = shopifyOrder.shipping_address?.country_code || shopifyOrder.shipping_address?.country || "";
      if (shippingCountry === "US" || shippingCountry === "USA" || shippingCountry === "United States") {
        context.log(`Order ${shopifyOrder.name || shopifyOrder.id}: US shipment, skipping`);
        return {
          status: 200,
          jsonBody: { success: true, message: "US order skipped, not sent to LifeRegen" },
        };
      }

      // Fetch order metafields from Shopify (webhook doesn't include them)
      const shopify = createShopifyClient();
      try {
        const orderWithMeta = await shopify.getOrder(shopifyOrder.id);
        shopifyOrder.note_attributes = orderWithMeta.note_attributes || shopifyOrder.note_attributes;
        shopifyOrder.metafields = orderWithMeta.metafields;
      } catch (err) {
        context.warn(`Could not fetch metafields for order ${shopifyOrder.id}: ${err.message}`);
      }

      // Map Shopify order to LifeRegen format
      const lifeRegenOrder = mapShopifyOrderToLifeRegen(shopifyOrder);

      // Validate required fields
      const warnings = [];
      if (!lifeRegenOrder.mobile) {
        warnings.push("Missing phone number");
        context.warn(`Order ${lifeRegenOrder.client_order_id}: missing phone number`);
      }
      if (!lifeRegenOrder.customer_name) {
        warnings.push("Missing customer name");
        context.warn(`Order ${lifeRegenOrder.client_order_id}: missing customer name`);
      }
      if (!lifeRegenOrder.addr_detail) {
        warnings.push("Missing shipping address");
        context.warn(`Order ${lifeRegenOrder.client_order_id}: missing shipping address`);
      }
      if (!lifeRegenOrder.items || lifeRegenOrder.items.length === 0) {
        warnings.push("No line items");
        context.warn(`Order ${lifeRegenOrder.client_order_id}: no line items`);
      }

      context.log("Mapped order:", JSON.stringify(lifeRegenOrder, null, 2));

      // Push to LifeRegen
      const lifeRegen = createLifeRegenClient();
      const result = await lifeRegen.pushOrder(lifeRegenOrder);

      context.log(`Order pushed successfully: ${lifeRegenOrder.client_order_id}`);

      return {
        status: 200,
        jsonBody: {
          success: true,
          order_id: lifeRegenOrder.client_order_id,
          liferegen_response: result,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      };
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      // 409 = duplicate order, not a real error
      if (status === 409) {
        context.log(`Duplicate order detected, skipping`);
        return {
          status: 200,
          jsonBody: { success: true, message: "Duplicate order, already exists" },
        };
      }

      context.error(`OrderPush failed: ${error.message}`, errorData);

      return {
        status: 500,
        jsonBody: {
          success: false,
          error: error.message,
          details: errorData,
        },
      };
    }
  },
});
