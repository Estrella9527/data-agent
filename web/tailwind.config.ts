import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: {
          DEFAULT: "var(--foreground)",
          "2": "var(--foreground-2)",
          "3": "var(--foreground-3)",
          "5": "var(--foreground-5)",
          "7": "var(--foreground-7)",
          "10": "var(--foreground-10)",
          "15": "var(--foreground-15)",
          "20": "var(--foreground-20)",
          "30": "var(--foreground-30)",
          "40": "var(--foreground-40)",
          "50": "var(--foreground-50)",
          "60": "var(--foreground-60)",
          "70": "var(--foreground-70)",
          "80": "var(--foreground-80)",
          "90": "var(--foreground-90)",
          "95": "var(--foreground-95)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          subtle: "var(--accent-subtle)",
          foreground: "var(--accent-foreground)",
        },
        info: {
          DEFAULT: "var(--info)",
          subtle: "var(--info-subtle)",
          foreground: "var(--info-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          subtle: "var(--success-subtle)",
          foreground: "var(--success-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          hover: "var(--destructive-hover)",
          subtle: "var(--destructive-subtle)",
          foreground: "var(--destructive-foreground)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        base: ["15px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        outer: "var(--radius-outer)",
        inner: "var(--radius-inner)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        minimal: "var(--shadow-minimal)",
        "modal-small": "var(--shadow-modal-small)",
        modal: "var(--shadow-modal)",
      },
      spacing: {
        "panel-gap": "var(--panel-gap)",
        "panel-padding": "var(--panel-padding)",
      },
      transitionTimingFunction: {
        spring: "var(--spring-easing)",
      },
      transitionDuration: {
        spring: "var(--spring-duration)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography"), require("tailwindcss-animate")],
};
export default config;
