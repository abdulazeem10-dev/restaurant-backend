const orderRoot = document.querySelector("#orders");
const errorRoot = document.querySelector("#error");
const notificationPanel = document.querySelector(".notification-panel");
const trackingMaps = [];
const customerLocationWatches = new Map();
const orderStages = [
  ["placed", "Order placed"],
  ["preparing", "Preparing"],
  ["ready", "Ready for pickup"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivery done"]
];

function showOrdersSignIn(message = "Sign in to see your orders, delivery updates, and receipts.") {
  errorRoot.textContent = "";
  orderRoot.replaceChildren();
  orderRoot.dataset.loaded = "true";
  orderRoot.setAttribute("aria-busy", "false");
  const state = document.createElement("section");
  state.className = "orders-signin-state";
  const icon = document.createElement("span");
  icon.className = "orders-signin-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "↗";
  const title = document.createElement("h2");
  title.textContent = "Your orders, all in one place";
  const description = document.createElement("p");
  description.className = "muted";
  description.textContent = message;
  const actions = document.createElement("div");
  actions.className = "orders-signin-actions";
  const signIn = document.createElement("a");
  signIn.className = "hero-cta";
  signIn.href = "login.html?next=orders.html";
  signIn.textContent = "Sign in";
  const browse = document.createElement("a");
  browse.className = "orders-browse-link";
  browse.href = "index.html#restaurant-listing";
  browse.textContent = "Browse restaurants";
  actions.append(signIn, browse);
  state.append(icon, title, description, actions);
  orderRoot.append(state);
  notificationPanel.hidden = true;
  document.querySelector("#order-refresh").textContent = "";
}

function showOrdersLoading() {
  orderRoot.setAttribute("aria-busy", "true");
  orderRoot.replaceChildren(...Array.from({ length: 2 }, () => {
    const card = document.createElement("article");
    card.className = "orders-loading-card";
    card.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 4; index += 1) {
      const line = document.createElement("span");
      line.className = `orders-loading-line orders-loading-line-${index + 1}`;
      card.append(line);
    }
    return card;
  }));
}

function showOrdersLoadError() {
  orderRoot.setAttribute("aria-busy", "false");
  orderRoot.dataset.loaded = "true";
  orderRoot.replaceChildren();
  const state = document.createElement("section");
  state.className = "orders-empty-state orders-load-error";
  const title = document.createElement("h2");
  title.textContent = "We couldn’t load your orders";
  const message = document.createElement("p");
  message.className = "muted";
  message.textContent = "Check your connection and try again.";
  const retry = document.createElement("button");
  retry.className = "hero-cta";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => {
    orderRoot.dataset.loaded = "";
    loadOrders(true);
  });
  state.append(title, message, retry);
  orderRoot.append(state);
}

function renderOrderProgress(order) {
  const history = order.statusHistory?.length
    ? order.statusHistory
    : [{ status: "placed", at: order.createdAt }, ...(order.status !== "placed" ? [{ status: order.status, at: order.updatedAt }] : [])];
  const currentStatus = order.status === "picked_up" ? "out_for_delivery" : order.status === "confirmed" ? "placed" : order.status;
  const currentIndex = orderStages.findIndex(([status]) => status === currentStatus);
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
    const event = [...history].reverse().find(item => item.status === status || (status === "out_for_delivery" && item.status === "picked_up"));
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
  return list;
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function renderOrderTiming(order) {
  const details = document.createElement("details");
  details.className = "order-timing-dropdown";
  const summary = document.createElement("summary");
  summary.textContent = "View order timing";
  details.append(summary);
  const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  const findTime = statuses => history.find(event => statuses.includes(event.status))?.at;
  const placedAt = findTime(["placed", "confirmed"]) || order.createdAt;
  const preparingAt = findTime(["preparing"]);
  const readyAt = findTime(["ready"]);
  const deliveryAt = findTime(["out_for_delivery", "picked_up"]);
  const deliveredAt = findTime(["delivered"]);
  const duration = (from, to) => from && to ? formatDuration(new Date(to).getTime() - new Date(from).getTime()) : null;
  const configuredPrep = Number(order.restaurantId?.prepTimeMinutes);
  const configuredDelivery = Number(order.restaurantId?.deliveryTimeMinutes);
  const rows = [
    ["Order placed", placedAt ? new Date(placedAt).toLocaleString("en-IN") : "—"],
    ["Preparing", preparingAt ? new Date(preparingAt).toLocaleString("en-IN") : order.status === "awaiting_payment" ? "Waiting for payment" : "Not started yet"],
    ["Ready for pickup", readyAt ? new Date(readyAt).toLocaleString("en-IN") : "Not recorded yet"],
    ["Out for delivery", deliveryAt ? new Date(deliveryAt).toLocaleString("en-IN") : "Not recorded yet"],
    ["Delivered", deliveredAt ? new Date(deliveredAt).toLocaleString("en-IN") : "Not delivered yet"]
  ];
  const list = document.createElement("dl");
  list.className = "order-timing-list";
  rows.forEach(([label, value]) => { const term = document.createElement("dt"); term.textContent = label; const description = document.createElement("dd"); description.textContent = value; list.append(term, description); });
  const estimate = document.createElement("p");
  estimate.className = "order-timing-estimate";
  const preparationTime = duration(placedAt, preparingAt) || (Number.isFinite(configuredPrep) ? `about ${configuredPrep} min` : "not available yet");
  const deliveryTime = duration(deliveryAt || readyAt, deliveredAt) || (Number.isFinite(configuredDelivery) ? `about ${configuredDelivery} min` : "not available yet");
  estimate.textContent = `Preparation time: ${preparationTime} · Delivery time: ${deliveryTime}`;
  details.append(list, estimate);
  return details;
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
  } else if (["ready", "out_for_delivery", "picked_up", "delivered"].includes(order.status)) {
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
    const reviewDetails = document.createElement("details");
    reviewDetails.className = "order-action-dropdown";
    const reviewSummary = document.createElement("summary");
    reviewSummary.textContent = "Leave a review";
    reviewDetails.append(reviewSummary, form);
    card.append(reviewDetails);
  }
}

function renderOrderHelp(order, card) {
  const cancellation = order.cancellationRequest;
  if (cancellation?.status && cancellation.status !== "none") {
    const notice = document.createElement("section");
    notice.className = "order-help-status";
    const title = document.createElement("strong");
    title.textContent = `Cancellation request: ${cancellation.status}`;
    const reason = document.createElement("p");
    reason.textContent = `${cancellation.reason || ""}${cancellation.details ? ` · ${cancellation.details}` : ""}`;
    notice.append(title, reason);
    if (cancellation.response) { const response = document.createElement("p"); response.textContent = `Restaurant response: ${cancellation.response}`; notice.append(response); }
    card.append(notice);
  }

  for (const request of order.supportRequests || []) {
    const section = document.createElement("section");
    section.className = "order-help-status";
    const title = document.createElement("strong");
    title.textContent = `${request.category.replaceAll("_", " ")} · ${request.status}`;
    const message = document.createElement("p"); message.textContent = request.message;
    section.append(title, message);
    if (request.response) { const response = document.createElement("p"); response.textContent = `Restaurant response: ${request.response}`; section.append(response); }
    card.append(section);
  }

  const cancellable = ["placed", "confirmed", "preparing", "ready"].includes(order.status);
  if (cancellable && order.paymentStatus !== "paid" && cancellation?.status !== "pending") {
    const form = document.createElement("form"); form.className = "order-cancel-form";
    form.innerHTML = `<label>Reason <select name="reason" required><option value="" selected disabled>Choose a reason</option><option value="Ordered by mistake">Ordered by mistake</option><option value="Change of plans">Change of plans</option><option value="Incorrect order">Incorrect order</option><option value="Other">Other</option></select></label><label>More details (optional) <textarea name="details" rows="2" maxlength="500" placeholder="Add a note for the restaurant"></textarea></label><button type="submit" class="secondary">Request cancellation</button>`;
    form.addEventListener("submit", async event => {
      event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
      const fields = new FormData(form);
      try {
        const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(order._id)}/cancellation-request`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ reason: fields.get("reason"), details: fields.get("details") }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not request cancellation");
        await loadOrders(true);
      } catch (error) { errorRoot.textContent = error.message; button.disabled = false; }
    });
    const cancelDetails = document.createElement("details");
    cancelDetails.className = "order-action-dropdown";
    const cancelSummary = document.createElement("summary");
    cancelSummary.textContent = "Need to cancel?";
    cancelDetails.append(cancelSummary, form);
    card.append(cancelDetails);
  } else if (order.paymentStatus === "paid" && cancellable) {
    const note = document.createElement("p"); note.className = "muted"; note.textContent = "For a paid order, contact support to discuss cancellation and a refund."; card.append(note);
  }

  if (order.status !== "awaiting_payment") {
    const form = document.createElement("form"); form.className = "order-help-form";
    form.innerHTML = `<label>Topic <select name="category" required><option value="missing_item">Missing item</option><option value="food_quality">Food quality</option><option value="delivery">Delivery</option><option value="payment">Payment</option><option value="other">Other</option></select></label><label>Describe the issue <textarea name="message" rows="3" minlength="5" maxlength="1000" required placeholder="Tell the restaurant what happened"></textarea></label><button type="submit" class="secondary">Send to restaurant</button>`;
    form.addEventListener("submit", async event => {
      event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
      const fields = new FormData(form);
      try {
        const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(order._id)}/help`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ category: fields.get("category"), message: fields.get("message") }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not send your help request");
        await loadOrders(true);
      } catch (error) { errorRoot.textContent = error.message; button.disabled = false; }
    });
    const helpDetails = document.createElement("details");
    helpDetails.className = "order-action-dropdown";
    const helpSummary = document.createElement("summary");
    helpSummary.textContent = "Need help with this order?";
    helpDetails.append(helpSummary, form);
    card.append(helpDetails);
  }
}

function renderOrders(orders) {
  while (trackingMaps.length) trackingMaps.pop()?.remove();
  orderRoot.replaceChildren();
  orderRoot.dataset.loaded = "true";
  orderRoot.setAttribute("aria-busy", "false");
  if (!orders.length) {
    const empty = document.createElement("section");
    empty.className = "orders-empty-state";
    const icon = document.createElement("span");
    icon.className = "orders-empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✦";
    const title = document.createElement("h2");
    title.textContent = "Your next favourite meal is nearby";
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = "Your orders and delivery updates will appear here once you place an order.";
    const browse = document.createElement("a");
    browse.className = "hero-cta";
    browse.href = "index.html#restaurant-listing";
    browse.textContent = "Explore restaurants";
    empty.append(icon, title, message, browse);
    orderRoot.append(empty);
    return;
  }
  for (const order of orders) {
    const card = document.createElement("article");
    card.className = "customer-order-card";
    const lines = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join(", ");
    const paymentLabel = order.paymentMethod === "cash_on_delivery"
      ? "Cash on delivery"
      : order.paymentMethod === "upi_qr"
        ? "UPI QR selected (not collected)"
        : "Online payment selected (not collected)";
    const paymentStatusLabel = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "failed" ? "Failed" : order.paymentStatus === "refunded" ? "Refunded" : order.paymentMethod === "cash_on_delivery" ? "Unpaid · due on delivery" : "Not paid · preference only";
    const statusLabels = { placed: "Order placed", confirmed: "Order placed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Out for delivery", delivered: "Delivery done", cancelled: "Cancelled", awaiting_payment: "Waiting for payment" };
    card.innerHTML = `<h3>${escapeHtml(order.restaurantId?.name || "Restaurant")}</h3><p>${lines}</p><p><strong>${escapeHtml(statusLabels[order.status] || order.status.replaceAll("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment mode: ${paymentLabel}</p><p>Payment status: ${paymentStatusLabel}</p><small>Order placed ${new Date(order.createdAt).toLocaleString("en-IN")}</small>`;
    if (order.deliveryDetails?.deliveryAreaName) {
      const area = document.createElement("p");
      area.textContent = `Delivery area: ${order.deliveryDetails.deliveryAreaName}`;
      card.append(area);
    }
    if (order.estimatedDeliveryAt && !["delivered", "cancelled"].includes(order.status)) {
      const eta = document.createElement("p"); eta.className = "order-eta";
      eta.textContent = `Estimated delivery: ${new Date(order.estimatedDeliveryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
      card.append(eta);
    }
    const prepMinutes = Number(order.restaurantId?.prepTimeMinutes);
    const deliveryMinutes = Number(order.restaurantId?.deliveryTimeMinutes);
    if (!["delivered", "cancelled"].includes(order.status) && Number.isFinite(prepMinutes) && Number.isFinite(deliveryMinutes)) {
      const timing = document.createElement("section");
      timing.className = "order-eta-breakdown";
      const heading = document.createElement("strong");
      heading.textContent = "Your delivery estimate";
      const copy = document.createElement("p");
      copy.textContent = `About ${prepMinutes} min preparation + ${deliveryMinutes} min delivery to your location.`;
      timing.append(heading, copy);
      if (order.estimatedDeliveryAt) {
        const arrival = document.createElement("span");
        arrival.textContent = `Expected by ${new Date(order.estimatedDeliveryAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
        timing.append(arrival);
      }
      card.append(timing);
    }
    const location = order.deliveryLocation;
    const customerLocation = order.customerLocation;
    const activeRoute = ["out_for_delivery", "picked_up"].includes(order.status);
    if (activeRoute) {
      const tracking = document.createElement("section");
      tracking.className = "live-tracking-panel";
      const heading = document.createElement("h4");
      heading.textContent = "Live delivery map";
      tracking.append(heading);
      const map = document.createElement("div");
      map.className = "live-order-map";
      map.setAttribute("role", "img");
      map.setAttribute("aria-label", "Live map showing the delivery person and shared customer location");
      const hasCoordinates = [location, customerLocation].some(point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
      if (hasCoordinates) {
        tracking.append(map);
        const leafletMap = createLiveTrackingMap(map, location, customerLocation);
        if (leafletMap) trackingMaps.push(leafletMap);
      } else {
        map.classList.add("is-empty");
        map.textContent = "The map will appear when GPS location is shared.";
        tracking.append(map);
      }
      if (location?.updatedAt) {
        const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(location.updatedAt).getTime()) / 60000));
        const freshness = document.createElement("p");
        freshness.className = "muted";
        freshness.textContent = ageMinutes > 2 ? `Rider location last updated ${ageMinutes} minutes ago.` : `Rider location is live · updated ${new Date(location.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`;
        tracking.append(freshness);
      } else {
        const waiting = document.createElement("p");
        waiting.className = "muted";
        waiting.textContent = "Waiting for the delivery person to share GPS location.";
        tracking.append(waiting);
      }
      const share = document.createElement("button");
      share.type = "button";
      share.className = "secondary";
      share.textContent = customerLocationWatches.has(String(order._id)) ? "Stop sharing my location" : "Share my live location with the delivery person";
      share.addEventListener("click", () => toggleCustomerLocationShare(order._id, share));
      tracking.append(share);
      const privacy = document.createElement("small");
      privacy.className = "muted";
      privacy.textContent = "Your precise location is shared only with the delivery person assigned to this active order. You can stop sharing at any time.";
      tracking.append(privacy);
      card.append(tracking);
    } else if (customerLocationWatches.has(String(order._id))) {
      stopCustomerLocationShare(order._id, true);
    }
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
    card.append(renderOrderTiming(order));
    renderOrderHelp(order, card);
    if (order.customerReceivedAt) {
      const received = document.createElement("p");
      received.className = "order-review-status";
      received.textContent = `You confirmed receipt on ${new Date(order.customerReceivedAt).toLocaleString("en-IN")}.`;
      card.append(received);
    } else if (order.status === "delivered") {
      const receivedButton = document.createElement("button");
      receivedButton.type = "button";
      receivedButton.className = "secondary";
      receivedButton.textContent = "Confirm received";
      receivedButton.addEventListener("click", async () => {
        receivedButton.disabled = true;
        try {
          const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(order._id)}/received`, { method: "PATCH", headers: authHeaders() });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not confirm receipt");
          await loadOrders(true);
        } catch (error) {
          errorRoot.textContent = error.message;
          receivedButton.disabled = false;
        }
      });
      card.append(receivedButton);
    }
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

async function stopCustomerLocationShare(orderId, clearRemote = true) {
  const key = String(orderId);
  const watch = customerLocationWatches.get(key);
  if (watch && navigator.geolocation) navigator.geolocation.clearWatch(watch.id);
  customerLocationWatches.delete(key);
  if (clearRemote && getToken()) {
    try {
      await fetch(`${API_BASE}/orders/${encodeURIComponent(key)}/customer-location`, { method: "DELETE", headers: authHeaders(), keepalive: true });
    } catch { /* The saved location is removed automatically when delivery completes. */ }
  }
}

function toggleCustomerLocationShare(orderId, button) {
  const key = String(orderId);
  if (customerLocationWatches.has(key)) {
    stopCustomerLocationShare(key, true);
    button.textContent = "Share my live location with the delivery person";
    errorRoot.textContent = "Live location sharing stopped.";
    return;
  }
  if (!window.isSecureContext || !navigator.geolocation) {
    errorRoot.textContent = "Live location requires browser permission on HTTPS (or localhost).";
    return;
  }
  button.disabled = true;
  errorRoot.textContent = "Waiting for location permission…";
  const watch = { id: null, lastSentAt: 0, inFlight: false };
  watch.id = navigator.geolocation.watchPosition(async position => {
    if (!customerLocationWatches.has(key)) return;
    button.disabled = false;
    button.textContent = "Stop sharing my location";
    if (watch.inFlight || Date.now() - watch.lastSentAt < 12000) return;
    watch.inFlight = true;
    try {
      const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(key)}/customer-location`, {
        method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not share your location");
      watch.lastSentAt = Date.now();
      errorRoot.textContent = `Your live location is shared with the assigned delivery person · updated ${new Date(data.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`;
    } catch (error) {
      errorRoot.textContent = error.message;
      button.disabled = false;
      await stopCustomerLocationShare(key, false);
    } finally { watch.inFlight = false; }
  }, async error => {
    button.disabled = false;
    errorRoot.textContent = error.code === error.PERMISSION_DENIED ? "Location permission was denied. Allow browser location access to share your location." : "Could not read your location. Check that location services are enabled.";
    await stopCustomerLocationShare(key, true);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  customerLocationWatches.set(key, watch);
}

window.addEventListener("pagehide", () => {
  for (const orderId of customerLocationWatches.keys()) stopCustomerLocationShare(orderId, true);
});

function renderNotifications(notifications, unreadCount) {
  const list = document.querySelector("#customer-notifications");
  const count = document.querySelector("#customer-notification-count");
  list.replaceChildren();
  count.hidden = unreadCount < 1;
  count.textContent = String(unreadCount);
  if (!notifications.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No notifications yet. Delivery updates will appear here.";
    list.append(empty);
    return;
  }
  for (const notification of notifications) {
    const item = document.createElement("li");
    item.className = notification.readAt ? "notification-item" : "notification-item is-unread";
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = notification.title;
    const message = document.createElement("p");
    message.textContent = notification.message;
    const time = document.createElement("small");
    time.textContent = new Date(notification.createdAt).toLocaleString("en-IN");
    content.append(title, message, time);
    item.append(content);
    if (!notification.readAt) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "Mark read";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const response = await fetch(`${API_BASE}/notifications/mine/${encodeURIComponent(notification._id)}/read`, { method: "PATCH", headers: authHeaders() });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Could not update notification");
          await loadNotifications();
        } catch (error) {
          errorRoot.textContent = error.message;
          button.disabled = false;
        }
      });
      item.append(button);
    }
    list.append(item);
  }
}

async function loadNotifications() {
  if (!getToken()) {
    notificationPanel.hidden = true;
    return;
  }
  notificationPanel.hidden = false;
  const response = await fetch(`${API_BASE}/notifications/mine`, { headers: authHeaders() });
  const data = await response.json();
  if (response.status === 401) return;
  if (!response.ok) throw new Error(data.error || "Could not load notifications");
  renderNotifications(data.notifications || [], data.unreadCount || 0);
}

async function loadLoyaltySummary() {
  if (!getToken()) return;
  const response = await fetch(API_BASE + "/customer/loyalty", { headers: authHeaders() });
  const data = await response.json();
  if (response.status === 401) return;
  if (!response.ok) throw new Error(data.error || "Could not load loyalty points");
  const loyalty = data.loyalty || {};
  const summary = document.querySelector(".order-summary");
  if (!summary) return;
  let card = document.querySelector("#summary-points")?.closest("div");
  if (!card) {
    card = document.createElement("div");
    card.innerHTML = '<span aria-hidden="true">✦</span><strong id="summary-points">0</strong><small>Foodway points</small>';
    summary.append(card);
  }
  card.querySelector("#summary-points").textContent = Number(loyalty.points || 0).toLocaleString("en-IN");
  card.title = loyalty.rewardMessage || "Points earned from delivered orders";
}

async function loadOrders(force = false) {
  if (!getToken()) { showOrdersSignIn(); return; }
  notificationPanel.hidden = false;
  if (!force && document.activeElement?.closest?.(".order-review-form, .order-help-form, .order-cancel-form")) return;
  if (orderRoot.dataset.loaded !== "true") showOrdersLoading();
  try {
    const response = await fetch(`${API_BASE}/orders/mine`, { headers: authHeaders() });
    const data = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      showOrdersSignIn("Your session expired. Sign in again to see your orders and delivery updates.");
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load orders");
    const orders = data.orders || [];
    renderOrders(orders);
    const active = orders.filter(order => !["delivered", "cancelled", "awaiting_payment"].includes(order.status)).length;
    const delivered = orders.filter(order => order.status === "delivered").length;
    document.querySelector("#summary-active")?.replaceChildren(document.createTextNode(String(active)));
    document.querySelector("#summary-delivered")?.replaceChildren(document.createTextNode(String(delivered)));
    document.querySelector("#summary-total")?.replaceChildren(document.createTextNode(String(orders.length)));
    loadLoyaltySummary().catch(error => { errorRoot.textContent = error.message; });
    errorRoot.textContent = "";
    const refreshed = document.querySelector("#order-refresh");
    if (refreshed) refreshed.textContent = `Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · Refreshes every 15 seconds`;
    if (new URLSearchParams(location.search).has("placed")) errorRoot.textContent = "Order placed. Follow its progress below.";
  } catch (error) {
    if (orderRoot.dataset.loaded !== "true") showOrdersLoadError();
    errorRoot.textContent = error.message;
  }
}

loadOrders();
loadNotifications().catch(error => { errorRoot.textContent = error.message; });
setInterval(() => {
  if (!getToken()) return;
  loadOrders();
  loadNotifications().catch(error => { errorRoot.textContent = error.message; });
}, 15000);
