const linesRoot = document.querySelector("#cart-lines");
const checkoutForm = document.querySelector("#checkout-form");

function renderCart() {
  const cart = readCart();
  updateCartCount();
  linesRoot.replaceChildren();

  if (!cart?.items?.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state cart-empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "🛍️";
    const title = document.createElement("h3");
    title.textContent = "Your cart is empty";
    const message = document.createElement("p");
    message.textContent = "Find something delicious from a local restaurant.";
    const link = document.createElement("a");
    link.className = "hero-cta";
    link.href = "index.html#restaurant-listing";
    link.textContent = "Explore restaurants";
    empty.append(icon, title, message, link);
    linesRoot.append(empty);
    checkoutForm.hidden = true;
    document.querySelector("#total").replaceChildren();
    return;
  }

  checkoutForm.hidden = false;
  let total = 0;
  for (const item of cart.items) {
    total += item.pricePaise * item.quantity;
    const row = document.createElement("article");
    row.className = "cart-line-card";

    const itemDetails = document.createElement("div");
    itemDetails.className = "cart-line-details";
    const name = document.createElement("h3");
    name.textContent = item.name;
    const unitPrice = document.createElement("p");
    unitPrice.className = "muted";
    unitPrice.textContent = `${formatRupees(item.pricePaise)} each`;
    itemDetails.append(name, unitPrice);

    const controls = document.createElement("div");
    controls.className = "cart-line-controls";
    const quantityLabel = document.createElement("span");
    quantityLabel.className = "cart-quantity-label";
    quantityLabel.textContent = "Quantity";
    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.className = "quantity-button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Remove one ${item.name}`);
    const quantity = document.createElement("output");
    quantity.className = "quantity-value";
    quantity.textContent = String(item.quantity);
    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = "quantity-button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Add one ${item.name}`);

    decrease.disabled = item.quantity <= 1;
    increase.disabled = item.quantity >= 20;
    decrease.addEventListener("click", () => updateCartQuantity(cart, item, item.quantity - 1));
    increase.addEventListener("click", () => updateCartQuantity(cart, item, item.quantity + 1));
    quantityControl.append(decrease, quantity, increase);
    const linePrice = document.createElement("strong");
    linePrice.className = "cart-line-total";
    linePrice.textContent = formatRupees(item.pricePaise * item.quantity);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cart-remove-button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${item.name} from cart`);
    remove.addEventListener("click", () => removeCartItem(cart, item));

    controls.append(quantityLabel, quantityControl, linePrice, remove);
    row.append(itemDetails, controls);
    linesRoot.append(row);
  }

  const totalBlock = document.querySelector("#total");
  totalBlock.replaceChildren();
  const totalLabel = document.createElement("span");
  totalLabel.textContent = "Item subtotal";
  const totalValue = document.createElement("strong");
  totalValue.textContent = formatRupees(total);
  const totalNote = document.createElement("small");
  totalNote.textContent = "Taxes and delivery fees are not included.";
  totalBlock.append(totalLabel, totalValue, totalNote);
}

function updateCartQuantity(cart, item, quantity) {
  item.quantity = Math.max(1, Math.min(20, quantity));
  writeCart(cart);
  renderCart();
}

function removeCartItem(cart, item) {
  cart.items = cart.items.filter(value => value.menuItemId !== item.menuItemId);
  if (!cart.items.length) localStorage.removeItem("food-platform-cart");
  else writeCart(cart);
  renderCart();
}

checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.querySelector("#error");
  error.textContent = "";
  if (!getToken()) {
    location.href = `login.html?next=${encodeURIComponent("cart.html")}`;
    return;
  }

  const cart = readCart();
  if (!cart?.items?.length) return;
  const button = checkoutForm.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Placing order…";

  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        restaurantId: cart.restaurantId,
        deliveryAddress: new FormData(checkoutForm).get("deliveryAddress"),
        items: cart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not place order");
    localStorage.removeItem("food-platform-cart");
    location.href = "orders.html?placed=1";
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
    button.textContent = "Place order";
  }
});

renderCart();
