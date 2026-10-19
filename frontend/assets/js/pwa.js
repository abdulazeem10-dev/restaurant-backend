const installButton = document.querySelector("#install-app");
const installHelp = document.querySelector("#install-app-help");
const isFoodwayAndroidApp = /FoodwayAndroidApp/i.test(navigator.userAgent);
let pendingInstallPrompt = null;

if (!isFoodwayAndroidApp && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(error => console.error("Foodway app setup failed:", error));
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  pendingInstallPrompt = event;
  if (installButton) installButton.hidden = false;
  if (installHelp) installHelp.hidden = true;
});

installButton?.addEventListener("click", async () => {
  if (!pendingInstallPrompt) return;
  pendingInstallPrompt.prompt();
  await pendingInstallPrompt.userChoice;
  pendingInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  pendingInstallPrompt = null;
  if (installButton) installButton.hidden = true;
  if (installHelp) installHelp.hidden = true;
});

if (/Android/i.test(navigator.userAgent) && !isFoodwayAndroidApp && installHelp && !window.matchMedia("(display-mode: standalone)").matches) installHelp.hidden = false;
