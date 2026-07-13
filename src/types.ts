export interface Panel {
  id: number;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] from 0 to 1000
}

export interface Page {
  id: string;
  pageNumber: number;
  imageUrl: string;
  panels?: Panel[];
  width?: number;
  height?: number;
}

export interface Chapter {
  id: string;
  title: string;
  chapterNumber: string;
  url?: string;
  pages?: Page[];
}

export interface Manga {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  author?: string;
  artist?: string;
  genre?: string[];
  status?: string;
  sourceId: string;
  referer?: string;
  chapters?: Chapter[];
}

export interface MangaSource {
  id: string;
  name: string;
  description: string;
  url?: string;
  type: "official" | "json" | "apk" | "custom";
  mangas: Manga[];
}
