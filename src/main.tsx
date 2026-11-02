import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydrateProviderKeys, refreshProviderKeys } from "./lib/provider-keys";
import { ensureDataHome } from "./lib/data-root";

// Provider keys come out of the OS keychain before React mounts — every
// picker and the sidecar config read them synchronously. Account-era data is
// brought home in the background; anything that reads ~/.ava waits for it.
void ensureDataHome();

hydrateProviderKeys().finally(() => {
// Keys the extension adds or removes land in the same keychain entries.
window.addEventListener("focus", () => { void refreshProviderKeys(); });
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
});
