const paymentCart = readCart();
const paymentError = document.querySelector("#payment-error");
const confirmOrderButton = document.querySelector("#confirm-order");
const paymentChoices = [...document.querySelectorAll("[data-payment-choice]")];
let checkout = null;
const ORDER_IDEMPOTENCY_KEY = "food-platform-order-idempotency-key";

function getOrderIdempotencyKey() {
  let key = sessionStorage.getItem(ORDER_IDEMPOTENCY_KEY);
  if (!key) {
    if (crypto.randomUUID) {
      key = crypto.randomUUID();
    } else {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
      key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    sessionStorage.setItem(ORDER_IDEMPOTENCY_KEY, key);
  }
  return key;
}

try {
  checkout = JSON.parse(sessionStorage.getItem("food-platform-checkout") || "null");
} catch {
  checkout = null;
}

function showPaymentError(message) {
  paymentError.textContent = message;
}

function selectedPaymentMethod() {
  return document.querySelector('input[name="paymentMethod"]:checked:not(:disabled)')?.value || "cash_on_delivery";
}

function updatePaymentChoice() {
  const method = selectedPaymentMethod();
  sessionStorage.setItem("food-platform-payment-method", method);
  paymentChoices.forEach(choice => {
    const input = choice.querySelector("input");
    choice.classList.toggle("payment-option-selected", Boolean(input?.checked && !input.disabled));
  });
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
  const area = document.querySelector("#payment-delivery-area");
  area.hidden = !checkout.deliveryDetails.deliveryAreaName;
  area.textContent = checkout.deliveryDetails.deliveryAreaName ? `Restaurant service area: ${checkout.deliveryDetails.deliveryAreaName}` : "";
  document.querySelector("#payment-total").textContent = formatRupees(subtotal);
}

async function createOrder(paymentMethod) {
  const response = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", "Idempotency-Key": getOrderIdempotencyKey() }),
    body: JSON.stringify({
      restaurantId: paymentCart.restaurantId,
      deliveryAddress: checkout.deliveryAddress,
      deliveryDetails: Object.fromEntries(["recipientType", "name", "phone", "flatBuilding", "lane", "landmark", "pincode"].map(key => [key, checkout.deliveryDetails[key]])),
      paymentMethod,
      items: paymentCart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
    })
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    location.replace(`login.html?next=${encodeURIComponent("payment.html")}`);
    throw new Error("Your sign-in expired. Sign in again to finish placing your order.");
  }
  if (!response.ok) throw new Error(data.error || "Could not place your order");
  const order = data.order;
  document.querySelector("#payment-total").textContent = formatRupees(order.totalPaise);
  return order;
}

async function placeOrder() {
  await createOrder(selectedPaymentMethod());
  localStorage.removeItem("food-platform-cart");
  sessionStorage.removeItem("food-platform-checkout");
  sessionStorage.removeItem(ORDER_IDEMPOTENCY_KEY);
  sessionStorage.removeItem("food-platform-payment-method");
  location.href = "orders.html?placed=1";
}

confirmOrderButton.addEventListener("click", async () => {
  showPaymentError("");
  if (!getToken()) {
    location.href = `login.html?next=${encodeURIComponent("payment.html")}`;
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

const savedPaymentMethod = sessionStorage.getItem("food-platform-payment-method");
if (savedPaymentMethod && paymentChoices.some(choice => {
  const input = choice.querySelector("input");
  return input?.value === savedPaymentMethod && !input.disabled;
})) {
  document.querySelector(`input[name="paymentMethod"][value="${savedPaymentMethod}"]`).checked = true;
}
paymentChoices.forEach(choice => choice.querySelector("input").addEventListener("change", updatePaymentChoice));
renderPaymentSummary();
updatePaymentChoice();
