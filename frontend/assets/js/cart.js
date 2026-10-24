const linesRoot = document.querySelector("#cart-lines");
const checkoutForm = document.querySelector("#checkout-form");
const addressSelect = document.querySelector("#saved-address-select");
let savedAddresses = [];

function setupGoogleAddressAutocomplete() {
  const input = document.querySelector("#address-search");
  const key = window.FOODWAY_GOOGLE_MAPS_API_KEY || "";
  if (!input || !key || key.startsWith("YOUR_")) return;
  const load = () => {
    if (!window.google?.maps?.places) return;
    const autocomplete = new google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: "in" },
      fields: ["address_components", "formatted_address"],
      types: ["address"]
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const parts = {};
      (place.address_components || []).forEach(component => component.types.forEach(type => { parts[type] = component.long_name; }));
      const flat = [parts.subpremise, parts.premise, parts.street_number].filter(Boolean).join(" ");
      const lane = [parts.route, parts.sublocality_level_2, parts.sublocality_level_1, parts.locality].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(", ");
      if (flat) checkoutForm.elements.flatBuilding.value = flat;
      if (lane) checkoutForm.elements.lane.value = lane;
      if (parts.postal_code) checkoutForm.elements.pincode.value = parts.postal_code;
      if (parts.point_of_interest || parts.establishment) checkoutForm.elements.landmark.value = parts.point_of_interest || parts.establishment;
      input.value = place.formatted_address || input.value;
      addressSelect.value = "";
      document.querySelector("#delete-saved-address").hidden = true;
      document.querySelector(".save-address-choice").hidden = false;
    });
  };
  if (window.google?.maps?.places) { load(); return; }
  const script = document.createElement("script");
  script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(key) + "&libraries=places";
  script.async = true; script.defer = true; script.onload = load;
  script.onerror = () => { document.querySelector("#error").textContent = "Google address suggestions could not load. You can still enter the address manually."; };
  document.head.append(script);
}

function fillSavedAddress(address) {
  if (!address) return;
  const recipientRadio = checkoutForm.querySelector(`input[name="recipientType"][value="${address.recipientType}"]`);
  if (recipientRadio) {
    recipientRadio.checked = true;
    recipientRadio.dispatchEvent(new Event("change"));
  }
  checkoutForm.elements.recipientName.value = address.name || "";
  checkoutForm.elements.recipientPhone.value = address.phone || "";
  checkoutForm.elements.flatBuilding.value = address.flatBuilding || "";
  checkoutForm.elements.lane.value = address.lane || "";
  checkoutForm.elements.landmark.value = address.landmark || "";
  checkoutForm.elements.pincode.value = address.pincode || "";
  checkoutForm.elements.addressLabel.value = address.label || "Home";
  checkoutForm.elements.saveAddress.checked = false;
}

function renderSavedAddresses() {
  const chosenId = addressSelect.value;
  addressSelect.replaceChildren(new Option("Enter a new address", ""));
  const seenAddresses = new Set();
  for (const address of savedAddresses) {
    const key = [address.recipientType, address.name, address.phone, address.flatBuilding, address.lane, address.landmark, address.pincode].map(value => String(value || "").trim().toLocaleLowerCase()).join("|");
    if (seenAddresses.has(key)) continue;
    seenAddresses.add(key);
    addressSelect.add(new Option(String(address.label || "Home") + " · " + String(address.flatBuilding || "") + ", " + String(address.pincode || ""), address._id));
  }
  if (savedAddresses.some(address => address._id === chosenId)) addressSelect.value = chosenId;
  document.querySelector("#delete-saved-address").hidden = !addressSelect.value;
}

async function loadSavedAddresses() {
  if (!getToken()) return;
  try {
    const response = await fetch(`${API_BASE}/customer/addresses`, { headers: authHeaders() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved addresses");
    savedAddresses = data.addresses || [];
    const rememberedAddressId = localStorage.getItem("foodway-default-address-id");
    const defaultAddress = savedAddresses.find(address => address._id === rememberedAddressId) || savedAddresses[0];
    renderSavedAddresses();
    if (defaultAddress && !addressSelect.value) {
      addressSelect.value = defaultAddress._id;
      fillSavedAddress(defaultAddress);
      document.querySelector("#delete-saved-address").hidden = false;
      document.querySelector(".save-address-choice").hidden = true;
    }
    const profileResponse = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
    if (profileResponse.ok) {
      const { user } = await profileResponse.json();
      if (user?.name && !checkoutForm.elements.recipientName.value) checkoutForm.elements.recipientName.value = user.name;
      const phoneDigits = String(user?.phone || "").replace(/\D/g, "");
      if (phoneDigits.length >= 10 && !checkoutForm.elements.recipientPhone.value) checkoutForm.elements.recipientPhone.value = phoneDigits.slice(-10);
    }
  } catch (error) {
    document.querySelector("#error").textContent = error.message;
  }
}

addressSelect.addEventListener("change", () => {
  const address = savedAddresses.find(item => item._id === addressSelect.value);
  if (address) {
    fillSavedAddress(address);
    localStorage.setItem("foodway-default-address-id", address._id);
  }
  document.querySelector("#delete-saved-address").hidden = !address;
  document.querySelector(".save-address-choice").hidden = Boolean(address);
});

document.querySelector("#delete-saved-address").addEventListener("click", async () => {
  const id = addressSelect.value;
  if (!id || !confirm("Delete this saved address?")) return;
  const error = document.querySelector("#error");
  try {
    const response = await fetch(`${API_BASE}/customer/addresses/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Could not delete this address"); }
    savedAddresses = savedAddresses.filter(item => item._id !== id);
    addressSelect.value = "";
    localStorage.removeItem("foodway-default-address-id");
    renderSavedAddresses();
    document.querySelector(".save-address-choice").hidden = false;
    error.textContent = "Saved address deleted.";
  } catch (deleteError) { error.textContent = deleteError.message; }
});

for (const field of ["recipientName", "recipientPhone", "flatBuilding", "lane", "landmark", "pincode"]) {
  checkoutForm.elements[field].addEventListener("input", () => {
    if (!addressSelect.value) return;
    addressSelect.value = "";
    document.querySelector("#delete-saved-address").hidden = true;
    document.querySelector(".save-address-choice").hidden = false;
    checkoutForm.elements.saveAddress.checked = false;
  });
}
checkoutForm.querySelectorAll('input[name="recipientType"]').forEach(input => {
  input.addEventListener("change", () => {
    const isOther = checkoutForm.querySelector('input[name="recipientType"]:checked').value === "other";
    document.querySelector("#delivery-name-label").textContent = isOther ? "Recipient name" : "Your name";
    document.querySelector("#address-recipient-label").textContent = isOther ? "Recipient delivery address" : "Your delivery address";
    document.querySelector("#recipient-hint").textContent = isOther
      ? "Enter the recipient’s name, mobile number, and delivery address below."
      : "Enter your contact and delivery details.";
  });
});

function renderCart() {
  const reorderNote = sessionStorage.getItem("food-platform-reorder-note");
  if (reorderNote) {
    document.querySelector("#notice").textContent = reorderNote;
    sessionStorage.removeItem("food-platform-reorder-note");
  }
  const cart = readCart();
  updateCartCount();
  linesRoot.replaceChildren();

  if (!cart?.items?.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state cart-empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "🛍️";
    const title = document.createElement("h3");
    title.textContent = "Your cart is empty";
    const message = document.createElement("p");
    message.textContent = "Find something delicious from a local restaurant.";
    const link = document.createElement("a");
    link.className = "hero-cta";
    link.href = "index.html#restaurant-listing";
    link.textContent = "Explore restaurants";
    empty.append(icon, title, message, link);
    linesRoot.append(empty);
    checkoutForm.hidden = true;
    document.querySelector(".checkout-progress").hidden = true;
    document.querySelector("#total").replaceChildren();
    return;
  }

  checkoutForm.hidden = false;
  document.querySelector(".checkout-progress").hidden = false;
  let total = 0;
  for (const item of cart.items) {
    total += item.pricePaise * item.quantity;
    const row = document.createElement("article");
    row.className = "cart-line-card";

    const itemDetails = document.createElement("div");
    itemDetails.className = "cart-line-details";
    const name = document.createElement("h3");
    name.textContent = item.name;
    const unitPrice = document.createElement("p");
    unitPrice.className = "muted";
    unitPrice.textContent = `${formatRupees(item.pricePaise)} each`;
    itemDetails.append(name, unitPrice);

    const controls = document.createElement("div");
    controls.className = "cart-line-controls";
    const quantityLabel = document.createElement("span");
    quantityLabel.className = "cart-quantity-label";
    quantityLabel.textContent = "Quantity";
    const quantityControl = document.createElement("div");
    quantityControl.className = "quantity-control";
    const decrease = document.createElement("button");
    decrease.type = "button";
    decrease.className = "quantity-button";
    decrease.textContent = "−";
    decrease.setAttribute("aria-label", `Remove one ${item.name}`);
    const quantity = document.createElement("output");
    quantity.className = "quantity-value";
    quantity.textContent = String(item.quantity);
    const increase = document.createElement("button");
    increase.type = "button";
    increase.className = "quantity-button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", `Add one ${item.name}`);

    decrease.disabled = item.quantity <= 1;
    increase.disabled = item.quantity >= 20;
    decrease.addEventListener("click", () => updateCartQuantity(cart, item, item.quantity - 1));
    increase.addEventListener("click", () => updateCartQuantity(cart, item, item.quantity + 1));
    quantityControl.append(decrease, quantity, increase);
    const linePrice = document.createElement("strong");
    linePrice.className = "cart-line-total";
    linePrice.textContent = formatRupees(item.pricePaise * item.quantity);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "cart-remove-button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${item.name} from cart`);
    remove.addEventListener("click", () => removeCartItem(cart, item));

    controls.append(quantityLabel, quantityControl, linePrice, remove);
    row.append(itemDetails, controls);
    linesRoot.append(row);
  }

  const totalBlock = document.querySelector("#total");
  totalBlock.replaceChildren();
  const totalLabel = document.createElement("span");
  totalLabel.textContent = "Item subtotal";
  const totalValue = document.createElement("strong");
  totalValue.textContent = formatRupees(total);
  const totalNote = document.createElement("small");
  totalNote.textContent = "Taxes and delivery fees are not included.";
  totalBlock.append(totalLabel, totalValue, totalNote);
}

function updateCartQuantity(cart, item, quantity) {
  item.quantity = Math.max(1, Math.min(20, quantity));
  writeCart(cart);
  renderCart();
}

function removeCartItem(cart, item) {
  cart.items = cart.items.filter(value => value.menuItemId !== item.menuItemId);
  if (!cart.items.length) localStorage.removeItem("food-platform-cart");
  else writeCart(cart);
  renderCart();
}

checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.querySelector("#error");
  error.textContent = "";
  if (!getToken()) {
    location.href = `login.html?next=${encodeURIComponent("cart.html")}`;
    return;
  }

  const cart = readCart();
  if (!cart?.items?.length) return;
  const formData = new FormData(checkoutForm);
  const deliveryDetails = {
    recipientType: formData.get("recipientType"),
    name: String(formData.get("recipientName") || "").trim(),
    phone: String(formData.get("recipientPhone") || "").trim(),
    flatBuilding: String(formData.get("flatBuilding") || "").trim(),
    lane: String(formData.get("lane") || "").trim(),
    landmark: String(formData.get("landmark") || "").trim(),
    pincode: String(formData.get("pincode") || "").trim()
  };
  const deliveryAddress = [deliveryDetails.flatBuilding, deliveryDetails.lane, deliveryDetails.landmark, deliveryDetails.pincode]
    .filter(Boolean).join(", ");
  const button = checkoutForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/restaurants/${encodeURIComponent(cart.restaurantId)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check restaurant delivery availability.");
    if (!data.restaurant.isOpen) throw new Error("This restaurant is currently closed and cannot accept your order.");
    if (data.restaurant.deliveryPincodes?.length && !data.restaurant.deliveryPincodes.includes(deliveryDetails.pincode)) {
      const servedAreas = (data.restaurant.deliveryAreas || []).map(area => area.name).filter(Boolean);
      const areaHint = servedAreas.length ? ` It currently serves ${servedAreas.join(", ")}.` : "";
      throw new Error(`This restaurant does not deliver to PIN code ${deliveryDetails.pincode}.${areaHint} Update the address or choose another restaurant.`);
    }
    const matchedArea = (data.restaurant.deliveryAreas || []).find(area => area.pincodes?.includes(deliveryDetails.pincode));
    if (matchedArea) deliveryDetails.deliveryAreaName = matchedArea.name;
    if (formData.get("saveAddress") === "on" && !addressSelect.value) {
      const saveResponse = await fetch(`${API_BASE}/customer/addresses`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          label: String(formData.get("addressLabel") || "Home").trim() || "Home",
          recipientType: deliveryDetails.recipientType,
          name: deliveryDetails.name,
          phone: deliveryDetails.phone,
          flatBuilding: deliveryDetails.flatBuilding,
          lane: deliveryDetails.lane,
          landmark: deliveryDetails.landmark,
          pincode: deliveryDetails.pincode
        })
      });
      const savedData = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(savedData.error || "Could not save this address");
      if (savedData.address?._id) localStorage.setItem("foodway-default-address-id", savedData.address._id);
    }
    sessionStorage.setItem("food-platform-checkout", JSON.stringify({ deliveryDetails, deliveryAddress }));
    location.href = "payment.html";
  } catch (submitError) {
    error.textContent = submitError.message;
    button.disabled = false;
  }
});

renderCart();
document.querySelector(".save-address-choice").hidden = false;
loadSavedAddresses();
setupGoogleAddressAutocomplete();
