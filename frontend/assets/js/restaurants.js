const restaurantGrid = document.querySelector("#restaurants");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const resultCount = document.querySelector("#results-count");
let allRestaurants = [];

function renderRestaurants() {
  const term = searchInput.value.trim().toLocaleLowerCase();
  const matches = allRestaurants.filter(restaurant =>
    `${restaurant.name} ${restaurant.address} ${restaurant.description || ""}`.toLocaleLowerCase().includes(term)
  );
  matches.sort((a, b) => sortSelect.value === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));

  restaurantGrid.replaceChildren();
  resultCount.textContent = `${matches.length} ${matches.length === 1 ? "restaurant" : "restaurants"} open now`;
  for (const [index, restaurant] of matches.entries()) {
    const card = document.createElement("article");
    card.className = "restaurant-card";
    const cover = document.createElement("div");
    cover.className = `restaurant-cover cover-${index % 4}`;
    cover.setAttribute("aria-hidden", "true");
    const coverText = document.createElement("span");
    coverText.textContent = ["🍽️", "🥘", "🍕", "🥗"][index % 4];
    cover.append(coverText);

    const details = document.createElement("div");
    details.className = "restaurant-card-content";
    const meta = document.createElement("div");
    meta.className = "restaurant-meta";
    const open = document.createElement("span");
    open.className = "open-badge";
    open.textContent = "Open now";
    const delivery = document.createElement("span");
    delivery.className = "muted";
    delivery.textContent = "Order from restaurant";
    meta.append(open, delivery);

    const title = document.createElement("h3");
    title.textContent = restaurant.name;
    const address = document.createElement("p");
    address.className = "restaurant-address";
    address.textContent = restaurant.address;
    const description = document.createElement("p");
    description.className = "restaurant-description";
    description.textContent = restaurant.description || "Freshly prepared favourites from your local kitchen.";
    const link = document.createElement("a");
    link.className = "card-action";
    link.href = `menu.html?id=${encodeURIComponent(restaurant._id)}`;
    link.textContent = "View menu";
    details.append(meta, title, address, description, link);
    card.append(cover, details);
    restaurantGrid.append(card);
  }
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span"); icon.className = "empty-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "⌕";
    const title = document.createElement("h3");
    const message = document.createElement("p");
    if (!allRestaurants.length) { title.textContent = "Mumbai menus are on the way"; message.textContent = "Restaurants will appear here once they’re approved and open for orders."; }
    else { title.textContent = "No restaurants found"; message.textContent = "Try another restaurant name or area."; }
    empty.append(icon, title, message);
    restaurantGrid.append(empty);
  }
}

async function loadRestaurants() {
  const error = document.querySelector("#error");
  try {
    const response = await fetch(`${API_BASE}/restaurants`);
    if (!response.ok) throw new Error("Unable to load restaurants");
    const data = await response.json();
    allRestaurants = data.restaurants || [];
    renderRestaurants();
  } catch {
    resultCount.textContent = "";
    error.textContent = "We couldn’t load restaurants. Check that the API is running, then refresh.";
  }
}

document.querySelector("#restaurant-search").addEventListener("submit", event => { event.preventDefault(); renderRestaurants(); });
searchInput.addEventListener("input", renderRestaurants);
sortSelect.addEventListener("change", renderRestaurants);
loadRestaurants();
