const { app } = require("@azure/functions");
const { createLifeRegenClient } = require("../shared/api");

app.storageQueue("RetryHandler", {
  queueName: "order-retry-queue",
  connection: "AzureWebJobsStorage",
  handler: async (message, context) => {
    context.log("RetryHandler triggered - retrying failed order push");

    try {
      const orderData = typeof message === "string" ? JSON.parse(message) : message;

      context.log(`Retrying order: ${orderData.client_order_id}`);

      const lifeRegen = createLifeRegenClient();
      const result = await lifeRegen.pushOrder(orderData);

      context.log(`Retry successful for order: ${orderData.client_order_id}`);
    } catch (error) {
      context.error(`Retry failed for order ${message.client_order_id}: ${error.message}`);
      // Azure Functions will automatically retry based on queue visibility timeout
      // After max retries (5 by default), message moves to poison queue
      throw error;
    }
  },
});
