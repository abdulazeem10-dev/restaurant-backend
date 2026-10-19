const msg = document.querySelector("#message");
const openingDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
let restaurantStaffRole = null;
const restaurantViewInfo = {
  overview: ["Overview", "A quick look at your restaurant workspace."],
  menu: ["Menu", "Manage dishes, prices, food types, and availability."],
  hours: ["Opening hours", "Set when your restaurant can accept orders."],
  "delivery-areas": ["Delivery areas", "Choose the PIN codes your restaurant delivers to."],
  accounts: ["Restaurant accounts", "Manage the three staff logins for your restaurant."],
  reviews: ["Customer reviews", "Read feedback from your customers."],
  orders: ["Incoming orders", "Review customer and delivery details and update order progress."],
  notifications: ["Notifications", "Order completion updates for your restaurant."]
};
function showRestaurantView(view) {
  if (!restaurantViewInfo[view]) return;
  const button = document.querySelector(`[data-restaurant-view="${view}"]`);
  if (!button || button.hidden) return;
  document.querySelectorAll("[data-restaurant-section]").forEach(section => {
    section.hidden = section.dataset.restaurantSection !== view;
  });
  document.querySelectorAll("[data-restaurant-view]").forEach(navButton => {
    if (navButton.dataset.restaurantView === view) navButton.setAttribute("aria-current", "page");
    else navButton.removeAttribute("aria-current");
  });
  document.querySelector("#restaurant-page-title").textContent = restaurantViewInfo[view][0];
  document.querySelector("#restaurant-page-description").textContent = restaurantViewInfo[view][1];
}
document.querySelectorAll("[data-restaurant-view]").forEach(button => button.addEventListener("click", () => showRestaurantView(button.dataset.restaurantView)));
document.querySelectorAll("[data-open-restaurant-view]").forEach(button => button.addEventListener("click", () => showRestaurantView(button.dataset.openRestaurantView)));
if (!getToken()) location.href = "../customer/login.html";
document.querySelector("#logout").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); location.href = "../customer/login.html"; });
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: authHeaders(options.headers || {}) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
async function loadNotifications() {
  const { notifications, unreadCount } = await api("/notifications/mine");
  const list = document.querySelector("#restaurant-notifications");
  const count = document.querySelector("#restaurant-notification-count");
  count.hidden = unreadCount < 1;
  count.textContent = String(unreadCount);
  list.replaceChildren();
  if (!notifications.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No notifications yet. Completed orders will appear here.";
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
          await api(`/notifications/mine/${encodeURIComponent(notification._id)}/read`, { method: "PATCH" });
          await loadNotifications();
        } catch (error) {
          msg.textContent = error.message;
          button.disabled = false;
        }
      });
      item.append(button);
    }
    list.append(item);
  }
}
const restaurantStaffRoles = [
  ["secondary_admin", "Secondary admin"],
  ["biller_modifier", "Biller / modifier"],
  ["viewer", "Viewer"]
];
async function loadStaffAccounts() {
  const { accounts } = await api("/restaurants/owner/staff");
  const list = document.querySelector("#owner-staff-list");
  const form = document.querySelector("#owner-staff-form");
  const roleSelect = form.elements.staffRole;
  const assignedRoles = new Set(accounts.map(account => account.restaurantStaffRole));
  const availableRoles = restaurantStaffRoles.filter(([key]) => !assignedRoles.has(key));
  list.replaceChildren();
  for (const account of accounts) {
    const item = document.createElement("li");
    const label = restaurantStaffRoles.find(([key]) => key === account.restaurantStaffRole)?.[1] || "Staff";
    const details = document.createElement("div");
    details.innerHTML = `<strong>${escapeHtml(label)}</strong><br>${escapeHtml(account.name)} · ${escapeHtml(account.email)}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!confirm(`Remove ${label} account for ${account.name}?`)) return;
      remove.disabled = true;
      try {
        await api(`/restaurants/owner/staff/${account._id}`, { method: "DELETE" });
        msg.textContent = `${label} account removed.`;
        await loadStaffAccounts();
      } catch (error) {
        msg.textContent = error.message;
        remove.disabled = false;
      }
    });
    item.append(details, remove);
    list.append(item);
  }
  roleSelect.replaceChildren(...availableRoles.map(([key, label]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    return option;
  }));
  form.hidden = availableRoles.length === 0;
  document.querySelector("#staff-roles-complete").hidden = availableRoles.length > 0;
}

document.querySelector("#owner-staff-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const values = new FormData(form);
  button.disabled = true;
  msg.textContent = "";
  try {
    const { account } = await api("/restaurants/owner/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(["staffRole", "name", "email", "phone", "password"].map(key => [key, values.get(key)])))
    });
    form.reset();
    msg.textContent = `${restaurantStaffRoles.find(([key]) => key === account.staffRole)?.[1] || "Staff"} login created for ${account.name}. Share the temporary password securely.`;
    await loadStaffAccounts();
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
function renderOpeningHours(schedule = {}) {
  const root = document.querySelector("#opening-hours-fields");
  root.replaceChildren();
  for (const day of openingDays) {
    const hours = schedule[day] || { closed: true, opensAt: "09:00", closesAt: "22:00" };
    const row = document.createElement("div");
    row.className = "opening-hours-row";
    row.innerHTML = `<strong>${day[0].toUpperCase()}${day.slice(1)}</strong><label class="opening-hours-closed"><input type="checkbox" name="${day}-closed" ${hours.closed ? "checked" : ""}> Closed</label><label>Opens <input type="time" name="${day}-opens" value="${escapeHtml(hours.opensAt || "09:00")}" ${hours.closed ? "disabled" : ""} required></label><label>Closes <input type="time" name="${day}-closes" value="${escapeHtml(hours.closesAt || "22:00")}" ${hours.closed ? "disabled" : ""} required></label>`;
    const closedInput = row.querySelector(`[name="${day}-closed"]`);
    closedInput.addEventListener("change", () => {
      row.querySelector(`[name="${day}-opens"]`).disabled = closedInput.checked;
      row.querySelector(`[name="${day}-closes"]`).disabled = closedInput.checked;
    });
    root.append(row);
  }
}
async function loadMenu() {
  const { restaurant, items } = await api("/restaurants/owner/menu"); const root = document.querySelector("#menu-items"); root.replaceChildren();
  document.querySelector("#restaurant-title").textContent = restaurant.name;
  document.querySelector("#restaurant-state").textContent = `Status: ${restaurant.status} · ${restaurant.isOpenNow ? "Open for orders" : "Closed"}`;
  renderOpeningHours(restaurant.openingHours);
  document.querySelector("#delivery-pincodes").value = (restaurant.deliveryPincodes || []).join(", ");
  const toggle = document.querySelector("#open-toggle");
  if (restaurant.status === "approved" && (!restaurantStaffRole || restaurantStaffRole === "secondary_admin")) { toggle.hidden = false; toggle.textContent = restaurant.isOpen ? "Close restaurant" : "Open for orders"; toggle.onclick = async () => { try { await api("/restaurants/owner/open", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOpen: !restaurant.isOpen }) }); await loadMenu(); } catch (error) { msg.textContent = error.message; } }; }
  else { toggle.hidden = true; }
  const foodFilter = document.querySelector("#owner-food-filter").value;
  const visibleItems = foodFilter === "all" ? items : items.filter(item => item.foodType === foodFilter);
  for (const item of visibleItems) {
    const card = document.createElement("article");
    card.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category)} · ${formatRupees(item.pricePaise)}</p><label>Food type <select class="menu-food-type"><option value="" disabled>Choose type</option><option value="veg">Veg</option><option value="nonVeg">Non-Veg</option></select></label><p><label><input class="menu-availability" type="checkbox" ${item.available ? "checked" : ""}> Available to customers</label> <button type="button" class="secondary">Delete</button></p>`;
    const foodTypeSelect = card.querySelector(".menu-food-type");
    foodTypeSelect.value = item.foodType || "";
    const canEditMenu = restaurantStaffRole !== "viewer";
    if (!canEditMenu) {
      card.querySelector("label").remove();
      card.querySelector(".menu-availability").closest("label").remove();
      card.querySelector("button").remove();
    }
    foodTypeSelect.addEventListener("change", async () => {
      foodTypeSelect.disabled = true;
      try {
        await api(`/restaurants/owner/menu/${item._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foodType: foodTypeSelect.value }) });
        msg.textContent = `${item.name} marked ${foodTypeSelect.value === "veg" ? "Veg" : "Non-Veg"}.`;
        await loadMenu();
      } catch (error) {
        msg.textContent = error.message;
        foodTypeSelect.value = item.foodType || "";
      } finally {
        foodTypeSelect.disabled = false;
      }
    });
    if (item.imageUrl) {
      const image = document.createElement("img");
      image.src = item.imageUrl;
      image.alt = item.name;
      image.loading = "lazy";
      image.className = "dish-image-preview";
      image.addEventListener("error", () => image.remove(), { once: true });
      card.prepend(image);
    }
    const availability = card.querySelector(".menu-availability");
    availability.addEventListener("change", async () => {
      const nextAvailability = availability.checked;
      availability.disabled = true;
      msg.textContent = "";
      try {
        await api(`/restaurants/owner/menu/${item._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available: nextAvailability }) });
        msg.textContent = `${item.name} is ${nextAvailability ? "now available" : "now hidden from customers"}.`;
      } catch (error) {
        availability.checked = !nextAvailability;
        msg.textContent = error.message;
      } finally {
        availability.disabled = false;
      }
    });
    if (canEditMenu) card.querySelector("button").addEventListener("click", async () => { if (!confirm(`Delete ${item.name}?`)) return; try { await api(`/restaurants/owner/menu/${item._id}`, { method: "DELETE" }); await loadMenu(); } catch (error) { msg.textContent = error.message; } });
    root.append(card);
  }
  if (!items.length) root.textContent = "Add your first menu item above.";
  else if (!visibleItems.length) root.textContent = `No ${foodFilter === "veg" ? "Veg" : "Non-Veg"} dishes. Choose another filter.`;
}
document.querySelector("#owner-food-filter").addEventListener("change", () => loadMenu().catch(error => { msg.textContent = error.message; }));
document.querySelector("#hours-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const openingHours = Object.fromEntries(openingDays.map(day => {
    const closed = form.elements[`${day}-closed`].checked;
    return [day, {
      closed,
      opensAt: form.elements[`${day}-opens`].value || "09:00",
      closesAt: form.elements[`${day}-closes`].value || "22:00"
    }];
  }));
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  msg.textContent = "";
  try {
    await api("/restaurants/owner/service-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingHours })
    });
    msg.textContent = "Opening hours saved.";
    await loadMenu();
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#delivery-area-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const text = new FormData(form).get("deliveryPincodes");
  const deliveryPincodes = String(text).split(/[\s,;]+/).filter(Boolean);
  if (deliveryPincodes.some(pincode => !/^\d{6}$/.test(pincode))) {
    msg.textContent = "Enter only valid 6-digit PIN codes, separated by commas.";
    return;
  }
  if (deliveryPincodes.length > 100) {
    msg.textContent = "You can add up to 100 delivery PIN codes.";
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  msg.textContent = "";
  try {
    await api("/restaurants/owner/service-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryPincodes })
    });
    msg.textContent = deliveryPincodes.length ? "Delivery areas saved." : "Delivery PIN restrictions cleared.";
    await loadMenu();
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
async function loadOrders() {
  const { orders } = await api("/orders/restaurant"); const root = document.querySelector("#orders"); root.replaceChildren();
  for (const order of orders) {
    const card = document.createElement("article"); const itemText = order.items.map(item => `${item.quantity} × ${item.name}`).join(", ");
    const recipient = order.deliveryDetails;
    const recipientText = recipient
      ? `${recipient.recipientType === "other" ? "Deliver to" : "Recipient"}: ${recipient.name} · ${recipient.phone}`
      : "";
    const deliveryPartnerText = order.deliveryPartnerId
      ? `Delivery person: ${order.deliveryPartnerId.name} · ${order.deliveryPartnerId.phone || "No phone on account"}`
      : "Delivery person not assigned yet";
    const paymentLabel = order.paymentMethod === "cash_on_delivery"
      ? "Cash on delivery"
      : order.paymentMethod === "upi_qr"
        ? "UPI QR selected (not collected)"
        : "Online payment selected (not collected)";
    const paymentStatus = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "failed" ? "Failed" : order.paymentStatus === "refunded" ? "Refunded" : order.paymentMethod === "cash_on_delivery" ? "Unpaid · due on delivery" : "Not paid · preference only";
    const receivedLabel = order.customerReceivedAt ? `Customer confirmed receipt ${new Date(order.customerReceivedAt).toLocaleString("en-IN")}` : "Awaiting customer receipt confirmation";
    const statusLabels = { placed: "Order placed", confirmed: "Order placed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Out for delivery", delivered: "Delivery done", cancelled: "Cancelled" };
    card.innerHTML = `<h3>Order ${escapeHtml(order._id.slice(-6))}</h3><p>${escapeHtml(order.customerId?.name || "Customer")} · ${escapeHtml(order.customerId?.email || "")}</p>${recipientText ? `<p>${escapeHtml(recipientText)}</p>` : ""}<p>${escapeHtml(itemText)}</p><p>Address: ${escapeHtml(order.deliveryAddress)}</p><p>${escapeHtml(deliveryPartnerText)}</p><p><strong>${escapeHtml(statusLabels[order.status] || order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment mode: ${paymentLabel} · ${paymentStatus}</p>${["delivered", "cancelled"].includes(order.status) ? `<p>${escapeHtml(receivedLabel)}</p>` : ""}`;
    const next = { placed: ["preparing", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["out_for_delivery"] }[order.status] || [];
    const statusActionLabels = { preparing: "Start preparing", ready: "Ready for pickup", out_for_delivery: "Mark out for delivery", cancelled: "Cancel" };
    if (restaurantStaffRole !== "viewer") for (const status of next) { const button = document.createElement("button"); button.textContent = statusActionLabels[status] || `Mark ${status}`; if (status === "cancelled") button.className = "secondary"; button.addEventListener("click", async () => { try { await api(`/orders/restaurant/${order._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadOrders(); } catch (error) { msg.textContent = error.message; } }); card.append(button); }
    root.append(card);
  }
  if (!orders.length) root.textContent = "No orders yet.";
}
async function loadReviews() {
  const root = document.querySelector("#owner-reviews");
  const { reviews } = await api("/reviews/restaurant/mine");
  root.replaceChildren();
  if (!reviews.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No customer reviews yet. Reviews appear after customers submit them for ready orders.";
    root.append(empty);
    return;
  }
  for (const review of reviews) {
    const card = document.createElement("article");
    card.className = "review-card";
    const top = document.createElement("div");
    top.className = "review-card-top";
    const customer = document.createElement("strong");
    customer.textContent = review.customerName;
    const stars = document.createElement("span");
    stars.className = "review-stars";
    stars.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)} · ${review.rating}/5`;
    top.append(customer, stars);
    card.append(top);
    if (review.comment) {
      const comment = document.createElement("p");
      comment.textContent = review.comment;
      card.append(comment);
    }
    const date = document.createElement("small");
    date.className = "muted";
    date.textContent = new Date(review.createdAt).toLocaleDateString("en-IN");
    card.append(date);
    root.append(card);
  }
}
document.querySelector("#menu-form").addEventListener("submit", async event => {
  event.preventDefault();
  msg.textContent = "";
  const menuForm = event.currentTarget;
  const form = new FormData(menuForm);
  const submitButton = menuForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    await api("/restaurants/owner/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        category: form.get("category"),
        foodType: form.get("foodType"),
        description: form.get("description"),
        imageUrl: form.get("imageUrl"),
        pricePaise: Math.round(Number(form.get("price")) * 100),
        available: true
      })
    });
  } catch (error) {
    msg.textContent = error.message;
    submitButton.disabled = false;
    return;
  }

  menuForm.reset();
  msg.textContent = "Menu item added.";
  try {
    await loadMenu();
  } catch (error) {
    msg.textContent = `Menu item added, but the list could not refresh: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});
async function initializeRestaurantDashboard() {
  const { user } = await api("/auth/me");
  const isStaffDashboard = location.pathname.endsWith("/staff-dashboard.html");
  if (user.role === "restaurant_staff" && !isStaffDashboard) { location.replace("staff-dashboard.html"); return; }
  if (user.role === "restaurant" && isStaffDashboard) { location.replace("dashboard.html"); return; }
  if (!isStaffDashboard && user.role !== "restaurant") { location.replace("../customer/login.html"); return; }
  if (isStaffDashboard && user.role !== "restaurant_staff") { location.replace("../customer/login.html"); return; }
  restaurantStaffRole = user.role === "restaurant_staff" ? user.restaurantStaffRole : null;
  const roleNames = { secondary_admin: "Secondary admin", biller_modifier: "Biller / modifier", viewer: "Viewer" };
  document.querySelector("#restaurant-role-badge").textContent = roleNames[restaurantStaffRole] || "Restaurant owner";
  if (restaurantStaffRole) {
    document.querySelector(".restaurant-brand span").textContent = `${roleNames[restaurantStaffRole]} workspace`;
    document.querySelector(".restaurant-page-heading .eyebrow").textContent = "RESTAURANT STAFF WORKSPACE";
  }
  if (restaurantStaffRole) {
    const allowedViews = restaurantStaffRole === "secondary_admin"
      ? ["overview", "menu", "hours", "delivery-areas", "reviews", "orders", "notifications"]
      : ["overview", "menu", "reviews", "orders", "notifications"];
    document.querySelectorAll("[data-restaurant-view]").forEach(button => {
      button.hidden = !allowedViews.includes(button.dataset.restaurantView);
    });
    document.querySelectorAll("[data-restaurant-section]").forEach(section => {
      if (!allowedViews.includes(section.dataset.restaurantSection)) section.hidden = true;
    });
    if (restaurantStaffRole === "viewer") document.querySelector("#menu-form").hidden = true;
  } else if (user.role === "restaurant") {
    document.querySelector("#staff-management-panel").hidden = false;
    await loadStaffAccounts();
  }
  showRestaurantView("overview");
  await Promise.all([loadMenu(), loadOrders(), loadReviews(), loadNotifications()]);
}
initializeRestaurantDashboard().catch(error => { msg.textContent = `${error.message}. Sign in with an approved restaurant account.`; });
setInterval(() => { if (getToken()) { loadOrders().catch(error => { msg.textContent = error.message; }); loadNotifications().catch(error => { msg.textContent = error.message; }); } }, 20000);
