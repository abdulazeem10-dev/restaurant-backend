const message = document.querySelector("#message");
const adminPageTitles = {
  overview: ["Admin overview", "Manage restaurants, accounts, and approvals from one place."],
  "add-restaurant": ["Add restaurant", "Create a restaurant and its owner account."],
  "create-account": ["Create account", "Set up a delivery-person login for your platform."],
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

    const foodTypeLabel = document.createElement("label");
    foodTypeLabel.textContent = "Food type";
    const foodTypeSelect = document.createElement("select");
    foodTypeSelect.innerHTML = `
      <option value="veg">Veg only</option>
      <option value="nonVeg">Non-Veg only</option>
      <option value="both">Veg & Non-Veg</option>
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

    if (restaurant.status === "pending") {
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

showAdminView("overview");
