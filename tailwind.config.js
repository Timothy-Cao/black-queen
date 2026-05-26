/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          900: "#0b3d2e",
          800: "#0f5138",
          700: "#13684a",
        },
        gold: {
          400: "#f5c46b",
          500: "#e0a93a",
          600: "#b8851f",
        },
      },
      fontFamily: {
        display: ['"Cinzel"', "serif"],
      },
      boxShadow: {
        card: "0 6px 14px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.25)",
        "card-hover": "0 10px 22px rgba(0,0,0,0.45), 0 4px 8px rgba(0,0,0,0.3)",
        inset: "inset 0 0 40px rgba(0,0,0,0.4)",
      },
      keyframes: {
        dealCard: {
          "0%": { transform: "translate(0,0) scale(0.6)", opacity: 0 },
          "100%": { transform: "translate(var(--tx,0),var(--ty,0)) scale(1)", opacity: 1 },
        },
        floatIn: {
          "0%": { transform: "translateY(8px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(245,196,107,0.6)" },
          "50%": { boxShadow: "0 0 0 10px rgba(245,196,107,0)" },
        },
      },
      animation: {
        dealCard: "dealCard 350ms ease-out both",
        floatIn: "floatIn 250ms ease-out both",
        pulseGlow: "pulseGlow 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
