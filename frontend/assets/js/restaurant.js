const msg = document.querySelector("#message");
if (!getToken()) location.href = "../customer/login.html";
document.querySelector("#logout").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); location.href = "../customer/login.html"; });
async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: authHeaders(options.headers || {}) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
async function loadMenu() {
  const { restaurant, items } = await api("/restaurants/owner/menu"); const root = document.querySelector("#menu-items"); root.replaceChildren();
  document.querySelector("#restaurant-title").textContent = restaurant.name;
  document.querySelector("#restaurant-state").textContent = `Status: ${restaurant.status} · ${restaurant.isOpen ? "Open for orders" : "Closed"}`;
  const toggle = document.querySelector("#open-toggle");
  if (restaurant.status === "approved") { toggle.hidden = false; toggle.textContent = restaurant.isOpen ? "Close restaurant" : "Open for orders"; toggle.onclick = async () => { try { await api("/restaurants/owner/open", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isOpen: !restaurant.isOpen }) }); await loadMenu(); } catch (error) { msg.textContent = error.message; } }; }
  else { toggle.hidden = true; }
  const foodFilter = document.querySelector("#owner-food-filter").value;
  const visibleItems = foodFilter === "all" ? items : items.filter(item => item.foodType === foodFilter);
  for (const item of visibleItems) {
    const card = document.createElement("article");
    card.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category)} · ${formatRupees(item.pricePaise)}</p><label>Food type <select class="menu-food-type"><option value="" disabled>Choose type</option><option value="veg">Veg</option><option value="nonVeg">Non-Veg</option></select></label><p><label><input type="checkbox" ${item.available ? "checked" : ""}> Available</label> <button type="button" class="secondary">Delete</button></p>`;
    const foodTypeSelect = card.querySelector(".menu-food-type");
    foodTypeSelect.value = item.foodType || "";
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
    card.querySelector("input").addEventListener("change", event => api(`/restaurants/owner/menu/${item._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ available: event.target.checked }) }).catch(error => { msg.textContent = error.message; }));
    card.querySelector("button").addEventListener("click", async () => { if (!confirm(`Delete ${item.name}?`)) return; try { await api(`/restaurants/owner/menu/${item._id}`, { method: "DELETE" }); await loadMenu(); } catch (error) { msg.textContent = error.message; } });
    root.append(card);
  }
  if (!items.length) root.textContent = "Add your first menu item above.";
  else if (!visibleItems.length) root.textContent = `No ${foodFilter === "veg" ? "Veg" : "Non-Veg"} dishes. Choose another filter.`;
}
document.querySelector("#owner-food-filter").addEventListener("change", () => loadMenu().catch(error => { msg.textContent = error.message; }));
async function loadOrders() {
  const { orders } = await api("/orders/restaurant"); const root = document.querySelector("#orders"); root.replaceChildren();
  for (const order of orders) {
    const card = document.createElement("article"); const itemText = order.items.map(item => `${item.quantity} × ${item.name}`).join(", ");
    const recipient = order.deliveryDetails;
    const recipientText = recipient
      ? `${recipient.recipientType === "other" ? "Deliver to" : "Recipient"}: ${recipient.name} · ${recipient.phone}`
      : "";
    const paymentLabel = order.paymentMethod === "razorpay" ? "Online payment" : "Cash on delivery";
    card.innerHTML = `<h3>Order ${escapeHtml(order._id.slice(-6))}</h3><p>${escapeHtml(order.customerId?.name || "Customer")} · ${escapeHtml(order.customerId?.email || "")}</p>${recipientText ? `<p>${escapeHtml(recipientText)}</p>` : ""}<p>${escapeHtml(itemText)}</p><p>Address: ${escapeHtml(order.deliveryAddress)}</p><p><strong>${escapeHtml(order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment: ${paymentLabel}</p>`;
    const next = { placed: ["confirmed", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["ready", "cancelled"] }[order.status] || [];
    for (const status of next) { const button = document.createElement("button"); button.textContent = status === "cancelled" ? "Cancel" : `Mark ${status}`; if (status === "cancelled") button.className = "secondary"; button.addEventListener("click", async () => { try { await api(`/orders/restaurant/${order._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadOrders(); } catch (error) { msg.textContent = error.message; } }); card.append(button); }
    root.append(card);
  }
  if (!orders.length) root.textContent = "No orders yet.";
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
Promise.all([loadMenu(), loadOrders()]).catch(error => { msg.textContent = `${error.message}. Sign in with an approved restaurant account.`; });
setInterval(() => { if (getToken()) loadOrders().catch(error => { msg.textContent = error.message; }); }, 20000);
