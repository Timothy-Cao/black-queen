import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CardSkin = "classic" | "svg-classic" | "jorel" | "poker-qr";

export const CARD_SKINS: { value: CardSkin; label: string; description: string }[] = [
  { value: "classic",     label: "Hand-Drawn",  description: "Original tabletop look." },
  { value: "svg-classic", label: "Classic SVG", description: "19th-century Goodall court art." },
  { value: "jorel",       label: "Pixel-Soft",  description: "Soft cartoon pixel deck." },
  { value: "poker-qr",    label: "Modern SVG",  description: "Bold geometric court art." },
];

interface Ctx {
  skin: CardSkin;
  setSkin: (s: CardSkin) => void;
}

const SkinContext = createContext<Ctx>({ skin: "poker-qr", setSkin: () => {} });

const STORAGE_KEY = "bq:card-skin";
// Bumping this performs a one-time reset to the current default deck, so an old
// saved choice (e.g. the previous "classic" default) doesn't stick. After the
// reset, the user's own picks are respected again.
const SKIN_VERSION_KEY = "bq:card-skin-v";
const CURRENT_SKIN_VERSION = "2"; // v2 = Modern SVG is the default for everyone

export function CardSkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<CardSkin>(() => {
    if (typeof window === "undefined") return "poker-qr";
    try {
      const ver = window.localStorage.getItem(SKIN_VERSION_KEY);
      if (ver !== CURRENT_SKIN_VERSION) {
        // One-time migration: make "Modern SVG" the default for everyone.
        window.localStorage.setItem(STORAGE_KEY, "poker-qr");
        window.localStorage.setItem(SKIN_VERSION_KEY, CURRENT_SKIN_VERSION);
        return "poker-qr";
      }
      const v = window.localStorage.getItem(STORAGE_KEY);
      return (v === "svg-classic" || v === "classic" || v === "jorel" || v === "poker-qr") ? v : "poker-qr";
    } catch { return "poker-qr"; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, skin); } catch { /* ignore */ }
  }, [skin]);
  return (
    <SkinContext.Provider value={{ skin, setSkin: setSkinState }}>
      {children}
    </SkinContext.Provider>
  );
}

export function useCardSkin(): Ctx {
  return useContext(SkinContext);
}
