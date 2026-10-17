const restaurantId = new URLSearchParams(location.search).get("id");
const menuRoot = document.querySelector("#menu-items");
const categoryRoot = document.querySelector("#category-nav");
let currentRestaurant = null;

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

function renderMenu(items, restaurant) {
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
      const title = document.createElement("h4");
      title.textContent = item.name;
      const price = document.createElement("strong");
      price.textContent = formatRupees(item.pricePaise);
      const description = document.createElement("p");
      description.className = "muted";
      description.textContent = item.description || "Prepared fresh by the restaurant.";
      info.append(title, price, description);
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
  if (!items.length) menuRoot.innerHTML = "<div class=\"empty-state\"><h3>Menu coming soon</h3><p>This restaurant hasn’t added available dishes yet.</p></div>";
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
    document.title = `${restaurant.name} menu | Food Platform`;
    document.querySelector("#restaurant-name").textContent = restaurant.name;
    document.querySelector("#crumb-name").textContent = restaurant.name;
    document.querySelector("#restaurant-description").textContent = restaurant.description || "Good food, made fresh by your local kitchen.";
    document.querySelector("#restaurant-address").textContent = restaurant.address;
    const status = document.querySelector("#restaurant-status");
    status.textContent = restaurant.isOpen ? "Open for orders" : "Currently closed";
    status.classList.toggle("closed-badge", !restaurant.isOpen);
    renderMenu(items, restaurant);
    updateStoreCart();
  } catch (errorValue) { error.textContent = errorValue.message || "Could not load this restaurant."; }
}

loadStorefront();
