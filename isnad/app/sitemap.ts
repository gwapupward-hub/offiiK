import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site.config.mjs";

export default function sitemap(): MetadataRoute.Sitemap {
  // Telegram routes require a signed session and are not public search pages.
  return ["/", "/ask"].map((path) => ({
    url: new URL(path, SITE_URL).href,
  }));
}
