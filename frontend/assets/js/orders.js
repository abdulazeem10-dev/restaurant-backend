async function loadOrders() {
  const root = document.querySelector("#orders"); const error = document.querySelector("#error");
  if (!getToken()) { error.innerHTML = `Please <a href="login.html?next=orders.html">sign in</a> to view your orders.`; return; }
  try {
    const response = await fetch(`${API_BASE}/orders/mine`, { headers: authHeaders() });
    const data = await response.json();
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      error.innerHTML = `Your session expired. Please <a href="login.html?next=orders.html">sign in again</a> to view your orders.`;
      return;
    }
    if (!response.ok) throw new Error(data.error || "Could not load orders");
    if (!data.orders.length) { root.textContent = "You haven’t placed any orders yet."; return; }
    root.replaceChildren();
    for (const order of data.orders) {
      const card = document.createElement("article");
      const lines = order.items.map(item => `${item.quantity} × ${escapeHtml(item.name)}`).join(", ");
      const paymentLabel = order.paymentMethod === "cash_on_delivery"
        ? "Cash on delivery"
        : order.paymentMethod === "upi_qr"
          ? "UPI QR selected (not collected)"
          : "Online payment selected (not collected)";
      card.innerHTML = `<h3>${escapeHtml(order.restaurantId?.name || "Restaurant")}</h3><p>${lines}</p><p><strong>${escapeHtml(order.status.replace("_", " "))}</strong> · ${formatRupees(order.totalPaise)}</p><p>Payment: ${paymentLabel}</p><small>${new Date(order.createdAt).toLocaleString("en-IN")}</small>`;
      if (order.review) {
        const reviewed = document.createElement("p");
        reviewed.className = "order-review-status";
        reviewed.textContent = `Your rating: ${order.review.rating} / 5`;
        card.append(reviewed);
      } else if (order.status === "ready") {
        const reviewForm = document.createElement("form");
        reviewForm.className = "order-review-form";
        reviewForm.innerHTML = `<label>Rate your order <select name="rating" required><option value="" selected disabled>Choose 1–5 stars</option><option value="5">★★★★★ — Excellent</option><option value="4">★★★★ — Good</option><option value="3">★★★ — Okay</option><option value="2">★★ — Poor</option><option value="1">★ — Bad</option></select></label><label>Review (optional)<textarea name="comment" maxlength="500" rows="3" placeholder="How was your order?"></textarea></label><button type="submit">Submit review</button>`;
        reviewForm.addEventListener("submit", async event => {
          event.preventDefault();
          const button = reviewForm.querySelector("button");
          const form = new FormData(reviewForm);
          button.disabled = true;
          error.textContent = "";
          try {
            const reviewResponse = await fetch(`${API_BASE}/reviews`, {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ orderId: order._id, rating: Number(form.get("rating")), comment: form.get("comment") })
            });
            const reviewData = await reviewResponse.json();
            if (!reviewResponse.ok) throw new Error(reviewData.error || "Could not submit your review");
            await loadOrders();
          } catch (reviewError) {
            error.textContent = reviewError.message;
            button.disabled = false;
          }
        });
        card.append(reviewForm);
      }
      root.append(card);
    }
  } catch (err) { error.textContent = err.message; }
}
if (new URLSearchParams(location.search).has("placed")) document.querySelector("#error").textContent = "Order placed. You can follow its status here.";
loadOrders();
