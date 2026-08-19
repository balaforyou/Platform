/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary, #f3f4f6)",
        },
        /*
         * Semantic palette tokens (F-146).
         *
         * These extend the brand.* precedent above rather than adding a second mechanism: every
         * value resolves to a CSS variable defined in src/index.css, so re-theming stays a
         * token-value change instead of another sweep across component files.
         *
         * Deliberately NOT usable with Tailwind's /opacity modifier - the variables hold hex
         * colours, not the space-separated channels that `<alpha-value>` requires. Where a
         * translucent surface is genuinely needed (the sticky header), a dedicated token carries
         * the alpha instead. See --surface-header.
         */
        surface: {
          DEFAULT: "var(--surface-white)",       // cards, raised panels
          alt: "var(--surface-background)",      // page background
          mint: "var(--mint-surface)",           // subtle fills, chips, availability areas
          header: "var(--surface-header)",       // translucent sticky header (keeps backdrop-blur)
        },
        ink: {
          DEFAULT: "var(--text-primary)",        // headings, values, anything that must be read
          muted: "var(--text-secondary)",        // labels, metadata, secondary copy
        },
        edge: {
          DEFAULT: "var(--border-card)",         // card and divider borders
          strong: "var(--border-subtle)",        // emphasised separators, input borders
        },
      },
      /*
       * Inter as the default sans stack - this is the approved scope.
       *
       * Deliberately NOT defining `outfit` here. src/ uses `font-outfit` in 34 places but the key
       * has never existed in this config, so the class has always been a silent no-op and those
       * elements render in the default stack. Defining it now would quietly restyle 34 elements,
       * which is a rendering change nobody asked for and would be indistinguishable from a
       * re-theme side effect. Left as-is and reported instead.
       */
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        button: "var(--radius-button)",
      },
    },
  },
  plugins: [],
}
