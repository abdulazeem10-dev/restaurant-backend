const paymentCart = readCart();
const paymentError = document.querySelector("#payment-error");
const confirmOrderButton = document.querySelector("#confirm-order");
let checkout = null;

try {
  checkout = JSON.parse(sessionStorage.getItem("food-platform-checkout") || "null");
} catch {
  checkout = null;
}

function showPaymentError(message) {
  paymentError.textContent = message;
}

function renderPaymentSummary() {
  if (!paymentCart?.items?.length || !checkout?.deliveryDetails || !checkout?.deliveryAddress) {
    showPaymentError("Your checkout details have expired. Return to your cart and enter your delivery details again.");
    confirmOrderButton.disabled = true;
    return;
  }

  const itemsRoot = document.querySelector("#payment-items");
  let subtotal = 0;
  for (const item of paymentCart.items) {
    const lineTotal = item.pricePaise * item.quantity;
    subtotal += lineTotal;
    const line = document.createElement("div");
    line.className = "payment-item-line";
    const name = document.createElement("span");
    name.textContent = `${item.quantity} × ${item.name}`;
    const price = document.createElement("strong");
    price.textContent = formatRupees(lineTotal);
    line.append(name, price);
    itemsRoot.append(line);
  }

  document.querySelector("#payment-restaurant").textContent = paymentCart.restaurantName || "Your order";
  document.querySelector("#payment-recipient").textContent = `${checkout.deliveryDetails.name} · ${checkout.deliveryDetails.phone}`;
  document.querySelector("#payment-address").textContent = checkout.deliveryAddress;
  document.querySelector("#payment-total").textContent = formatRupees(subtotal);
}

confirmOrderButton.addEventListener("click", async () => {
  showPaymentError("");
  if (!getToken()) {
    location.href = `login.html?next=${encodeURIComponent("cart.html")}`;
    return;
  }
  if (!paymentCart?.items?.length || !checkout?.deliveryDetails || !checkout?.deliveryAddress) {
    renderPaymentSummary();
    return;
  }

  confirmOrderButton.disabled = true;
  confirmOrderButton.textContent = "Placing your order…";
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        restaurantId: paymentCart.restaurantId,
        deliveryAddress: checkout.deliveryAddress,
        deliveryDetails: checkout.deliveryDetails,
        paymentMethod: "cash_on_delivery",
        items: paymentCart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not place your order");
    localStorage.removeItem("food-platform-cart");
    sessionStorage.removeItem("food-platform-checkout");
    location.href = "orders.html?placed=1";
  } catch (error) {
    showPaymentError(error.message);
    confirmOrderButton.disabled = false;
    confirmOrderButton.textContent = "Place cash-on-delivery order";
  }
});

renderPaymentSummary();
