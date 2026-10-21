const restaurantId = new URLSearchParams(location.search).get("id");
const menuRoot = document.querySelector("#menu-items");
const categoryRoot = document.querySelector("#category-nav");
const menuFoodButtons = [...document.querySelectorAll("[data-menu-food]")];
let currentRestaurant = null;
let allMenuItems = [];
let selectedMenuFood = "all";

function formatTodayHours(openingHours) {
  if (!openingHours) return "Today's hours aren't listed.";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toLowerCase();
  const hours = openingHours[day];
  if (!hours || hours.closed) return "Closed today.";
  const formatTime = value => {
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  };
  return `Today's hours: ${formatTime(hours.opensAt)}–${formatTime(hours.closesAt)} IST`;
}

function renderFilteredMenu() {
  if (!currentRestaurant) return;
  const filter = selectedMenuFood;
  menuFoodButtons.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.menuFood === filter));
  });
  const filtered = filter === "all" ? allMenuItems : allMenuItems.filter(item => item.foodType === filter);
  renderMenu(filtered, currentRestaurant, filter);
}

function updateStoreCart() {
  const cart = readCart();
  const summary = document.querySelector("#cart-summary");
  if (!cart?.items?.length) { summary.textContent = "Your cart is empty"; return; }
  const quantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
  summary.textContent = `${quantity} ${quantity === 1 ? "item" : "items"} · ${formatRupees(total)}`;
}

function renderReviews(data) {
  const summary = document.querySelector("#review-summary");
  const root = document.querySelector("#restaurant-reviews");
  const count = Number(data.ratingCount) || 0;
  summary.textContent = count ? `★ ${Number(data.ratingAverage).toFixed(1)} · ${count} ${count === 1 ? "review" : "reviews"}` : "No reviews yet";
  root.replaceChildren();
  if (!data.reviews?.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Reviews from customers will appear here.";
    root.append(empty);
    return;
  }
  for (const review of data.reviews) {
    const card = document.createElement("article");
    card.className = "review-card";
    const top = document.createElement("div");
    top.className = "review-card-top";
    const name = document.createElement("strong");
    name.textContent = review.customerName;
    const rating = document.createElement("span");
    rating.className = "review-stars";
    rating.setAttribute("aria-label", `${review.rating} out of 5 stars`);
    rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
    top.append(name, rating);
    card.append(top);
    if (review.comment) {
      const comment = document.createElement("p");
      comment.textContent = review.comment;
      card.append(comment);
    }
    const date = document.createElement("small");
    date.className = "muted";
    date.textContent = new Date(review.createdAt).toLocaleDateString("en-IN");
    card.append(date);
    root.append(card);
  }
}

async function loadReviews() {
  const summary = document.querySelector("#review-summary");
  try {
    const response = await fetch(`${API_BASE}/reviews/restaurant/${encodeURIComponent(restaurantId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load reviews");
    renderReviews(data);
  } catch {
    summary.textContent = "Reviews are temporarily unavailable.";
    document.querySelector("#restaurant-reviews").replaceChildren();
  }
}

function addMenuItem(item, button) {
  let cart = readCart();
  if (cart && cart.restaurantId !== restaurantId) {
    if (!confirm("Your cart has items from another restaurant. Clear it and start this order?")) return;
    cart = null;
  }
  cart ||= { restaurantId, restaurantName: currentRestaurant.name, items: [] };
  const line = cart.items.find(value => value.menuItemId === item._id);
  if (line?.quantity >= 20) {
    setStatusMessage(document.querySelector("#cart-feedback"), `You’ve reached the 20-item limit for ${item.name}.`, "info");
    return;
  }
  if (line) line.quantity += 1;
  else cart.items.push({ menuItemId: item._id, name: item.name, pricePaise: item.pricePaise, quantity: 1 });
  writeCart(cart);
  updateStoreCart();
  setStatusMessage(document.querySelector("#cart-feedback"), `${item.name} added to your order.`, "success");
  if (button) {
    clearTimeout(button.feedbackTimer);
    button.classList.add("is-added");
    button.textContent = "Added ✓";
    button.setAttribute("aria-label", `${item.name} added to your order`);
    button.feedbackTimer = setTimeout(() => {
      button.classList.remove("is-added");
      button.textContent = "+ Add";
      button.setAttribute("aria-label", `Add ${item.name}`);
    }, 1400);
  }
}

function renderMenu(items, restaurant, filter = "all") {
  const groups = new Map();
  for (const item of items) {
    const category = item.category || "Menu";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  }
  categoryRoot.replaceChildren();
  menuRoot.replaceChildren();
  for (const [index, [category, entries]] of [...groups.entries()].entries()) {
    const sectionId = `category-${index}`;
    const categoryLink = document.createElement("a");
    categoryLink.href = `#${sectionId}`;
    categoryLink.textContent = category;
    categoryRoot.append(categoryLink);

    const section = document.createElement("section");
    section.className = "menu-category";
    section.id = sectionId;
    const heading = document.createElement("h3");
    heading.textContent = category;
    const count = document.createElement("span");
    count.className = "muted";
    count.textContent = `${entries.length} items`;
    const categoryHeading = document.createElement("div");
    categoryHeading.className = "category-heading";
    categoryHeading.append(heading, count);
    section.append(categoryHeading);

    for (const item of entries) {
      const row = document.createElement("article");
      row.className = "menu-item-card";
      const info = document.createElement("div");
      info.className = "menu-item-info";
      if (item.imageUrl) {
        const image = document.createElement("img");
        image.src = item.imageUrl;
        image.alt = item.name;
        image.loading = "lazy";
        image.className = "dish-image";
        image.addEventListener("error", () => image.remove(), { once: true });
        row.append(image);
      }
      const title = document.createElement("h4");
      title.textContent = item.name;
      const typeBadge = document.createElement("span");
      typeBadge.className = `dish-type-badge ${item.foodType === "veg" ? "dish-type-veg" : "dish-type-nonveg"}`;
      typeBadge.textContent = item.foodType === "veg" ? "Veg" : "Non-Veg";
      const price = document.createElement("strong");
      price.textContent = formatRupees(item.pricePaise);
      const description = document.createElement("p");
      description.className = "muted";
      description.textContent = item.description || "Prepared fresh by the restaurant.";
      info.append(title);
      if (item.foodType === "veg" || item.foodType === "nonVeg") info.append(typeBadge);
      info.append(price, description);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "add-item-button";
      action.textContent = restaurant.isOpen ? "+ Add" : "Closed";
      action.disabled = !restaurant.isOpen;
      action.setAttribute("aria-label", `${restaurant.isOpen ? "Add" : "Unavailable"} ${item.name}`);
      action.addEventListener("click", () => addMenuItem(item, action));
      row.append(info, action);
      section.append(row);
    }
    menuRoot.append(section);
  }
  if (!items.length) {
    const emptyTitle = filter === "all" ? "Menu coming soon" : `No ${filter === "veg" ? "Veg" : "Non-Veg"} dishes listed`;
    const emptyMessage = filter === "all"
      ? "This restaurant hasn’t added available dishes yet."
      : "Try another food filter or check back later.";
    menuRoot.innerHTML = `<div class="empty-state"><h3>${emptyTitle}</h3><p>${emptyMessage}</p></div>`;
  }
}

async function loadStorefront() {
  const error = document.querySelector("#error");
  const storefrontHero = document.querySelector(".storefront-hero");
  if (!restaurantId) {
    error.textContent = "Choose a restaurant from the restaurant list.";
    document.querySelector("#restaurant-name").textContent = "Choose a restaurant";
    storefrontHero.setAttribute("aria-busy", "false");
    return;
  }
  try {
    const [restaurantResponse, menuResponse] = await Promise.all([
      fetch(`${API_BASE}/restaurants/${encodeURIComponent(restaurantId)}`),
      fetch(`${API_BASE}/restaurants/${encodeURIComponent(restaurantId)}/menu`)
    ]);
    if (!restaurantResponse.ok || !menuResponse.ok) throw new Error("This restaurant is not available right now.");
    const { restaurant } = await restaurantResponse.json();
    const { items } = await menuResponse.json();
    currentRestaurant = restaurant;
    if (restaurant.imageUrl) {
      const restaurantArt = document.querySelector(".storefront-art");
      restaurantArt.classList.add("has-image");
      restaurantArt.replaceChildren();
      const restaurantImage = document.createElement("img");
      restaurantImage.src = restaurant.imageUrl;
      restaurantImage.alt = "";
      restaurantImage.loading = "lazy";
      restaurantImage.addEventListener("error", () => restaurantImage.remove(), { once: true });
      restaurantArt.append(restaurantImage);
    }
    document.title = `${restaurant.name} menu | Foodway`;
    document.querySelector("#restaurant-name").textContent = restaurant.name;
    document.querySelector("#crumb-name").textContent = restaurant.name;
    document.querySelector("#restaurant-description").textContent = restaurant.description || "Good food, made fresh by your local kitchen.";
    document.querySelector("#restaurant-address").textContent = restaurant.address;
    const status = document.querySelector("#restaurant-status");
    status.textContent = restaurant.isOpen ? "Open for orders" : "Currently closed";
    status.classList.toggle("closed-badge", !restaurant.isOpen);
    document.querySelector("#restaurant-hours").textContent = formatTodayHours(restaurant.openingHours);
    const areas = restaurant.deliveryAreas || [];
    const pincodes = restaurant.deliveryPincodes || [];
    document.querySelector("#restaurant-delivery-area").textContent = areas.length
      ? `Delivery areas: ${areas.slice(0, 4).map(area => `${area.name} (${area.pincodes.join(", ")})`).join(" · ")}${areas.length > 4 ? ` · +${areas.length - 4} more` : ""}`
      : pincodes.length ? `Delivery PINs: ${pincodes.join(", ")}` : "Delivery areas aren't listed.";
    storefrontHero.setAttribute("aria-busy", "false");
    allMenuItems = items;
    renderFilteredMenu();
    updateStoreCart();
    await loadReviews();
  } catch (errorValue) {
    const message = errorValue.message || "Could not load this restaurant.";
    error.textContent = message;
    document.querySelector("#restaurant-name").textContent = "Restaurant unavailable";
    document.querySelector("#restaurant-description").textContent = message;
    storefrontHero.setAttribute("aria-busy", "false");
  }
}

menuFoodButtons.forEach(button => button.addEventListener("click", () => {
  selectedMenuFood = button.dataset.menuFood;
  renderFilteredMenu();
}));
loadStorefront();
