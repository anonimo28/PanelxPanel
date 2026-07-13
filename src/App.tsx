import React, { useState, useCallback, useEffect } from "react";
import { 
  Compass, 
  FolderOpen, 
  BookOpen, 
  X, 
  BookMarked,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Library,
  Fullscreen
} from "lucide-react";
import SourceManager from "./components/SourceManager";
import LocalReader from "./components/LocalReader";
import LocalLibrary from "./components/LocalLibrary";
import PanelViewer from "./components/PanelViewer";
import { Manga, Chapter, Page, Panel } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<"catalogs" | "library" | "local">("catalogs");
  
  // Active reading states
  const [readingManga, setReadingManga] = useState<Manga | null>(null);
  const [readingChapter, setReadingChapter] = useState<Chapter | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);

  // Simple onboarding helper
  const [showWelcome, setShowWelcome] = useState(true);

  // Triggered when user selects a chapter from catalog or uploads local ZIP
  const handleReadChapter = (manga: Manga, chapter: Chapter) => {
    setReadingManga(manga);
    setReadingChapter(chapter);
    setActivePageIndex(0);
  };

  const handleCloseReader = () => {
    setReadingManga(null);
    setReadingChapter(null);
  };

  const handleNextPage = () => {
    if (!readingChapter?.pages) return;
    if (activePageIndex < readingChapter.pages.length - 1) {
      setActivePageIndex(activePageIndex + 1);
    } else {
      alert("You have reached the end of this chapter!");
    }
  };

  const handlePrevPage = () => {
    if (activePageIndex > 0) {
      setActivePageIndex(activePageIndex - 1);
    } else {
      alert("This is the first page of the chapter.");
    }
  };

  const handleUpdatePagePanels = (pageId: string, panels: Panel[]) => {
    if (!readingChapter || !readingChapter.pages) return;
    const updatedPages = readingChapter.pages.map((p) => {
      if (p.id === pageId) {
        return { ...p, panels };
      }
      return p;
    });
    setReadingChapter({ ...readingChapter, pages: updatedPages });
  };

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.getElementById("immersive-canvas")?.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    if (!readingManga) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") handleToggleFullscreen();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [readingManga, handleToggleFullscreen]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex flex-col font-sans select-none" id="app-wrapper">
      
      {/* Immersive distraction-free active reading canvas */}
      {readingManga && readingChapter && readingChapter.pages && readingChapter.pages.length > 0 ? (
        <div className="fixed inset-0 bg-black flex flex-col z-50 overflow-hidden" id="immersive-canvas">
          {/* Top reader bar wrapper */}
          <div className="bg-[#121212]/95 border-b border-white/10 px-6 py-3 flex items-center justify-between z-10" id="immersive-canvas-header">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={handleCloseReader}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-white/60 hover:text-white"
                title="Return to list"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h2 className="font-extrabold text-sm text-white truncate">{readingManga.title}</h2>
                <p className="text-[11px] text-white/40 truncate">{readingChapter.title}</p>
              </div>
            </div>

            {/* Quick Page Jump Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={activePageIndex === 0}
                className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-white/80 transition-opacity"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <select
                value={activePageIndex}
                onChange={(e) => setActivePageIndex(parseInt(e.target.value))}
                className="bg-[#1e1e1e] border border-white/10 text-xs text-white/80 rounded px-2.5 py-1 focus:outline-none"
              >
                {readingChapter.pages.map((p, idx) => (
                  <option key={p.id} value={idx}>
                    Page {idx + 1} / {readingChapter.pages?.length}
                  </option>
                ))}
              </select>

              <button
                onClick={handleNextPage}
                disabled={activePageIndex === readingChapter.pages.length - 1}
                className="p-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-white/80 transition-opacity"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-white/10 mx-1" />

              <button
                onClick={handleToggleFullscreen}
                className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-white/80 transition-opacity"
                title="Toggle fullscreen (F)"
              >
                <Fullscreen className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Core Panel Zoom Engine Stage */}
          <div className="flex-1 relative bg-black">
            <PanelViewer
              page={readingChapter.pages[activePageIndex]}
              pageIndex={activePageIndex}
              totalPages={readingChapter.pages.length}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              onUpdatePagePanels={handleUpdatePagePanels}
            />
          </div>
        </div>
      ) : null}

      {/* ---------------- MAIN APP WRAPPER ---------------- */}
      
      {/* Navigation Top Header */}
      <header className="bg-[#121212] border-b border-white/10 sticky top-0 z-40" id="main-header">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow shadow-blue-950/40">
              P
            </div>
            <div>
              <h1 className="font-extrabold text-base text-white tracking-tight flex items-center gap-2">
                PANEL<span className="text-blue-500">x</span>PANEL
                <span className="hidden sm:inline-block text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono tracking-widest uppercase px-2 py-0.5 rounded">
                  Panel Reader v1.0
                </span>
              </h1>
            </div>
          </div>

          {/* Header tabs selector */}
          <nav className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-xl border border-white/5" id="tabs-navigation">
            <button
              type="button"
              onClick={() => setActiveTab("catalogs")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "catalogs" 
                  ? "bg-blue-600 text-white shadow" 
                  : "text-white/60 hover:text-white"
              }`}
              id="catalogs-tab-btn"
            >
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              <span>Catalog Sources</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "library" 
                  ? "bg-blue-600 text-white shadow" 
                  : "text-white/60 hover:text-white"
              }`}
              id="library-tab-btn"
            >
              <Library className="w-3.5 h-3.5 text-blue-400" />
              <span>Local Library</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("local")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                activeTab === "local" 
                  ? "bg-blue-600 text-white shadow" 
                  : "text-white/60 hover:text-white"
              }`}
              id="local-tab-btn"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Loose Files / CBZ</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden" id="main-content-stage">
        
        {/* Simple Welcome Tutorial */}
        {showWelcome && (
          <div className="max-w-4xl mx-auto px-6 mt-4" id="tutorial-alert">
            <div className="bg-[#121212] border border-white/10 p-5 rounded-2xl flex gap-3.5 relative shadow-2xl overflow-hidden">
              <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5 animate-pulse" />
              <div className="space-y-1.5 pr-6">
                <h4 className="font-bold text-sm text-white">Welcome to PanelxPanel!</h4>
                <p className="text-xs text-white/50 leading-relaxed">
                  Browse real manga from the public <strong>MangaDex API</strong>, save chapters offline directly into your <strong>Local Library</strong>, or upload standard offline <strong>.zip / .cbz archives</strong> of comic files. Click on any chapter to start the guided zoom engine. Panel segmentation is handled client-side with fast edge-scanners, grid slicer, and manual fine-tuning.
                </p>
              </div>
              <button
                onClick={() => setShowWelcome(false)}
                className="absolute top-3 right-3 text-white/40 hover:text-white p-1"
                title="Dismiss welcome tutorial"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Tab renders */}
        <div className="h-full" id="tab-renderer">
          {activeTab === "catalogs" ? (
            <SourceManager onReadChapter={handleReadChapter} />
          ) : activeTab === "library" ? (
            <LocalLibrary onLoadChapter={handleReadChapter} />
          ) : (
            <LocalReader onLoadChapter={handleReadChapter} />
          )}
        </div>

      </main>

    </div>
  );
}
