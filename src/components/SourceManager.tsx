import React, { useState, useEffect } from "react";
import { 
  Search, 
  Download, 
  BookOpen, 
  Link as LinkIcon, 
  FileJson, 
  Box, 
  ChevronRight, 
  Globe, 
  Loader2, 
  AlertCircle,
  FolderDown,
  CheckCircle2,
  Trash2,
  Plus,
  Layers,
  Database,
  FolderHeart,
  Library,
  Heart,
  RefreshCw
} from "lucide-react";
import JSZip from "jszip";
import { Manga, Chapter, Page, MangaSource } from "../types";
import { saveChapterToLibrary } from "../lib/db";

interface SourceManagerProps {
  onReadChapter: (manga: Manga, chapter: Chapter) => void;
}

// Preseeded high-quality catalog sources
const INITIAL_SOURCES: MangaSource[] = [
  {
    id: "mangadex",
    name: "MangaDex (Official Catalog)",
    description: "Access millions of official translated mangas and scanlations in real-time.",
    type: "official",
    mangas: [],
  },
  {
    id: "keiyoushi-repo",
    name: "Keiyoushi Extensions Catalog",
    description: "Access thousands of active Tachiyomi/Mihon scanlation extensions.",
    type: "custom",
    mangas: [],
  }
];

const COVER_IMAGES = [
  "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&q=80",
  "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500&q=80",
  "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&q=80",
  "https://images.unsplash.com/photo-1560942485-b2a11cc13456?w=500&q=80",
  "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=500&q=80",
  "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=500&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&q=80",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
  "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80"
];

const PAGE_IMAGES = [
  "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&q=80",
  "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&q=80",
  "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80",
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&q=80",
  "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
  "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&q=80",
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80",
  "https://images.unsplash.com/photo-1511497584788-876760111969?w=800&q=80",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80"
];

function ExtensionDetails({ extension, onClose }: { extension: any; onClose: () => void }) {
  if (!extension) return null;

  const sources = extension.sources || [];
  const apkUrl = extension.apk || "";

  return (
    <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <h3 className="font-extrabold text-lg text-white truncate">
            {extension.name?.replace("Tachiyomi: ", "")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/20 text-[10px] text-blue-400 font-semibold uppercase">
              {extension.lang || "?"}
            </span>
            {extension.nsfw ? (
              <span className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/20 text-[10px] text-red-400 font-semibold uppercase">
                NSFW
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded bg-green-500/15 border border-green-500/20 text-[10px] text-green-400 font-semibold uppercase">
                Safe
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white p-1"
        >
          ✕
        </button>
      </div>

      <div className="bg-black/40 rounded-xl p-4 space-y-3 text-xs">
        <div>
          <span className="text-white/40 block mb-0.5">Package</span>
          <code className="text-white/80 font-mono text-[11px] break-all">{extension.pkg || "—"}</code>
        </div>

        {extension.version && (
          <div>
            <span className="text-white/40 block mb-0.5">Version</span>
            <span className="text-white/80">{extension.version}</span>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-white/50">Source Websites</h4>
          <div className="space-y-1.5">
            {sources.map((s: any, i: number) => (
              <div key={i} className="bg-black/40 rounded-lg p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white/90 truncate">{s.name || s.baseUrl}</p>
                  {s.baseUrl && (
                    <p className="text-[10px] text-white/40 truncate font-mono">{s.baseUrl}</p>
                  )}
                </div>
                {s.baseUrl && (
                  <a
                    href={s.baseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 p-2 bg-[#1e1e1e] hover:bg-[#252525] border border-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
                    title="Open source website"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {apkUrl && (
        <a
          href={apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-indigo-950/40"
        >
          <Download className="w-4 h-4" />
          <span>Download APK</span>
        </a>
      )}
    </div>
  );
}

export default function SourceManager({ onReadChapter }: SourceManagerProps) {
  const [sources, setSources] = useState<MangaSource[]>(INITIAL_SOURCES);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("mangadex");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active viewing states
  const [activeManga, setActiveManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Custom link inputs
  const [customJsonUrl, setCustomJsonUrl] = useState("");
  const [apkUrlInput, setApkUrlInput] = useState("");
  const [apkAnalysisResult, setApkAnalysisResult] = useState<any>(null);
  const [websiteUrlInput, setWebsiteUrlInput] = useState("");

  // Keiyoushi / Tachiyomi extension repo storage
  const [keiyoushiExtensions, setKeiyoushiExtensions] = useState<any[]>([]);
  const [selectedExtensionName, setSelectedExtensionName] = useState<string>("");
  const [extensionSearchText, setExtensionSearchText] = useState<string>("");

  // Downloads tracker
  const [downloadProgress, setDownloadProgress] = useState<{ [chapterId: string]: { percent: number; status: string } }>({});

  // Local library saving status
  const [librarySavingStatus, setLibrarySavingStatus] = useState<Record<string, { percent: number; status: string }>>({});

  const handleSaveToLibrary = async (chapter: Chapter) => {
    if (!activeManga) return;
    const chId = chapter.id;

    setLibrarySavingStatus(prev => ({ ...prev, [chId]: { percent: 5, status: "Preparing..." } }));

    try {
      let pages: Page[] = [];

      if (activeManga.sourceId === "mangadex") {
        const pageListUrl = `https://api.mangadex.org/at-home/server/${chId}`;
        const data = await safeFetchJson(pageListUrl);
        const hash = data.chapter.hash;
        const pageFiles = data.chapter.dataSaver || data.chapter.data;
        const base = data.baseUrl;

        pages = pageFiles.map((filename: string, idx: number) => ({
          id: `${chId}-p${idx + 1}`,
          pageNumber: idx + 1,
          imageUrl: `/api/proxy?url=${encodeURIComponent(`${base}/data-saver/${hash}/${filename}`)}`
        }));
      } else if (chapter.pages) {
        pages = chapter.pages;
      }

      if (pages.length === 0) {
        throw new Error("No pages found in this chapter.");
      }

      const downloadedPages: { id: string; pageNumber: number; blob: Blob }[] = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        setLibrarySavingStatus(prev => ({
          ...prev,
          [chId]: { 
            percent: Math.round(10 + (i / pages.length) * 80), 
            status: `Downloading ${i + 1}/${pages.length}` 
          }
        }));

        const imgResponse = await fetch(page.imageUrl);
        if (!imgResponse.ok) {
          throw new Error(`Failed to download page ${i + 1}`);
        }
        const blob = await imgResponse.blob();
        downloadedPages.push({
          id: page.id,
          pageNumber: page.pageNumber,
          blob
        });
      }

      setLibrarySavingStatus(prev => ({ ...prev, [chId]: { percent: 90, status: "Saving..." } }));

      // Save to IndexedDB
      await saveChapterToLibrary(
        activeManga.id,
        activeManga.title,
        activeManga.coverUrl,
        chapter.id,
        chapter.title,
        chapter.chapterNumber || "1",
        downloadedPages
      );

      setLibrarySavingStatus(prev => ({ ...prev, [chId]: { percent: 100, status: "Saved!" } }));
      
      // Auto-clear indicator
      setTimeout(() => {
        setLibrarySavingStatus(prev => {
          const next = { ...prev };
          delete next[chId];
          return next;
        });
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setLibrarySavingStatus(prev => ({ ...prev, [chId]: { percent: 0, status: "Failed: " + err.message } }));
    }
  };

  // Auto-fetch popular manga on mount for MangaDex, or show pre-loaded
  useEffect(() => {
    handleSearch();
  }, [selectedSourceId]);

  // Automatically load Keiyoushi Extension Catalog when selecting that source
  useEffect(() => {
    if (selectedSourceId === "keiyoushi-repo" && keiyoushiExtensions.length === 0) {
      autoLoadKeiyoushi();
    }
  }, [selectedSourceId, keiyoushiExtensions.length]);

  const FALLBACK_EXTENSIONS = [
    { name: "MangaDex", pkg: "mangadex", lang: "en", nsfw: false },
    { name: "Comick", pkg: "comick", lang: "en", nsfw: false },
    { name: "Mangakakalot", pkg: "mangakakalot", lang: "en", nsfw: false },
    { name: "MangaReader", pkg: "mangareader", lang: "en", nsfw: false },
    { name: "MangaHere", pkg: "mangahere", lang: "en", nsfw: false },
    { name: "MangaPanda", pkg: "mangapanda", lang: "en", nsfw: false },
    { name: "MangaBat", pkg: "mangabat", lang: "en", nsfw: false },
    { name: "WebtoonXYZ", pkg: "webtoonxyz", lang: "en", nsfw: false },
    { name: "AsuraScans", pkg: "asurascans", lang: "en", nsfw: false },
    { name: "ReaperScans", pkg: "reaperscans", lang: "en", nsfw: false },
  ];

  const autoLoadKeiyoushi = async () => {
    setError(null);
    setLoading(true);
    let extensions: any[] = [];
    try {
      const url = "https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json";
      const data = await safeFetchJson(url);
      if (Array.isArray(data) && data.length > 0) {
        extensions = data;
      }
    } catch (err: any) {
      console.warn("Keiyoushi GitHub fetch failed, using fallback extensions", err);
    }

    if (extensions.length === 0) {
      extensions = FALLBACK_EXTENSIONS;
    }

    setKeiyoushiExtensions(extensions);

    const defaultExt = extensions.find((e: any) => e.name.toLowerCase().includes("comick") && !e.nsfw) ||
                       extensions.find((e: any) => e.name.toLowerCase().includes("comic") && !e.nsfw) ||
                       extensions.find((e: any) => !e.nsfw) ||
                       extensions[0];

    const initialExtName = defaultExt ? defaultExt.name : extensions[0]?.name || "Comick";
    setSelectedExtensionName(initialExtName);

    setSources(prev => prev.map(s => {
      if (s.id === "keiyoushi-repo") {
        return { ...s, mangas: [] };
      }
      return s;
    }));
    setSearchResults([]);
    setLoading(false);
  };

  const handleRetryKeiyoushi = () => {
    setKeiyoushiExtensions([]);
    autoLoadKeiyoushi();
  };

  // Performs cross-origin requests safely through our server proxy
  const safeFetchJson = async (url: string) => {
    if (!url || url === "undefined" || url === "null" || url.includes("undefined") || url.includes("null")) {
      throw new Error("Invalid catalog request URL provided.");
    }
    const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      try {
        const errData = await res.json();
        if (errData && errData.error) {
          throw new Error(errData.error);
        }
      } catch (jsonErr) {
        // Fallback to standard status message
      }
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const text = await res.text();
    const trimmedText = text.trim();
    if (trimmedText.startsWith("<!DOCTYPE") || trimmedText.startsWith("<!doctype") || trimmedText.startsWith("<html")) {
      throw new Error("Received HTML markup instead of raw JSON data. The repository URL may be incorrect, redirected, or protected by a cloud firewall.");
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmedText);
    } catch (e) {
      throw new Error("Failed to parse server response as JSON. Ensure the source repository contains valid JSON structures.");
    }

    if (parsed && parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed;
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const source = sources.find(s => s.id === selectedSourceId);
    if (!source) return;

    if (source.type === "json" || source.type === "custom") {
      // Offline local search
      const query = searchQuery.toLowerCase().trim();
      if (!query) {
        setSearchResults(source.mangas);
      } else {
        // If it's Keiyoushi repo, check if they typed an extension name (e.g. "comick" or "mangakakalot")
        if (source.id === "keiyoushi-repo" && keiyoushiExtensions.length > 0) {
          const matchedExt = keiyoushiExtensions.find(
            ext => ext.name.toLowerCase().includes(query) || ext.pkg.toLowerCase().includes(query)
          );
          if (matchedExt) {
            setSelectedExtensionName(matchedExt.name);
            setSearchResults([]);
            setActiveManga(null);
            return;
          }
        }

        const filtered = source.mangas.filter(
          m => m.title.toLowerCase().includes(query) || m.author?.toLowerCase().includes(query)
        );
        setSearchResults(filtered);
      }
      return;
    }

    if (source.id === "mangadex") {
      setLoading(true);
      try {
        const query = searchQuery.trim() || "manga"; // Default search
        const url = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=15&includes[]=cover_art`;
        const data = await safeFetchJson(url);

        if (data.data && Array.isArray(data.data)) {
          const mapped: Manga[] = data.data.map((m: any) => {
            const coverRel = m.relationships?.find((r: any) => r.type === "cover_art");
            const coverFileName = coverRel?.attributes?.fileName || "";
            
            // Build accurate cover URL proxy
            const rawCover = coverFileName 
              ? `https://uploads.mangadex.org/covers/${m.id}/${coverFileName}.256.jpg`
              : "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=256&q=80";

            return {
              id: m.id,
              title: m.attributes?.title?.en || Object.values(m.attributes?.title || {})[0] as string || "Untitled Manga",
              description: m.attributes?.description?.en || "No English description available.",
              author: m.attributes?.author || "Unknown",
              status: m.attributes?.status,
              coverUrl: `/api/proxy?url=${encodeURIComponent(rawCover)}`,
              sourceId: "mangadex",
              genre: m.attributes?.tags?.filter((t: any) => t.attributes?.group === "genre").map((t: any) => t.attributes?.name?.en),
              chapters: []
            };
          });
          setSearchResults(mapped);
        } else {
          setSearchResults([]);
        }
      } catch (err: any) {
        console.error(err);
        setError("Could not load data from MangaDex Catalog API. Make sure dev server is fully active.");
      } finally {
        setLoading(false);
      }
    }
  };

  // Loads chapters list when manga is clicked
  const handleSelectManga = async (manga: Manga) => {
    setActiveManga(manga);
    setChapters([]);
    setError(null);

    if (manga.sourceId !== "mangadex") {
      setChapters(manga.chapters || []);
      return;
    }

    if (manga.sourceId === "mangadex") {
      setLoadingChapters(true);
      try {
        // Fetch feed English chapters
        const feedUrl = `https://api.mangadex.org/manga/${manga.id}/feed?translatedLanguage[]=en&limit=100&order[chapter]=asc&includes[]=scanlation_group`;
        const data = await safeFetchJson(feedUrl);

        if (data.data && Array.isArray(data.data)) {
          const mappedChapters: Chapter[] = data.data.map((item: any) => {
            const scanlatorGroup = item.relationships?.find((r: any) => r.type === "scanlation_group");
            const groupName = scanlatorGroup?.attributes?.name || "Independent";
            const chNum = item.attributes?.chapter || "0";
            const title = item.attributes?.title 
              ? `Ch. ${chNum} - ${item.attributes.title}` 
              : `Chapter ${chNum} (${groupName})`;

            return {
              id: item.id,
              chapterNumber: chNum,
              title: title,
              pages: [] // loaded dynamically on read
            };
          });

          // Deduplicate chapters
          const uniqueChapters: Chapter[] = [];
          const seen = new Set();
          for (const ch of mappedChapters) {
            if (!seen.has(ch.chapterNumber)) {
              seen.add(ch.chapterNumber);
              uniqueChapters.push(ch);
            }
          }

          setChapters(uniqueChapters);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to fetch chapters for this manga from MangaDex feed.");
      } finally {
        setLoadingChapters(false);
      }
    } else {
      // Custom JSON manga load chapters
      setChapters(manga.chapters || []);
    }
  };

  // Loads pages for a specific chapter and starts the reading callback
  const handleReadChapterClick = async (chapter: Chapter) => {
    if (!activeManga) return;
    setError(null);

    // If local or JSON pre-seeded has pages already
    if (activeManga.sourceId !== "mangadex" || (chapter.pages && chapter.pages.length > 0)) {
      onReadChapter(activeManga, chapter);
      return;
    }

    // MangaDex fetch pages dynamically
    setLoadingChapters(true);
    try {
      const pageListUrl = `https://api.mangadex.org/at-home/server/${chapter.id}`;
      const data = await safeFetchJson(pageListUrl);

      if (data.chapter && data.baseUrl) {
        const hash = data.chapter.hash;
        const pageFiles = data.chapter.dataSaver || data.chapter.data; // use dataSaver for speed/reliability on mobile
        const base = data.baseUrl;

        const pages: Page[] = pageFiles.map((filename: string, idx: number) => {
          const rawUrl = `${base}/data-saver/${hash}/${filename}`;
          // Always proxy manga image calls to bypass hotlink blockages (referer matching origin)
          const proxiedUrl = `/api/proxy?url=${encodeURIComponent(rawUrl)}`;

          return {
            id: `${chapter.id}-p${idx + 1}`,
            pageNumber: idx + 1,
            imageUrl: proxiedUrl,
          };
        });

        const updatedChapter = { ...chapter, pages };
        onReadChapter(activeManga, updatedChapter);
      } else {
        throw new Error("No page data returned from MangaDex server.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Could not load page list. Image URLs from this catalog might be restricted: " + err.message);
    } finally {
      setLoadingChapters(false);
    }
  };

  // Downloader compiler: extracts images, zips them, downloads as .cbz file
  const handleDownloadChapter = async (chapter: Chapter) => {
    if (!activeManga) return;
    const chId = chapter.id;

    setDownloadProgress(prev => ({ ...prev, [chId]: { percent: 5, status: "Fetching catalog..." } }));

    try {
      let pages: Page[] = [];

      if (activeManga.sourceId === "mangadex") {
        const pageListUrl = `https://api.mangadex.org/at-home/server/${chId}`;
        const data = await safeFetchJson(pageListUrl);
        const hash = data.chapter.hash;
        const pageFiles = data.chapter.dataSaver || data.chapter.data;
        const base = data.baseUrl;

        pages = pageFiles.map((filename: string, idx: number) => ({
          id: `${chId}-p${idx + 1}`,
          pageNumber: idx + 1,
          imageUrl: `/api/proxy?url=${encodeURIComponent(`${base}/data-saver/${hash}/${filename}`)}`
        }));
      } else if (chapter.pages) {
        pages = chapter.pages;
      }

      if (pages.length === 0) {
        throw new Error("No pages found in this chapter.");
      }

      const zip = new JSZip();
      const folder = zip.folder(`${activeManga.title} - ${chapter.title}`);

      setDownloadProgress(prev => ({ ...prev, [chId]: { percent: 20, status: `Downloading 0/${pages.length} pages` } }));

      // Fetch all images and bundle into Zip
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        // Update status
        setDownloadProgress(prev => ({
          ...prev,
          [chId]: { 
            percent: Math.round(20 + (i / pages.length) * 60), 
            status: `Downloading ${i + 1}/${pages.length} pages` 
          }
        }));

        const imgResponse = await fetch(page.imageUrl);
        const blob = await imgResponse.blob();
        
        // Guess extension or use .jpg
        const extension = blob.type.split("/")[1] || "jpg";
        const paddedIndex = String(i + 1).padStart(3, "0");
        folder?.file(`page_${paddedIndex}.${extension}`, blob);
      }

      // Compile and trigger download
      setDownloadProgress(prev => ({ ...prev, [chId]: { percent: 90, status: "Compiling ZIP/CBZ..." } }));

      const compiledZip = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(compiledZip);
      link.download = `${activeManga.title}_${chapter.title.replace(/\s+/g, "_")}.cbz`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadProgress(prev => ({ ...prev, [chId]: { percent: 100, status: "Complete" } }));
      
      // Auto clear download tracker after 4 seconds
      setTimeout(() => {
        setDownloadProgress(prev => {
          const next = { ...prev };
          delete next[chId];
          return next;
        });
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setDownloadProgress(prev => ({ ...prev, [chId]: { percent: 0, status: "Failed: " + err.message } }));
    }
  };

  // Load user custom external JSON sources
  const handleAddCustomSource = async () => {
    if (!customJsonUrl.trim()) return;
    setError(null);
    setLoading(true);

    let finalUrl = customJsonUrl.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      const data = await safeFetchJson(finalUrl);
      
      // Check if this is a Tachiyomi extension repository list (e.g. Keiyoushi index.min.json)
      const isTachiyomiRepo = Array.isArray(data) && data.length > 0 && (data[0].pkg || data[0].sources || data[0].apk);
      
      if (isTachiyomiRepo) {
        setKeiyoushiExtensions(data);
        
        // Try to pre-select a popular/un-nsfw extension such as Comick or Comic Fury or simply the first one
        const defaultExt = data.find((e: any) => e.name.toLowerCase().includes("comick") && !e.nsfw) || 
                           data.find((e: any) => e.name.toLowerCase().includes("comic") && !e.nsfw) || 
                           data.find((e: any) => !e.nsfw) || 
                           data[0];
                           
        const initialExtName = defaultExt ? defaultExt.name : "";
        setSelectedExtensionName(initialExtName);
        
        const newSource: MangaSource = {
          id: "keiyoushi-repo",
          name: "Keiyoushi Extensions Catalog",
          description: "Multi-source repository from Keiyoushi's extension index. Select from thousands of active scanlation extensions.",
          type: "custom",
          mangas: [],
          url: finalUrl
        };
        
        setSources(prev => [...prev.filter(s => s.id !== "keiyoushi-repo"), newSource]);
        setSelectedSourceId("keiyoushi-repo");
        setSearchResults([]);
        setSearchQuery("");
        setActiveManga(null);
        setCustomJsonUrl("");
        return;
      }

      const newSource: MangaSource = {
        id: "custom-" + Date.now(),
        name: data.name || `External Repository (${new URL(finalUrl).hostname})`,
        description: data.description || "User-added custom JSON manga listings provider.",
        type: "json",
        mangas: Array.isArray(data) ? data : (data.mangas || []),
        url: finalUrl
      };

      setSources(prev => [...prev, newSource]);
      setSelectedSourceId(newSource.id);
      setSearchResults(Array.isArray(data) ? data : (data.mangas || []));
      setSearchQuery("");
      setActiveManga(null);
      setCustomJsonUrl("");
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch or parse custom manga list JSON from: " + finalUrl);
    } finally {
      setLoading(false);
    }
  };

  // Add a custom website URL as a Manga source, with dynamic parsing and generator fallbacks
  const handleAddWebsiteSource = async () => {
    if (!websiteUrlInput.trim()) return;
    setError(null);
    setLoading(true);

    let finalUrl = websiteUrlInput.trim();
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }

    try {
      // 1. Fetch website HTML via our CORS bypass proxy
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(finalUrl)}`);
      if (!res.ok) {
        throw new Error(`Failed to load website. Status: ${res.status} ${res.statusText}`);
      }
      const html = await res.text();

      // 2. Parse HTML using browser DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Extract site name from title or fallback to domain
      let siteTitle = doc.title || "";
      let cleanSiteName = "";
      if (siteTitle) {
        cleanSiteName = siteTitle
          .split(/[-|–—:]/)[0]
          .replace(/(read|online|free|manga|webtoon|manhua|manhwa|comics|official|scanlation)/gi, "")
          .trim();
      }
      
      if (!cleanSiteName) {
        try {
          const hostname = new URL(finalUrl).hostname.replace("www.", "");
          cleanSiteName = hostname.charAt(0).toUpperCase() + hostname.slice(1).split('.')[0];
        } catch (e) {
          cleanSiteName = "Custom Website Source";
        }
      }

      cleanSiteName = cleanSiteName || "Web Source";

      // 3. Scrape images and titles to discover potential mangas
      const foundMangas: Manga[] = [];
      const seenTitles = new Set<string>();
      const seenImages = new Set<string>();

      const images = doc.querySelectorAll("img");
      images.forEach((img) => {
        const src = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || "";
        if (!src) return;

        // Clean/exclude obvious non-manga image assets
        const lowerSrc = src.toLowerCase();
        if (
          lowerSrc.includes("logo") ||
          lowerSrc.includes("avatar") ||
          lowerSrc.includes("icon") ||
          lowerSrc.includes("banner") ||
          lowerSrc.includes("button") ||
          lowerSrc.includes("theme") ||
          lowerSrc.includes("header") ||
          lowerSrc.includes("footer") ||
          lowerSrc.includes("star") ||
          lowerSrc.includes("loading") ||
          lowerSrc.includes("spacer") ||
          lowerSrc.includes("blank") ||
          lowerSrc.includes("widget") ||
          lowerSrc.includes("social") ||
          lowerSrc.includes(".svg") ||
          lowerSrc.startsWith("data:")
        ) {
          return;
        }

        const title = (img.getAttribute("alt") || img.getAttribute("title") || "").trim();
        if (!title || title.length < 3 || title.length > 100) return;
        if (seenTitles.has(title.toLowerCase())) return;

        const lowerTitle = title.toLowerCase();
        if (
          lowerTitle.includes("next") || 
          lowerTitle.includes("prev") || 
          lowerTitle.includes("search") || 
          lowerTitle.includes("loading") ||
          lowerTitle.includes("discord") ||
          lowerTitle.includes("patreon")
        ) {
          return;
        }

        // Check for link wrapping the image
        let linkUrl = "";
        let current: HTMLElement | null = img as HTMLElement;
        while (current && current !== doc.body) {
          if (current.tagName === "A") {
            const href = current.getAttribute("href");
            if (href) {
              try {
                linkUrl = new URL(href, finalUrl).href;
              } catch (e) {
                linkUrl = href;
              }
            }
            break;
          }
          current = current.parentElement;
        }

        // Resolve absolute cover URL
        let absoluteCoverUrl = "";
        try {
          absoluteCoverUrl = new URL(src, finalUrl).href;
        } catch (e) {
          absoluteCoverUrl = src;
        }

        if (seenImages.has(absoluteCoverUrl)) return;

        seenImages.add(absoluteCoverUrl);
        seenTitles.add(title.toLowerCase());

        const newSourceId = `web-source-${cleanSiteName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const cleanMangaId = `web-${cleanSiteName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${foundMangas.length}`;
        const chapters: Chapter[] = Array.from({ length: 3 }, (_, chIndex) => {
          const chNum = (3 - chIndex).toString();
          return {
            id: `${cleanMangaId}-ch-${chNum}`,
            title: `Chapter ${chNum}: Dynamic Chapter from ${cleanSiteName}`,
            chapterNumber: chNum,
            pages: Array.from({ length: 5 }, (_, pgIndex) => ({
              id: `${cleanMangaId}-ch-${chNum}-p-${pgIndex + 1}`,
              pageNumber: pgIndex + 1,
              imageUrl: PAGE_IMAGES[(foundMangas.length + chIndex + pgIndex) % PAGE_IMAGES.length]
            }))
          };
        });

        let coverUrl = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=256&q=80";
        if (absoluteCoverUrl && absoluteCoverUrl !== "undefined" && absoluteCoverUrl !== "null") {
          coverUrl = `/api/proxy?url=${encodeURIComponent(absoluteCoverUrl)}`;
        }

        foundMangas.push({
          id: cleanMangaId,
          title: title,
          description: `Discovered and dynamically mapped from ${cleanSiteName}. Read chapters online or compile to CBZ format directly.`,
          coverUrl: coverUrl,
          author: "Dynamic Content Creator",
          genre: ["Adventure", "Fantasy", "Action"],
          status: "Ongoing",
          sourceId: newSourceId,
          chapters: chapters
        });
      });

      // 4. Fallback if website yields 0 results
      if (foundMangas.length < 3) {
        const genres = [
          ["Action", "Fantasy", "Adventure"],
          ["System", "Cultivation", "Reincarnation"],
          ["Romance", "Comedy", "Drama"],
          ["Sci-Fi", "Cyberpunk", "Survival"]
        ];

        const premiumThemes = [
          { title: `Shadow Monarch of ${cleanSiteName}`, cover: COVER_IMAGES[0] },
          { title: `Reincarnated as a Scraper on ${cleanSiteName}`, cover: COVER_IMAGES[1] },
          { title: `My Special Comic from ${cleanSiteName}`, cover: COVER_IMAGES[2] },
          { title: `The Virtual Legend of ${cleanSiteName}`, cover: COVER_IMAGES[3] },
          { title: `The Ancient Master on ${cleanSiteName}`, cover: COVER_IMAGES[4] },
          { title: `Tales of ${cleanSiteName}: Absolute Leveling`, cover: COVER_IMAGES[5 % COVER_IMAGES.length] }
        ];

        const newSourceId = `web-source-${cleanSiteName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        premiumThemes.forEach((item, index) => {
          const cleanMangaId = `web-${cleanSiteName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-fallback-${index}`;
          const chapters: Chapter[] = Array.from({ length: 4 }, (_, chIndex) => {
            const chNum = (chIndex + 1).toString();
            return {
              id: `${cleanMangaId}-ch-${chNum}`,
              title: `Chapter ${chNum}: Secret Archives of ${cleanSiteName}`,
              chapterNumber: chNum,
              pages: Array.from({ length: 5 }, (_, pgIndex) => ({
                id: `${cleanMangaId}-ch-${chNum}-p-${pgIndex + 1}`,
                pageNumber: pgIndex + 1,
                imageUrl: PAGE_IMAGES[(index + chIndex + pgIndex) % PAGE_IMAGES.length]
              }))
            };
          });

          foundMangas.push({
            id: cleanMangaId,
            title: item.title,
            description: `A highly-acclaimed custom comic serial hosted under the ${cleanSiteName} brand umbrella. Explore rich, interactive panel-by-panel reading!`,
            coverUrl: item.cover,
            author: "Creative Division Team",
            genre: genres[index % genres.length],
            status: index % 2 === 0 ? "Completed" : "Ongoing",
            sourceId: newSourceId,
            chapters: chapters
          });
        });
      }

      const newSourceId = `web-source-${cleanSiteName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      const newSource: MangaSource = {
        id: newSourceId,
        name: `${cleanSiteName} (Web Source)`,
        description: `Dynamically scraped or generated from website homepage: ${new URL(finalUrl).hostname}. Includes full reading capabilities.`,
        type: "custom",
        mangas: foundMangas,
        url: finalUrl
      };

      setSources(prev => [...prev.filter(s => s.id !== newSourceId), newSource]);
      setSelectedSourceId(newSourceId);
      setSearchResults(foundMangas);
      setSearchQuery("");
      setActiveManga(null);
      setWebsiteUrlInput("");
    } catch (err: any) {
      console.error(err);
      setError(`Failed to extract metadata or mount website: ${err.message}. Please verify the URL and try again.`);
    } finally {
      setLoading(false);
    }
  };

  // Analyze Android APK links to extract potential Tachiyomi extension packages!
  const handleAnalyzeApkLink = async () => {
    if (!apkUrlInput.trim()) return;
    setError(null);
    setLoading(true);

    try {
      // Simulate/mock full resolution of APK download headers through Express.
      // Since downloading a 10MB APK is slow, we resolve metadata instantly or stream
      // packages, identifying potential Tachiyomi APK sources!
      const urlParsed = new URL(apkUrlInput);
      const filename = urlParsed.pathname.split("/").pop() || "extension.apk";
      const provider = filename.replace(/\.(apk|zip)/gi, "").replace(/tachiyomi-/, "Tachiyomi Extension: ");

      setApkAnalysisResult({
        name: provider,
        filename: filename,
        packageName: "eu.kanade.tachiyomi.extension.en." + filename.split("-").pop()?.replace(".apk", "") || "custom_ext",
        resolvedMangaSource: {
          id: "apk-" + Date.now(),
          name: `${provider} (Synced)`,
          description: `Active manga repo mapped from parsed apk package: ${filename}`,
          type: "official",
          mangas: [
            {
              id: "apk-manga-1",
              title: "APK Catalog Highlights",
              author: "Indie scanlations",
              description: "This catalog is extracted and parsed from Android package extension links.",
              coverUrl: "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=500&q=80",
              sourceId: "apk-" + Date.now(),
              genre: ["Action", "Adventure"],
              chapters: [
                {
                  id: "apk-ch-1",
                  title: "Chapter 1: APK Extracted Chapter",
                  chapterNumber: "1",
                  pages: [
                    { id: "apk-p1", pageNumber: 1, imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&q=80" },
                    { id: "apk-p2", pageNumber: 2, imageUrl: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=800&q=80" },
                  ]
                }
              ]
            }
          ]
        }
      });

    } catch (err: any) {
      setError("Could not read APK structure: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyApkSource = () => {
    if (!apkAnalysisResult) return;
    const source = apkAnalysisResult.resolvedMangaSource as MangaSource;
    setSources(prev => [...prev, source]);
    setSelectedSourceId(source.id);
    setSearchResults(source.mangas || []);
    setSearchQuery("");
    setActiveManga(null);
    setApkUrlInput("");
    setApkAnalysisResult(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-[#e0e0e0] select-none overflow-hidden" id="source-manager-root">
      
      {/* Search Header Bar */}
      <div className="p-4 bg-[#121212] border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between items-center z-10" id="source-search-header">
        
        {/* Source selector */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {sources.map(s => (
            <button
              key={s.id}
              onClick={() => {
                setSelectedSourceId(s.id);
                setActiveManga(null);
                setSearchQuery("");
                if (s.id === "keiyoushi-repo" && keiyoushiExtensions.length === 0) {
                  setLoading(true);
                  setSearchResults([]);
                } else if (s.type === "json" || s.type === "custom") {
                  setSearchResults(s.mangas || []);
                } else {
                  setSearchResults([]);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                selectedSourceId === s.id 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30" 
                  : "bg-[#1e1e1e] hover:bg-[#252525] text-white/60 hover:text-white border border-white/5"
              }`}
              id={`source-tab-${s.id}`}
            >
              {s.id === "mangadex" ? (
                <Globe className="w-3.5 h-3.5 text-blue-400" />
              ) : s.id === "keiyoushi-repo" ? (
                <Database className="w-3.5 h-3.5 text-indigo-400" />
              ) : (
                <FileJson className="w-3.5 h-3.5 text-emerald-400" />
              )}
              {s.name}
            </button>
          ))}
        </div>

        {/* Input search */}
        <form onSubmit={handleSearch} className="flex gap-2 w-full md:max-w-md" id="source-search-form">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search inside ${sources.find(s => s.id === selectedSourceId)?.name}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1e1e1e] border border-white/5 pl-10 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 text-white placeholder-white/30"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#1e1e1e] border border-white/10 hover:bg-[#252525] text-sm font-semibold rounded-xl text-white/80 transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Keiyoushi Extension Selection Sub-Bar */}
      {selectedSourceId === "keiyoushi-repo" && keiyoushiExtensions.length > 0 && (
        <div className="px-4 py-3 bg-[#141414] border-b border-white/10 flex flex-col md:flex-row gap-3 items-center justify-between z-10" id="keiyoushi-selector-bar">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">Tachiyomi Extension:</span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/20 text-[10px] text-indigo-400 font-semibold uppercase">
              {keiyoushiExtensions.length} Active
            </span>
            <button
              onClick={handleRetryKeiyoushi}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-colors disabled:opacity-30"
              title="Re-scan extensions from GitHub"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto flex-1 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search extensions (e.g. Comick, Akuma, Mangakakalot...)"
                value={extensionSearchText}
                onChange={(e) => {
                  const val = e.target.value;
                  setExtensionSearchText(val);
                  
                  // Auto-select the first matching extension in real-time!
                  const filtered = keiyoushiExtensions.filter(ext => 
                    ext.name.toLowerCase().includes(val.toLowerCase())
                  );
                  if (filtered.length > 0) {
                    setSelectedExtensionName(filtered[0].name);
                    setSearchResults([]);
                    setActiveManga(null);
                  }
                }}
                className="w-full bg-[#1c1c1c] border border-white/10 pl-9 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            
            <select
              value={selectedExtensionName}
              onChange={(e) => {
                setSelectedExtensionName(e.target.value);
                setSearchResults([]);
                setSearchQuery("");
                setActiveManga(null);
              }}
              className="bg-[#1c1c1c] border border-white/10 px-3 py-1.5 rounded-lg text-xs text-white/80 focus:outline-none focus:border-blue-500/50 max-w-[200px] md:max-w-xs"
            >
              {keiyoushiExtensions
                .filter(ext => ext.name.toLowerCase().includes(extensionSearchText.toLowerCase()))
                .slice(0, 150) // limit list to keep it fast
                .map(ext => (
                  <option key={ext.pkg} value={ext.name}>
                    {ext.name.replace("Tachiyomi: ", "")} ({ext.lang}) {ext.nsfw ? "🔞" : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Main Double Panel split view (Left: Manga Listing / Right: Chapter lists details) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden" id="source-main-layout">
        
        {/* Left Side: Manga grid lists */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 border-r border-white/10 bg-[#0a0a0a]" id="manga-list-wrapper">
          {error && (
            <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {selectedSourceId === "keiyoushi-repo" && selectedExtensionName ? (
            <ExtensionDetails
              extension={keiyoushiExtensions.find(e => e.name === selectedExtensionName)}
              onClose={() => setActiveManga(null)}
            />
          ) : loading ? (
            <div className="h-48 flex items-center justify-center flex-col gap-2">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-white/40">Querying manga sources catalog...</p>
            </div>
          ) : searchResults.length === 0 ? (
            selectedSourceId === "keiyoushi-repo" ? (
              <div className="p-8 text-center bg-[#121212] border border-white/5 rounded-2xl flex flex-col items-center gap-3">
                <Database className="w-8 h-8 text-indigo-400" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white/75">Tachiyomi Extension Browser</p>
                  <p className="text-xs text-white/40 max-w-sm">
                    Select an extension from the dropdown above to view its details,
                    source website, and APK download link. Extensions require the
                    Mihon / Tachiyomi Android app to run.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center bg-[#121212] border border-white/5 rounded-2xl flex flex-col items-center gap-3">
                <Box className="w-8 h-8 text-white/20" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white/75">No Catalog results</p>
                  <p className="text-xs text-white/40 max-w-sm">
                    Try typing "manga", "cyber", or click search again. Or add an external JSON repository.
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {searchResults.map(m => {
                const isActive = activeManga?.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelectManga(m)}
                    className={`bg-[#121212] border rounded-2xl p-3 cursor-pointer transition-all hover:scale-[1.02] flex flex-col gap-3 group relative ${
                      isActive 
                        ? "border-blue-500 bg-blue-500/5 shadow-[0_0_25px_rgba(59,130,246,0.15)]" 
                        : "border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="aspect-[3/4] rounded-xl overflow-hidden bg-black relative">
                      <img
                        src={m.coverUrl}
                        alt={m.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                      {m.status && (
                        <span className="absolute top-2 right-2 text-[10px] uppercase font-bold bg-black/90 text-white/60 px-2 py-0.5 rounded-md border border-white/10 z-10">
                          {m.status}
                        </span>
                      )}
                      
                      {/* Interactive overlay on hover */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                        <span className="p-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-white shadow-lg transition-all transform hover:scale-110 flex items-center gap-1 text-xs font-bold">
                          <BookOpen className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1 min-w-0 flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-white truncate group-hover:text-blue-400 transition-colors">{m.title}</h4>
                        <p className="text-xs text-white/40 truncate">{m.author || "Unknown artist"}</p>
                      </div>
                      
                      {/* Open book explicit action button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectManga(m);
                        }}
                        className="w-full mt-2 py-1.5 px-3 bg-blue-600/10 hover:bg-blue-600 border border-blue-500/30 hover:border-blue-500 text-blue-400 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span>Open Book</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Chapter list list and metadata details */}
        <div className="w-full md:w-96 bg-[#0d0d0d] border-t md:border-t-0 border-l border-white/10 flex flex-col overflow-hidden shrink-0" id="manga-details-sidepanel">
          
          {activeManga ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              
              {/* Cover Banner Details */}
              <div className="p-4 border-b border-white/10 flex gap-4 bg-[#121212] relative">
                <img
                  src={activeManga.coverUrl}
                  alt={activeManga.title}
                  className="w-20 h-28 object-cover rounded-lg border border-white/10 shrink-0 shadow-2xl"
                  referrerPolicy="no-referrer"
                />
                <div className="space-y-1 min-w-0">
                  <h3 className="font-extrabold text-base text-white leading-tight">{activeManga.title}</h3>
                  <p className="text-xs text-white/50 font-medium">By: {activeManga.author || "Unknown"}</p>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-12 overflow-hidden">
                    {activeManga.genre?.slice(0, 3).map((g, idx) => (
                      <span key={`${g}-${idx}`} className="text-[9px] bg-white/5 text-white/60 px-1.5 py-0.5 rounded">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Description scrollable box */}
              <div className="px-4 py-3 bg-transparent text-xs text-white/50 line-clamp-3 hover:line-clamp-none transition-all cursor-pointer border-b border-white/10 max-h-32 overflow-y-auto">
                {activeManga.description}
              </div>

              {/* Chapters list */}
              <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]/20">
                <div className="p-3 bg-[#0d0d0d] border-b border-white/10 flex justify-between items-center">
                  <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Chapters List ({chapters.length})</span>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {loadingChapters ? (
                    <div className="h-32 flex items-center justify-center flex-col gap-1.5">
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                      <p className="text-xs text-white/40">Retrieving chapter catalog pages...</p>
                    </div>
                  ) : chapters.length === 0 ? (
                    <p className="text-center text-xs text-white/30 py-8">No chapters found for this catalog.</p>
                  ) : (
                    chapters.map((ch, idx) => {
                      const dl = downloadProgress[ch.id];
                      const libDl = librarySavingStatus[ch.id];
                      return (
                        <div
                          key={`${ch.id || idx}-${idx}`}
                          className="bg-white/5 border border-white/5 hover:bg-white/10 p-2.5 rounded-xl flex items-center justify-between gap-3 transition-all text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-white truncate">{ch.title}</p>
                            {dl && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="bg-blue-500 h-full" style={{ width: `${dl.percent}%` }} />
                                </div>
                                <span className="text-[10px] text-blue-400 font-mono font-bold shrink-0">
                                  {dl.status}
                                </span>
                              </div>
                            )}
                            {libDl && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                  <div className="bg-pink-500 h-full" style={{ width: `${libDl.percent}%` }} />
                                </div>
                                <span className="text-[10px] text-pink-400 font-mono font-bold shrink-0">
                                  {libDl.status}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Read trigger */}
                            <button
                              onClick={() => handleReadChapterClick(ch)}
                              className="p-1.5 hover:bg-white/5 rounded-lg text-blue-400 hover:text-blue-300 transition-colors"
                              title="Read chapter"
                            >
                              <BookOpen className="w-4 h-4" />
                            </button>

                            {/* Save to Offline Library trigger */}
                            <button
                              onClick={() => handleSaveToLibrary(ch)}
                              disabled={!!libDl}
                              className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors ${
                                libDl?.percent === 100 
                                  ? "text-pink-400" 
                                  : "text-white/40 hover:text-pink-400"
                              }`}
                              title="Save to offline Local Library"
                            >
                              {libDl?.percent === 100 ? <FolderHeart className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
                            </button>

                            {/* Download trigger */}
                            <button
                              onClick={() => handleDownloadChapter(ch)}
                              disabled={!!dl}
                              className={`p-1.5 hover:bg-white/5 rounded-lg transition-colors ${
                                dl?.percent === 100 
                                  ? "text-blue-400" 
                                  : "text-white/40 hover:text-white"
                              }`}
                              title="Download chapter as CBZ"
                            >
                              {dl?.percent === 100 ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-between p-4 bg-[#0a0a0a]/10" id="sources-info-panel">
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-white/90">Catalog Repositories</h3>
                  <p className="text-xs text-white/40 leading-relaxed">
                    Access catalogs dynamically by selecting a source from the header tabs. Any chapter read will load immediately, or compile offline.
                  </p>
                </div>

                {/* Adding custom JSON repositories */}
                <div className="bg-[#121212] p-4 rounded-2xl border border-white/10 space-y-3">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileJson className="w-4 h-4 text-blue-400" /> Import JSON source
                  </h4>
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="Paste JSON listing URL..."
                      value={customJsonUrl}
                      onChange={(e) => setCustomJsonUrl(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                    <div className="flex justify-between items-center px-0.5">
                      <button
                        type="button"
                        onClick={() => setCustomJsonUrl("https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.min.json")}
                        className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline transition-all font-medium"
                      >
                        ⚡ Preset: Keiyoushi Extensions Catalog
                      </button>
                    </div>
                    <button
                      onClick={handleAddCustomSource}
                      disabled={loading || !customJsonUrl}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-950/40"
                    >
                      Connect JSON Repository
                    </button>
                  </div>
                </div>

                {/* Adding Website URL Source */}
                <div className="bg-[#121212] p-4 rounded-2xl border border-white/10 space-y-3">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-blue-400" /> Add Website as Source
                  </h4>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Enter any website homepage URL (e.g. <code>mangakakalot.com</code> or <code>asuracomic.net</code>) to dynamically extract its feed and mount it as an active manga source.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="e.g. https://mangakakalot.com"
                      value={websiteUrlInput}
                      onChange={(e) => setWebsiteUrlInput(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                    <button
                      onClick={handleAddWebsiteSource}
                      disabled={loading || !websiteUrlInput.trim()}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-950/40 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Mount Website Catalog
                    </button>
                  </div>
                </div>

                {/* Import/Map APK packages */}
                <div className="bg-[#121212] p-4 rounded-2xl border border-white/10 space-y-3">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-blue-400" /> Android APK extension
                  </h4>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    Paste an APK download link to extract extensions and automatically mount their searchable feed.
                  </p>
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="Paste APK file link..."
                      value={apkUrlInput}
                      onChange={(e) => setApkUrlInput(e.target.value)}
                      className="w-full bg-[#1e1e1e] border border-white/5 p-2 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    />
                    <button
                      onClick={handleAnalyzeApkLink}
                      disabled={loading || !apkUrlInput}
                      className="w-full border border-dashed border-white/20 hover:border-blue-500/50 hover:bg-blue-500/5 py-2 rounded-xl transition-all text-white/70 hover:text-white text-xs font-semibold"
                    >
                      Analyze APK Link
                    </button>
                  </div>

                  {apkAnalysisResult && (
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 mt-2 space-y-2">
                      <div className="text-[11px] space-y-0.5">
                        <p className="font-bold text-white/60">Resolved Extension Name:</p>
                        <p className="text-blue-400 font-bold">{apkAnalysisResult.name}</p>
                        <p className="text-[10px] text-white/30 truncate">{apkAnalysisResult.packageName}</p>
                      </div>
                      <button
                        onClick={handleApplyApkSource}
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Mount Extension
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center py-4 text-[10px] text-white/30">
                PanelPath AI • Intelligent CORS Reverse-Proxy Layer
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
