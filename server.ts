import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Increase body parser limits for base64 image uploads
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// CORS and Anti-Hotlinking bypass proxy
app.get("/api/proxy", async (req, res) => {
  let targetUrl = req.query.url as string;

  const isJsonRequest = (urlStr: string) => {
    if (!urlStr) return false;
    const lower = urlStr.toLowerCase();
    return lower.includes(".json") || lower.includes("api.") || lower.includes("/api/") || lower.includes("feed");
  };

  if (!targetUrl || targetUrl === "undefined" || targetUrl === "null" || targetUrl.trim() === "") {
    if (targetUrl && isJsonRequest(targetUrl)) {
      return res.status(200).json({ error: "Missing or invalid url parameter", data: [] });
    }
    const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(transparentGif);
  }

  // Auto-prepend https:// if missing protocol to handle users copy-pasting domains directly
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = "https://" + targetUrl;
  }

  try {
    const parsedUrl = (() => {
      try {
        return new URL(targetUrl);
      } catch (e) {
        return null;
      }
    })();

    let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    if (isJsonRequest(targetUrl) || (parsedUrl && parsedUrl.hostname.includes("mangadex.org"))) {
      userAgent = "MangaReader/1.0";
    }

    const headers: Record<string, string> = {
      "User-Agent": userAgent,
      "Accept": isJsonRequest(targetUrl)
        ? "application/json, text/plain, */*"
        : "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    let finalUrl = targetUrl;
    // Inject referer to bypass hotlink blockages (e.g. MangaDex, Mangakakalot, etc.)
    if (req.query.referer) {
      headers["Referer"] = req.query.referer as string;
    } else {
      if (parsedUrl) {
        finalUrl = parsedUrl.toString();
        if (parsedUrl.hostname.includes("mangadex.org")) {
          headers["Referer"] = "https://mangadex.org/";
        } else {
          headers["Referer"] = parsedUrl.origin + "/";
        }
      }
    }

    // Always ensure square brackets in query string/paths are encoded for strict API gateways
    finalUrl = finalUrl.replace(/\[/g, "%5B").replace(/\]/g, "%5D");

    const controller = new AbortController();
    const proxyTimeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(finalUrl, { headers, signal: controller.signal });
    } finally {
      clearTimeout(proxyTimeout);
    }

    if (!response.ok) {
      console.warn(`Proxy failed to fetch target URL: ${finalUrl}, status: ${response.status}`);
      if (isJsonRequest(finalUrl)) {
        return res.status(200).json({ error: `Failed to fetch target URL: ${response.statusText} (${response.status})`, status: response.status });
      }
      const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
      res.setHeader("Content-Type", "image/gif");
      res.setHeader("Cache-Control", "public, max-age=60");
      return res.status(200).send(transparentGif);
    }

    // Set standard CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // Cache responses for fast reading
    res.setHeader("Cache-Control", "public, max-age=86400");

    const reader = response.body?.getReader();
    if (!reader) {
      if (isJsonRequest(finalUrl)) {
        return res.status(200).json({ error: "Cannot read response body stream" });
      }
      const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
      res.setHeader("Content-Type", "image/gif");
      return res.status(200).send(transparentGif);
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error: any) {
    console.error("Proxy error fetching:", targetUrl, error);
    if (isJsonRequest(targetUrl)) {
      return res.status(200).json({ error: error.message || "Proxy connection failed" });
    }
    const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.setHeader("Content-Type", "image/gif");
    return res.status(200).send(transparentGif);
  }
});

// Serve Vite middleware in dev, otherwise serve static frontend build in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
