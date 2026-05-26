import { Card, RANK_LABEL, SUIT_GLYPHS } from "../game/types";
import { useCardSkin } from "./CardSkinContext";

interface Props {
  card?: Card;
  faceDown?: boolean;
  small?: boolean;
  disabled?: boolean;
  selected?: boolean;
  highlight?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  className?: string;
  dim?: boolean;
}

const SUIT_COLOR: Record<string, string> = {
  S: "#1a1714",
  C: "#2a3b22",
  H: "#c4222e",
  D: "#e5701a",
};

// Map our rank to htdebeer's SVG id suffix.
const SVG_RANK: Record<number, string> = {
  14: "1",     // Ace → 1
  13: "king",
  12: "queen",
  11: "jack",
  10: "10",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};
const SVG_SUIT: Record<string, string> = { S: "spade", H: "heart", D: "diamond", C: "club" };

export function CardView({
  card, faceDown, small, disabled, selected, highlight, onClick, style, className = "", dim,
}: Props) {
  const { skin } = useCardSkin();
  const w = small ? 56 : 84;
  const h = small ? 80 : 118;
  const sizeStyle: React.CSSProperties = { width: w, height: h };

  if (faceDown || !card) {
    return (
      <div
        className={`card-back shadow-card ${className}`}
        style={{ ...sizeStyle, ...style }}
      />
    );
  }

  const baseClass = `relative shadow-card transition-all select-none ${
    disabled ? "card-dim cursor-not-allowed" : "hover:-translate-y-2 hover:shadow-card-hover cursor-pointer"
  } ${selected ? "-translate-y-3 ring-2 ring-gold-400" : ""} ${
    highlight ? "ring-2 ring-amber-300 animate-pulseGlow" : ""
  } ${dim ? "card-dim" : ""} ${className}`;

  if (skin === "svg-classic") {
    const useId = `${SVG_SUIT[card.suit]}_${SVG_RANK[card.rank]}`;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`card-face overflow-hidden ${baseClass}`}
        style={{ ...sizeStyle, ...style, padding: 0 }}
        aria-label={`${RANK_LABEL[card.rank]} of ${card.suit}`}
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 169.075 244.640"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block" }}
        >
          <use href={`/cards/htdebeer.svg#${useId}`} />
        </svg>
      </button>
    );
  }

  // Classic hand-drawn
  const color = SUIT_COLOR[card.suit];
  const isFace = card.rank >= 11;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`card-face ${baseClass}`}
      style={{ ...sizeStyle, ...style, color }}
      aria-label={`${RANK_LABEL[card.rank]} of ${card.suit}`}
    >
      <div
        className="absolute leading-none font-bold flex flex-col items-center"
        style={{
          top: small ? 3 : 4,
          left: small ? 4 : 6,
          fontSize: small ? 11 : 14,
        }}
      >
        <div>{RANK_LABEL[card.rank]}</div>
        <div style={{ fontSize: small ? 10 : 13, marginTop: small ? 0 : 1 }}>{SUIT_GLYPHS[card.suit]}</div>
      </div>
      <div
        className="absolute inset-0 flex items-center justify-center font-bold"
        style={{ fontSize: small ? 22 : isFace ? 28 : 38, opacity: 0.92 }}
      >
        {isFace ? (
          <div className="flex flex-col items-center leading-none">
            <div style={{ fontSize: small ? 22 : 30 }}>{RANK_LABEL[card.rank]}</div>
            <div style={{ fontSize: small ? 14 : 22 }}>{SUIT_GLYPHS[card.suit]}</div>
          </div>
        ) : (
          SUIT_GLYPHS[card.suit]
        )}
      </div>
      <div
        className="absolute leading-none font-bold flex flex-col items-center rotate-180"
        style={{
          bottom: small ? 3 : 4,
          right: small ? 4 : 6,
          fontSize: small ? 11 : 14,
        }}
      >
        <div>{RANK_LABEL[card.rank]}</div>
        <div style={{ fontSize: small ? 10 : 13, marginTop: small ? 0 : 1 }}>{SUIT_GLYPHS[card.suit]}</div>
      </div>
      <div className="absolute inset-1 rounded-md pointer-events-none" style={{ boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} />
    </button>
  );
}
