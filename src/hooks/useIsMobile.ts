import { useEffect, useState } from "react";

// True on narrow screens (phones), where the desktop ellipse-table layout
// doesn't fit and we switch to the vertical MobileGame layout.
const QUERY = "(max-width: 700px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}
