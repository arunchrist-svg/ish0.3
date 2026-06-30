import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ISH Sales Hub",
    short_name: "Sales Hub",
    description: "Scout, enrich, and approve AI outreach from anywhere.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fa",
    theme_color: "#83a2db",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
