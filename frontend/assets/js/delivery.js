const deliveryRoot = document.querySelector("#deliveries");
const deliveryMessage = document.querySelector("#message");
const locationButton = document.querySelector("#location-sharing");
let locationWatchId = null;
let lastLocationSentAt = 0;
let locationUpdateInFlight = false;
let locationUpdateController = null;
const trackingMaps = [];

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

function stopLocationSharing(clearRemote = false) {
  if (locationWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchId);
  locationWatchId = null;
  locationUpdateController?.abort();
  locationUpdateController = null;
  locationButton.textContent = "Start sharing live location";
  locationButton.disabled = false;
  if (clearRemote && getToken()) {
    fetch(`${API_BASE}/orders/delivery/location`, { method: "DELETE", headers: authHeaders(), keepalive: true })
      .catch(() => { deliveryMessage.textContent = "Sharing stopped on this device. The last shared location will expire from customer view shortly."; });
  }
}

locationButton.addEventListener("click", () => {
  if (locationWatchId !== null) {
    stopLocationSharing(true);
    deliveryMessage.textContent = "Live location sharing stopped.";
    return;
  }
  if (!window.isSecureContext || !navigator.geolocation) {
    deliveryMessage.textContent = "Live location requires browser location access on HTTPS (or localhost).";
    return;
  }
  locationButton.disabled = true;
  deliveryMessage.textContent = "Waiting for location permission…";
  locationWatchId = navigator.geolocation.watchPosition(async position => {
    if (locationWatchId === null) return;
    locationButton.disabled = false;
    locationButton.textContent = "Stop sharing live location";
    if (locationUpdateInFlight || Date.now() - lastLocationSentAt < 12000) return;
    locationUpdateInFlight = true;
    locationUpdateController = new AbortController();
    try {
      const { updatedAt } = await deliveryApi("/orders/delivery/location", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        signal: locationUpdateController.signal
      });
      lastLocationSentAt = Date.now();
      deliveryMessage.textContent = `Live location shared at ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`;
    } catch (error) {
      if (error.name === "AbortError") return;
      deliveryMessage.textContent = error.message;
      if (error.message.includes("no active deliveries")) stopLocationSharing();
    } finally { locationUpdateInFlight = false; locationUpdateController = null; }
  }, error => {
    locationButton.disabled = false;
    deliveryMessage.textContent = error.code === error.PERMISSION_DENIED
      ? "Location permission was denied. Allow location access in your browser settings to share it."
      : "Could not read your location. Check that location services are enabled and try again.";
    stopLocationSharing(true);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  locationButton.disabled = false;
});

window.addEventListener("pagehide", () => stopLocationSharing(true));

function renderDelivery(order) {
  const card = document.createElement("article");
  card.className = "delivery-order-card";
  const items = order.items.map(item => `<li><span>${escapeHtml(item.name)}</span><strong>× ${Number(item.quantity) || 0}</strong></li>`).join("");
  const recipient = order.deliveryDetails || {};
  const restaurant = order.restaurantId || {};
  const customer = order.customerId || {};
  const stateLabels = { placed: "Order placed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Out for delivery", delivered: "Delivery done", cancelled: "Cancelled" };
  const state = stateLabels[order.status] || order.status.replaceAll("_", " ");
  const paymentMode = order.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : order.paymentMethod === "upi_qr" ? "UPI QR preference" : order.paymentMethod === "razorpay" ? "Online payment" : "UPI / card / net banking preference";
  const paymentState = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "failed" ? "Payment failed" : order.paymentStatus === "refunded" ? "Refunded" : order.paymentMethod === "cash_on_delivery" ? "Unpaid · collect cash on delivery" : "Not paid · selected preference only";
  const pickupMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address || "")}`;
  const deliveryMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress || "")}`;
  card.innerHTML = `<div class="delivery-card-heading"><div><p class="eyebrow">ORDER #${escapeHtml(order._id.slice(-6))}</p><h3>${escapeHtml(restaurant.name || "Restaurant")}</h3></div><span class="delivery-status-chip" data-status="${escapeHtml(order.status)}">${escapeHtml(state)}</span></div>
    <div class="delivery-trip-grid">
      <section class="delivery-stop"><span class="delivery-stop-number">01</span><div><p class="delivery-detail-label">Pickup from</p><strong>${escapeHtml(restaurant.address || "Pickup address unavailable")}</strong><a href="${pickupMap}" target="_blank" rel="noopener noreferrer">Open pickup in Maps ↗</a></div></section>
      <section class="delivery-stop"><span class="delivery-stop-number delivery-stop-number--drop">02</span><div><p class="delivery-detail-label">Deliver to ${recipient.recipientType === "other" ? "recipient" : "customer"}</p><strong>${escapeHtml(recipient.name || customer.name || "Customer")}</strong>${recipient.phone ? `<a href="tel:${encodeURIComponent(recipient.phone)}">Call ${escapeHtml(recipient.phone)}</a>` : ""}<span>${escapeHtml(order.deliveryAddress || "Delivery address unavailable")}${recipient.deliveryAreaName ? ` · ${escapeHtml(recipient.deliveryAreaName)}` : ""}${recipient.pincode ? ` · PIN ${escapeHtml(recipient.pincode)}` : ""}</span><a href="${deliveryMap}" target="_blank" rel="noopener noreferrer">Open delivery location in Maps ↗</a></div></section>
    </div>
    <section class="delivery-order-details"><div><p class="delivery-detail-label">Customer</p><strong>${escapeHtml(customer.name || "Customer")}</strong>${customer.email ? `<span>${escapeHtml(customer.email)}</span>` : ""}</div><div><p class="delivery-detail-label">Order items</p><ul class="delivery-item-list">${items}</ul></div></section>
    <section class="delivery-payment-summary"><div><p class="delivery-detail-label">Payment · ${escapeHtml(paymentMode)}</p><strong>${escapeHtml(paymentState)}</strong>${order.paymentCollectedAt ? `<span>Collected ${new Date(order.paymentCollectedAt).toLocaleString("en-IN")}</span>` : ""}</div><strong class="delivery-order-total">${formatRupees(order.totalPaise)}</strong></section>
    ${order.customerReceivedAt ? `<p class="delivery-receipt-note"><strong>Customer confirmed receipt</strong> · ${new Date(order.customerReceivedAt).toLocaleString("en-IN")}</p>` : order.status === "delivered" ? "<p class=\"delivery-receipt-note\">Waiting for customer to confirm receipt.</p>" : ""}`;

  if (["out_for_delivery", "picked_up"].includes(order.status)) {
    const tracking = document.createElement("section");
    tracking.className = "live-tracking-panel";
    const heading = document.createElement("h4");
    heading.textContent = "Live customer location";
    tracking.append(heading);
    const map = document.createElement("div");
    map.className = "live-order-map";
    map.setAttribute("role", "img");
    map.setAttribute("aria-label", "Live map showing your location and the customer-shared location");
    const hasCoordinates = [order.deliveryLocation, order.customerLocation].some(point => point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    if (hasCoordinates) {
      tracking.append(map);
      const leafletMap = createLiveTrackingMap(map, order.deliveryLocation, order.customerLocation);
      if (leafletMap) trackingMaps.push(leafletMap);
    } else {
      map.classList.add("is-empty");
      map.textContent = "The map appears when GPS location is shared.";
      tracking.append(map);
    }
    const customerNote = document.createElement("p");
    customerNote.className = "muted";
    customerNote.textContent = order.customerLocation?.updatedAt
      ? `Customer location shared · updated ${new Date(order.customerLocation.updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`
      : "The customer has not shared live location. Use the delivery address and Maps link above.";
    tracking.append(customerNote);
    card.append(tracking);
  }

  if (order.deliveryAssignmentStatus === "offered") {
    const offer = document.createElement("section");
    offer.className = "order-admin-request";
    const prompt = document.createElement("p");
    prompt.innerHTML = "<strong>New delivery offer</strong><br>Accept this order to take responsibility for the delivery, or decline to pass it to another driver.";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Accept delivery";
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "secondary";
    decline.textContent = "Decline";
    const respond = async action => {
      accept.disabled = true;
      decline.disabled = true;
      try {
        const result = await deliveryApi(`/orders/delivery/${encodeURIComponent(order._id)}/assignment`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action })
        });
        await loadDeliveries();
        deliveryMessage.textContent = result.message;
      } catch (error) {
        deliveryMessage.textContent = error.message;
        accept.disabled = false;
        decline.disabled = false;
      }
    };
    accept.addEventListener("click", () => respond("accept"));
    decline.addEventListener("click", () => respond("decline"));
    offer.append(prompt, accept, decline);
    card.append(offer);
  }

  let nextStatus = null;
  let actionLabel = "";
  const assignmentAccepted = order.deliveryAssignmentStatus === "accepted" || !order.deliveryAssignmentStatus;
  if (assignmentAccepted && (order.status === "out_for_delivery" || order.status === "picked_up")) { nextStatus = "delivered"; actionLabel = order.paymentMethod === "cash_on_delivery" && order.paymentStatus !== "paid" ? "Mark delivered & cash received" : "Mark delivered"; }
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
    const hasActiveRoute = orders.some(order => ["out_for_delivery", "picked_up"].includes(order.status));
    locationButton.disabled = !hasActiveRoute && locationWatchId === null;
    if (!hasActiveRoute && locationWatchId !== null) stopLocationSharing();
    while (trackingMaps.length) trackingMaps.pop()?.remove();
    deliveryRoot.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement("article");
      empty.className = "empty-state delivery-empty-state";
      const icon = document.createElement("span");
      icon.className = "empty-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "✓";
      const title = document.createElement("h3");
      title.textContent = "You’re all caught up";
      const note = document.createElement("p");
      note.textContent = "New delivery offers will appear here when a restaurant hands off an order.";
      empty.append(icon, title, note);
      deliveryRoot.append(empty);
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
