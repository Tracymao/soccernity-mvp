import type { HtmlTagDescriptor, Plugin } from "vite";

// Document basics for index.html: robots meta, robots.txt, canonical and og:url.
//
// Indexing is OFF by default in every environment, production included. It is switched on only by the
// exact build-time value VITE_SITE_INDEXABLE=true (the founder sets it at the launch gate), and then
// VITE_SITE_URL must be an https origin with no path, or the build fails (a wrong canonical is worse
// than no build). The site is one single-page app on one shared index.html, so the canonical and og:url
// are the origin plus "/", not a per-page address.

export interface DocumentBasics {
  indexable: boolean;
  /** Origin plus "/", only when indexable. */
  canonicalUrl: string | null;
}

export function resolveDocumentBasics(
  env: Record<string, string | undefined>,
  isBuild: boolean,
): DocumentBasics {
  if (!isBuild || env.VITE_SITE_INDEXABLE !== "true") {
    return { indexable: false, canonicalUrl: null };
  }
  const raw = env.VITE_SITE_URL;
  let origin: URL | null = null;
  try {
    origin = raw ? new URL(raw) : null;
  } catch {
    origin = null;
  }
  const valid =
    origin !== null &&
    origin.protocol === "https:" &&
    (origin.pathname === "/" || origin.pathname === "") &&
    !origin.search &&
    !origin.hash &&
    !origin.username &&
    !origin.password &&
    // new URL() normalises, so also require the text to be a bare origin (optional trailing slash).
    raw!.replace(/\/$/, "") === origin.origin;
  if (!valid) {
    throw new Error(
      "VITE_SITE_INDEXABLE is \"true\" but VITE_SITE_URL is missing or is not an https origin with no path " +
        "(for example https://soccernity.com). Set VITE_SITE_URL to the site origin or set VITE_SITE_INDEXABLE to anything else.",
    );
  }
  return { indexable: true, canonicalUrl: `${origin!.origin}/` };
}

export function robotsTxt(basics: DocumentBasics): string {
  return basics.indexable ? "User-agent: *\nAllow: /\n" : "User-agent: *\nDisallow: /\n";
}

export const SHARE_IMAGE_PATH = "/share-image.png";
export const SHARE_IMAGE_ALT = "Soccernity. Where the whole game lives.";

export function documentBasicsTags(basics: DocumentBasics): HtmlTagDescriptor[] {
  if (!basics.indexable) {
    return [
      { tag: "meta", attrs: { name: "robots", content: "noindex, nofollow" }, injectTo: "head" },
      { tag: "meta", attrs: { name: "twitter:card", content: "summary" }, injectTo: "head" },
    ];
  }
  // A social crawler needs an absolute image URL, so the image tags exist only here, with the canonical.
  const image = `${new URL(basics.canonicalUrl!).origin}${SHARE_IMAGE_PATH}`;
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({ tag: "meta", attrs, injectTo: "head" });
  return [
    { tag: "link", attrs: { rel: "canonical", href: basics.canonicalUrl! }, injectTo: "head" },
    meta({ property: "og:url", content: basics.canonicalUrl! }),
    meta({ property: "og:image", content: image }),
    meta({ property: "og:image:type", content: "image/png" }),
    meta({ property: "og:image:width", content: "1200" }),
    meta({ property: "og:image:height", content: "630" }),
    meta({ property: "og:image:alt", content: SHARE_IMAGE_ALT }),
    meta({ name: "twitter:card", content: "summary_large_image" }),
    meta({ name: "twitter:image", content: image }),
    meta({ name: "twitter:image:alt", content: SHARE_IMAGE_ALT }),
  ];
}

export function documentBasicsPlugin(): Plugin {
  let basics: DocumentBasics = { indexable: false, canonicalUrl: null };
  return {
    name: "soccernity-document-basics",
    configResolved(config) {
      basics = resolveDocumentBasics(config.env as Record<string, string | undefined>, config.command === "build");
    },
    transformIndexHtml() {
      return documentBasicsTags(basics);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(basics) });
    },
    configureServer(server) {
      server.middlewares.use("/robots.txt", (_req, res) => {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(robotsTxt(basics));
      });
    },
  };
}
