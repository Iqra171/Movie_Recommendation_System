/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'DM Serif Display'", "Georgia", "serif"],
        sans:    ["'DM Sans'", "system-ui", "sans-serif"],
        mono:    ["'DM Mono'", "monospace"],
      },
      colors: {
        teal:  { DEFAULT: "#0d9488", 50: "#f0fdfa", 100: "#ccfbf1", 600: "#0d9488", 700: "#0f766e", 800: "#115e59" },
        slate: { 900: "#0f172a", 800: "#1e293b", 700: "#334155", 600: "#475569", 400: "#94a3b8", 200: "#e2e8f0" },
        amber: { 400: "#fbbf24", 500: "#f59e0b" },
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease forwards",
        "slide-up":   "slideUp 0.4s ease forwards",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:    { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
        slideUp:   { "0%": { opacity: 0, transform: "translateY(16px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        pulseSoft: { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.6 } },
      },
    },
  },
  plugins: [],
};
