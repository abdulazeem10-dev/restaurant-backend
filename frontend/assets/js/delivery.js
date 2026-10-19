const deliveryRoot = document.querySelector("#deliveries");
const deliveryMessage = document.querySelector("#message");

if (!getToken()) location.href = "../customer/login.html";
document.querySelector("#logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  location.href = "../customer/login.html";
});

async function deliveryApi(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Could not load deliveries");
  return data;
}

function renderDelivery(order) {
  const card = document.createElement("article");
  const items = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join("<br>");
  const recipient = order.deliveryDetails || {};
  const restaurant = order.restaurantId || {};
  const customer = order.customerId || {};
  const stateLabels = { placed: "Order placed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Out for delivery", delivered: "Delivery done", cancelled: "Cancelled" };
  const state = stateLabels[order.status] || order.status.replaceAll("_", " ");
  const paymentMode = order.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : order.paymentMethod === "upi_qr" ? "UPI QR preference" : order.paymentMethod === "razorpay" ? "Online payment" : "UPI / card / net banking preference";
  const paymentState = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "failed" ? "Payment failed" : order.paymentStatus === "refunded" ? "Refunded" : order.paymentMethod === "cash_on_delivery" ? "Unpaid · collect cash on delivery" : "Not paid · selected preference only";
  const pickupMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address || "")}`;
  const deliveryMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress || "")}`;
  card.innerHTML = `<p class="eyebrow">ORDER ${escapeHtml(order._id.slice(-6))}</p><h3>${escapeHtml(restaurant.name || "Restaurant")}</h3><p><strong>Pickup from</strong><br>${escapeHtml(restaurant.address || "Pickup address unavailable")}<br><a href="${pickupMap}" target="_blank" rel="noopener noreferrer">Open pickup in Maps</a></p><hr><p><strong>Customer</strong><br>${escapeHtml(customer.name || "Customer")}${customer.email ? ` · ${escapeHtml(customer.email)}` : ""}</p><p><strong>Deliver to ${recipient.recipientType === "other" ? "recipient" : "customer"}</strong><br>${escapeHtml(recipient.name || "")}${recipient.phone ? ` · <a href="tel:${encodeURIComponent(recipient.phone)}">${escapeHtml(recipient.phone)}</a>` : ""}</p><p><strong>Delivery address</strong><br>${escapeHtml(order.deliveryAddress)}${recipient.pincode ? `<br>PIN ${escapeHtml(recipient.pincode)}` : ""}<br><a href="${deliveryMap}" target="_blank" rel="noopener noreferrer">Open delivery location in Maps</a></p><p><strong>Food</strong><br>${items}</p><p><strong>Status:</strong> ${escapeHtml(state)} · ${formatRupees(order.totalPaise)}</p><p><strong>Payment mode:</strong> ${escapeHtml(paymentMode)}</p><p><strong>Payment status:</strong> ${escapeHtml(paymentState)}${order.paymentCollectedAt ? ` · ${new Date(order.paymentCollectedAt).toLocaleString("en-IN")}` : ""}</p>${order.customerReceivedAt ? `<p><strong>Customer confirmed receipt:</strong> ${new Date(order.customerReceivedAt).toLocaleString("en-IN")}</p>` : order.status === "delivered" ? "<p>Waiting for customer to confirm receipt.</p>" : ""}`;

  let nextStatus = null;
  let actionLabel = "";
  if (order.status === "out_for_delivery" || order.status === "picked_up") { nextStatus = "delivered"; actionLabel = order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "paid" ? "Mark delivered & cash received" : "Mark delivered"; }
  if (order.status === "ready") {
    const waiting = document.createElement("p");
    waiting.className = "muted";
    waiting.textContent = "Ready for pickup. The restaurant will mark the order out for delivery after handing it over.";
    card.append(waiting);
  }
  if (nextStatus) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await deliveryApi(`/orders/delivery/${encodeURIComponent(order._id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, ...(nextStatus === "delivered" && order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "paid" ? { cashCollected: true } : {}) })
        });
        await loadDeliveries();
      } catch (error) {
        deliveryMessage.textContent = error.message;
        button.disabled = false;
      }
    });
    card.append(button);
  }
  if (order.status === "delivered" && order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "paid") {
    const cashButton = document.createElement("button");
    cashButton.type = "button";
    cashButton.className = "secondary";
    cashButton.textContent = "Confirm cash collected";
    cashButton.addEventListener("click", async () => {
      cashButton.disabled = true;
      try {
        await deliveryApi(`/orders/delivery/${encodeURIComponent(order._id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cashCollected: true })
        });
        await loadDeliveries();
      } catch (error) {
        deliveryMessage.textContent = error.message;
        cashButton.disabled = false;
      }
    });
    card.append(cashButton);
  }
  return card;
}

async function loadDeliveries() {
  if (!getToken()) return;
  try {
    const { orders } = await deliveryApi("/orders/delivery/mine");
    deliveryRoot.replaceChildren();
    if (!orders.length) {
      deliveryRoot.textContent = "No assigned deliveries right now.";
      return;
    }
    for (const order of orders) deliveryRoot.append(renderDelivery(order));
    deliveryMessage.textContent = `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    deliveryMessage.textContent = `${error.message}. Sign in with a delivery account.`;
  }
}

loadDeliveries();
setInterval(loadDeliveries, 15000);
