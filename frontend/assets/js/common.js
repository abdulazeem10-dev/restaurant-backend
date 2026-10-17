// const API_BASE = "http://localhost:5000/api";
const API_BASE = "https://foodway-ten.vercel.app/api";
const TOKEN_KEY = "food-platform-token";
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function authHeaders(extra = {}) { return { ...extra, ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) }; }
function formatRupees(paise) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100); }
function readCart() { try { return JSON.parse(localStorage.getItem("food-platform-cart") || "null"); } catch { return null; } }
function writeCart(cart) { localStorage.setItem("food-platform-cart", JSON.stringify(cart)); updateCartCount(); }
function updateCartCount() { const el = document.querySelector("[data-cart-count]"); if (el) el.textContent = (readCart()?.items || []).reduce((sum, item) => sum + item.quantity, 0); }
function escapeHtml(value) { const el = document.createElement("span"); el.textContent = value ?? ""; return el.innerHTML; }
updateCartCount();
