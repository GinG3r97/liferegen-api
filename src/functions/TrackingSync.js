const { app } = require("@azure/functions");
const { createLifeRegenClient, createShopifyClient } = require("../shared/api");
const { mapLifeRegenShipmentToShopify } = require("../shared/mappers");

// Runs daily at 18:00 HKT (10:00 UTC)
app.timer("TrackingSync", {
  schedule: "0 0 10 * * *",
  handler: async (myTimer, context) => {
    context.log("TrackingSync triggered - polling LifeRegen for tracking updates");

    try {
      const shopify = createShopifyClient();
      const lifeRegen = createLifeRegenClient();

      // Get unfulfilled orders from Shopify
      const orders = await shopify.getOrders({
        fulfillment_status: "unfulfilled",
        status: "open",
        limit: 250,
      });

      if (!orders || orders.length === 0) {
        context.log("No unfulfilled orders found");
        return;
      }

      context.log(`Found ${orders.length} unfulfilled orders`);

      // Collect order IDs to query LifeRegen
      const orderIds = orders.map((o) => o.name || o.id.toString());

      // Get shipment info from LifeRegen
      const shipments = await lifeRegen.getShipments(orderIds);

      const shipmentData = shipments?.data || shipments;

      if (!shipmentData || shipmentData.length === 0) {
        context.log("No shipment data returned from LifeRegen");
        return;
      }

      context.log(`Received ${shipmentData.length} shipment records`);

      // Process each order's shipments
      let fulfilled = 0;
      let errors = 0;

      for (const record of shipmentData) {
        // Each record has client_order_id and a shipments array
        const orderShipments = record.shipments || [];

        if (orderShipments.length === 0) {
          continue;
        }

        // Use the first shipment's tracking info
        const shipment = orderShipments[0];

        try {
          const trackingInfo = mapLifeRegenShipmentToShopify(shipment);

          // Skip if no tracking number yet
          if (!trackingInfo.tracking_number) {
            context.log(`No tracking for order ${record.client_order_id}, skipping`);
            continue;
          }

          // Find matching Shopify order
          const order = orders.find(
            (o) => (o.name || o.id.toString()) === record.client_order_id
          );

          if (!order) {
            context.log(`No matching Shopify order for ${record.client_order_id}`);
            continue;
          }

          // Get fulfillment orders
          const fulfillmentOrders = await shopify.getFulfillmentOrders(order.id);
          const openFulfillmentOrder = fulfillmentOrders.find(
            (fo) => fo.status === "open" || fo.status === "in_progress"
          );

          if (!openFulfillmentOrder) {
            context.log(`Order ${order.name} already fulfilled, skipping`);
            continue;
          }

          // Create fulfillment in Shopify
          await shopify.createFulfillment(openFulfillmentOrder.id, trackingInfo);
          fulfilled++;
          context.log(`Fulfilled order ${order.name} with tracking ${trackingInfo.tracking_number}`);
        } catch (err) {
          errors++;
          context.error(`Error fulfilling ${record.client_order_id}: ${err.message}`);
        }
      }

      context.log(`TrackingSync complete: ${fulfilled} fulfilled, ${errors} errors`);
    } catch (error) {
      context.error(`TrackingSync failed: ${error.message}`);
      throw error;
    }
  },
});

// Also expose as HTTP for manual testing
app.http("TrackingSyncManual", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "tracking-sync",
  handler: async (request, context) => {
    context.log("Manual TrackingSync triggered");

    try {
      const shopify = createShopifyClient();
      const lifeRegen = createLifeRegenClient();

      const orders = await shopify.getOrders({
        fulfillment_status: "unfulfilled",
        status: "open",
        limit: 250,
      });

      if (!orders || orders.length === 0) {
        return { status: 200, jsonBody: { message: "No unfulfilled orders" } };
      }

      const orderIds = orders.map((o) => o.name || o.id.toString());
      const shipments = await lifeRegen.getShipments(orderIds);
      const shipmentData = shipments?.data || shipments;

      let fulfilled = 0;
      let errors = 0;
      const results = [];

      if (shipmentData && shipmentData.length > 0) {
        for (const record of shipmentData) {
          const orderShipments = record.shipments || [];
          if (orderShipments.length === 0) continue;

          const shipment = orderShipments[0];
          const trackingInfo = mapLifeRegenShipmentToShopify(shipment);

          if (!trackingInfo.tracking_number) continue;

          const order = orders.find(
            (o) => (o.name || o.id.toString()) === record.client_order_id
          );

          if (!order) continue;

          try {
            const fulfillmentOrders = await shopify.getFulfillmentOrders(order.id);
            const openFulfillmentOrder = fulfillmentOrders.find(
              (fo) => fo.status === "open" || fo.status === "in_progress"
            );

            if (!openFulfillmentOrder) {
              results.push({ order: record.client_order_id, status: "already fulfilled" });
              continue;
            }

            await shopify.createFulfillment(openFulfillmentOrder.id, trackingInfo);
            fulfilled++;
            results.push({ order: record.client_order_id, tracking: trackingInfo.tracking_number, status: "fulfilled" });
            context.log(`Fulfilled order ${order.name} with tracking ${trackingInfo.tracking_number}`);
          } catch (err) {
            errors++;
            results.push({ order: record.client_order_id, status: "error", message: err.message });
          }
        }
      }

      return {
        status: 200,
        jsonBody: {
          unfulfilled_orders: orders.length,
          shipments_found: shipmentData?.length || 0,
          fulfilled,
          errors,
          results,
        },
      };
    } catch (error) {
      context.error(`TrackingSyncManual error: ${error.message}`);
      context.error(`Response status: ${error.response?.status}`);
      context.error(`Response data: ${JSON.stringify(error.response?.data)}`);
      context.error(`Response headers: ${JSON.stringify(error.response?.headers)}`);
      return {
        status: 500,
        jsonBody: {
          error: error.message,
          shopify_status: error.response?.status,
          shopify_response: error.response?.data,
        },
      };
    }
  },
});
