const msg = document.querySelector("#message");
const openingDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
let restaurantStaffRole = null;
let restaurantOrdersCache = [];
let restaurantCurrentUser = null;
let restaurantCurrentRestaurant = null;
const restaurantViewInfo = {
  overview: ["Overview", "A quick look at your restaurant workspace."],
  menu: ["Menu", "Manage dishes, prices, food types, and availability."],
  hours: ["Hours & cuisine", "Set your service hours and the cuisine customers use to find you."],
  "delivery-areas": ["Delivery areas", "Name the neighbourhoods you serve and assign their PIN codes."],
  accounts: ["Restaurant accounts", "Manage the three staff logins for your restaurant."],
  reviews: ["Customer reviews", "Read feedback from your customers."],
  orders: ["Incoming orders", "Review customer and delivery details and update order progress."],
  reports: ["Sales reports", "Track paid sales, completed orders, and best-selling dishes."],
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

const restaurantProfileForm = document.querySelector("#restaurant-profile-form");
if (restaurantProfileForm) restaurantProfileForm.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const values = new FormData(form);
  button.disabled = true;
  msg.textContent = "";
  try {
    const { restaurant, user } = await api("/restaurants/owner/profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(["restaurantName", "address", "ownerName", "email", "phone"].map(key => [key, values.get(key)])))
    });
    restaurantCurrentUser = user;
    restaurantCurrentRestaurant = restaurant;
  document.querySelector("#restaurant-title").textContent = restaurant.name;
    msg.textContent = "Restaurant and owner profile updated.";
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

const deactivateOwnProfileButton = document.querySelector("#deactivate-own-profile");
if (deactivateOwnProfileButton) deactivateOwnProfileButton.addEventListener("click", async () => {
  const confirmed = confirm("Deactivate your owner login and close the restaurant to new orders? Your account, restaurant data, and order history will be kept. You will need the platform admin to reactivate the profile.");
  if (!confirmed) return;
  deactivateOwnProfileButton.disabled = true;
  try {
    await api("/restaurants/owner/deactivate-profile", { method: "PATCH" });
    sessionStorage.removeItem(TOKEN_KEY);
    location.replace("../customer/login.html");
  } catch (error) {
    msg.textContent = error.message;
    deactivateOwnProfileButton.disabled = false;
  }
});

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
function renderDeliveryAreas(areas = [], legacyPincodes = []) {
  const root = document.querySelector("#delivery-areas-list");
  if (!root) return;
  root.replaceChildren();
  const entries = areas.length
    ? areas
    : legacyPincodes.length ? [{ name: "Delivery area", pincodes: legacyPincodes }] : [{ name: "", pincodes: [] }];
  for (const [index, area] of entries.entries()) {
    const row = document.createElement("fieldset");
    row.className = "delivery-area-row";
    const legend = document.createElement("legend");
    legend.textContent = `Area ${index + 1}`;
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Area name";
    const nameInput = document.createElement("input");
    nameInput.name = "deliveryAreaName";
    nameInput.type = "text";
    nameInput.maxLength = 80;
    nameInput.required = true;
    nameInput.placeholder = "e.g. Ulwe, Seawoods";
    nameInput.value = area.name || "";
    nameLabel.append(nameInput);
    const pinLabel = document.createElement("label");
    pinLabel.textContent = "6-digit PIN codes";
    const pinInput = document.createElement("input");
    pinInput.name = "deliveryAreaPincodes";
    pinInput.type = "text";
    pinInput.maxLength = 699;
    pinInput.placeholder = "400706, 400703";
    pinInput.value = (area.pincodes || []).join(", ");
    pinInput.setAttribute("aria-label", `PIN codes for area ${index + 1}`);
    pinLabel.append(pinInput);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "secondary delivery-area-remove";
    removeButton.textContent = "Remove area";
    removeButton.addEventListener("click", () => row.remove());
    row.append(legend, nameLabel, pinLabel, removeButton);
    root.append(row);
  }
}
function addDeliveryAreaRow() {
  const root = document.querySelector("#delivery-areas-list");
  const rows = [...root.querySelectorAll(".delivery-area-row")];
  const areas = rows.map(row => ({
    name: row.querySelector('[name="deliveryAreaName"]').value,
    pincodes: row.querySelector('[name="deliveryAreaPincodes"]').value.split(/[\s,;]+/).filter(Boolean)
  }));
  renderDeliveryAreas([...areas, { name: "", pincodes: [] }]);
}
async function loadMenu() {
  const { restaurant, items } = await api("/restaurants/owner/menu"); const root = document.querySelector("#menu-items"); root.replaceChildren();
  document.querySelector("#restaurant-title").textContent = restaurant.name;
  if (restaurantProfileForm) {
    restaurantProfileForm.elements.restaurantName.value = restaurant.name || "";
    restaurantProfileForm.elements.address.value = restaurant.address || "";
    restaurantProfileForm.elements.ownerName.value = restaurantCurrentUser?.name || "";
    restaurantProfileForm.elements.email.value = restaurantCurrentUser?.email || "";
    restaurantProfileForm.elements.phone.value = restaurantCurrentUser?.phone || "";
  }
  document.querySelector("#restaurant-state").textContent = `Status: ${restaurant.status} · ${restaurant.isOpenNow ? "Open for orders" : "Closed"}`;
  renderOpeningHours(restaurant.openingHours);
  document.querySelector('#delivery-times-form [name="prepTimeMinutes"]').value = restaurant.prepTimeMinutes || 30;
  document.querySelector('#delivery-times-form [name="deliveryTimeMinutes"]').value = restaurant.deliveryTimeMinutes || 30;
  renderDeliveryAreas(restaurant.deliveryAreas || [], restaurant.deliveryPincodes || []);
  document.querySelector('#cuisine-form [name="cuisine"]').value = restaurant.cuisine || "other";
  const toggle = document.querySelector("#open-toggle");
  if (restaurant.status === "approved" && (!restaurantStaffRole || restaurantStaffRole === "secondary_admin")) { toggle.hidden = false; toggle.textContent = restaurant.isOpen ? "Close restaurant" : "Open for orders"; toggle.onclick = async () => { try { await api("/restaurants/owner/open", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOpen: !restaurant.isOpen }) }); await loadMenu(); } catch (error) { msg.textContent = error.message; } }; }
  else { toggle.hidden = true; }
  const foodFilter = document.querySelector("#owner-food-filter").value;
  const visibleItems = foodFilter === "all" ? items : items.filter(item => item.foodType === foodFilter);
  const menuCategories = ["Indian", "North Indian", "South Indian", "Chinese", "Italian", "Pizza", "Fast Food", "Burger", "Biryani", "Noodles", "Rolls", "Shawarma", "Vada", "Dosa", "Momo", "Desserts", "Salads", "Other"];
  for (const item of visibleItems) {
    const card = document.createElement("article");
    const currentCategory = item.category || "Other";
    const matchingCategory = menuCategories.find(category => category.toLocaleLowerCase() === currentCategory.toLocaleLowerCase());
    const categoryOptions = [...menuCategories];
    if (!matchingCategory && currentCategory) categoryOptions.unshift(currentCategory);
    card.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p class="menu-item-summary">${escapeHtml(currentCategory)} · ${formatRupees(item.pricePaise)}</p><button type="button" class="secondary menu-edit-toggle">Edit dish details</button><form class="menu-edit-form" hidden><label>Dish name<input name="name" required maxlength="150" value="${escapeHtml(item.name)}"></label><label>Category / cuisine<select name="category" required>${categoryOptions.map(category => `<option value="${escapeHtml(category)}" ${category === (matchingCategory || currentCategory) ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label><label>Food type<select name="foodType" required><option value="veg" ${item.foodType === "veg" ? "selected" : ""}>Veg</option><option value="nonVeg" ${item.foodType === "nonVeg" ? "selected" : ""}>Non-Veg</option></select></label><label>Price in rupees<input name="price" type="number" min="0.01" step="0.01" required value="${(Number(item.pricePaise) / 100).toFixed(2)}"></label><label>Description<textarea name="description" maxlength="1000">${escapeHtml(item.description || "")}</textarea></label><label>Dish image URL (HTTPS)<input name="imageUrl" type="url" maxlength="2048" placeholder="https://…" value="${escapeHtml(item.imageUrl || "")}"></label><div class="menu-edit-actions"><button type="submit">Save changes</button><button type="button" class="secondary menu-edit-cancel">Cancel</button></div></form><p class="menu-item-actions"><label><input class="menu-availability" type="checkbox" ${item.available ? "checked" : ""}> Available to customers</label> <button type="button" class="secondary menu-delete">Delete</button></p>`;
    const editToggle = card.querySelector(".menu-edit-toggle");
    const editForm = card.querySelector(".menu-edit-form");
    editToggle.addEventListener("click", () => {
      editForm.hidden = !editForm.hidden;
      editToggle.textContent = editForm.hidden ? "Edit dish details" : "Close editor";
    });
    card.querySelector(".menu-edit-cancel").addEventListener("click", () => {
      editForm.reset();
      editForm.hidden = true;
      editToggle.textContent = "Edit dish details";
    });
    editForm.addEventListener("submit", async event => {
      event.preventDefault();
      const formData = new FormData(editForm);
      const saveButton = editForm.querySelector('button[type="submit"]');
      saveButton.disabled = true;
      msg.textContent = "";
      try {
        await api(`/restaurants/owner/menu/${item._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name").trim(),
            category: formData.get("category"),
            foodType: formData.get("foodType"),
            pricePaise: Math.round(Number(formData.get("price")) * 100),
            description: formData.get("description"),
            imageUrl: formData.get("imageUrl").trim()
          })
        });
        msg.textContent = `${formData.get("name").trim()} updated.`;
        await loadMenu();
      } catch (error) {
        msg.textContent = error.message;
        saveButton.disabled = false;
      }
    });
    const canEditMenu = restaurantStaffRole !== "viewer";
    if (!canEditMenu) {
      editToggle.remove();
      editForm.remove();
      card.querySelector(".menu-availability").closest("label").remove();
      card.querySelector(".menu-delete").remove();
    }
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
    if (canEditMenu) card.querySelector(".menu-delete").addEventListener("click", async () => { if (!confirm(`Delete ${item.name}?`)) return; try { await api(`/restaurants/owner/menu/${item._id}`, { method: "DELETE" }); await loadMenu(); } catch (error) { msg.textContent = error.message; } });
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
document.querySelector("#delivery-times-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const values = new FormData(form);
    await api("/restaurants/owner/service-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepTimeMinutes: Number(values.get("prepTimeMinutes")), deliveryTimeMinutes: Number(values.get("deliveryTimeMinutes")) })
    });
    msg.textContent = "Preparation and delivery estimates saved.";
  } catch (error) { msg.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector("#cuisine-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const cuisine = new FormData(form).get("cuisine");
    await api("/restaurants/owner/service-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuisine })
    });
    msg.textContent = "Restaurant cuisine saved.";
  } catch (error) { msg.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector("#delivery-area-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const deliveryAreas = [...form.querySelectorAll(".delivery-area-row")].map(row => ({
    name: row.querySelector('[name="deliveryAreaName"]').value.trim(),
    pincodes: row.querySelector('[name="deliveryAreaPincodes"]').value.split(/[\s,;]+/).filter(Boolean)
  })).filter(area => area.name || area.pincodes.length);
  if (deliveryAreas.some(area => !area.name || !area.pincodes.length)) {
    msg.textContent = "Give every delivery area a name and at least one PIN code.";
    return;
  }
  const deliveryPincodes = deliveryAreas.flatMap(area => area.pincodes);
  if (deliveryAreas.length > 50 || deliveryPincodes.length > 100) {
    msg.textContent = "You can add up to 50 areas and 100 PIN codes in total.";
    return;
  }
  if (deliveryPincodes.some(pincode => !/^\d{6}$/.test(pincode))) {
    msg.textContent = "Enter only valid 6-digit PIN codes, separated by commas.";
    return;
  }
  if (new Set(deliveryAreas.map(area => area.name.toLocaleLowerCase())).size !== deliveryAreas.length) {
    msg.textContent = "Each delivery area must have a unique name.";
    return;
  }
  if (new Set(deliveryPincodes).size !== deliveryPincodes.length) {
    msg.textContent = "A PIN code can belong to only one delivery area.";
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  msg.textContent = "";
  try {
    await api("/restaurants/owner/service-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryAreas })
    });
    msg.textContent = deliveryAreas.length ? "Named delivery areas saved." : "Delivery coverage cleared.";
    await loadMenu();
  } catch (error) {
    msg.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#add-delivery-area")?.addEventListener("click", addDeliveryAreaRow);

function setDefaultReportDates() {
  const form = document.querySelector("#reports-filter");
  if (form.elements.from.value && form.elements.to.value) return;
  const today = new Date();
  const from = new Date(today); from.setDate(today.getDate() - 6);
  const dateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  form.elements.from.value = dateValue(from);
  form.elements.to.value = dateValue(today);
}

async function loadReports() {
  const form = document.querySelector("#reports-filter");
  setDefaultReportDates();
  const params = new URLSearchParams({ from: form.elements.from.value, to: form.elements.to.value });
  const message = document.querySelector("#reports-message");
  message.textContent = "Loading report…";
  try {
    const data = await api(`/restaurants/owner/reports?${params}`);
    const summary = document.querySelector("#reports-summary");
    summary.replaceChildren();
    const paidSales = document.createElement("article"); paidSales.className = "report-metric";
    paidSales.innerHTML = `<span>Paid sales</span><strong>${formatRupees(data.summary.paidSalesPaise || 0)}</strong>`;
    const delivered = document.createElement("article"); delivered.className = "report-metric";
    delivered.innerHTML = `<span>Delivered orders</span><strong>${data.summary.delivered || 0}</strong>`;
    const total = document.createElement("article"); total.className = "report-metric";
    total.innerHTML = `<span>All orders</span><strong>${data.summary.orders || 0}</strong>`;
    const cancelled = document.createElement("article"); cancelled.className = "report-metric";
    cancelled.innerHTML = `<span>Cancelled</span><strong>${data.summary.cancelled || 0}</strong>`;
    summary.append(paidSales, delivered, total, cancelled);

    const statuses = document.querySelector("#report-status-counts"); statuses.replaceChildren();
    if (!data.statusCounts.length) statuses.textContent = "No orders in this date range.";
    else {
      const list = document.createElement("ul"); list.className = "report-status-list";
      const labels = { placed: "Order placed", confirmed: "Confirmed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Picked up", delivered: "Delivered", cancelled: "Cancelled" };
      for (const row of data.statusCounts) { const li = document.createElement("li"); li.textContent = `${labels[row._id] || row._id} · ${row.count}`; list.append(li); }
      statuses.append(list);
    }

    const daily = document.querySelector("#report-daily"); daily.replaceChildren();
    if (!data.daily.length) daily.textContent = "No orders in this date range.";
    else {
      const table = document.createElement("table"); table.className = "report-table";
      table.innerHTML = "<thead><tr><th>Date</th><th>Orders</th><th>Paid sales</th></tr></thead>";
      const tbody = document.createElement("tbody");
      for (const day of data.daily) { const row = document.createElement("tr"); row.innerHTML = `<td>${escapeHtml(new Date(`${day._id}T00:00:00`).toLocaleDateString("en-IN"))}</td><td>${day.orders}</td><td>${formatRupees(day.paidSalesPaise)}</td>`; tbody.append(row); }
      table.append(tbody); daily.append(table);
    }
    const top = document.querySelector("#report-top-items"); top.replaceChildren();
    if (!data.topItems.length) top.textContent = "No paid delivered dishes in this date range.";
    else {
      const list = document.createElement("ol"); list.className = "report-top-list";
      for (const item of data.topItems) { const li = document.createElement("li"); li.textContent = `${item.name} · ${item.quantity} sold · ${formatRupees(item.salesPaise)}`; list.append(li); }
      top.append(list);
    }
    message.textContent = `Report from ${form.elements.from.value} to ${form.elements.to.value}.`;
  } catch (error) { message.textContent = error.message; }
}

document.querySelector("#reports-filter").addEventListener("submit", event => { event.preventDefault(); loadReports(); });
function printRestaurantOrderBill(order) {
  const printWindow = window.open("", "_blank", "width=760,height=900");
  if (!printWindow) { msg.textContent = "Allow pop-ups to print the bill."; return; }
  const restaurantName = restaurantCurrentRestaurant?.name || document.querySelector("#restaurant-title")?.textContent || "Restaurant";
  const items = (order.items || []).map(item => "<tr><td>" + escapeHtml(item.name) + "</td><td>" + item.quantity + "</td><td>" + formatRupees(item.unitPricePaise) + "</td><td>" + formatRupees(item.unitPricePaise * item.quantity) + "</td></tr>").join("");
  const recipient = order.deliveryDetails;
  const address = [recipient?.flatBuilding, recipient?.lane, recipient?.landmark, recipient?.pincode].filter(Boolean).join(", ") || order.deliveryAddress || "—";
  const payment = order.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : order.paymentMethod === "upi_qr" ? "UPI QR" : "Online payment";
  const html = "<!doctype html><html><head><meta charset='utf-8'><title>Bill " + escapeHtml(order._id.slice(-6)) + "</title><style>body{font:14px Arial,sans-serif;color:#202521;max-width:720px;margin:32px auto;padding:0 24px}h1{margin:0 0 4px;font-size:26px}h2{margin:26px 0 8px;font-size:16px}p{margin:5px 0;color:#59635c;line-height:1.45}.bill-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #174b3d;padding-bottom:18px}.bill-meta{text-align:right}.bill-meta strong{display:block;color:#174b3d}.bill-box{margin-top:22px;padding:14px;border:1px solid #dfe2d9;border-radius:10px}.bill-box h2{margin-top:0}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{text-align:left;padding:9px 6px;border-bottom:1px solid #e9ece6}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.total{margin-top:14px;text-align:right;font-size:18px;font-weight:700}.footer{margin-top:34px;text-align:center;font-size:12px;color:#7a847c}@media print{body{margin:0;max-width:none}.no-print{display:none}}</style></head><body><div class='bill-head'><div><h1>" + escapeHtml(restaurantName) + "</h1><p>Order bill</p></div><div class='bill-meta'><strong>Order #" + escapeHtml(order._id.slice(-6)) + "</strong><span>" + escapeHtml(new Date(order.createdAt).toLocaleString("en-IN")) + "</span></div></div><div class='bill-box'><h2>Customer</h2><p><strong>" + escapeHtml(recipient?.name || order.customerId?.name || "Customer") + "</strong>" + (recipient?.phone ? " · " + escapeHtml(recipient.phone) : "") + "</p><p>" + escapeHtml(address) + "</p></div><h2>Items</h2><table><thead><tr><th>Dish</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody>" + items + "</tbody></table><p class='total'>Total: " + formatRupees(order.totalPaise) + "</p><div class='bill-box'><p><strong>Payment:</strong> " + escapeHtml(payment) + " · " + escapeHtml(order.paymentStatus || "pending") + "</p><p><strong>Delivery:</strong> " + escapeHtml(order.deliveryPartnerId?.name || "Assigned delivery person") + "</p></div><p class='footer'>Thank you for ordering from " + escapeHtml(restaurantName) + ".</p><button class='no-print' onclick='window.print()'>Print bill</button></body></html>";
  printWindow.document.write(html); printWindow.document.close(); printWindow.focus();
}

function filterRestaurantOrders(orders) {
  const query = document.querySelector("#order-search")?.value.trim().toLocaleLowerCase() || "";
  const status = document.querySelector("#order-status-filter")?.value || "all";
  return orders.filter(order => {
    const normalizedStatus = order.status === "confirmed" ? "placed" : order.status === "picked_up" ? "out_for_delivery" : order.status;
    if (status !== "all" && status !== normalizedStatus) return false;
    if (!query) return true;
    const searchable = [order._id.slice(-6), order.customerId?.name, order.customerId?.email, order.deliveryDetails?.name, order.deliveryDetails?.phone, order.items.map(item => item.name).join(" ")].filter(Boolean).join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
}

async function loadOrders(fetchLatest = true) {
  if (fetchLatest) {
    const data = await api("/orders/restaurant");
    restaurantOrdersCache = data.orders || [];
  }
  const orders = restaurantOrdersCache; const root = document.querySelector("#orders"); root.replaceChildren();
  const visibleOrders = filterRestaurantOrders(orders);
  const count = document.querySelector("#order-filter-count");
  if (count) count.textContent = `${visibleOrders.length} of ${orders.length} orders`;
  for (const order of visibleOrders) {
    const card = document.createElement("article"); const itemText = order.items.map(item => `${item.quantity} × ${item.name}`).join(", ");
    const recipient = order.deliveryDetails;
    const recipientText = recipient
      ? `${recipient.recipientType === "other" ? "Deliver to" : "Recipient"}: ${recipient.name} · ${recipient.phone}`
      : "";
    const deliveryPartnerText = order.deliveryPartnerId
      ? `Delivery person: ${order.deliveryPartnerId.name} · ${order.deliveryPartnerId.phone || "No phone on account"} · ${order.deliveryAssignmentStatus === "accepted" ? "Accepted" : order.deliveryAssignmentStatus === "offered" ? "Waiting for acceptance" : "Assigned"}`
      : order.deliveryAssignmentStatus === "unassigned" ? "No delivery person has accepted yet" : "Delivery person not assigned yet";
    const paymentLabel = order.paymentMethod === "cash_on_delivery"
      ? "Cash on delivery"
      : order.paymentMethod === "upi_qr"
        ? "UPI QR selected (not collected)"
        : "Online payment selected (not collected)";
    const paymentStatus = order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "failed" ? "Failed" : order.paymentStatus === "refunded" ? "Refunded" : order.paymentMethod === "cash_on_delivery" ? "Unpaid · due on delivery" : "Not paid · preference only";
    const receivedLabel = order.customerReceivedAt ? `Customer confirmed receipt ${new Date(order.customerReceivedAt).toLocaleString("en-IN")}` : "Awaiting customer receipt confirmation";
    const statusLabels = { placed: "Order placed", confirmed: "Order placed", preparing: "Preparing", ready: "Ready for pickup", out_for_delivery: "Out for delivery", picked_up: "Out for delivery", delivered: "Delivery done", cancelled: "Cancelled" };
    card.innerHTML = `<h3>Order ${escapeHtml(order._id.slice(-6))}</h3><p>${escapeHtml(order.customerId?.name || "Customer")} · ${escapeHtml(order.customerId?.email || "")}</p>${recipientText ? `<p>${escapeHtml(recipientText)}</p>` : ""}<p>${escapeHtml(itemText)}</p><p>Address: ${escapeHtml(order.deliveryAddress)}</p>${order.deliveryDetails?.deliveryAreaName ? `<p>Delivery area: ${escapeHtml(order.deliveryDetails.deliveryAreaName)}</p>` : ""}<p>${escapeHtml(deliveryPartnerText)}</p><p><strong>${escapeHtml(statusLabels[order.status] || order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment mode: ${paymentLabel} · ${paymentStatus}</p>${["delivered", "cancelled"].includes(order.status) ? `<p>${escapeHtml(receivedLabel)}</p>` : ""}`;
    if (order.deliveryAssignmentStatus === "accepted") {
      const printButton = document.createElement("button"); printButton.type = "button";
      printButton.className = "secondary order-print-bill"; printButton.textContent = "Print bill";
      printButton.addEventListener("click", () => printRestaurantOrderBill(order)); card.append(printButton);
    }
    if (order.deliveryAssignmentStatus === "offered") {
      const note = document.createElement("p");
      note.className = "muted";
      note.textContent = "Waiting for the delivery person to accept. The order cannot go out for delivery until accepted.";
      card.append(note);
    }
    if (order.deliveryAssignmentStatus === "unassigned" && restaurantStaffRole !== "viewer") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Assign another delivery person";
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        try {
          const result = await api(`/orders/restaurant/${encodeURIComponent(order._id)}/reassign-delivery`, { method: "PATCH" });
          msg.textContent = result.message;
          await loadOrders();
        } catch (error) { msg.textContent = error.message; retry.disabled = false; }
      });
      card.append(retry);
    }
    if (order.cancellationRequest?.status && order.cancellationRequest.status !== "none") {
      const request = order.cancellationRequest;
      const section = document.createElement("section"); section.className = "order-admin-request";
      const summary = document.createElement("p"); summary.textContent = `Cancellation request · ${request.status}: ${request.reason}${request.details ? ` — ${request.details}` : ""}`; section.append(summary);
      if (request.response) { const response = document.createElement("p"); response.textContent = `Response: ${request.response}`; section.append(response); }
      if (request.status === "pending" && restaurantStaffRole !== "viewer") {
        const form = document.createElement("form"); form.className = "order-admin-request-form";
        form.innerHTML = `<label>Response to customer <textarea name="response" rows="2" maxlength="500" placeholder="Optional explanation"></textarea></label><button type="submit" name="decision" value="approved">Approve cancellation</button><button type="submit" name="decision" value="declined" class="secondary">Decline</button>`;
        form.addEventListener("submit", async event => {
          event.preventDefault(); const decision = event.submitter?.value; if (!decision) return;
          form.querySelectorAll("button").forEach(button => { button.disabled = true; });
          try { await api(`/orders/restaurant/${order._id}/cancellation`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, response: new FormData(form).get("response") }) }); await loadOrders(); }
          catch (error) { msg.textContent = error.message; form.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
        }); section.append(form);
      }
      card.append(section);
    }
    for (const request of order.supportRequests || []) {
      const section = document.createElement("section"); section.className = "order-admin-request";
      const summary = document.createElement("p"); summary.textContent = `${request.category.replaceAll("_", " ")} · ${request.status}: ${request.message}`; section.append(summary);
      if (request.response) { const response = document.createElement("p"); response.textContent = `Response sent: ${request.response}`; section.append(response); }
      if (request.status === "open" && restaurantStaffRole !== "viewer") {
        const form = document.createElement("form"); form.className = "order-admin-request-form";
        form.innerHTML = `<label>Reply to customer <textarea name="response" rows="2" maxlength="1000" required placeholder="Explain how this was resolved"></textarea></label><button type="submit">Reply and resolve</button>`;
        form.addEventListener("submit", async event => {
          event.preventDefault(); const button = form.querySelector("button"); button.disabled = true;
          try { await api(`/orders/restaurant/${order._id}/help/${request._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: new FormData(form).get("response") }) }); await loadOrders(); }
          catch (error) { msg.textContent = error.message; button.disabled = false; }
        }); section.append(form);
      }
      card.append(section);
    }
    const next = { placed: ["preparing", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["out_for_delivery"] }[order.status] || [];
    if (order.deliveryAssignmentStatus && order.deliveryAssignmentStatus !== "accepted") {
      const deliveryIndex = next.indexOf("out_for_delivery");
      if (deliveryIndex >= 0) next.splice(deliveryIndex, 1);
    }
    if (order.paymentStatus === "paid") { const cancelIndex = next.indexOf("cancelled"); if (cancelIndex >= 0) next.splice(cancelIndex, 1); }
    const statusActionLabels = { preparing: "Start preparing", ready: "Ready for pickup", out_for_delivery: "Mark out for delivery", cancelled: "Cancel" };
    if (restaurantStaffRole !== "viewer") for (const status of next) { const button = document.createElement("button"); button.textContent = statusActionLabels[status] || `Mark ${status}`; if (status === "cancelled") button.className = "secondary"; button.addEventListener("click", async () => { try { await api(`/orders/restaurant/${order._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadOrders(); } catch (error) { msg.textContent = error.message; } }); card.append(button); }
    root.append(card);
  }
  if (!orders.length) root.textContent = "No orders yet.";
  else if (!visibleOrders.length) root.textContent = "No orders match your search or status filter.";
}
document.querySelector("#order-search")?.addEventListener("input", () => loadOrders(false).catch(error => { msg.textContent = error.message; }));
document.querySelector("#order-status-filter")?.addEventListener("change", () => loadOrders(false).catch(error => { msg.textContent = error.message; }));
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
  restaurantCurrentUser = user;
  const isStaffDashboard = location.pathname.endsWith("/staff-dashboard.html");
  if (user.role === "restaurant_staff" && !isStaffDashboard) { location.replace("staff-dashboard.html"); return; }
  if (user.role === "restaurant" && isStaffDashboard) { location.replace("dashboard.html"); return; }
  if (!isStaffDashboard && user.role !== "restaurant") { location.replace("../customer/login.html"); return; }
  if (isStaffDashboard && user.role !== "restaurant_staff") { location.replace("../customer/login.html"); return; }
  restaurantStaffRole = user.role === "restaurant_staff" ? user.restaurantStaffRole : null;
  const roleNames = { secondary_admin: "Secondary admin", biller_modifier: "Biller / modifier", viewer: "Viewer" };
  document.querySelector("#restaurant-role-badge").textContent = roleNames[restaurantStaffRole] || "Restaurant owner";
  if (restaurantStaffRole) {
    document.querySelector(".restaurant-brand-copy small").textContent = `${roleNames[restaurantStaffRole]} workspace`;
    document.querySelector(".restaurant-page-heading .eyebrow").textContent = "RESTAURANT STAFF WORKSPACE";
  }
  if (restaurantStaffRole) {
    const allowedViews = restaurantStaffRole === "secondary_admin"
      ? ["overview", "menu", "hours", "delivery-areas", "reviews", "orders", "reports", "notifications"]
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
    document.querySelector("#staff-management-panel-list").hidden = false;
    await loadStaffAccounts();
  }
  showRestaurantView("overview");
  const dashboardLoads = [loadMenu(), loadOrders(), loadReviews(), loadNotifications()];
  if (!restaurantStaffRole || restaurantStaffRole === "secondary_admin") dashboardLoads.push(loadReports());
  await Promise.all(dashboardLoads);
}
initializeRestaurantDashboard().catch(error => { msg.textContent = `${error.message}. Sign in with an approved restaurant account.`; });
setInterval(() => { if (getToken()) { loadOrders().catch(error => { msg.textContent = error.message; }); loadNotifications().catch(error => { msg.textContent = error.message; }); } }, 20000);
