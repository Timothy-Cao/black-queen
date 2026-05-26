import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CardSkin = "classic" | "svg-classic";

export const CARD_SKINS: { value: CardSkin; label: string; description: string }[] = [
  { value: "classic", label: "Hand-Drawn", description: "The original tabletop look — distinct red/orange suit shades." },
  { value: "svg-classic", label: "Classic SVG", description: "19th-century Goodall court designs (htdebeer/SVG-cards)." },
];

interface Ctx {
  skin: CardSkin;
  setSkin: (s: CardSkin) => void;
}

const SkinContext = createContext<Ctx>({ skin: "classic", setSkin: () => {} });

const STORAGE_KEY = "bq:card-skin";

export function CardSkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<CardSkin>(() => {
    if (typeof window === "undefined") return "classic";
    const v = window.localStorage.getItem(STORAGE_KEY);
    return (v === "svg-classic" || v === "classic") ? v : "classic";
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
