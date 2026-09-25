import type { MetadataRoute } from "next";
import { SITE_URL } from "@/site.config.mjs";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/telegram"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
