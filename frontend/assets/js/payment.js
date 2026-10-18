const paymentCart = readCart();
const paymentError = document.querySelector("#payment-error");
const confirmOrderButton = document.querySelector("#confirm-order");
const onlinePaymentInput = document.querySelector('input[name="paymentMethod"][value="razorpay"]');
const onlinePaymentChoice = document.querySelector("#online-payment-choice");
const paymentChoices = [...document.querySelectorAll("[data-payment-choice]")];
let checkout = null;
let onlinePaymentEnabled = false;

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
  const online = method === "razorpay";
  document.querySelector("#payment-total-label").textContent = online ? "Total to pay online" : "Total to pay on delivery";
  document.querySelector("#payment-security-note").textContent = online
    ? "Your payment is processed securely by Razorpay. Food Platform never receives your card or UPI PIN details."
    : "Pay the delivery partner in cash when your order arrives.";
  confirmOrderButton.textContent = online ? "Pay securely" : "Place cash-on-delivery order";
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

async function paymentRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(data.error || "Payment request failed");
  return { data, status: response.status };
}

async function loadPaymentConfig() {
  try {
    const { data } = await paymentRequest("/orders/payment/config");
    onlinePaymentEnabled = Boolean(data.enabled && data.keyId);
    onlinePaymentInput.disabled = !onlinePaymentEnabled;
    onlinePaymentChoice.classList.toggle("payment-option-disabled", !onlinePaymentEnabled);
    document.querySelector("#online-payment-status").textContent = onlinePaymentEnabled ? "Available" : "Unavailable";
    document.querySelector("#online-payment-hint").textContent = onlinePaymentEnabled
      ? "Pay securely using an available UPI app, card, or net banking."
      : "Online payments are not configured yet.";
  } catch {
    onlinePaymentInput.disabled = true;
    document.querySelector("#online-payment-status").textContent = "Unavailable";
    document.querySelector("#online-payment-hint").textContent = "Online payments are temporarily unavailable.";
  }
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load secure checkout. Please try again."));
    document.head.append(script);
  });
}

async function createLocalOrder(paymentMethod) {
  const response = await paymentRequest("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restaurantId: paymentCart.restaurantId,
      deliveryAddress: checkout.deliveryAddress,
      deliveryDetails: checkout.deliveryDetails,
      paymentMethod,
      items: paymentCart.items.map(({ menuItemId, quantity }) => ({ menuItemId, quantity }))
    })
  });
  const order = response.data.order;
  document.querySelector("#payment-total").textContent = formatRupees(order.totalPaise);
  return order;
}

async function cancelPendingOnlineOrder() {
  const orderId = sessionStorage.getItem("food-platform-pending-payment-order");
  if (!orderId) return;
  await paymentRequest(`/orders/${encodeURIComponent(orderId)}/payment/cancel`, { method: "POST" });
  sessionStorage.removeItem("food-platform-pending-payment-order");
}

async function placeCashOrder() {
  await cancelPendingOnlineOrder();
  await createLocalOrder("cash_on_delivery");
  localStorage.removeItem("food-platform-cart");
  sessionStorage.removeItem("food-platform-checkout");
  location.href = "orders.html?placed=1";
}

async function confirmCapturedPayment(orderId, checkoutResponse) {
  const result = await paymentRequest(`/orders/${encodeURIComponent(orderId)}/payment/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(checkoutResponse)
  });
  if (result.data.paid) {
    localStorage.removeItem("food-platform-cart");
    sessionStorage.removeItem("food-platform-checkout");
    sessionStorage.removeItem("food-platform-pending-payment-order");
    location.href = "orders.html?placed=1";
    return true;
  }
  if (result.data.processing === false) throw new Error(result.data.error || "Payment failed. Try again or choose cash on delivery.");
  return false;
}

async function waitForCapturedPayment(orderId, checkoutResponse) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const { data } = await paymentRequest(`/orders/${encodeURIComponent(orderId)}/payment/status`);
    if (data.paymentStatus === "paid" && data.status !== "awaiting_payment") {
      localStorage.removeItem("food-platform-cart");
      sessionStorage.removeItem("food-platform-checkout");
      sessionStorage.removeItem("food-platform-pending-payment-order");
      location.href = "orders.html?placed=1";
      return true;
    }
    if (data.paymentStatus === "failed") {
      showPaymentError("Payment failed. You can try again or choose cash on delivery.");
      return false;
    }
    if (attempt === 2) {
      try {
        if (await confirmCapturedPayment(orderId, checkoutResponse)) return true;
      } catch {
        // A webhook can still confirm the captured payment; continue polling.
      }
    }
  }
  showPaymentError("Your payment is still being confirmed. Please check My orders before trying to pay again.");
  return false;
}

async function placeOnlineOrder() {
  if (!onlinePaymentEnabled) throw new Error("Online payment is not available right now. Please choose cash on delivery.");

  let orderId = sessionStorage.getItem("food-platform-pending-payment-order");
  if (orderId) {
    const { data: status } = await paymentRequest(`/orders/${encodeURIComponent(orderId)}/payment/status`);
    if (status.paymentStatus === "paid") {
      localStorage.removeItem("food-platform-cart");
      sessionStorage.removeItem("food-platform-checkout");
      sessionStorage.removeItem("food-platform-pending-payment-order");
      location.href = "orders.html?placed=1";
      return;
    }
    if (status.status !== "awaiting_payment") {
      sessionStorage.removeItem("food-platform-pending-payment-order");
      orderId = null;
    }
  }
  if (!orderId) {
    const order = await createLocalOrder("razorpay");
    orderId = order._id;
    sessionStorage.setItem("food-platform-pending-payment-order", orderId);
  }

  await loadRazorpayCheckout();
  const { data: paymentOrder } = await paymentRequest(`/orders/${encodeURIComponent(orderId)}/payment/razorpay`, { method: "POST" });
  const checkoutOptions = {
    key: paymentOrder.keyId,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    name: "Food Platform",
    description: `Order from ${paymentCart.restaurantName || "your restaurant"}`,
    order_id: paymentOrder.razorpayOrderId,
    prefill: {
      name: checkout.deliveryDetails.name,
      contact: checkout.deliveryDetails.phone
    },
    theme: { color: "#e83d55" },
    handler: async response => {
      confirmOrderButton.disabled = true;
      confirmOrderButton.textContent = "Confirming payment…";
      showPaymentError("");
      try {
        const confirmed = await confirmCapturedPayment(orderId, response);
        if (!confirmed) await waitForCapturedPayment(orderId, response);
      } catch (error) {
        showPaymentError(error.message);
        try {
          await waitForCapturedPayment(orderId, response);
        } catch {
          // Keep the verification error visible if the payment service is unreachable.
        }
      } finally {
        confirmOrderButton.disabled = false;
        updatePaymentChoice();
      }
    },
    modal: {
      ondismiss: () => {
        confirmOrderButton.disabled = false;
        updatePaymentChoice();
      }
    }
  };
  const razorpayCheckout = new window.Razorpay(checkoutOptions);
  razorpayCheckout.on("payment.failed", event => {
    showPaymentError(event.error?.description || "Payment failed. Try again or choose cash on delivery.");
  });
  razorpayCheckout.open();
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
    if (selectedPaymentMethod() === "razorpay") await placeOnlineOrder();
    else await placeCashOrder();
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
loadPaymentConfig();
