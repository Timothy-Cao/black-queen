import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { CardSkinProvider } from "./components/CardSkinContext";
import { AuthProvider } from "./auth/AuthContext";
import { DEFAULT_HARD_WEIGHTS, setActiveHardWeights, setGen2HardWeights } from "./game/aiHard";
import gen2Weights from "./game/tuned_weights_gen2.json";
import gen3Weights from "./game/tuned_weights_gen3.json";
import { warmWasm } from "./game/hard4Driver";

// Install tuned generations so Hard-2 / Hard-3 use their real trained weights
// in the browser (they only existed in CLI sim tools before).
setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights });
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights });

// Warm Hard-4 WASM (290KB) in the BACKGROUND after first paint, so it doesn't
// compete with the initial menu render. Fire-and-forget — the driver falls back
// to Hard-3 on the rare cold-start race where the AI is called before WASM is
// ready. By the time a user navigates the menu + lobby, it's warm.
const warm = () => { void warmWasm(); };
if (typeof requestIdleCallback === "function") requestIdleCallback(warm, { timeout: 3000 });
else setTimeout(warm, 1200);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <CardSkinProvider>
        <App />
      </CardSkinProvider>
    </AuthProvider>
  </StrictMode>
);
