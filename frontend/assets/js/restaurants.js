const restaurantGrid = document.querySelector("#restaurants");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const foodTypeFilter = document.querySelector("#food-type-filter");
const deliveryPincodeFilter = document.querySelector("#delivery-pincode-filter");
const resultCount = document.querySelector("#results-count");
let allRestaurants = [];

function formatTodayHours(openingHours) {
  if (!openingHours) return "Hours not set";
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date()).toLowerCase();
  const hours = openingHours[day];
  if (!hours || hours.closed) return "Closed today";
  const formatTime = value => {
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  };
  return `Today: ${formatTime(hours.opensAt)}–${formatTime(hours.closesAt)}`;
}

function formatDeliveryPincodes(pincodes = []) {
  if (!pincodes.length) return "Delivery area not set";
  const visible = pincodes.slice(0, 3).join(", ");
  return `Delivers to ${visible}${pincodes.length > 3 ? ` +${pincodes.length - 3} more` : ""}`;
}

function renderRestaurants() {
  const term = searchInput.value.trim().toLocaleLowerCase();
  const pin = deliveryPincodeFilter.value.trim();
  const hasCompletePin = /^\d{6}$/.test(pin);
  const matches = allRestaurants.filter(restaurant => {
    const searchMatches = `${restaurant.name} ${restaurant.address} ${restaurant.description || ""}`.toLocaleLowerCase().includes(term);
    // Treat missing foodType values from older records as mixed restaurants.
    const foodType = ["veg", "nonVeg", "both"].includes(restaurant.foodType)
      ? restaurant.foodType
      : "both";
    const foodTypeMatches = foodTypeFilter.value === "all" || foodType === foodTypeFilter.value;
    const pinMatches = !hasCompletePin || (restaurant.deliveryPincodes || []).includes(pin);
    return searchMatches && foodTypeMatches && pinMatches;
  });
  matches.sort((a, b) => sortSelect.value === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));

  restaurantGrid.replaceChildren();
  const openCount = matches.filter(restaurant => restaurant.isOpen).length;
  resultCount.textContent = `${openCount} open now · ${matches.length} ${matches.length === 1 ? "restaurant" : "restaurants"}${pin && !hasCompletePin ? " · Enter a complete 6-digit PIN to filter delivery areas" : ""}`;
  for (const [index, restaurant] of matches.entries()) {
    const card = document.createElement("article");
    card.className = "restaurant-card";
    const cover = document.createElement("div");
    cover.className = `restaurant-cover cover-${index % 4}`;
    if (restaurant.imageUrl) {
      cover.classList.add("has-image");
      const coverImage = document.createElement("img");
      coverImage.src = restaurant.imageUrl;
      coverImage.alt = "";
      coverImage.loading = "lazy";
      coverImage.addEventListener("error", () => coverImage.remove(), { once: true });
      cover.append(coverImage);
    } else {
      cover.setAttribute("aria-hidden", "true");
      const coverText = document.createElement("span");
      coverText.textContent = ["🍽️", "🥘", "🍕", "🥗"][index % 4];
      cover.append(coverText);
    }

    const details = document.createElement("div");
    details.className = "restaurant-card-content";
    const meta = document.createElement("div");
    meta.className = "restaurant-meta";
    const open = document.createElement("span");
    open.className = "open-badge";
    open.textContent = restaurant.isOpen ? "Open now" : "Closed";
    open.classList.toggle("closed-badge", !restaurant.isOpen);
    const delivery = document.createElement("span");
    delivery.className = "muted";
    const labels = { veg: "Veg only", nonVeg: "Non-Veg only", both: "Veg & Non-Veg" };
    delivery.textContent = labels[restaurant.foodType] || labels.both;
    meta.append(open, delivery);

    const title = document.createElement("h3");
    title.textContent = restaurant.name;
    const address = document.createElement("p");
    address.className = "restaurant-address";
    address.textContent = restaurant.address;
    const description = document.createElement("p");
    description.className = "restaurant-description";
    description.textContent = restaurant.description || "Freshly prepared favourites from your local kitchen.";
    const rating = document.createElement("p");
    rating.className = "restaurant-rating";
    rating.textContent = restaurant.ratingCount
      ? `★ ${Number(restaurant.ratingAverage).toFixed(1)} · ${restaurant.ratingCount} ${restaurant.ratingCount === 1 ? "review" : "reviews"}`
      : "No reviews yet";
    const hours = document.createElement("p");
    hours.className = "restaurant-service-detail muted";
    hours.textContent = formatTodayHours(restaurant.openingHours);
    const coverage = document.createElement("p");
    coverage.className = "restaurant-service-detail muted";
    coverage.textContent = formatDeliveryPincodes(restaurant.deliveryPincodes);
    const link = document.createElement("a");
    link.className = "card-action";
    link.href = `menu.html?id=${encodeURIComponent(restaurant._id)}`;
    link.textContent = "View menu";
    details.append(meta, title, rating, address, description, hours, coverage, link);
    card.append(cover, details);
    restaurantGrid.append(card);
  }
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span"); icon.className = "empty-icon"; icon.setAttribute("aria-hidden", "true"); icon.textContent = "⌕";
    const title = document.createElement("h3");
    const message = document.createElement("p");
    if (!allRestaurants.length) { title.textContent = "Mumbai menus are on the way"; message.textContent = "Restaurants will appear here once they’re approved."; }
    else {
      title.textContent = "No restaurants found";
      message.textContent = hasCompletePin
        ? `No listed restaurants deliver to PIN ${pin}. Try another PIN code.`
        : foodTypeFilter.value === "all"
          ? "Try another restaurant name or area."
        : `No ${foodTypeFilter.options[foodTypeFilter.selectedIndex].text} restaurants match. Try another food type or search.`;
    }
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
foodTypeFilter.addEventListener("change", renderRestaurants);
deliveryPincodeFilter.addEventListener("input", renderRestaurants);
loadRestaurants();
