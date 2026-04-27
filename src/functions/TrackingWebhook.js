const { app } = require("@azure/functions");
const { createShopifyClient } = require("../shared/api");
const { mapLifeRegenShipmentToShopify } = require("../shared/mappers");

app.http("TrackingWebhook", {
  methods: ["POST"],
  authLevel: "function",
  handler: async (request, context) => {
    context.log("TrackingWebhook triggered - received push from LifeRegen");

    try {
      const payload = await request.json();

      const clientOrderId = payload.client_order_id;
      const shipments = payload.shipments || [];

      if (!clientOrderId) {
        return {
          status: 400,
          jsonBody: { success: false, error: "Missing client_order_id" },
        };
      }

      if (shipments.length === 0) {
        return {
          status: 200,
          jsonBody: { success: true, message: "No shipments to process" },
        };
      }

      // Map all shipments to tracking info
      const trackingInfoList = shipments
        .map(mapLifeRegenShipmentToShopify)
        .filter((t) => t.tracking_number);

      if (trackingInfoList.length === 0) {
        return {
          status: 200,
          jsonBody: { success: true, message: "No valid tracking numbers" },
        };
      }

      const allTrackingNumbers = trackingInfoList.map((t) => t.tracking_number);

      const shopify = createShopifyClient();

      // Find the Shopify order
      const orders = await shopify.getOrders({ name: clientOrderId, status: "any", limit: 5 });
      const order = orders.find((o) => o.name === clientOrderId);

      if (!order) {
        context.warn(`No Shopify order found for ${clientOrderId}`);
        return {
          status: 404,
          jsonBody: { success: false, error: `Order ${clientOrderId} not found in Shopify` },
        };
      }

      // Check existing fulfillment
      const existingFulfillments = await shopify.getFulfillments(order.id);
      const existingFulfillment = existingFulfillments?.[0];

      if (existingFulfillment) {
        // Check if all tracking numbers already match (we store as comma-separated)
        const currentTracking = existingFulfillment.tracking_number || "";
        const currentNumbers = currentTracking ? currentTracking.split(", ").map((s) => s.trim()) : [];
        const sameTracking =
          currentNumbers.length === allTrackingNumbers.length &&
          allTrackingNumbers.every((n) => currentNumbers.includes(n));

        if (sameTracking) {
          context.log(`Order ${clientOrderId} already has all tracking numbers, no change`);
          return {
            status: 200,
            jsonBody: {
              success: true,
              action: "no_change",
              tracking_numbers: allTrackingNumbers,
            },
          };
        }

        // Update with all tracking numbers
        await shopify.updateTracking(existingFulfillment.id, trackingInfoList);

        context.log(
          `Updated tracking for ${clientOrderId}: [${currentNumbers.join(", ")}] -> [${allTrackingNumbers.join(", ")}]`
        );

        return {
          status: 200,
          jsonBody: {
            success: true,
            action: "updated",
            order_id: clientOrderId,
            previous_tracking: currentNumbers,
            new_tracking: allTrackingNumbers,
            courier: trackingInfoList[0].tracking_company,
          },
        };
      }

      // No fulfillment yet - create one with all tracking numbers
      const fulfillmentOrders = await shopify.getFulfillmentOrders(order.id);
      const openFulfillmentOrder = fulfillmentOrders.find(
        (fo) => fo.status === "open" || fo.status === "in_progress"
      );

      if (!openFulfillmentOrder) {
        context.warn(`Order ${clientOrderId} has no open fulfillment order`);
        return {
          status: 400,
          jsonBody: { success: false, error: "No open fulfillment order found" },
        };
      }

      await shopify.createFulfillment(openFulfillmentOrder.id, trackingInfoList);

      context.log(
        `Created fulfillment for ${clientOrderId} with tracking [${allTrackingNumbers.join(", ")}]`
      );

      return {
        status: 200,
        jsonBody: {
          success: true,
          action: "created",
          order_id: clientOrderId,
          tracking_numbers: allTrackingNumbers,
          courier: trackingInfoList[0].tracking_company,
        },
      };
    } catch (error) {
      context.error(`TrackingWebhook failed: ${error.message}`);
      return {
        status: 500,
        jsonBody: { success: false, error: error.message },
      };
    }
  },
});
