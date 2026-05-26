import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { CardSkinProvider } from "./components/CardSkinContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CardSkinProvider>
      <App />
    </CardSkinProvider>
  </StrictMode>
);
