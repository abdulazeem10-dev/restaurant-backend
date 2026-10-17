const linesRoot = document.querySelector("#cart-lines");
function renderCart() {
  const cart = readCart(); linesRoot.replaceChildren();
  if (!cart?.items?.length) { linesRoot.textContent = "Your cart is empty."; document.querySelector("#checkout-form").hidden = true; document.querySelector("#total").textContent = ""; return; }
  document.querySelector("#checkout-form").hidden = false;
  let total = 0;
  for (const item of cart.items) {
    total += item.pricePaise * item.quantity;
    const row = document.createElement("article");
    row.innerHTML = `<strong>${escapeHtml(item.name)}</strong> · ${formatRupees(item.pricePaise)} <label>Qty <input type="number" min="1" max="20" value="${item.quantity}" style="width:5rem"></label> <button type="button" class="secondary">Remove</button>`;
    row.querySelector("input").addEventListener("change", event => { item.quantity = Math.max(1, Math.min(20, Number(event.target.value) || 1)); writeCart(cart); renderCart(); });
    row.querySelector("button").addEventListener("click", () => { cart.items = cart.items.filter(value => value.menuItemId !== item.menuItemId); if (!cart.items.length) localStorage.removeItem("food-platform-cart"); else writeCart(cart); renderCart(); });
    linesRoot.append(row);
  }
  document.querySelector("#total").textContent = `Items total: ${formatRupees(total)} · taxes and delivery fees are not included`;
}
document.querySelector("#checkout-form").addEventListener("submit", async event => {
  event.preventDefault(); const error = document.querySelector("#error"); error.textContent = "";
  if (!getToken()) { location.href = `login.html?next=${encodeURIComponent("cart.html")}`; return; }
  const cart = readCart(); if (!cart?.items?.length) return;
  const button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/orders`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ restaurantId: cart.restaurantId, deliveryAddress: new FormData(event.currentTarget).get("deliveryAddress"), items: cart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity })) }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not place order");
    localStorage.removeItem("food-platform-cart"); location.href = "orders.html?placed=1";
  } catch (err) { error.textContent = err.message; button.disabled = false; }
});
renderCart();
