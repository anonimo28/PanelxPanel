// IndexedDB library manager for PanelPath AI offline storage

const DB_NAME = "panelpath_library_db";
const DB_VERSION = 1;
const STORE_NAME = "chapters";

export interface SavedChapterPage {
  id: string;
  pageNumber: number;
  imageBlob: Blob;
}

export interface LibraryChapter {
  id: string; // chapter ID
  mangaId: string;
  mangaTitle: string;
  mangaCoverBlob?: Blob; // Cover stored as Blob for offline use
  mangaCoverUrl: string; // Fallback or Blob URL
  chapterTitle: string;
  chapterNumber: string;
  downloadedAt: number;
  pages: SavedChapterPage[];
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open library database:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Saves a chapter and its pages to IndexedDB
export async function saveChapterToLibrary(
  mangaId: string,
  mangaTitle: string,
  mangaCoverUrl: string,
  chapterId: string,
  chapterTitle: string,
  chapterNumber: string,
  pages: { id: string; pageNumber: number; blob: Blob }[]
): Promise<void> {
  const db = await openDatabase();

  // Try to download the cover image as a Blob so it can be stored offline
  let mangaCoverBlob: Blob | undefined;
  try {
    const response = await fetch(mangaCoverUrl);
    if (response.ok) {
      mangaCoverBlob = await response.blob();
    }
  } catch (e) {
    console.warn("Could not download cover for offline storage, using fallback URL:", e);
  }

  const savedPages: SavedChapterPage[] = pages.map((p) => ({
    id: p.id,
    pageNumber: p.pageNumber,
    imageBlob: p.blob,
  }));

  const record: LibraryChapter = {
    id: chapterId,
    mangaId,
    mangaTitle,
    mangaCoverBlob,
    mangaCoverUrl,
    chapterTitle,
    chapterNumber,
    downloadedAt: Date.now(),
    pages: savedPages,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Retrieves all saved chapters in the local library
export async function getLibraryChapters(): Promise<LibraryChapter[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Checks if a specific chapter is saved in the local library
export async function isChapterSaved(chapterId: string): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getKey(chapterId);

    request.onsuccess = () => {
      resolve(request.result !== undefined);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Removes a chapter from the local library
export async function deleteChapterFromLibrary(chapterId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(chapterId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}
