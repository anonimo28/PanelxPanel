import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Sparkles,
  Layers,
  Settings,
  Edit3,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Info,
  Sliders,
  Grid,
  Eye,
  EyeOff,
  Columns,
  Expand
} from "lucide-react";
import { Page, Panel } from "../types";
import { detectPanelsHeuristic, createGridPanels, loadImage } from "../lib/cv-helper";

interface PanelViewerProps {
  page: Page;
  pageIndex: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  onUpdatePagePanels?: (pageId: string, panels: Panel[]) => void;
}

export default function PanelViewer({
  page,
  pageIndex,
  totalPages,
  onPrevPage,
  onNextPage,
  onUpdatePagePanels,
}: PanelViewerProps) {
  const [readingMode, setReadingMode] = useState<"page" | "panel">("panel");
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [panels, setPanels] = useState<Panel[]>(page.panels || []);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPanelId, setSelectedPanelId] = useState<number | null>(null);

  // Focus & Immersive Blackout settings
  const [blackoutSurround, setBlackoutSurround] = useState<boolean>(true);
  const [zoomCushion, setZoomCushion] = useState<number>(0.96);
  const [fillScreen, setFillScreen] = useState<boolean>(false);

  // Heuristic panel configuration states
  const [gutterThreshold, setGutterThreshold] = useState(242);
  const [splitSensitivity, setSplitSensitivity] = useState(0.95);

  // Manual grid settings
  const [gridRows, setGridRows] = useState(3);
  const [gridCols, setGridCols] = useState(2);

  const containerRef = useRef<HTMLDivElement>(null);

  // --- Real geometry tracking (fixes centering/clipping bugs) -------------
  // The panel pan/zoom math needs to know two things in real pixels:
  // 1) how big the viewer stage actually is right now (resizes with window/
  //    orientation), and 2) the manga page's *intrinsic* pixel dimensions
  // (so we can work out exactly how object-contain/object-cover letterboxes
  // or crops it inside the stage). Guessing that the image always fills the
  // container 1:1 is what caused panels to end up off-center or clipped.
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setImgNatural({ w: 0, h: 0 }); // reset until the new page's real size is known
    loadImage(page.imageUrl)
      .then((img) => {
        if (!cancelled) setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
      })
      .catch(() => {
        // If this fails, we'll just fall back to scale 1 / no translate below.
      });
    return () => {
      cancelled = true;
    };
  }, [page.imageUrl]);

  // Synchronize panels when page changes
  useEffect(() => {
    if (page.panels && page.panels.length > 0) {
      setPanels(page.panels);
    } else {
      // Auto-detect using fast heuristic upon loading if not pre-detected
      handleAutoDetectHeuristic();
    }
    setCurrentPanelIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditing) return; // disable during manual edits
      if (e.key === "ArrowRight" || e.key === " ") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "v" || e.key === "V") {
        setReadingMode((m) => (m === "page" ? "panel" : "page"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPanelIndex, panels, readingMode, isEditing]);

  const handlePrev = () => {
    if (readingMode === "page") {
      onPrevPage();
    } else {
      if (currentPanelIndex > 0) {
        setCurrentPanelIndex(currentPanelIndex - 1);
      } else {
        // Go to previous page and target its last panel
        onPrevPage();
      }
    }
  };

  const handleNext = () => {
    if (readingMode === "page") {
      onNextPage();
    } else {
      if (currentPanelIndex < panels.length - 1) {
        setCurrentPanelIndex(currentPanelIndex + 1);
      } else {
        // Go to next page
        onNextPage();
      }
    }
  };

  // 1. Client-Side Computer Vision detection
  const handleAutoDetectHeuristic = async () => {
    setIsDetecting(true);
    try {
      const detected = await detectPanelsHeuristic(page.imageUrl, {
        gutterThreshold,
        splitSensitivity,
      });
      setPanels(detected);
      if (onUpdatePagePanels) {
        onUpdatePagePanels(page.id, detected);
      }
      setCurrentPanelIndex(0);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDetecting(false);
    }
  };

  // 2. Grid split creator
  const handleApplyGrid = () => {
    const gridPanels = createGridPanels(gridRows, gridCols);
    setPanels(gridPanels);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, gridPanels);
    }
    setCurrentPanelIndex(0);
  };

  const handleResetPanels = () => {
    const defaultPanels: Panel[] = [{ id: 1, box: [0, 0, 1000, 1000] }];
    setPanels(defaultPanels);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, defaultPanels);
    }
    setCurrentPanelIndex(0);
  };

  // Smart split for double-page spreads
  const handleSplitCenter = () => {
    // Splits page vertically down the middle.
    // In manga reading order (RTL), Panel 1 is on the right, Panel 2 is on the left.
    const centerSplitPanels: Panel[] = [
      { id: 1, box: [0, 500, 1000, 1000] },
      { id: 2, box: [0, 0, 1000, 500] }
    ];
    setPanels(centerSplitPanels);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, centerSplitPanels);
    }
    setCurrentPanelIndex(0);
  };

  // Manual box editor helpers
  const handlePanelBoxChange = (index: number, boxIndex: number, val: number) => {
    const updated = [...panels];
    const newBox = [...updated[index].box] as [number, number, number, number];
    newBox[boxIndex] = Math.max(0, Math.min(1000, val));
    updated[index] = { ...updated[index], box: newBox };
    setPanels(updated);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, updated);
    }
  };

  const handleDeletePanel = (index: number) => {
    const updated = panels.filter((_, i) => i !== index).map((p, idx) => ({ ...p, id: idx + 1 }));
    setPanels(updated.length > 0 ? updated : [{ id: 1, box: [0, 0, 1000, 1000] }]);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, updated);
    }
    setCurrentPanelIndex(0);
  };

  const handleAddPanel = () => {
    const newPanel: Panel = {
      id: panels.length + 1,
      box: [250, 250, 750, 750], // Center box
    };
    const updated = [...panels, newPanel];
    setPanels(updated);
    if (onUpdatePagePanels) {
      onUpdatePagePanels(page.id, updated);
    }
    setCurrentPanelIndex(updated.length - 1);
  };

  // --- Panel zoom: scale + translate to keep every panel centered --------
  // Computed entirely in real pixels from the *actual* measured stage size
  // and the page's intrinsic image size, so it's correct regardless of
  // whether object-contain letterboxes the page or object-cover crops it.
  const currentPanel = panels[currentPanelIndex] || { id: 1, box: [0, 0, 1000, 1000] };
  const [ymin, xmin, ymax, xmax] = currentPanel.box;

  const containerW = containerSize.w;
  const containerH = containerSize.h;
  const naturalW = imgNatural.w;
  const naturalH = imgNatural.h;
  const geometryReady = containerW > 0 && containerH > 0 && naturalW > 0 && naturalH > 0;

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  if (geometryReady) {
    // How the page is actually rendered inside the stage right now:
    // "contain" fits the whole page (letterboxed on one axis), "cover"
    // fills the stage completely (cropped on one axis). Both cases are
    // handled by the same formula below.
    const displayScale = fillScreen
      ? Math.max(containerW / naturalW, containerH / naturalH)
      : Math.min(containerW / naturalW, containerH / naturalH);
    const displayedW = naturalW * displayScale;
    const displayedH = naturalH * displayScale;
    // Offset of the rendered page's top-left corner from the stage's
    // top-left corner. Positive = letterbox padding, negative = cropped
    // off-screen (cover mode).
    const offsetX = (containerW - displayedW) / 2;
    const offsetY = (containerH - displayedH) / 2;

    const u0 = xmin / 1000;
    const u1 = xmax / 1000;
    const v0 = ymin / 1000;
    const v1 = ymax / 1000;
    const panelNormW = Math.max(u1 - u0, 0.001);
    const panelNormH = Math.max(v1 - v0, 0.001);
    const panelPxW = panelNormW * displayedW;
    const panelPxH = panelNormH * displayedH;

    const rawScale = fillScreen
      ? Math.max(containerW / panelPxW, containerH / panelPxH)
      : Math.min(containerW / panelPxW, containerH / panelPxH);
    scale = Math.max(1, Math.min(rawScale * zoomCushion, fillScreen ? 8 : 6));

    // Where the panel's center actually sits on screen right now, before
    // any transform is applied.
    const panelCenterX = offsetX + ((u0 + u1) / 2) * displayedW;
    const panelCenterY = offsetY + ((v0 + v1) / 2) * displayedH;

    // Move that point to the exact center of the stage, post-scale.
    translateX = scale * (containerW / 2 - panelCenterX);
    translateY = scale * (containerH / 2 - panelCenterY);
  }

  return (
    <div className="flex flex-col h-full bg-black text-gray-200 select-none overflow-hidden" id="panel-viewer-root">
      {/* Immersive Top Bar */}
      <div className="bg-[#121212] border-b border-white/10 px-4 py-3 flex items-center justify-between z-10" id="viewer-top-bar">
        <div className="flex items-center gap-2">
          <span className="bg-red-600 text-white text-[10px] tracking-wider uppercase font-extrabold px-2 py-0.5 rounded">
            {readingMode === "panel" ? `Panel ${currentPanelIndex + 1}/${panels.length}` : "Page Mode"}
          </span>
          <p className="text-xs text-white/40 font-medium">
            Page {pageIndex + 1} of {totalPages}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick toggle Reading Mode */}
          <button
            onClick={() => setReadingMode(readingMode === "page" ? "panel" : "page")}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
              readingMode === "panel"
                ? "bg-blue-600/15 text-blue-400 border border-blue-500/30"
                : "bg-[#1e1e1e] hover:bg-[#252525] border border-white/5 text-white/80 hover:text-white"
            }`}
            title="Toggle panel / full page reading mode"
            id="toggle-reading-mode-btn"
          >
            {readingMode === "panel" ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{readingMode === "panel" ? "Panel View" : "Page View"}</span>
          </button>

          {/* Cinematic Blackout Toggle */}
          {readingMode === "panel" && (
            <button
              onClick={() => setBlackoutSurround(!blackoutSurround)}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold border ${
                blackoutSurround
                  ? "bg-pink-600/15 text-pink-400 border-pink-500/30"
                  : "bg-[#1e1e1e] hover:bg-[#252525] border-white/5 text-white/60 hover:text-white"
              }`}
              title="Toggle blackout background focus"
              id="blackout-surround-btn"
            >
              {blackoutSurround ? <EyeOff className="w-4 h-4 text-pink-400" /> : <Eye className="w-4 h-4 text-white/60" />}
              <span className="hidden sm:inline">{blackoutSurround ? "Blackout: On" : "Blackout: Off"}</span>
            </button>
          )}

          {/* Fill Screen Toggle */}
          {readingMode === "panel" && (
            <button
              onClick={() => setFillScreen(!fillScreen)}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold border ${
                fillScreen
                  ? "bg-emerald-600/15 text-emerald-400 border-emerald-500/30"
                  : "bg-[#1e1e1e] hover:bg-[#252525] border-white/5 text-white/60 hover:text-white"
              }`}
              title="Toggle fill screen mode"
              id="fill-screen-btn"
            >
              <Expand className="w-4 h-4" />
              <span className="hidden sm:inline">{fillScreen ? "Fill: On" : "Fill Screen"}</span>
            </button>
          )}

          {/* Quick setup panel config */}
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`p-2 rounded-lg transition-colors border ${
              showConfig
                ? "bg-[#252525] border-white/20 text-white"
                : "bg-[#1e1e1e] hover:bg-[#252525] border-white/5 text-white/60 hover:text-white"
            }`}
            title="Panel detection algorithms & settings"
            id="viewer-config-btn"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Manual Fine-Tuner Editor Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-2 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold ${
              isEditing
                ? "bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                : "bg-[#1e1e1e] hover:bg-[#252525] border border-white/5 text-white/80 hover:text-white"
            }`}
            title="Fine-tune and edit panels manually"
            id="viewer-edit-btn"
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline">{isEditing ? "Editing" : "Edit Panels"}</span>
          </button>
        </div>
      </div>

      {/* Main Core View Area */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden" ref={containerRef} id="viewer-stage">
        {/* Detection Settings Floating Menu */}
        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-4 right-4 bg-[#121212] border border-white/10 p-4 rounded-xl shadow-2xl z-20 w-80 text-sm max-h-[85%] overflow-y-auto"
              id="config-floating-panel"
            >
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-400" /> Panel Segmentation
                </h4>
                <button
                  onClick={() => setShowConfig(false)}
                  className="text-white/40 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* 2. Fast Heuristic client-side detector */}
              <div className="mb-4 bg-black/40 p-3 rounded-lg border border-white/5">
                <span className="font-semibold text-xs text-blue-300 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Sliders className="w-3.5 h-3.5" /> Fast Gutter Detector
                </span>
                <p className="text-xs text-white/40 mb-3 leading-relaxed">
                  Scans columns & rows for whitespace gutters completely offline.
                </p>

                <div className="space-y-2 mb-3">
                  <div>
                    <div className="flex justify-between text-[11px] text-white/40 mb-1">
                      <span>Brightness Threshold: {gutterThreshold}</span>
                    </div>
                    <input
                      type="range"
                      min="200"
                      max="255"
                      value={gutterThreshold}
                      onChange={(e) => setGutterThreshold(parseInt(e.target.value))}
                      className="w-full accent-blue-500 bg-[#1e1e1e] h-1 rounded"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-white/40 mb-1">
                      <span>Gutter Sensitivity: {Math.round(splitSensitivity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.80"
                      max="0.99"
                      step="0.01"
                      value={splitSensitivity}
                      onChange={(e) => setSplitSensitivity(parseFloat(e.target.value))}
                      className="w-full accent-blue-500 bg-[#1e1e1e] h-1 rounded"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAutoDetectHeuristic}
                  disabled={isDetecting}
                  className="w-full py-1.5 bg-[#1e1e1e] hover:bg-[#252525] border border-white/5 disabled:bg-zinc-850 text-blue-400 hover:text-blue-300 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  id="run-heuristic-detect-btn"
                >
                  {isDetecting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                      <span>Scanning gutters...</span>
                    </>
                  ) : (
                    <span>Re-Scan Whitespaces</span>
                  )}
                </button>
              </div>

              {/* 3. Manual Grid Builder */}
              <div className="mb-3 bg-black/40 p-3 rounded-lg border border-white/5">
                <span className="font-semibold text-xs text-blue-300 uppercase tracking-wider flex items-center gap-1 mb-1.5">
                  <Grid className="w-3.5 h-3.5" /> Equal-Grid Slicer
                </span>
                <p className="text-xs text-white/40 mb-2 leading-relaxed">
                  Slice page into static rows and columns. Ideal for 4-panel strips (Yonkoma) or uniform grids.
                </p>
                <div className="flex gap-2 mb-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-white/30 block mb-0.5">Rows</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={gridRows}
                      onChange={(e) => setGridRows(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-[#1e1e1e] border border-white/5 text-white rounded text-center text-xs py-1"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-white/30 block mb-0.5">Cols</label>
                    <input
                      type="number"
                      min="1"
                      max="8"
                      value={gridCols}
                      onChange={(e) => setGridCols(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-[#1e1e1e] border border-white/5 text-white rounded text-center text-xs py-1"
                    />
                  </div>
                </div>
                <button
                  onClick={handleApplyGrid}
                  className="w-full py-1.5 bg-[#1e1e1e] border border-white/10 hover:bg-[#252525] text-blue-400 hover:text-blue-300 text-xs font-semibold rounded-lg transition-colors"
                  id="apply-grid-slicer-btn"
                >
                  Apply Grid
                </button>
              </div>

              {/* 4. Cinematic Focus Settings */}
              <div className="mb-4 bg-black/40 p-3 rounded-lg border border-white/5 space-y-3">
                <span className="font-semibold text-xs text-blue-300 uppercase tracking-wider flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> Cinematic Controls
                </span>

                {/* Blackout Surround Switch */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/80 block">Blackout Surround</span>
                    <span className="text-[10px] text-white/40 block">Hides all other comic panels</span>
                  </div>
                  <button
                    onClick={() => setBlackoutSurround(!blackoutSurround)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      blackoutSurround ? "bg-blue-600" : "bg-zinc-800"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                        blackoutSurround ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Fill Screen Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white/80 block">Fill Screen</span>
                    <span className="text-[10px] text-white/40 block">Panel fills entire viewport edge-to-edge</span>
                  </div>
                  <button
                    onClick={() => setFillScreen(!fillScreen)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                      fillScreen ? "bg-emerald-600" : "bg-zinc-800"
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                        fillScreen ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Zoom Snugness Slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-white/40 mb-1">
                    <span>Zoom Frame Snugness: {Math.round(zoomCushion * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.80"
                    max="1.00"
                    step="0.02"
                    value={zoomCushion}
                    onChange={(e) => setZoomCushion(parseFloat(e.target.value))}
                    className="w-full accent-blue-500 bg-[#1e1e1e] h-1 rounded cursor-pointer"
                  />
                </div>

                {/* Force Double Page Split Preset */}
                <button
                  onClick={handleSplitCenter}
                  className="w-full py-1.5 bg-[#1e1e1e] hover:bg-[#252525] border border-white/5 text-blue-400 hover:text-blue-300 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1"
                  title="Force split the page into right and left panels (perfect for double spreads)"
                  id="split-center-btn"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Split Center (Double Page helper)</span>
                </button>
              </div>

              {/* 5. Resets */}
              <button
                onClick={handleResetPanels}
                className="w-full py-1.5 bg-black/40 hover:bg-black/60 border border-white/10 text-white/40 hover:text-white/80 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                id="reset-panels-btn"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Full Page (1 Panel)</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------------- DRAW STAGE AND ANIMATOR ---------------- */}
        {readingMode === "panel" ? (
          /* Immersive Pitch Black Guided Panel Mode */
          <div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden select-none">
            {/* Dark vignette layer — hidden in fill screen mode */}
            {!fillScreen && (
              <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_60%,rgba(0,0,0,0.95)_100%)] z-10"></div>
            )}

            <motion.div
              className="w-full h-full flex items-center justify-center relative"
              animate={{
                scale: scale,
                x: translateX,
                y: translateY,
              }}
              transition={{
                duration: 0.28,
                ease: "easeOut",
              }}
              style={{
                transformOrigin: "50% 50%",
              }}
            >
              <motion.img
                src={page.imageUrl}
                alt="Manga page panel view"
                className={`max-w-full max-h-full select-none shadow-2xl ${fillScreen ? "w-full h-full object-cover" : "object-contain"}`}
                referrerPolicy="no-referrer"
                draggable={false}
                animate={{
                  clipPath: blackoutSurround
                    ? `inset(${ymin / 10}% ${(1000 - xmax) / 10}% ${(1000 - ymax) / 10}% ${xmin / 10}%)`
                    : "inset(0% 0% 0% 0%)"
                }}
                transition={{
                  duration: 0.15,
                  ease: "easeOut",
                }}
              />
            </motion.div>
          </div>
        ) : (
          /* Standard Full Page View with overlay box indicators */
          <div className="w-full h-full max-w-lg md:max-w-xl flex items-center justify-center p-4 relative" id="full-page-wrapper">
            <img
              src={page.imageUrl}
              alt="Manga full page view"
              className="max-w-full max-h-[85vh] object-contain select-none shadow-xl border border-white/10"
              referrerPolicy="no-referrer"
              draggable={false}
            />
            {/* Bounding box overlays */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 1000" preserveAspectRatio="none">
              {panels.map((p, idx) => {
                const [ymin, xmin, ymax, xmax] = p.box;
                const active = idx === currentPanelIndex;
                return (
                  <g key={p.id}>
                    <rect
                      x={xmin}
                      y={ymin}
                      width={xmax - xmin}
                      height={ymax - ymin}
                      className={`fill-none transition-all duration-300 ${
                        active
                          ? "stroke-blue-500 stroke-[5] drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]"
                          : "stroke-white/10 stroke-[2] hover:stroke-white/30"
                      }`}
                    />
                    <text
                      x={xmin + 10}
                      y={ymin + 35}
                      className={`font-sans font-extrabold text-[24px] ${
                        active ? "fill-blue-500" : "fill-white/20"
                      }`}
                    >
                      {idx + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ---------------- MANUAL BOX EDITOR INTERACTIVE PANEL ---------------- */}
        {isEditing && (
          <div className="absolute inset-0 bg-black/90 z-30 flex flex-col md:flex-row p-4 gap-4 overflow-y-auto" id="manual-panel-editor">
            {/* Edit Left Side: Page Canvas visualization */}
            <div className="flex-1 flex flex-col items-center justify-center relative min-h-[300px]">
              <p className="text-xs text-white/60 absolute top-0 text-center bg-black/80 px-3 py-1.5 rounded-full border border-white/10 z-10 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                Select a panel below, then adjust coordinates using input dials.
              </p>
              <div className="relative max-h-[70vh] max-w-full flex items-center justify-center aspect-[2/3] border border-white/10 rounded bg-black">
                <img
                  src={page.imageUrl}
                  alt="Manga editor page view"
                  className="max-w-full max-h-[60vh] object-contain select-none opacity-40"
                  referrerPolicy="no-referrer"
                  draggable={false}
                />
                {/* Editable overlay SVG */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                  {panels.map((p, idx) => {
                    const [ymin, xmin, ymax, xmax] = p.box;
                    const selected = selectedPanelId === p.id;
                    return (
                      <g
                        key={p.id}
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => {
                          setSelectedPanelId(p.id);
                          setCurrentPanelIndex(idx);
                        }}
                      >
                        <rect
                          x={xmin}
                          y={ymin}
                          width={xmax - xmin}
                          height={ymax - ymin}
                          className={`fill-transparent transition-all ${
                            selected
                              ? "stroke-blue-400 stroke-[6] fill-blue-500/10"
                              : "stroke-white/20 stroke-[3] hover:stroke-white/40"
                          }`}
                        />
                        <rect
                          x={xmin}
                          y={ymin}
                          width={40}
                          height={40}
                          className={selected ? "fill-blue-500" : "fill-[#1e1e1e]"}
                        />
                        <text
                          x={xmin + 12}
                          y={ymin + 28}
                          className="font-bold fill-white text-[22px] font-mono"
                        >
                          {idx + 1}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Edit Right Side: Panel boxes and sliders dial config */}
            <div className="w-full md:w-80 bg-[#121212] border border-white/10 rounded-xl p-4 flex flex-col max-h-[75vh] md:max-h-[85vh]">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-blue-400" /> Fine-Tune Panels
                </h4>
                <button
                  onClick={() => setIsEditing(false)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-lg shadow-blue-950/40"
                  id="save-edits-btn"
                >
                  <Check className="w-3.5 h-3.5" /> Save / Exit
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {panels.map((p, idx) => {
                  const selected = selectedPanelId === p.id || (!selectedPanelId && idx === currentPanelIndex);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedPanelId(p.id);
                        setCurrentPanelIndex(idx);
                      }}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                        selected
                          ? "bg-blue-950/20 border-blue-500"
                          : "bg-black/35 border-white/5 hover:bg-[#1e1e1e]/40"
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold font-mono text-white/80">
                          Panel #{idx + 1} (ID: {p.id})
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePanel(idx);
                          }}
                          className="text-white/30 hover:text-red-400 p-1 rounded transition-colors"
                          title="Delete this panel"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Dimensions sliders */}
                      <div className="space-y-1 text-white/40">
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span>Left Boundary:</span>
                            <span className="text-white/80 font-bold">{p.box[1]}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1000"
                            value={p.box[1]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePanelBoxChange(idx, 1, parseInt(e.target.value))}
                            className="w-full h-1 bg-[#1e1e1e] rounded accent-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span>Right Boundary:</span>
                            <span className="text-white/80 font-bold">{p.box[3]}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1000"
                            value={p.box[3]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePanelBoxChange(idx, 3, parseInt(e.target.value))}
                            className="w-full h-1 bg-[#1e1e1e] rounded accent-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span>Top Boundary:</span>
                            <span className="text-white/80 font-bold">{p.box[0]}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1000"
                            value={p.box[0]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePanelBoxChange(idx, 0, parseInt(e.target.value))}
                            className="w-full h-1 bg-[#1e1e1e] rounded accent-blue-500"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] mb-0.5 font-mono">
                            <span>Bottom Boundary:</span>
                            <span className="text-white/80 font-bold">{p.box[2]}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1000"
                            value={p.box[2]}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handlePanelBoxChange(idx, 2, parseInt(e.target.value))}
                            className="w-full h-1 bg-[#1e1e1e] rounded accent-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleAddPanel}
                className="w-full py-2 bg-[#1e1e1e] hover:bg-[#252525] border border-white/10 text-white/80 text-xs font-semibold rounded-lg mt-3 transition-colors flex items-center justify-center gap-1.5"
                id="add-custom-panel-btn"
              >
                <Plus className="w-4 h-4" /> Add Custom Panel
              </button>
            </div>
          </div>
        )}

        {/* ---------------- HOTKEYS INSTRUCTION ON-SCREEN OVERLAY ---------------- */}
        <div className="absolute bottom-20 left-4 text-[10px] text-white/30 bg-black/80 px-3 py-1.5 rounded-lg border border-white/5 pointer-events-none hidden sm:block">
          💡 Hotkeys: <kbd className="bg-[#1e1e1e] px-1 rounded text-white/50 border border-white/5">Space</kbd> / <kbd className="bg-[#1e1e1e] px-1 rounded text-white/50 border border-white/5">→</kbd> next, <kbd className="bg-[#1e1e1e] px-1 rounded text-white/50 border border-white/5">←</kbd> prev, <kbd className="bg-[#1e1e1e] px-1 rounded text-white/50 border border-white/5">V</kbd> switch modes
        </div>
      </div>

      {/* Immersive Bottom Controls Strip */}
      <div className="bg-[#121212] border-t border-white/10 py-3 px-4 flex flex-col gap-2 z-10" id="viewer-bottom-strip">
        <div className="flex items-center justify-between w-full max-w-lg mx-auto">
          {/* Previous Trigger */}
          <button
            onClick={handlePrev}
            className="p-3 bg-[#1e1e1e] border border-white/10 hover:bg-[#252525] rounded-xl transition-colors text-white/80 flex items-center justify-center shadow"
            id="prev-btn"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Quick Jump Panel Dots Indicator */}
          <div className="flex-1 flex justify-center items-center gap-1 mx-3 overflow-x-auto py-1 max-w-[220px] sm:max-w-[350px]">
            {readingMode === "panel" ? (
              panels.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setCurrentPanelIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === currentPanelIndex
                      ? "w-6 bg-blue-500"
                      : "w-2 bg-[#252525] hover:bg-white/20"
                  }`}
                  title={`Jump to panel ${idx + 1}`}
                />
              ))
            ) : (
              <span className="text-white/40 text-xs font-semibold tracking-wider font-sans uppercase">Immersive View Enabled</span>
            )}
          </div>

          {/* Next Trigger */}
          <button
            onClick={handleNext}
            className="p-3 bg-[#1e1e1e] border border-white/10 hover:bg-[#252525] rounded-xl transition-colors text-white/80 flex items-center justify-center shadow"
            id="next-btn"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
