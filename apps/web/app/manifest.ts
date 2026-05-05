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
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "New Task",
        short_name: "Task",
        url: "/tasks?action=new",
        icons: [{ src: "/icon.svg", sizes: "any" }],
      },
      {
        name: "New Note",
        short_name: "Note",
        url: "/notes?action=new",
        icons: [{ src: "/icon.svg", sizes: "any" }],
      },
      {
        name: "My Work",
        short_name: "Work",
        url: "/work",
        icons: [{ src: "/icon.svg", sizes: "any" }],
      },
    ],
  };
}
