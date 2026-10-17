const restaurantId = new URLSearchParams(location.search).get("id");
const menuRoot = document.querySelector("#menu-items");
const categoryRoot = document.querySelector("#category-nav");
let currentRestaurant = null;
let allMenuItems = [];

function renderFilteredMenu() {
  if (!currentRestaurant) return;
  const filter = document.querySelector("#menu-food-filter").value;
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

function addMenuItem(item) {
  let cart = readCart();
  if (cart && cart.restaurantId !== restaurantId) {
    if (!confirm("Your cart has items from another restaurant. Clear it and start this order?")) return;
    cart = null;
  }
  cart ||= { restaurantId, restaurantName: currentRestaurant.name, items: [] };
  const line = cart.items.find(value => value.menuItemId === item._id);
  if (line) line.quantity = Math.min(20, line.quantity + 1);
  else cart.items.push({ menuItemId: item._id, name: item.name, pricePaise: item.pricePaise, quantity: 1 });
  writeCart(cart);
  updateStoreCart();
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
      action.addEventListener("click", () => addMenuItem(item));
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
  if (!restaurantId) { error.textContent = "Choose a restaurant from the restaurant list."; return; }
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
    document.title = `${restaurant.name} menu | Food Platform`;
    document.querySelector("#restaurant-name").textContent = restaurant.name;
    document.querySelector("#crumb-name").textContent = restaurant.name;
    document.querySelector("#restaurant-description").textContent = restaurant.description || "Good food, made fresh by your local kitchen.";
    document.querySelector("#restaurant-address").textContent = restaurant.address;
    const status = document.querySelector("#restaurant-status");
    status.textContent = restaurant.isOpen ? "Open for orders" : "Currently closed";
    status.classList.toggle("closed-badge", !restaurant.isOpen);
    allMenuItems = items;
    renderFilteredMenu();
    updateStoreCart();
  } catch (errorValue) { error.textContent = errorValue.message || "Could not load this restaurant."; }
}

loadStorefront();
document.querySelector("#menu-food-filter").addEventListener("change", renderFilteredMenu);
