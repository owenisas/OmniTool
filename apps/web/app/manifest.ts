import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OmniTool",
    short_name: "OmniTool",
    description:
      "Internal company app for performance tracking, issue tracking, notes, and AI agents.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    categories: ["productivity", "business", "developer"],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New Task",
        short_name: "Task",
        url: "/tasks?action=new",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "New Note",
        short_name: "Note",
        url: "/notes?action=new",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "My Work",
        short_name: "Work",
        url: "/work",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
