const orderRoot = document.querySelector("#orders");
const errorRoot = document.querySelector("#error");
const orderStages = [
  ["placed", "Order received"],
  ["confirmed", "Confirmed"],
  ["preparing", "Preparing"],
  ["ready", "Ready"]
];

function renderOrderProgress(order) {
  const history = order.statusHistory?.length
    ? order.statusHistory
    : [{ status: "placed", at: order.createdAt }, ...(order.status !== "placed" ? [{ status: order.status, at: order.updatedAt }] : [])];
  const currentIndex = ["picked_up", "delivered"].includes(order.status)
    ? orderStages.length - 1
    : orderStages.findIndex(([status]) => status === order.status);
  const list = document.createElement("ol");
  list.className = "order-progress";
  if (order.status === "cancelled") {
    const cancelled = document.createElement("li");
    cancelled.className = "order-step is-cancelled";
    const dot = document.createElement("span");
    dot.className = "order-step-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("strong");
    label.textContent = "Order cancelled";
    cancelled.append(dot, label);
    list.append(cancelled);
    return list;
  }
  if (order.status === "awaiting_payment") {
    const payment = document.createElement("li");
    payment.className = "order-step is-current";
    payment.textContent = "Waiting for payment";
    list.append(payment);
    return list;
  }
  for (const [index, [status, label]] of orderStages.entries()) {
    const event = [...history].reverse().find(item => item.status === status);
    const item = document.createElement("li");
    item.className = `order-step${index < currentIndex ? " is-complete" : ""}${index === currentIndex ? " is-current" : ""}`;
    const dot = document.createElement("span");
    dot.className = "order-step-dot";
    dot.setAttribute("aria-hidden", "true");
    const content = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = label;
    content.append(title);
    if (event?.at) {
      const time = document.createElement("small");
      time.textContent = new Date(event.at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
      content.append(time);
    }
    item.append(dot, content);
    list.append(item);
  }
  if (["picked_up", "delivered"].includes(order.status)) {
    const item = document.createElement("li");
    item.className = "order-step is-current";
    const dot = document.createElement("span");
    dot.className = "order-step-dot";
    dot.setAttribute("aria-hidden", "true");
    const label = document.createElement("strong");
    label.textContent = order.status === "delivered" ? "Delivered" : "Picked up";
    item.append(dot, label);
    list.append(item);
  }
  return list;
}

async function reorder(order, button) {
  button.disabled = true;
  errorRoot.textContent = "Checking the restaurant’s current menu…";
  try {
    const restaurantId = order.restaurantId?._id;
    if (!restaurantId) throw new Error("Could not find the restaurant for this order.");
    const response = await fetch(`${API_BASE}/restaurants/${encodeURIComponent(restaurantId)}/menu`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load the current menu.");
    const currentById = new Map((data.items || []).map(item => [String(item._id), item]));
    const items = [];
    let unavailableCount = 0;
    for (const previous of order.items) {
      const current = currentById.get(String(previous.menuItemId));
      if (!current) { unavailableCount += 1; continue; }
      items.push({ menuItemId: current._id, name: current.name, pricePaise: current.pricePaise, quantity: previous.quantity });
    }
    if (!items.length) throw new Error("None of the dishes in this order are currently available.");
    const existingCart = readCart();
    if (existingCart?.items?.length && !confirm("Replace your current cart with this reorder?")) {
      errorRoot.textContent = "Your current cart was kept unchanged.";
      button.disabled = false;
      return;
    }
    writeCart({ restaurantId, restaurantName: order.restaurantId.name, items });
    if (unavailableCount) sessionStorage.setItem("food-platform-reorder-note", `${unavailableCount} unavailable ${unavailableCount === 1 ? "dish was" : "dishes were"} left out. Review your cart before ordering.`);
    sessionStorage.removeItem("food-platform-checkout");
    location.href = "cart.html";
  } catch (error) {
    errorRoot.textContent = error.message;
    button.disabled = false;
  }
}

function renderReview(order, card) {
  if (order.review) {
    const reviewed = document.createElement("p");
    reviewed.className = "order-review-status";
    reviewed.textContent = `Your rating: ${order.review.rating} / 5`;
    card.append(reviewed);
  } else if (order.status === "ready") {
    const form = document.createElement("form");
    form.className = "order-review-form";
    form.innerHTML = `<label>Rate your order <select name="rating" required><option value="" selected disabled>Choose 1–5 stars</option><option value="5">★★★★★ — Excellent</option><option value="4">★★★★ — Good</option><option value="3">★★★ — Okay</option><option value="2">★★ — Poor</option><option value="1">★ — Bad</option></select></label><label>Review (optional)<textarea name="comment" maxlength="500" rows="3" placeholder="How was your order?"></textarea></label><button type="submit">Submit review</button>`;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector("button");
      const fields = new FormData(form);
      button.disabled = true;
      try {
        const response = await fetch(`${API_BASE}/reviews`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ orderId: order._id, rating: Number(fields.get("rating")), comment: fields.get("comment") })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not submit your review");
        await loadOrders(true);
      } catch (error) {
        errorRoot.textContent = error.message;
        button.disabled = false;
      }
    });
    card.append(form);
  }
}

function renderOrders(orders) {
  orderRoot.replaceChildren();
  if (!orders.length) { orderRoot.textContent = "You haven’t placed any orders yet."; return; }
  for (const order of orders) {
    const card = document.createElement("article");
    card.className = "customer-order-card";
    const lines = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join(", ");
    const paymentLabel = order.paymentMethod === "cash_on_delivery"
      ? "Cash on delivery"
      : order.paymentMethod === "upi_qr"
        ? "UPI QR selected (not collected)"
        : "Online payment selected (not collected)";
    card.innerHTML = `<h3>${escapeHtml(order.restaurantId?.name || "Restaurant")}</h3><p>${lines}</p><p><strong>${escapeHtml(order.status.replaceAll("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment: ${paymentLabel}</p><small>Order placed ${new Date(order.createdAt).toLocaleString("en-IN")}</small>`;
    if (order.deliveryPartnerId) {
      const partner = document.createElement("p");
      partner.textContent = `Delivery person: ${order.deliveryPartnerId.name}${order.deliveryPartnerId.phone ? ` · ${order.deliveryPartnerId.phone}` : ""}`;
      card.append(partner);
    } else if (!["delivered", "cancelled", "awaiting_payment"].includes(order.status)) {
      const pending = document.createElement("p");
      pending.className = "muted";
      pending.textContent = "A delivery person will be assigned shortly.";
      card.append(pending);
    }
    card.append(renderOrderProgress(order));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary reorder-button";
    button.textContent = "Reorder";
    button.addEventListener("click", () => reorder(order, button));
    card.append(button);
    renderReview(order, card);
    orderRoot.append(card);
  }
}

async function loadOrders(force = false) {
  if (!getToken()) { errorRoot.innerHTML = `Please <a href="login.html?next=orders.html">sign in</a> to view your orders.`; return; }
  if (!force && document.activeElement?.closest?.(".order-review-form")) return;
  try {
    const response = await fetch(`${API_BASE}/orders/mine`, { headers: authHeaders() });
    const data = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      errorRoot.innerHTML = `Your session expired. Please <a href="login.html?next=orders.html">sign in again</a> to view your orders.`;
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load orders");
    renderOrders(data.orders || []);
    const refreshed = document.querySelector("#order-refresh");
    if (refreshed) refreshed.textContent = `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · Refreshes every 15 seconds`;
    if (new URLSearchParams(location.search).has("placed")) errorRoot.textContent = "Order placed. Follow its progress below.";
  } catch (error) { errorRoot.textContent = error.message; }
}

loadOrders();
setInterval(loadOrders, 15000);
