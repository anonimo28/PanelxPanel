import { Panel } from "../types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

interface Box {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

/**
 * Multi-pass panel detection algorithm combining:
 * 1. Adaptive luminance threshold + edge detection
 * 2. Projection-profile analysis with adaptive sensitivity
 * 3. Morphological cleanup and noise rejection
 * 4. Smart RTL tier grouping
 */
export async function detectPanelsHeuristic(
  imageUrl: string,
  options: {
    gutterThreshold?: number;
    splitSensitivity?: number;
    minPanelSizePercent?: number;
  } = {}
): Promise<Panel[]> {
  const {
    gutterThreshold: _userThreshold,
    splitSensitivity: _userSensitivity,
    minPanelSizePercent = 4,
  } = options;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return createGridPanels(2, 2);

    const targetWidth = 500;
    const targetHeight = Math.round((img.height / img.width) * targetWidth);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    const marginX = Math.round(targetWidth * 0.04);
    const marginY = Math.round(targetHeight * 0.04);

    // Compute luminance + horizontal & vertical gradients for every pixel
    const lum = new Float32Array(targetWidth * targetHeight);
    const gradX = new Float32Array(targetWidth * targetHeight);
    const gradY = new Float32Array(targetWidth * targetHeight);

    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const idx = (y * targetWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        lum[y * targetWidth + x] = l;
      }
    }

    // Sobel-like gradients
    for (let y = 1; y < targetHeight - 1; y++) {
      for (let x = 1; x < targetWidth - 1; x++) {
        const c = y * targetWidth + x;
        gradX[c] = Math.abs(lum[c - 1] - lum[c + 1]);
        gradY[c] = Math.abs(lum[(y - 1) * targetWidth + x] - lum[(y + 1) * targetWidth + x]);
      }
    }

    // Adaptive luminance threshold (percentile from histogram)
    const hist = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) {
      hist[Math.round(lum[i])]++;
    }
    let total = 0;
    const totalPixels = targetWidth * targetHeight;
    let adaptiveThreshold = 240;
    for (let i = 255; i >= 0; i--) {
      total += hist[i];
      if (total >= totalPixels * 0.12) {
        adaptiveThreshold = i;
        break;
      }
    }
    adaptiveThreshold = Math.max(200, Math.min(250, adaptiveThreshold));

    // Build three binary maps:
    // whiteMap: bright regions (gutters between panels)
    // edgeMap: strong horizontal/vertical edges (panel borders)
    const whiteMap = new Uint8Array(targetWidth * targetHeight);
    const hEdgeMap = new Uint8Array(targetWidth * targetHeight);
    const vEdgeMap = new Uint8Array(targetWidth * targetHeight);

    for (let y = 0; y < targetHeight; y++) {
      const isNearY = y < marginY || y >= targetHeight - marginY;
      for (let x = 0; x < targetWidth; x++) {
        const c = y * targetWidth + x;
        const isNearX = x < marginX || x >= targetWidth - marginX;
        if (isNearY || isNearX) {
          whiteMap[c] = 1;
        } else {
          whiteMap[c] = lum[c] >= adaptiveThreshold ? 1 : 0;
        }
        hEdgeMap[c] = gradY[c] > 50 ? 1 : 0;
        vEdgeMap[c] = gradX[c] > 50 ? 1 : 0;
      }
    }

    // Combine white + edge into a gutter map.
    // A pixel is "gutter" if it's white OR if it's a strong horizontal/vertical edge
    // (since panel borders often appear as dark lines, not white gaps)
    const gutterMap = new Uint8Array(targetWidth * targetHeight);
    for (let i = 0; i < gutterMap.length; i++) {
      gutterMap[i] = whiteMap[i] || hEdgeMap[i] || vEdgeMap[i] ? 1 : 0;
    }

    // Morphological close: dilate then erode to fill small gaps in gutters
    const dilated = morphDilate(gutterMap, targetWidth, targetHeight, 3);
    const closed = morphErode(dilated, targetWidth, targetHeight, 3);

    // Now use the cleaned map for projection analysis
    const hGutterRows = new Uint8Array(targetHeight);
    for (let y = 0; y < targetHeight; y++) {
      let gutterCount = 0;
      for (let x = 0; x < targetWidth; x++) {
        if (closed[y * targetWidth + x]) gutterCount++;
      }
      const ratio = gutterCount / targetWidth;

      // Adaptive sensitivity: use a lower threshold for the middle portion
      // where the page is less likely to have border artifacts
      const isInner = y > marginY * 2 && y < targetHeight - marginY * 2;
      const sensitivity = isInner ? 0.88 : 0.95;
      hGutterRows[y] = ratio >= sensitivity ? 1 : 0;
    }

    // Smooth gutter rows: a single non-gutter row between gutter rows is still a gutter
    for (let y = 1; y < targetHeight - 1; y++) {
      if (hGutterRows[y - 1] && hGutterRows[y + 1] && !hGutterRows[y]) {
        hGutterRows[y] = 1;
      }
    }

    // Extract horizontal segments (panel rows)
    const hSegments: { start: number; end: number }[] = [];
    {
      let inGutter = true;
      let segStart = 0;
      for (let y = 0; y < targetHeight; y++) {
        if (!hGutterRows[y] && inGutter) {
          segStart = y;
          inGutter = false;
        } else if (hGutterRows[y] && !inGutter) {
          if (y - segStart >= targetHeight * minPanelSizePercent / 100) {
            hSegments.push({ start: segStart, end: y - 1 });
          }
          inGutter = true;
        }
      }
      if (!inGutter && targetHeight - segStart >= targetHeight * minPanelSizePercent / 100) {
        hSegments.push({ start: segStart, end: targetHeight - 1 });
      }
    }

    const detectedBoxes: Box[] = [];

    for (const hSeg of hSegments) {
      const segHeight = hSeg.end - hSeg.start + 1;
      if (segHeight < targetHeight * minPanelSizePercent / 100) continue;

      // Vertical projection within the row
      const vGutter = new Uint8Array(targetWidth);
      for (let x = 0; x < targetWidth; x++) {
        let gutterCount = 0;
        for (let y = hSeg.start; y <= hSeg.end; y++) {
          if (closed[y * targetWidth + x]) gutterCount++;
        }
        vGutter[x] = (gutterCount / segHeight) >= 0.85 ? 1 : 0;
      }

      // Close small gaps in vertical gutters (1-pixel columns of content between gutter cols)
      for (let x = 1; x < targetWidth - 1; x++) {
        if (vGutter[x - 1] && vGutter[x + 1] && !vGutter[x]) {
          vGutter[x] = 1;
        }
      }

      // Extract vertical segments (individual panels in the row)
      const vSegments: { start: number; end: number }[] = [];
      let inGutter = true;
      let segStart = 0;
      for (let x = 0; x < targetWidth; x++) {
        if (!vGutter[x] && inGutter) {
          segStart = x;
          inGutter = false;
        } else if (vGutter[x] && !inGutter) {
          if (x - segStart >= targetWidth * minPanelSizePercent / 100) {
            vSegments.push({ start: segStart, end: x - 1 });
          }
          inGutter = true;
        }
      }
      if (!inGutter && targetWidth - segStart >= targetWidth * minPanelSizePercent / 100) {
        vSegments.push({ start: segStart, end: targetWidth - 1 });
      }

      for (const vSeg of vSegments) {
        detectedBoxes.push({
          ymin: Math.round((hSeg.start / targetHeight) * 1000),
          xmin: Math.round((vSeg.start / targetWidth) * 1000),
          ymax: Math.round((hSeg.end / targetHeight) * 1000),
          xmax: Math.round((vSeg.end / targetWidth) * 1000),
        });
      }
    }

    // Fallback
    if (detectedBoxes.length === 0) {
      return [{ id: 1, box: [0, 0, 1000, 1000] }];
    }

    // Merge very small adjacent boxes that likely belong together
    const merged = mergeSmallBoxes(detectedBoxes, targetWidth, targetHeight);

    // Manga reading order: RTL + TTB
    const sorted = sortRTL(merged);

    return sorted.map((box, idx) => ({
      id: idx + 1,
      box: [box.ymin, box.xmin, box.ymax, box.xmax],
    }));
  } catch (err) {
    console.warn("Panel detection failed, using grid fallback", err);
    return createGridPanels(2, 2);
  }
}

function morphDilate(
  map: Uint8Array,
  w: number,
  h: number,
  size: number
): Uint8Array {
  const out = new Uint8Array(map);
  const half = Math.floor(size / 2);
  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      if (map[y * w + x]) {
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            out[(y + dy) * w + (x + dx)] = 1;
          }
        }
      }
    }
  }
  return out;
}

function morphErode(
  map: Uint8Array,
  w: number,
  h: number,
  size: number
): Uint8Array {
  const out = new Uint8Array(w * h);
  const half = Math.floor(size / 2);
  for (let y = half; y < h - half; y++) {
    for (let x = half; x < w - half; x++) {
      let all = true;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (!map[(y + dy) * w + (x + dx)]) {
            all = false;
            break;
          }
        }
        if (!all) break;
      }
      out[y * w + x] = all ? 1 : 0;
    }
  }
  return out;
}

function mergeSmallBoxes(
  boxes: Box[],
  imgW: number,
  imgH: number
): Box[] {
  if (boxes.length <= 1) return boxes;

  const minSize = 0.03; // 3% of page dimension
  const minW = imgW * minSize;
  const minH = imgH * minSize;

  let result = boxes.map((b) => ({ ...b }));

  // Convert from 0-1000 back to pixel coords for comparison
  const toPix = (val: number, dim: number) => Math.round((val / 1000) * dim);
  const toRel = (val: number, dim: number) => Math.round((val / dim) * 1000);

  let changed = true;
  while (changed) {
    changed = false;
    const newResult: Box[] = [];

    for (let i = 0; i < result.length; i++) {
      let merged = false;
      const a = result[i];
      const aW = toPix(a.xmax - a.xmin, imgW);
      const aH = toPix(a.ymax - a.ymin, imgH);

      // Skip merging for already-large boxes
      if (aW >= minW && aH >= minH) {
        newResult.push(a);
        continue;
      }

      for (let j = 0; j < result.length; j++) {
        if (i === j) continue;
        const b = result[j];
        // Check if they're adjacent (within 5% of each other)
        const adjX = Math.abs(toPix(a.xmin, imgW) - toPix(b.xmax, imgW)) < imgW * 0.05 ||
                     Math.abs(toPix(a.xmax, imgW) - toPix(b.xmin, imgW)) < imgW * 0.05;
        const adjY = Math.abs(toPix(a.ymin, imgH) - toPix(b.ymax, imgH)) < imgH * 0.05 ||
                     Math.abs(toPix(a.ymax, imgH) - toPix(b.ymin, imgH)) < imgH * 0.05;

        if (adjX || adjY) {
          // Merge: take the bounding box
          const mergedBox: Box = {
            ymin: Math.min(a.ymin, b.ymin),
            xmin: Math.min(a.xmin, b.xmin),
            ymax: Math.max(a.ymax, b.ymax),
            xmax: Math.max(a.xmax, b.xmax),
          };
          newResult.push(mergedBox);
          // Mark b as consumed
          result[j] = { ymin: -1, xmin: -1, ymax: -1, xmax: -1 };
          merged = true;
          changed = true;
          break;
        }
      }
      if (!merged) {
        newResult.push(a);
      }
    }

    result = newResult.filter((b) => b.ymin >= 0);
  }

  return result;
}

function sortRTL(boxes: Box[]): Box[] {
  if (boxes.length <= 1) return boxes;

  const sorted: Box[] = [];
  const remaining = boxes.map((b) => ({ ...b }));

  while (remaining.length > 0) {
    // Find the topmost box
    remaining.sort((a, b) => a.ymin - b.ymin);
    const topBox = remaining[0];

    // Collect all boxes in the same row (vertical overlap >= 30%)
    const rowBoxes = remaining.filter((b) => {
      const overlapY = Math.max(0, Math.min(b.ymax, topBox.ymax) - Math.max(b.ymin, topBox.ymin));
      const minHeight = Math.min(b.ymax - b.ymin, topBox.ymax - topBox.ymin);
      return minHeight > 0 && (overlapY / minHeight) >= 0.30;
    });

    // Sort row right-to-left
    rowBoxes.sort((a, b) => b.xmin - a.xmin);

    for (const box of rowBoxes) {
      sorted.push(box);
      const idx = remaining.indexOf(box);
      if (idx > -1) remaining.splice(idx, 1);
    }
  }

  return sorted;
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

    // Manga order: Right-to-Left
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
