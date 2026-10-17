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
  for (const item of items) {
    const card = document.createElement("article");
    card.innerHTML = `<h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.category)} · ${formatRupees(item.pricePaise)}</p><label><input type="checkbox" ${item.available ? "checked" : ""}> Available</label> <button type="button" class="secondary">Delete</button>`;
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
}
async function loadOrders() {
  const { orders } = await api("/orders/restaurant"); const root = document.querySelector("#orders"); root.replaceChildren();
  for (const order of orders) {
    const card = document.createElement("article"); const itemText = order.items.map(item => `${item.quantity} × ${item.name}`).join(", ");
    card.innerHTML = `<h3>Order ${escapeHtml(order._id.slice(-6))}</h3><p>${escapeHtml(order.customerId?.name || "Customer")} · ${escapeHtml(order.customerId?.email || "")}</p><p>${escapeHtml(itemText)}</p><p>Address: ${escapeHtml(order.deliveryAddress)}</p><p><strong>${escapeHtml(order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p>`;
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
