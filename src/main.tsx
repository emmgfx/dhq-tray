import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppUpdateProvider } from "./appUpdate";
import "./styles.css";

// The browser context menu (Reload, Inspect…) gives the webview away; keep it
// only where it is useful: text fields, for copy and paste.
document.addEventListener("contextmenu", (event) => {
  const target = event.target as HTMLElement;
  if (!target.closest("input, textarea")) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppUpdateProvider>
      <App />
    </AppUpdateProvider>
  </React.StrictMode>,
);
