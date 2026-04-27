const axios = require("axios");

/**
 * LifeRegen API client
 */
function createLifeRegenClient() {
  const baseURL = process.env.LIFEREGEN_API_URL;
  const apiKey = process.env.LIFEREGEN_API_KEY;

  const client = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
  });

  return {
    async pushOrder(orderData) {
      const response = await client.post("/orders", orderData);
      return response.data;
    },

    async getShipments(clientOrderIds) {
      const response = await client.post("/shipments", {
        client_order_ids: clientOrderIds,
      });
      return response.data;
    },
  };
}

/**
 * Shopify Admin API client
 */
function createShopifyClient() {
  const store = process.env.SHOPIFY_STORE;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  const client = axios.create({
    baseURL: `https://${store}.myshopify.com/admin/api/2026-04`,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  });

  return {
    async getOrders(params = {}) {
      const response = await client.get("/orders.json", { params });
      return response.data.orders;
    },

    async getOrder(orderId) {
      const response = await client.get(`/orders/${orderId}.json`);
      return response.data.order;
    },

    async getFulfillmentOrders(orderId) {
      const response = await client.get(`/orders/${orderId}/fulfillment_orders.json`);
      return response.data.fulfillment_orders;
    },

    async createFulfillment(fulfillmentOrderId, trackingInfoOrList) {
      const trackingList = Array.isArray(trackingInfoOrList)
        ? trackingInfoOrList
        : [trackingInfoOrList];

      const uniqueCouriers = [...new Set(trackingList.map((t) => t.tracking_company))];

      // If all same courier, use that. If different, mark as "Other" to avoid wrong URLs
      const company = uniqueCouriers.length === 1 ? uniqueCouriers[0] : "Other";

      // For mixed couriers, prefix tracking numbers with courier name for clarity
      const trackingNumber =
        uniqueCouriers.length === 1
          ? trackingList.map((t) => t.tracking_number).join(", ")
          : trackingList.map((t) => `${t.tracking_company}: ${t.tracking_number}`).join(", ");

      const response = await client.post("/fulfillments.json", {
        fulfillment: {
          line_items_by_fulfillment_order: [
            { fulfillment_order_id: fulfillmentOrderId },
          ],
          tracking_info: {
            number: trackingNumber,
            company: company,
          },
        },
      });
      return response.data;
    },

    async getFulfillments(orderId) {
      const response = await client.get(`/orders/${orderId}/fulfillments.json`);
      return response.data.fulfillments;
    },

    async updateTracking(fulfillmentId, trackingInfoOrList) {
      const trackingList = Array.isArray(trackingInfoOrList)
        ? trackingInfoOrList
        : [trackingInfoOrList];

      const uniqueCouriers = [...new Set(trackingList.map((t) => t.tracking_company))];

      const company = uniqueCouriers.length === 1 ? uniqueCouriers[0] : "Other";

      const trackingNumber =
        uniqueCouriers.length === 1
          ? trackingList.map((t) => t.tracking_number).join(", ")
          : trackingList.map((t) => `${t.tracking_company}: ${t.tracking_number}`).join(", ");

      const notifyOnUpdate = process.env.NOTIFY_CUSTOMER_ON_UPDATE === "true";
      const response = await client.post(`/fulfillments/${fulfillmentId}/update_tracking.json`, {
        fulfillment: {
          notify_customer: notifyOnUpdate,
          tracking_info: {
            number: trackingNumber,
            company: company,
          },
        },
      });
      return response.data;
    },
  };
}

module.exports = {
  createLifeRegenClient,
  createShopifyClient,
};
