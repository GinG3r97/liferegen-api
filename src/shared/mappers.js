/**
 * Map Shopify order to LifeRegen order format
 */
function mapShopifyOrderToLifeRegen(order) {
  const shipping = order.shipping_address || {};

  // Build full address string (LifeRegen handles parsing)
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

  // Extract Resident ID from metafields or note_attributes (for China customs)
  const residentId =
    order.note_attributes?.find((a) => a.name === "Resident ID number")?.value ||
    order.metafields?.find((m) => m.key === "resident_id")?.value ||
    "";

  // Extract customer name for ID card (may differ from shipping name)
  const nameOnId =
    order.note_attributes?.find((a) => a.name === "name_IDCard")?.value ||
    "";

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

/**
 * Map LifeRegen shipment to Shopify fulfillment format
 */
function mapLifeRegenShipmentToShopify(shipment) {
  // Map LifeRegen courier names to Shopify tracking company names
  const courierMap = {
    "SF Express": "SF Express",
    "sf express": "SF Express",
    SF: "SF Express",
  };

  return {
    tracking_number: shipment.waybill || shipment.waybill_no || shipment.tracking_number,
    tracking_company: courierMap[shipment.courier] || shipment.courier || "Other",
    status: shipment.shipping_status || shipment.status,
  };
}

module.exports = {
  mapShopifyOrderToLifeRegen,
  mapLifeRegenShipmentToShopify,
};
