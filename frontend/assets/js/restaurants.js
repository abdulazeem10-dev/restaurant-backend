const restaurantGrid = document.querySelector("#restaurants");
const searchInput = document.querySelector("#search-input");
const sortSelect = document.querySelector("#sort-select");
const deliveryPincodeFilter = document.querySelector("#delivery-pincode-filter");
const resultCount = document.querySelector("#results-count");
const clearFiltersButton = document.querySelector("#clear-filters");
const quickFoodFilters = [...document.querySelectorAll("[data-quick-food]")];
const cuisineFilters = [...document.querySelectorAll("[data-cuisine-filter]")];
const cuisineTrack = document.querySelector("#cuisine-track");
const cuisineImageFiles = Object.freeze({
  "north-indian": "north-indian.webp",
  pizza: "pizza.webp",
  chinese: "chinese.webp",
  desserts: "desserts.webp",
  burger: "burger.webp",
  biryani: "biryani.webp",
  "south-indian": "south-indian.webp",
  noodles: "noodles.webp",
  rolls: "rolls.webp",
  shawarma: "shawarma.webp",
  vada: "vada.jpg",
  dosa: "dosa.webp",
  momo: "momo.webp",
  salads: "salads.webp",
  other: "other.webp"
});
let selectedFoodFilter = "all";
let selectedCuisineFilter = "all";
let allRestaurants = [];

async function setupHomeAccountNav() {
  if (!getToken()) return;
  try {
    const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (response.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      return;
    }
    if (!response.ok) return;
    const { user } = await response.json();
    const destinations = {
      admin: ["../admin/dashboard.html", "Admin dashboard"],
      restaurant: ["../restaurant/dashboard.html", "Restaurant dashboard"],
      delivery: ["../delivery/dashboard.html", "Delivery dashboard"]
    };
    const destination = destinations[user?.role];
    const dashboardLink = document.querySelector("#dashboard-link");
    if (destination && dashboardLink) {
      dashboardLink.href = destination[0];
      dashboardLink.textContent = destination[1];
      dashboardLink.hidden = false;
    }
    const loginLink = document.querySelector(".login-link");
    if (loginLink) loginLink.hidden = true;
    const logout = document.querySelector("#home-logout");
    if (logout) {
      logout.hidden = false;
      logout.addEventListener("click", () => {
        sessionStorage.removeItem(TOKEN_KEY);
        location.href = "index.html";
      }, { once: true });
    }
  } catch {
    // Keep the public home page usable if the API cannot be reached.
  }
}

function formatTodayHours(openingHours) {
  if (!openingHours) return "Hours not listed";
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
  if (!pincodes.length) return "Delivery areas not listed";
  const visible = pincodes.slice(0, 3).join(", ");
  return `Delivers to ${visible}${pincodes.length > 3 ? ` +${pincodes.length - 3} more` : ""}`;
}

function getCuisineImage(restaurant) {
  const cuisines = Array.isArray(restaurant.cuisines) ? restaurant.cuisines : [];
  const cuisine = [...cuisines, restaurant.cuisine].find(value =>
    typeof value === "string" && Object.prototype.hasOwnProperty.call(cuisineImageFiles, value)
  ) || "other";
  return `../assets/images/cuisines/${cuisineImageFiles[cuisine]}`;
}

function renderRestaurants() {
  const term = searchInput.value.trim().toLocaleLowerCase();
  const pin = deliveryPincodeFilter.value.trim();
  const hasCompletePin = /^\d{6}$/.test(pin);
  const hasActiveFilters = Boolean(term || pin || selectedFoodFilter !== "all" || selectedCuisineFilter !== "all" || sortSelect.value !== "name");
  clearFiltersButton.hidden = !hasActiveFilters;
  quickFoodFilters.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.quickFood === selectedFoodFilter));
  });
  cuisineFilters.forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.cuisineFilter === selectedCuisineFilter));
  });
  const matches = allRestaurants.filter(restaurant => {
    const searchMatches = `${restaurant.name} ${restaurant.address} ${restaurant.description || ""}`.toLocaleLowerCase().includes(term);
    // Treat missing foodType values from older records as mixed restaurants.
    const foodType = ["veg", "nonVeg", "both"].includes(restaurant.foodType)
      ? restaurant.foodType
      : "both";
    const foodTypeMatches = selectedFoodFilter === "all" || foodType === selectedFoodFilter;
    const restaurantCuisines = Array.isArray(restaurant.cuisines) && restaurant.cuisines.length
      ? restaurant.cuisines
      : [restaurant.cuisine || "other"];
    const cuisineMatches = selectedCuisineFilter === "all" || restaurantCuisines.includes(selectedCuisineFilter);
    const pinMatches = !hasCompletePin || (restaurant.deliveryPincodes || []).includes(pin);
    return searchMatches && foodTypeMatches && cuisineMatches && pinMatches;
  });
  matches.sort((a, b) => sortSelect.value === "name-desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));

  restaurantGrid.replaceChildren();
  const openCount = matches.filter(restaurant => restaurant.isOpen).length;
  resultCount.textContent = `${openCount} open now · ${matches.length} ${matches.length === 1 ? "restaurant" : "restaurants"}${pin && !hasCompletePin ? " · Enter a complete 6-digit PIN to filter delivery areas" : ""}`;
  for (const [index, restaurant] of matches.entries()) {
    const card = document.createElement("article");
    card.className = "restaurant-card";
    const cover = document.createElement("div");
    cover.className = `restaurant-cover cover-${index % 4} has-image`;
    cover.setAttribute("aria-hidden", "true");
    const coverImage = document.createElement("img");
    const cuisineImage = getCuisineImage(restaurant);
    let showingCuisineImage = !restaurant.imageUrl;
    coverImage.src = restaurant.imageUrl || cuisineImage;
    coverImage.alt = "";
    coverImage.loading = "lazy";
    coverImage.decoding = "async";
    coverImage.addEventListener("error", () => {
      if (!showingCuisineImage) {
        showingCuisineImage = true;
        coverImage.src = cuisineImage;
        return;
      }
      cover.classList.remove("has-image");
      coverImage.remove();
    });
    cover.append(coverImage);

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

    const identity = document.createElement("div");
    identity.className = "restaurant-identity";
    const title = document.createElement("h3");
    title.textContent = restaurant.name;
    identity.append(title);
    const address = document.createElement("p");
    address.className = "restaurant-address";
    address.textContent = restaurant.address;
    const description = document.createElement("p");
    description.className = "restaurant-description";
    description.textContent = restaurant.description || "Freshly prepared favourites from your local kitchen.";
    const rating = document.createElement("span");
    rating.className = "restaurant-rating";
    rating.textContent = restaurant.ratingCount
      ? `★ ${Number(restaurant.ratingAverage).toFixed(1)} · ${restaurant.ratingCount} ${restaurant.ratingCount === 1 ? "review" : "reviews"}`
      : "New";
    rating.setAttribute("aria-label", restaurant.ratingCount
      ? `Rated ${Number(restaurant.ratingAverage).toFixed(1)} out of 5 from ${restaurant.ratingCount} ${restaurant.ratingCount === 1 ? "review" : "reviews"}`
      : "New restaurant, no reviews yet");
    identity.append(rating);
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
    const service = document.createElement("div");
    service.className = "restaurant-service-list";
    const hoursLine = document.createElement("span");
    hoursLine.textContent = `◷ ${hours.textContent}`;
    const coverageLine = document.createElement("span");
    coverageLine.textContent = `⌖ ${coverage.textContent}`;
    service.append(hoursLine, coverageLine);
    details.append(meta, identity, address, description, service, link);
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
        : selectedCuisineFilter !== "all"
          ? `No ${selectedCuisineFilter.replaceAll("-", " ")} restaurants match. Try another cuisine or clear filters.`
        : selectedFoodFilter === "all"
          ? "Try another restaurant name or area, or choose a different cuisine."
        : `No ${selectedFoodFilter === "veg" ? "Veg" : "Non-Veg"} restaurants match. Try another food type or search.`;
    }
    empty.append(icon, title, message);
    restaurantGrid.append(empty);
  }
}

async function loadRestaurants() {
  const error = document.querySelector("#error");
  restaurantGrid.setAttribute("aria-busy", "true");
  resultCount.textContent = "Finding restaurants nearby…";
  restaurantGrid.replaceChildren(...Array.from({ length: 3 }, () => {
    const card = document.createElement("article");
    card.className = "restaurant-card restaurant-card-skeleton";
    card.setAttribute("aria-hidden", "true");
    const cover = document.createElement("div");
    cover.className = "skeleton-cover";
    const details = document.createElement("div");
    details.className = "skeleton-details";
    for (let index = 0; index < 7; index += 1) details.append(document.createElement("span"));
    card.append(cover, details);
    return card;
  }));
  try {
    const response = await fetch(`${API_BASE}/restaurants`);
    if (!response.ok) throw new Error("Unable to load restaurants");
    const data = await response.json();
    allRestaurants = data.restaurants || [];
    restaurantGrid.setAttribute("aria-busy", "false");
    renderRestaurants();
    error.textContent = "";
  } catch {
    restaurantGrid.setAttribute("aria-busy", "false");
    resultCount.textContent = "";
    const state = document.createElement("div");
    state.className = "empty-state restaurant-load-error";
    const title = document.createElement("h3");
    title.textContent = "Restaurants aren’t available right now";
    const message = document.createElement("p");
    message.textContent = "Check your connection and try again.";
    const retry = document.createElement("button");
    retry.className = "hero-cta";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", loadRestaurants, { once: true });
    state.append(title, message, retry);
    restaurantGrid.replaceChildren(state);
    error.textContent = "";
  }
}

document.querySelector("#restaurant-search").addEventListener("submit", event => { event.preventDefault(); renderRestaurants(); });
searchInput.addEventListener("input", renderRestaurants);
sortSelect.addEventListener("change", renderRestaurants);
deliveryPincodeFilter.addEventListener("input", renderRestaurants);
quickFoodFilters.forEach(button => button.addEventListener("click", () => {
  selectedFoodFilter = button.dataset.quickFood;
  renderRestaurants();
}));
cuisineFilters.forEach(button => button.addEventListener("click", () => {
  selectedCuisineFilter = button.dataset.cuisineFilter;
  renderRestaurants();
  document.querySelector("#restaurant-listing").scrollIntoView({ behavior: "smooth", block: "start" });
}));
document.querySelector("#cuisine-scroll-left").addEventListener("click", () => {
  cuisineTrack.scrollBy({ left: -Math.max(280, cuisineTrack.clientWidth * .75), behavior: "smooth" });
});
document.querySelector("#cuisine-scroll-right").addEventListener("click", () => {
  cuisineTrack.scrollBy({ left: Math.max(280, cuisineTrack.clientWidth * .75), behavior: "smooth" });
});
clearFiltersButton.addEventListener("click", () => {
  searchInput.value = "";
  deliveryPincodeFilter.value = "";
  selectedFoodFilter = "all";
  selectedCuisineFilter = "all";
  sortSelect.value = "name";
  renderRestaurants();
  searchInput.focus();
});
loadRestaurants();
setupHomeAccountNav();
