const message = document.querySelector("#message");
const adminPageTitles = {
  overview: ["Admin overview", "Manage restaurants, accounts, and approvals from one place."],
  "add-restaurant": ["Add restaurant", "Create a restaurant and its owner account."],
  "create-account": ["Create account", "Set up delivery logins and update delivery-person contact details."],
  restaurants: ["Restaurants", "Review restaurant details and manage approvals."]
};

function showAdminView(view) {
  if (!adminPageTitles[view]) return;
  document.querySelectorAll("[data-admin-section]").forEach(section => {
    section.hidden = section.dataset.adminSection !== view;
  });
  document.querySelectorAll("[data-admin-view]").forEach(button => {
    if (button.dataset.adminView === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelector("#admin-page-title").textContent = adminPageTitles[view][0];
  document.querySelector("#admin-page-description").textContent = adminPageTitles[view][1];
  if (view !== "overview") document.querySelector("#message").textContent = "";
}

document.querySelectorAll("[data-admin-view]").forEach(button => {
  button.addEventListener("click", () => showAdminView(button.dataset.adminView));
});
document.querySelectorAll("[data-open-admin-view]").forEach(button => {
  button.addEventListener("click", () => showAdminView(button.dataset.openAdminView));
});

if (!getToken()) {
  location.href = "../customer/login.html";
}

document.querySelector("#logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  location.href = "../customer/login.html";
});

async function adminRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers || {})
  });

  const data = response.status === 204 ? {} : await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function updateRestaurantStatus(restaurantId, status) {
  await adminRequest(`/admin/restaurants/${restaurantId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });

  await loadRestaurants();
}

async function loadRestaurants() {
  const { restaurants } = await adminRequest("/admin/restaurants");
  const root = document.querySelector("#restaurants");

  document.querySelector("#stat-total").textContent = restaurants.length;
  document.querySelector("#stat-approved").textContent = restaurants.filter(item => item.status === "approved").length;
  document.querySelector("#stat-pending").textContent = restaurants.filter(item => item.status === "pending").length;

  root.replaceChildren();

  for (const restaurant of restaurants) {
    const owner = restaurant.ownerId || {};
    const card = document.createElement("article");
    card.className = "admin-restaurant-card";

    card.innerHTML = `
      <h3>${escapeHtml(restaurant.name)}</h3>
      <p>${escapeHtml(restaurant.address)}</p>
      <p>
        Owner:
        ${escapeHtml(owner.name || "")}
        ·
        ${escapeHtml(owner.email || "")}
      </p>
      <p>
        Status:
        <strong>${escapeHtml(restaurant.status)}</strong>
      </p>
    `;

    const profileForm = document.createElement("form");
    profileForm.className = "form-grid admin-profile-form";
    profileForm.innerHTML = `
      <label>Restaurant name<br><input name="restaurantName" required maxlength="150" value="${escapeHtml(restaurant.name || "")}"></label>
      <label>Restaurant address<br><textarea name="address" required maxlength="500" rows="3" placeholder="Full street address, area, city, PIN">${escapeHtml(restaurant.address || "")}</textarea></label>
      <label class="admin-profile-description">Restaurant description<br><textarea name="description" maxlength="2000" rows="3" placeholder="Describe the food, specialties, and atmosphere">${escapeHtml(restaurant.description || "")}</textarea></label>
      <label>Owner name<br><input name="ownerName" required maxlength="100" value="${escapeHtml(owner.name || "")}"></label>
      <label>Owner email / login<br><input name="email" type="email" required maxlength="254" value="${escapeHtml(owner.email || "")}"></label>
      <label>Owner phone<br><input name="phone" type="tel" maxlength="20" value="${escapeHtml(owner.phone || "")}"></label>
      <button type="submit">Save restaurant &amp; owner details</button>`;
    profileForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = profileForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = new FormData(profileForm);
        await adminRequest(`/admin/restaurants/${encodeURIComponent(restaurant._id)}/profile`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(["restaurantName", "address", "description", "ownerName", "email", "phone"].map(key => [key, values.get(key)])))
        });
        message.textContent = "Restaurant address, name, and owner contact details updated.";
        await loadRestaurants();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
    card.append(profileForm);

    const deactivateProfile = document.createElement("button");
    deactivateProfile.type = "button";
    deactivateProfile.className = restaurant.profileDeactivatedAt ? "" : "secondary";
    deactivateProfile.textContent = restaurant.profileDeactivatedAt ? "Reactivate restaurant & owner" : "Deactivate restaurant & owner";
    deactivateProfile.addEventListener("click", async () => {
      const active = Boolean(restaurant.profileDeactivatedAt);
      const prompt = active
        ? `Reactivate ${restaurant.name} and its owner login?`
        : `Deactivate ${restaurant.name} and its owner login? The restaurant will stop accepting orders, but its data and order history will be kept.`;
      if (!confirm(prompt)) return;
      deactivateProfile.disabled = true;
      try {
        await adminRequest(`/admin/restaurants/${encodeURIComponent(restaurant._id)}/profile-status`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active })
        });
        message.textContent = active ? "Restaurant and owner profile reactivated." : "Restaurant and owner profile deactivated. Data and order history were retained.";
        await loadRestaurants();
      } catch (error) {
        message.textContent = error.message;
        deactivateProfile.disabled = false;
      }
    });
    card.append(deactivateProfile);

    const foodTypeLabel = document.createElement("label");
    foodTypeLabel.textContent = "Food type";
    const foodTypeSelect = document.createElement("select");
    foodTypeSelect.innerHTML = `
      <option value="veg">Pure Veg</option>
      <option value="nonVeg">Non‑Veg / Mixed Menu</option>
      <option value="both">Veg &amp; Non‑Veg</option>
    `;
    foodTypeSelect.value = restaurant.foodType || "both";
    foodTypeSelect.addEventListener("change", async () => {
      foodTypeSelect.disabled = true;
      try {
        await adminRequest(`/admin/restaurants/${restaurant._id}/food-type`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foodType: foodTypeSelect.value })
        });
        message.textContent = "Restaurant food type updated.";
      } catch (error) {
        message.textContent = error.message;
        foodTypeSelect.value = restaurant.foodType || "both";
      } finally {
        foodTypeSelect.disabled = false;
      }
    });
    foodTypeLabel.append(document.createElement("br"), foodTypeSelect);
    card.append(foodTypeLabel);

    const cuisineLabel = document.createElement("label");
    cuisineLabel.textContent = "Main cuisine";
    const cuisineSelect = document.createElement("select");
    cuisineSelect.innerHTML = `
      <option value="other">Other / not set</option>
      <option value="north-indian">North Indian</option><option value="pizza">Pizza</option>
      <option value="chinese">Chinese</option><option value="desserts">Desserts</option>
      <option value="burger">Burger</option><option value="biryani">Biryani</option>
      <option value="south-indian">South Indian</option><option value="noodles">Noodles</option>
      <option value="rolls">Rolls</option><option value="shawarma">Shawarma</option>
      <option value="vada">Vada</option><option value="dosa">Dosa</option>
      <option value="momo">Momo</option><option value="salads">Salads</option>`;
    cuisineSelect.value = restaurant.cuisine || "other";
    cuisineSelect.addEventListener("change", async () => {
      cuisineSelect.disabled = true;
      try {
        await adminRequest(`/admin/restaurants/${restaurant._id}/cuisine`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cuisine: cuisineSelect.value })
        });
        restaurant.cuisine = cuisineSelect.value;
        message.textContent = "Restaurant cuisine updated.";
      } catch (error) {
        message.textContent = error.message;
        cuisineSelect.value = restaurant.cuisine || "other";
      } finally {
        cuisineSelect.disabled = false;
      }
    });
    cuisineLabel.append(document.createElement("br"), cuisineSelect);
    card.append(cuisineLabel);

    const imageForm = document.createElement("form");
    imageForm.className = "restaurant-image-form";
    const imageLabel = document.createElement("label");
    imageLabel.textContent = "Restaurant image URL (HTTPS)";
    const imageInput = document.createElement("input");
    imageInput.type = "url";
    imageInput.maxLength = 2048;
    imageInput.placeholder = "https://…";
    imageInput.value = restaurant.imageUrl || "";
    imageLabel.append(document.createElement("br"), imageInput);
    const imageButton = document.createElement("button");
    imageButton.type = "submit";
    imageButton.textContent = "Save image";
    imageForm.append(imageLabel, imageButton);
    imageForm.addEventListener("submit", async event => {
      event.preventDefault();
      imageButton.disabled = true;
      try {
        await adminRequest(`/admin/restaurants/${restaurant._id}/image`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: imageInput.value.trim() })
        });
        message.textContent = "Restaurant image saved.";
        await loadRestaurants();
      } catch (error) {
        message.textContent = error.message;
        imageButton.disabled = false;
      }
    });
    card.append(imageForm);

    if (restaurant.profileDeactivatedAt) {
      // The dedicated reactivation action also restores the owner's login.
    } else if (restaurant.status === "pending") {
      for (const status of ["approved", "rejected"]) {
        const button = document.createElement("button");

        button.textContent =
          status === "approved" ? "Approve" : "Reject";

        if (status === "rejected") {
          button.className = "secondary";
        }

        button.addEventListener("click", async () => {
          try {
            await updateRestaurantStatus(restaurant._id, status);
          } catch (error) {
            message.textContent = error.message;
          }
        });

        card.append(button);
      }
    } else if (restaurant.status === "suspended") {
      const button = document.createElement("button");
      button.textContent = "Approve";

      button.addEventListener("click", async () => {
        try {
          await updateRestaurantStatus(restaurant._id, "approved");
        } catch (error) {
          message.textContent = error.message;
        }
      });

      card.append(button);
    } else if (restaurant.status === "approved") {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = "Suspend";

      button.addEventListener("click", async () => {
        try {
          await updateRestaurantStatus(restaurant._id, "suspended");
        } catch (error) {
          message.textContent = error.message;
        }
      });

      card.append(button);
    }

    root.append(card);
  }

  if (!restaurants.length) {
    root.textContent = "No restaurants onboarded yet.";
  }
}

async function loadDeliveryPartners() {
  const { deliveryPartners } = await adminRequest("/admin/delivery-partners");
  const root = document.querySelector("#delivery-partners");
  root.replaceChildren();
  if (!deliveryPartners.length) {
    root.textContent = "No delivery accounts have been created yet.";
    return;
  }
  for (const partner of deliveryPartners) {
    const card = document.createElement("article");
    card.className = "panel admin-delivery-account";
    const heading = document.createElement("h3");
    heading.textContent = partner.name;
    const status = document.createElement("p");
    status.textContent = `Status: ${partner.status || "active"}`;
    const accountId = document.createElement("p");
    accountId.className = "muted admin-account-id";
    accountId.textContent = `Account ID: ${partner._id} · System generated`;
    const form = document.createElement("form");
    form.className = "form-grid admin-profile-form";
    form.innerHTML = `<label>Full name<br><input name="name" required maxlength="100" value="${escapeHtml(partner.name || "")}"></label>
      <label>Email / login<br><input name="email" type="email" required maxlength="254" value="${escapeHtml(partner.email || "")}"></label>
      <label>Phone number<br><input name="phone" type="tel" maxlength="20" value="${escapeHtml(partner.phone || "")}"></label>
      <button type="submit">Save delivery details</button>`;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = new FormData(form);
        await adminRequest(`/admin/delivery-partners/${encodeURIComponent(partner._id)}/profile`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(["name", "email", "phone"].map(key => [key, values.get(key)])))
        });
        message.textContent = `Delivery account for ${values.get("name")} updated.`;
        await loadDeliveryPartners();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = partner.profileDeactivatedAt ? "" : "secondary";
    toggle.textContent = partner.profileDeactivatedAt ? "Reactivate delivery account" : "Deactivate delivery account";
    toggle.addEventListener("click", async () => {
      const active = Boolean(partner.profileDeactivatedAt);
      const prompt = active
        ? `Reactivate the delivery login for ${partner.name}?`
        : `Deactivate the delivery login for ${partner.name}? Their account and order history will be kept.`;
      if (!confirm(prompt)) return;
      toggle.disabled = true;
      try {
        await adminRequest(`/admin/delivery-partners/${encodeURIComponent(partner._id)}/profile-status`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active })
        });
        message.textContent = active ? "Delivery account reactivated." : "Delivery account deactivated. Its data was retained.";
        await loadDeliveryPartners();
      } catch (error) {
        message.textContent = error.message;
        toggle.disabled = false;
      }
    });
    card.append(heading, status, accountId, form, toggle);
    root.append(card);
  }
}

document
  .querySelector("#restaurant-form")
  .addEventListener("submit", async event => {
    event.preventDefault();
    message.textContent = "";

    const restaurantForm = event.currentTarget;
    const form = new FormData(restaurantForm);
    const fields = [
      "restaurantName",
      "address",
      "description",
      "imageUrl",
      "foodType",
      "cuisine",
      "ownerName",
      "email",
      "password"
    ];

    const body = Object.fromEntries(
      fields.map(key => [key, form.get(key)])
    );

    try {
      await adminRequest("/admin/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      restaurantForm.reset();
      message.textContent =
        "Restaurant and owner account created. The restaurant is pending approval.";

      await loadRestaurants();
      showAdminView("restaurants");
    } catch (error) {
      message.textContent = error.message;
    }
  });

document.querySelector("#delivery-partner-form").addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "";
  const form = event.currentTarget;
  const values = new FormData(form);
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { deliveryPartner } = await adminRequest("/admin/delivery-partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(["name", "email", "phone", "password"].map(key => [key, values.get(key)])))
    });
    form.reset();
    message.textContent = `Delivery login created for ${deliveryPartner.name}. Share the login securely.`;
    await loadDeliveryPartners();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadRestaurants().catch(error => {
  message.textContent =
    `${error.message}. Sign in with an admin account.`;
});
loadDeliveryPartners().catch(error => { message.textContent = error.message; });

showAdminView("overview");
