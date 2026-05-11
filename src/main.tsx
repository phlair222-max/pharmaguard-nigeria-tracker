import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import ErrorBoundary from "./components/ErrorBoundary";

// Swallow runtime noise so transient async errors do not surface as overlays.
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.warn("[window error]", e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.warn("[unhandled rejection]", e.reason);
  e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
