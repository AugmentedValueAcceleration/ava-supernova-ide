import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { hydratePlatformKey } from "./lib/shared-config";

// Reconcile the IDE's local platform key with the shared ~/.ava/config.json
// before React mounts. If the user signed in on a different surface (CLI or
// extension), we adopt that key. If we have one but the shared config does
// not, we write ours so the other surfaces can pick it up. Fire-and-forget —
// a delay here should never block the UI.
void hydratePlatformKey();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
