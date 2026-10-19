// Replace this value with the Google OAuth 2.0 Web Client ID from Google Cloud.
// The Client ID is public; never put a Google client secret in frontend code.
const GOOGLE_CLIENT_ID = "852447387928-qvqa0a8mvcv37v0qdlkihftumv9ii4ld.apps.googleusercontent.com";

function renderGoogleSignInButton() {
  const container = document.querySelector("#google-signin-button");
  if (!container) return;
  const divider = document.querySelector(".auth-divider");

  function showFallback(message) {
    container.classList.add("is-fallback");
    container.hidden = false;
    container.textContent = message;
  }

  if (GOOGLE_CLIENT_ID.startsWith("YOUR_")) {
    showFallback("Google sign-in is unavailable. Use email or phone instead.");
    return;
  }

  function initializeGoogleSignIn() {
    if (!window.google?.accounts?.id) {
      showFallback("Google sign-in is unavailable. Use email or phone instead.");
      return;
    }
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential
      });
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(320, Math.max(220, container.parentElement.clientWidth || 320))
      });
      container.classList.remove("is-fallback");
      container.hidden = false;
      if (divider) divider.hidden = false;
    } catch {
      showFallback("Google sign-in is unavailable. Use email or phone instead.");
    }
  }

  if (window.google?.accounts?.id) {
    initializeGoogleSignIn();
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.async = true;
  script.defer = true;
  script.onload = initializeGoogleSignIn;
  script.onerror = () => {
    showFallback("Google sign-in is unavailable. Use email or phone instead.");
  };
  document.head.append(script);
}

async function handleGoogleCredential(response) {
  const message = document.querySelector("#message");
  if (message) setStatusMessage(message, "Signing in with Google…");

  try {
    const result = await fetch(`${API_BASE}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || "Google sign-in failed");

    sessionStorage.setItem(TOKEN_KEY, data.accessToken);
    location.href = new URLSearchParams(location.search).get("next") === "cart.html"
      ? "cart.html"
      : "index.html";
  } catch (error) {
    if (message) setStatusMessage(message, error.message, "error");
  }
}
