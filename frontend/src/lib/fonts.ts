import { Be_Vietnam_Pro, Fraunces, JetBrains_Mono } from "next/font/google";

// Display — the lexicon's voice. Fraunces is a literary "old-style" serif with
// real optical contrast; it carries headwords, headings, and the hero. Optical
// sizing (opsz) lets it stay elegant large and legible small.
export const display = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

// Body / UI — a clean humanist sans with full Vietnamese support, for all the
// chrome: buttons, labels, nav, forms, and running text.
export const body = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Mono — the pronunciation key: IPA, counters, tags, reference labels.
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});
