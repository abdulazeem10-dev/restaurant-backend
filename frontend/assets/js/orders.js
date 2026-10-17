async function loadOrders() {
  const root = document.querySelector("#orders"); const error = document.querySelector("#error");
  if (!getToken()) { error.innerHTML = `Please <a href="login.html?next=orders.html">sign in</a> to view your orders.`; return; }
  try {
    const response = await fetch(`${API_BASE}/orders/mine`, { headers: authHeaders() });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load orders");
    if (!data.orders.length) { root.textContent = "You haven’t placed any orders yet."; return; }
    for (const order of data.orders) {
      const card = document.createElement("article");
      const lines = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join(", ");
      card.innerHTML = `<h3>${escapeHtml(order.restaurantId?.name || "Restaurant")}</h3><p>${lines}</p><p><strong>${escapeHtml(order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><small>${new Date(order.createdAt).toLocaleString("en-IN")}</small>`;
      root.append(card);
    }
  } catch (err) { error.textContent = err.message; }
}
if (new URLSearchParams(location.search).has("placed")) document.querySelector("#error").textContent = "Order placed. You can follow its status here.";
loadOrders();
