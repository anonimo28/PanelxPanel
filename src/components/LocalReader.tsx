import React, { useState } from "react";
import { 
  Upload, 
  FolderOpen, 
  FileArchive, 
  Link as LinkIcon, 
  Loader2, 
  BookOpen, 
  Info,
  AlertCircle,
  FileText
} from "lucide-react";
import JSZip from "jszip";
import { Manga, Chapter, Page } from "../types";

interface LocalReaderProps {
  onLoadChapter: (manga: Manga, chapter: Chapter) => void;
}

export default function LocalReader({ onLoadChapter }: LocalReaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteZipUrl, setRemoteZipUrl] = useState("");

  // Helper to extract pages from a local or downloaded ZIP / CBZ file
  const processZipFile = async (file: File | Blob, customTitle?: string) => {
    setLoading(true);
    setError(null);
    try {
      const zip = await JSZip.loadAsync(file);
      const imagePromises: { name: string; promise: Promise<string> }[] = [];

      zip.forEach((relativePath, zipEntry) => {
        // Look for image files inside the archive (jpg, jpeg, png, webp)
        if (!zipEntry.dir && /\.(jpe?g|png|webp|gif)$/i.test(zipEntry.name)) {
          const promise = zipEntry.async("blob").then((blob) => {
            return URL.createObjectURL(blob);
          });
          imagePromises.push({ name: zipEntry.name, promise });
        }
      });

      if (imagePromises.length === 0) {
        throw new Error("No readable image files (JPG, PNG, WEBP) found in the ZIP/CBZ archive.");
      }

      // Sort files alphabetically to preserve correct manga reading order
      imagePromises.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const pageUrls = await Promise.all(imagePromises.map(p => p.promise));

      const pages: Page[] = pageUrls.map((url, idx) => ({
        id: `local-p${idx + 1}`,
        pageNumber: idx + 1,
        imageUrl: url,
      }));

      const mangaTitle = customTitle || (file instanceof File ? file.name.replace(/\.[^/.]+$/, "") : "Web Archive Comic");

      const localManga: Manga = {
        id: "local-archive-" + Date.now(),
        title: mangaTitle,
        coverUrl: pages[0].imageUrl,
        sourceId: "local",
      };

      const localChapter: Chapter = {
        id: "local-chapter-1",
        title: "Chapter 1: Full Archive",
        chapterNumber: "1",
        pages,
      };

      onLoadChapter(localManga, localChapter);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to process ZIP/CBZ manga file.");
    } finally {
      setLoading(false);
    }
  };

  // 1. Handlers for individual files or multiple page image uploads
  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    try {
      const imageFiles = (Array.from(files) as File[]).filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
      if (imageFiles.length === 0) {
        throw new Error("Please select valid image files (JPG, PNG, WEBP).");
      }

      // Sort files alphabetically
      imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

      const pages: Page[] = imageFiles.map((file, idx) => ({
        id: `local-file-p${idx + 1}-${Date.now()}`,
        pageNumber: idx + 1,
        imageUrl: URL.createObjectURL(file),
      }));

      const localManga: Manga = {
        id: "local-images-" + Date.now(),
        title: "Manual Upload Images",
        coverUrl: pages[0].imageUrl,
        sourceId: "local",
      };

      const localChapter: Chapter = {
        id: "local-chapter-manual",
        title: "Custom Manga Upload",
        chapterNumber: "1",
        pages,
      };

      onLoadChapter(localManga, localChapter);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Handler for CBZ / ZIP file upload
  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    processZipFile(file);
  };

  // 3. Handler to load a folder link (ZIP, CBZ or nested open directories on the web)
  const handleLoadRemoteZipUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteZipUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch ZIP securely via server-side CORS-bypass proxy
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(remoteZipUrl.trim())}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to download remote file: ${response.statusText} (${response.status})`);
      }

      const blob = await response.blob();
      
      // Attempt to extract title from the end of URL
      const urlParsed = new URL(remoteZipUrl);
      let titleName = urlParsed.pathname.split("/").pop() || "Web CBZ Archive";
      titleName = decodeURIComponent(titleName).replace(/\.[^/.]+$/, "");

      await processZipFile(blob, titleName);
      setRemoteZipUrl("");
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch or open remote manga ZIP. Ensure the URL is directly downloadable: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 text-[#e0e0e0]" id="local-reader-root">
      
      <div className="space-y-1.5 text-center py-4">
        <h2 className="text-xl font-extrabold text-white flex items-center justify-center gap-2">
          <FolderOpen className="w-5 h-5 text-blue-500" /> Local File & CBZ Archive Reader
        </h2>
        <p className="text-xs text-white/40 max-w-md mx-auto">
          Read manga directly from your storage device. Supports dragging-and-dropping loose pages, folders of files, or packaged comic files.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center bg-[#121212] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-white/80">Unpacking manga content...</p>
            <p className="text-xs text-white/40">Decompressing and sorting image sequences alphabetically.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Box 1: ZIP & CBZ unpacker dropzone */}
          <div className="bg-[#121212] border border-white/5 hover:border-white/10 rounded-2xl p-6 flex flex-col justify-between items-center text-center gap-4 transition-all">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
              <FileArchive className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-sm text-white">Load CBZ / ZIP Comic Book</h3>
              <p className="text-xs text-white/40 max-w-xs">
                Upload a packed standard digital manga archive (.cbz, .zip). All images will be parsed instantly.
              </p>
            </div>

            <label className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl cursor-pointer transition-colors shadow-lg shadow-blue-950/40">
              Select Comic ZIP File
              <input
                type="file"
                accept=".zip,.cbz"
                onChange={handleZipUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Box 2: Folder of images selector */}
          <div className="bg-[#121212] border border-white/5 hover:border-white/10 rounded-2xl p-6 flex flex-col justify-between items-center text-center gap-4 transition-all">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
              <FolderOpen className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-sm text-white">Load Manga Folder / Images</h3>
              <p className="text-xs text-white/40 max-w-xs">
                Select a local folder containing high-quality loose page files or select individual files manually.
              </p>
            </div>

            <div className="flex gap-2 w-full">
              <label className="flex-1 py-2.5 px-4 bg-[#1e1e1e] hover:bg-[#252525] border border-white/10 text-white/80 font-semibold text-xs rounded-xl cursor-pointer text-center transition-colors">
                Loose Files
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImagesUpload}
                  className="hidden"
                />
              </label>

              <label className="flex-1 py-2.5 px-4 bg-[#1e1e1e] hover:bg-[#252525] border border-white/10 text-white/80 font-semibold text-xs rounded-xl cursor-pointer text-center transition-colors">
                Folder Upload
                <input
                  type="file"
                  multiple
                  webkitdirectory=""
                  directory=""
                  onChange={handleImagesUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Box 3: Fetch ZIP via link (DropBox, MEGA, direct web links) */}
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-6 md:col-span-2 space-y-4">
            <div className="flex items-center gap-2 text-blue-400">
              <LinkIcon className="w-5 h-5" />
              <h3 className="font-bold text-sm text-white">Stream Manga ZIP from Link URL</h3>
            </div>
            
            <p className="text-xs text-white/40 leading-relaxed">
              Paste any directly downloadable web address linking to a manga `.zip` or `.cbz` archive. The application will bypass restrictions, download the container via proxy, and extract it instantly inside your browser.
            </p>

            <form onSubmit={handleLoadRemoteZipUrl} className="flex gap-2" id="stream-zip-form">
              <input
                type="url"
                placeholder="Paste remote .zip or .cbz URL link..."
                value={remoteZipUrl}
                onChange={(e) => setRemoteZipUrl(e.target.value)}
                className="flex-1 bg-[#1e1e1e] border border-white/5 p-2.5 rounded-xl text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
              <button
                type="submit"
                disabled={loading || !remoteZipUrl}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-950/40"
              >
                Stream CBZ
              </button>
            </form>
          </div>

        </div>
      )}

      {/* Warning/Tips */}
      <div className="bg-[#121212]/30 border border-white/5 p-4 rounded-2xl flex gap-3 text-xs text-white/40 leading-relaxed" id="local-reader-tips">
        <Info className="w-4.5 h-4.5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-white/70">Reading Optimization Tips</p>
          <p>
            Manga panels are read from <strong>Right to Left</strong>. Make sure files inside your ZIP archive or folder are ordered sequentially (e.g. <code>page_001.jpg</code>, <code>page_002.jpg</code>) so they sort correctly. For standard page reading, press the <kbd className="bg-[#1e1e1e] border border-white/10 px-1.5 py-0.5 rounded text-white/60 font-mono">V</kbd> key to switch reading directions.
          </p>
        </div>
      </div>

    </div>
  );
}
