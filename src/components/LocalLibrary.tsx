import React, { useEffect, useState } from "react";
import { 
  Library, 
  BookOpen, 
  Trash2, 
  Loader2, 
  Inbox, 
  Calendar,
  Layers,
  ArrowRight
} from "lucide-react";
import { 
  getLibraryChapters, 
  deleteChapterFromLibrary, 
  LibraryChapter 
} from "../lib/db";
import { Manga, Chapter, Page } from "../types";

interface LocalLibraryProps {
  onLoadChapter: (manga: Manga, chapter: Chapter) => void;
}

export default function LocalLibrary({ onLoadChapter }: LocalLibraryProps) {
  const [loading, setLoading] = useState(true);
  const [chapters, setChapters] = useState<LibraryChapter[]>([]);
  const [expandedMangaId, setExpandedMangaId] = useState<string | null>(null);

  // Load chapters on mount
  const loadLibrary = async () => {
    setLoading(true);
    try {
      const items = await getLibraryChapters();
      // Sort by download date descending
      items.sort((a, b) => b.downloadedAt - a.downloadedAt);
      setChapters(items);
      
      // Auto-expand the first manga if there are any
      if (items.length > 0) {
        setExpandedMangaId(items[0].mangaId);
      }
    } catch (e) {
      console.error("Failed to load local library:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Safe createObjectURL utility to gracefully handle missing or invalid/sandboxed blobs
  const safeCreateObjectURL = (blob: any): string => {
    if (!blob) return "";
    try {
      if (blob instanceof Blob || (blob && typeof blob === "object" && "size" in blob && "type" in blob)) {
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.error("safeCreateObjectURL failed:", err);
    }
    return "";
  };

  // Group chapters by Manga
  interface GroupedManga {
    mangaId: string;
    mangaTitle: string;
    coverUrl: string;
    chapters: LibraryChapter[];
  }

  const groupedMangas = chapters.reduce<Record<string, GroupedManga>>((acc, ch) => {
    if (!acc[ch.mangaId]) {
      // Determine the best cover URL (convert stored Blob to object URL or fallback)
      let coverUrl = ch.mangaCoverUrl || "";
      if (ch.mangaCoverBlob) {
        const objectUrl = safeCreateObjectURL(ch.mangaCoverBlob);
        if (objectUrl) {
          coverUrl = objectUrl;
        }
      }

      acc[ch.mangaId] = {
        mangaId: ch.mangaId,
        mangaTitle: ch.mangaTitle || "Untitled Manga",
        coverUrl,
        chapters: []
      };
    }
    acc[ch.mangaId].chapters.push(ch);
    return acc;
  }, {});

  const mangaList: GroupedManga[] = Object.values(groupedMangas);

  const handleReadLocalChapter = (libCh: LibraryChapter) => {
    // 1. Create a dummy or real cover URL
    let coverUrl = libCh.mangaCoverUrl || "";
    if (libCh.mangaCoverBlob) {
      const objectUrl = safeCreateObjectURL(libCh.mangaCoverBlob);
      if (objectUrl) {
        coverUrl = objectUrl;
      }
    }

    // 2. Map SavedChapterPages to standard Page objects with object URLs from Blobs
    const pages: Page[] = libCh.pages.map(p => {
      let imageUrl = "";
      if (p.imageBlob) {
        imageUrl = safeCreateObjectURL(p.imageBlob);
      }
      return {
        id: p.id,
        pageNumber: p.pageNumber,
        imageUrl: imageUrl || libCh.mangaCoverUrl || "" // Fallback to cover URL if blob url fails
      };
    });

    const manga: Manga = {
      id: libCh.mangaId,
      title: libCh.mangaTitle,
      coverUrl: coverUrl,
      sourceId: "local-library"
    };

    const chapter: Chapter = {
      id: libCh.id,
      title: libCh.chapterTitle,
      chapterNumber: libCh.chapterNumber,
      pages
    };

    onLoadChapter(manga, chapter);
  };

  const handleDeleteChapter = async (e: React.MouseEvent, chapterId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this chapter from your local offline library?")) {
      return;
    }

    try {
      await deleteChapterFromLibrary(chapterId);
      // Reload list
      const updated = await getLibraryChapters();
      updated.sort((a, b) => b.downloadedAt - a.downloadedAt);
      setChapters(updated);
      
      // If expanded manga no longer has chapters, clear selection
      if (expandedMangaId) {
        const remainingForManga = updated.filter(c => c.mangaId === expandedMangaId);
        if (remainingForManga.length === 0) {
          const nextManga = updated[0];
          setExpandedMangaId(nextManga ? nextManga.mangaId : null);
        }
      }
    } catch (err) {
      console.error("Failed to delete chapter:", err);
      alert("Error deleting chapter from library.");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 text-[#e0e0e0]" id="local-library-root">
      
      <div className="space-y-1.5 text-center py-2">
        <h2 className="text-xl font-extrabold text-white flex items-center justify-center gap-2">
          <Library className="w-5 h-5 text-blue-500 animate-pulse" /> Local Offline Library
        </h2>
        <p className="text-xs text-white/40 max-w-md mx-auto">
          Read downloaded chapters completely offline with zero loading lag. Your progress is saved locally.
        </p>
      </div>

      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-white/40">Opening your local database shelf...</p>
        </div>
      ) : mangaList.length === 0 ? (
        <div className="p-12 text-center bg-[#121212] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-4">
          <div className="p-4 bg-white/5 rounded-full text-white/20">
            <Inbox className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-white/80">Your Library is Empty</p>
            <p className="text-xs text-white/40 max-w-sm mx-auto">
              Go to the <strong>Catalog Sources</strong> tab, search for a manga, select it, and click the <strong>Save to Library</strong> button next to any chapter!
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          
          {/* Left Column: List of mangas */}
          <div className="md:col-span-1 space-y-3">
            <span className="text-[10px] font-bold uppercase text-white/30 tracking-widest block px-1">
              Downloaded Series ({mangaList.length})
            </span>
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {mangaList.map((m) => {
                const isActive = expandedMangaId === m.mangaId;
                return (
                  <button
                    key={m.mangaId}
                    onClick={() => setExpandedMangaId(m.mangaId)}
                    className={`w-full text-left p-2.5 rounded-xl border flex items-center gap-3.5 transition-all ${
                      isActive 
                        ? "bg-blue-600/15 border-blue-500/50 text-white" 
                        : "bg-[#121212] border-white/5 hover:border-white/10 text-white/70 hover:text-white"
                    }`}
                  >
                    <img
                      src={m.coverUrl}
                      alt={m.mangaTitle}
                      className="w-10 h-14 object-cover rounded-md border border-white/10 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs truncate leading-tight">{m.mangaTitle}</h4>
                      <p className="text-[10px] text-white/40 mt-1 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-blue-400 shrink-0" />
                        {m.chapters.length} chapter{m.chapters.length > 1 ? "s" : ""} saved
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Chapters in expanded manga */}
          <div className="md:col-span-2 space-y-3">
            {expandedMangaId && groupedMangas[expandedMangaId] ? (
              <>
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase text-white/30 tracking-widest">
                    Available Chapters ({groupedMangas[expandedMangaId].chapters.length})
                  </span>
                  <span className="text-xs font-semibold text-blue-400">
                    {groupedMangas[expandedMangaId].mangaTitle}
                  </span>
                </div>

                <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 divide-y divide-white/5 space-y-3">
                  {groupedMangas[expandedMangaId].chapters.map((ch, idx) => {
                    const formattedDate = new Date(ch.downloadedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <div 
                        key={ch.id} 
                        className={`flex items-center justify-between gap-4 pt-3 ${idx === 0 ? "pt-0" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs text-white truncate flex items-center gap-2">
                            <span className="bg-blue-600/25 border border-blue-500/30 text-blue-400 font-mono text-[9px] px-1.5 py-0.5 rounded uppercase">
                              Ch {ch.chapterNumber}
                            </span>
                            {ch.chapterTitle}
                          </h4>
                          <div className="flex items-center gap-3 text-[10px] text-white/40 mt-1.5 font-mono">
                            <span className="flex items-center gap-1 shrink-0">
                              <Calendar className="w-3 h-3 text-white/30" />
                              {formattedDate}
                            </span>
                            <span className="shrink-0">•</span>
                            <span className="text-blue-400 font-bold">
                              {ch.pages.length} Pages
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleReadLocalChapter(ch)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                            title="Open chapter in active guided reader"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Read</span>
                          </button>

                          <button
                            onClick={(e) => handleDeleteChapter(e, ch.id)}
                            className="p-1.5 hover:bg-red-500/10 rounded-lg text-white/30 hover:text-red-400 transition-colors"
                            title="Delete chapter from offline storage"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-8 text-center bg-[#121212] border border-white/5 rounded-2xl text-white/30 text-xs">
                Select a series from the left list to view saved chapters.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
