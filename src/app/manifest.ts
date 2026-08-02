import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next injects the <link rel="manifest">.
// Icons are generated from public/icon-source.png by placing the circular
// crest on solid brand-navy squares — regenerate or replace the files in
// public/icons/ to change them (docs/SETUP.md § App icon).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tudor Hall — Staff",
    short_name: "Tudor Hall",
    description: "Resident management for Tudor Hall staff.",
    start_url: "/",
    display: "standalone",
    // Splash/backdrop = the app's canvas navy; theme = the brand navy.
    background_color: "#0a1633",
    theme_color: "#16264a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
