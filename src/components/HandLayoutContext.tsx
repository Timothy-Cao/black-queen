import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// How the mobile hand is shown:
//  "swipe"   — bigger overlapped cards, scroll/swipe for the rest (default)
//  "compact" — every card visible at once, smaller, wrapped onto rows
export type HandLayout = "swipe" | "compact";

const KEY = "bq:handLayout";
const Ctx = createContext<{ layout: HandLayout; setLayout: (l: HandLayout) => void }>({
  layout: "swipe",
  setLayout: () => {},
});

export function HandLayoutProvider({ children }: { children: ReactNode }) {
  const [layout, setLayoutState] = useState<HandLayout>(() => {
    if (typeof window === "undefined") return "swipe";
    return window.localStorage.getItem(KEY) === "compact" ? "compact" : "swipe";
  });
  useEffect(() => {
    try { window.localStorage.setItem(KEY, layout); } catch { /* ignore */ }
  }, [layout]);
  return <Ctx.Provider value={{ layout, setLayout: setLayoutState }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useHandLayout = () => useContext(Ctx);
