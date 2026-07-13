import { Panel } from "../types";

/**
 * Loads an image from a URL or Base64 string and returns an HTMLImageElement
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Advanced Client-Side Heuristic Panel Detection Algorithm
 * Uses projection-profile document layout analysis on a canvas element.
 * Detects white/light gutters separating comic panels.
 */
export async function detectPanelsHeuristic(
  imageUrl: string,
  options: {
    gutterThreshold?: number; // threshold of pixel value to be considered white (0-255)
    splitSensitivity?: number; // fraction of row/col that must be white to consider it a gutter
    minPanelSizePercent?: number; // minimum width/height as a % of page
  } = {}
): Promise<Panel[]> {
  const {
    gutterThreshold = 240,
    splitSensitivity = 0.96,
    minPanelSizePercent = 5,
  } = options;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return createGridPanels(2, 2); // Fallback to 2x2 grid if canvas fails

    // Scale down image for faster processing
    const targetWidth = 400;
    const targetHeight = Math.round((img.height / img.width) * targetWidth);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    // Convert to grayscale/binary map
    // Neutralize borders: often page-scans have dark shadows/borders at the very edges which block the whiteness lines from running
    const marginX = Math.round(targetWidth * 0.035); // 3.5% padding of the page
    const marginY = Math.round(targetHeight * 0.035);

    const grid: boolean[][] = []; // true = white/gutter, false = dark/drawing
    for (let y = 0; y < targetHeight; y++) {
      grid[y] = [];
      const isNearY = y < marginY || y > targetHeight - marginY;
      for (let x = 0; x < targetWidth; x++) {
        const isNearX = x < marginX || x > targetWidth - marginX;
        
        if (isNearY || isNearX) {
          // Treat borders as white space to neutralize scan border lines
          grid[y][x] = true;
        } else {
          const idx = (y * targetWidth + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          grid[y][x] = luminance >= gutterThreshold;
        }
      }
    }

    // 1. Horizontal projection (which rows are gutters?)
    const horizontalWhiteness = new Array(targetHeight).fill(0);
    for (let y = 0; y < targetHeight; y++) {
      let whiteCount = 0;
      for (let x = 0; x < targetWidth; x++) {
        if (grid[y][x]) whiteCount++;
      }
      horizontalWhiteness[y] = whiteCount / targetWidth;
    }

    // Identify horizontal cuts
    const hGutterRows: boolean[] = [];
    for (let y = 0; y < targetHeight; y++) {
      hGutterRows[y] = horizontalWhiteness[y] >= splitSensitivity;
    }

    // Group rows into non-gutter slices (horizontal segments containing panel rows)
    interface Segment {
      start: number;
      end: number;
    }
    const hSegments: Segment[] = [];
    let inSegment = false;
    let segStart = 0;

    for (let y = 0; y < targetHeight; y++) {
      if (!hGutterRows[y]) {
        if (!inSegment) {
          segStart = y;
          inSegment = true;
        }
      } else {
        if (inSegment) {
          hSegments.push({ start: segStart, end: y - 1 });
          inSegment = false;
        }
      }
    }
    if (inSegment) {
      hSegments.push({ start: segStart, end: targetHeight - 1 });
    }

    const detectedBoxes: { ymin: number; xmin: number; ymax: number; xmax: number }[] = [];

    // 2. For each horizontal segment, run vertical projection to locate individual panels
    for (const hSeg of hSegments) {
      const segHeight = hSeg.end - hSeg.start + 1;
      if (segHeight < (targetHeight * minPanelSizePercent) / 100) continue;

      const verticalWhiteness = new Array(targetWidth).fill(0);
      for (let x = 0; x < targetWidth; x++) {
        let whiteCount = 0;
        for (let y = hSeg.start; y <= hSeg.end; y++) {
          if (grid[y][x]) whiteCount++;
        }
        verticalWhiteness[x] = whiteCount / segHeight;
      }

      const vGutterCols: boolean[] = [];
      for (let x = 0; x < targetWidth; x++) {
        vGutterCols[x] = verticalWhiteness[x] >= splitSensitivity;
      }

      // Group columns into panel segments
      let inColSeg = false;
      let colStart = 0;
      const vSegments: Segment[] = [];

      for (let x = 0; x < targetWidth; x++) {
        if (!vGutterCols[x]) {
          if (!inColSeg) {
            colStart = x;
            inColSeg = true;
          }
        } else {
          if (inColSeg) {
            vSegments.push({ start: colStart, end: x - 1 });
            inColSeg = false;
          }
        }
      }
      if (inColSeg) {
        vSegments.push({ start: colStart, end: targetWidth - 1 });
      }

      // Add detected panel rectangles for this row segment
      for (const vSeg of vSegments) {
        const segWidth = vSeg.end - vSeg.start + 1;
        if (segWidth < (targetWidth * minPanelSizePercent) / 100) continue;

        // Convert coordinates back to 0-1000 percentage space
        const ymin = Math.round((hSeg.start / targetHeight) * 1000);
        const xmin = Math.round((vSeg.start / targetWidth) * 1000);
        const ymax = Math.round((hSeg.end / targetHeight) * 1000);
        const xmax = Math.round((vSeg.end / targetWidth) * 1000);

        detectedBoxes.push({ ymin, xmin, ymax, xmax });
      }
    }

    // 3. Manga reading order sorting (Right-to-Left, Top-to-Bottom)
    // We group boxes into row levels using 35% vertical intersection overlap.
    // This is vastly smarter than a simple 8% static tolerance check.
    const sortedBoxes: typeof detectedBoxes = [];
    const remainingBoxes = [...detectedBoxes];

    while (remainingBoxes.length > 0) {
      // Find the top-most box remaining
      remainingBoxes.sort((a, b) => a.ymin - b.ymin);
      const topBox = remainingBoxes[0];
      
      // Filter remaining boxes to locate any that share a substantial vertical intersection (row overlap)
      const rowBoxes = remainingBoxes.filter((b) => {
        const overlapY = Math.max(0, Math.min(b.ymax, topBox.ymax) - Math.max(b.ymin, topBox.ymin));
        const minHeight = Math.min(b.ymax - b.ymin, topBox.ymax - topBox.ymin);
        const overlapRatio = minHeight > 0 ? overlapY / minHeight : 0;
        return overlapRatio >= 0.35; // Shared horizontal row if vertical overlap is >= 35%
      });

      // Sort row boxes Right-to-Left (Japanese manga order)
      rowBoxes.sort((a, b) => b.xmin - a.xmin);

      // Append sorted tier boxes and remove from remaining pool
      for (const box of rowBoxes) {
        sortedBoxes.push(box);
        const idx = remainingBoxes.indexOf(box);
        if (idx > -1) remainingBoxes.splice(idx, 1);
      }
    }

    // If no panels detected or page is solid, fallback to a full page panel
    if (sortedBoxes.length === 0) {
      return [{ id: 1, box: [0, 0, 1000, 1000] }];
    }

    // Return panels mapped to standard format
    return sortedBoxes.map((box, idx) => ({
      id: idx + 1,
      box: [box.ymin, box.xmin, box.ymax, box.xmax],
    }));
  } catch (err) {
    console.warn("Client panel detection heuristic failed, using 2x2 grid", err);
    return createGridPanels(2, 2);
  }
}

/**
 * Creates uniform grids of panels as a fast secondary algorithm
 */
export function createGridPanels(rows: number, cols: number): Panel[] {
  const panels: Panel[] = [];
  const hStep = Math.round(1000 / rows);
  const wStep = Math.round(1000 / cols);
  let id = 1;

  for (let r = 0; r < rows; r++) {
    const ymin = r * hStep;
    const ymax = r === rows - 1 ? 1000 : (r + 1) * hStep;

    // For Manga reading: Right-to-Left order inside the row
    for (let c = cols - 1; c >= 0; c--) {
      const xmin = c * wStep;
      const xmax = c === cols - 1 ? 1000 : (c + 1) * wStep;

      panels.push({
        id,
        box: [ymin, xmin, ymax, xmax],
      });
      id++;
    }
  }
  return panels;
}
