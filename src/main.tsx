import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { CardSkinProvider } from "./components/CardSkinContext";
import { DEFAULT_HARD_WEIGHTS, setActiveHardWeights, setGen2HardWeights } from "./game/aiHard";
import gen2Weights from "./game/tuned_weights_gen2.json";
import gen3Weights from "./game/tuned_weights_gen3.json";

// Install tuned generations so Hard-2 / Hard-3 use their real trained weights
// in the browser (they only existed in CLI sim tools before).
setGen2HardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen2Weights });
setActiveHardWeights({ ...DEFAULT_HARD_WEIGHTS, ...gen3Weights });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CardSkinProvider>
      <App />
    </CardSkinProvider>
  </StrictMode>
);
