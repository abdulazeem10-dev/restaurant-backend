const paymentCart = readCart();
const paymentError = document.querySelector("#payment-error");
const confirmOrderButton = document.querySelector("#confirm-order");
const paymentChoices = [...document.querySelectorAll("[data-payment-choice]")];
let checkout = null;

try {
  checkout = JSON.parse(sessionStorage.getItem("food-platform-checkout") || "null");
} catch {
  checkout = null;
}

function showPaymentError(message) {
  paymentError.textContent = message;
}

function selectedPaymentMethod() {
  return document.querySelector('input[name="paymentMethod"]:checked')?.value || "cash_on_delivery";
}

function updatePaymentChoice() {
  const method = selectedPaymentMethod();
  paymentChoices.forEach(choice => choice.classList.toggle("payment-option-selected", choice.querySelector("input")?.checked));
  const online = method === "online";
  document.querySelector("#payment-total-label").textContent = "Order total";
  document.querySelector("#payment-security-note").textContent = online
    ? "Online payment selected as your preference. No payment is collected on this page."
    : method === "upi_qr"
      ? "UPI QR selected as your preference. No QR code or payment is generated on this page."
      : "Cash on delivery selected. Pay the delivery partner when your order arrives.";
  confirmOrderButton.textContent = "Place order";
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

async function createOrder(paymentMethod) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      restaurantId: paymentCart.restaurantId,
      deliveryAddress: checkout.deliveryAddress,
      deliveryDetails: checkout.deliveryDetails,
      paymentMethod,
      items: paymentCart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not place your order");
  const order = data.order;
  document.querySelector("#payment-total").textContent = formatRupees(order.totalPaise);
  return order;
}

async function placeOrder() {
  await createOrder(selectedPaymentMethod());
  localStorage.removeItem("food-platform-cart");
  sessionStorage.removeItem("food-platform-checkout");
  location.href = "orders.html?placed=1";
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
  try {
    await placeOrder();
  } catch (error) {
    showPaymentError(error.message);
  } finally {
    confirmOrderButton.disabled = false;
    updatePaymentChoice();
  }
});

paymentChoices.forEach(choice => choice.querySelector("input").addEventListener("change", updatePaymentChoice));
renderPaymentSummary();
updatePaymentChoice();
