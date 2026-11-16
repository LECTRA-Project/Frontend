import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/global.css";
import App from "./app/App.jsx";
import { applyTheme, readTheme } from "./theme/theme.js";

// Before the first render, so a dark theme doesn't flash light while loading.
applyTheme(readTheme());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
