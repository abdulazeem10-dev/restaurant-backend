const message = document.querySelector("#message");
if (!getToken()) location.href = "../customer/login.html";
document.querySelector("#logout").addEventListener("click", () => { sessionStorage.removeItem(TOKEN_KEY); location.href = "../customer/login.html"; });
async function adminRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: authHeaders(options.headers || {}) });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed"); return data;
}
async function loadRestaurants() {
  const { restaurants } = await adminRequest("/admin/restaurants"); const root = document.querySelector("#restaurants"); root.replaceChildren();
  for (const restaurant of restaurants) {
    const owner = restaurant.ownerId || {};
    const card = document.createElement("article");
    card.innerHTML = `<h3>${escapeHtml(restaurant.name)}</h3><p>${escapeHtml(restaurant.address)}</p><p>Owner: ${escapeHtml(owner.name)} · ${escapeHtml(owner.email)}</p><p>Status: <strong>${escapeHtml(restaurant.status)}</strong></p>`;
    if (restaurant.status === "pending") {
      for (const status of ["approved", "rejected"]) { const button = document.createElement("button"); button.textContent = status === "approved" ? "Approve" : "Reject"; if (status === "rejected") button.className = "secondary"; button.addEventListener("click", async () => { try { await adminRequest(`/admin/restaurants/${restaurant._id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadRestaurants(); } catch (error) { message.textContent = error.message; } }); card.append(button); }
    } else if (restaurant.status === "approved") {
      const button = document.createElement("button"); button.className = "secondary"; button.textContent = "Suspend"; button.addEventListener("click", async () => { try { await adminRequest(`/admin/restaurants/${restaurant._id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "suspended" }) }); await loadRestaurants(); } catch (error) { message.textContent = error.message; } }); card.append(button);
    }
    root.append(card);
  }
  if (!restaurants.length) root.textContent = "No restaurants onboarded yet.";
}
document.querySelector("#restaurant-form").addEventListener("submit", async event => {
  event.preventDefault(); message.textContent = ""; const form = new FormData(event.currentTarget);
  const body = Object.fromEntries(["restaurantName", "address", "description", "ownerName", "email", "password"].map(key => [key, form.get(key)]));
  try { await adminRequest("/admin/restaurants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); event.currentTarget.reset(); message.textContent = "Restaurant and owner account created. The restaurant is pending approval."; await loadRestaurants(); }
  catch (error) { message.textContent = error.message; }
});
loadRestaurants().catch(error => { message.textContent = `${error.message}. Sign in with an admin account.`; });
