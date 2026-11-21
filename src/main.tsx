import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydrateProviderKeys, refreshProviderKeys } from "./lib/provider-keys";
import { ensureDataHome } from "./lib/data-root";
import { syncSharedOnboarding } from "./lib/shared-onboarding";
import { hydrateLocalModelKey, refreshLocalModelKey } from "./lib/keychain";
import { syncSharedSettings, watchSharedSettings } from "./lib/shared-settings";
import { restartSidecar } from "./lib/sidecar-boot";
import { getSidecar } from "./lib/sidecar";

// Provider keys come out of the OS keychain before React mounts — every
// picker and the sidecar config read them synchronously. Account-era data is
// brought home in the background; anything that reads ~/.ava waits for it.
void ensureDataHome();

// Everything else about the user is shared with the extension too, and read
// before the first render: what the welcome learned (consent, finished, your
// name) decides whether to show it at all, and the settings, avatar and
// personality are what every screen and the first sidecar start read.
Promise.allSettled([
  hydrateProviderKeys(),
  hydrateLocalModelKey(),
  syncSharedOnboarding(),
  syncSharedSettings("shared"),
]).finally(() => {
  // From here on, a change made in the extension arrives when this window
  // comes back into focus; a change made here goes out when it leaves.
  watchSharedSettings();
  // The months the old usage counter kept come into ~/.ava/usage once
  // (the Usage timeline, phase 3). A no-op on every later start.
  void import('./lib/usage-ledger').then((m) => m.importLegacyIdeUsage()).catch(() => {});
  window.addEventListener("focus", () => {
    void refreshProviderKeys();
    void refreshLocalModelKey().then((changed) => { if (changed && getSidecar().isReady) restartSidecar(); });
  });
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
