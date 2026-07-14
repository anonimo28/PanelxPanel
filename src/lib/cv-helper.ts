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

type DetectOptions = {
  gutterThreshold?: number;
  splitSensitivity?: number;
  minPanelSizePercent?: number;
};

// In-memory cache so re-navigating to a page (or re-rendering a component)
// doesn't redo the full pixel scan. Keyed by image URL + the tuning options
// used, since different options can legitimately produce different results.
// Failed detections are not cached, so retries are still possible.
const detectionCache = new Map<string, Promise<Panel[]>>();

export function clearPanelDetectionCache(imageUrl?: string): void {
  if (!imageUrl) {
    detectionCache.clear();
    return;
  }
  for (const key of Array.from(detectionCache.keys())) {
    if (key.startsWith(`${imageUrl}::`)) detectionCache.delete(key);
  }
}

/**
 * Multi-pass panel detection algorithm combining:
 * 1. Adaptive luminance threshold + adaptive edge detection
 * 2. Projection-profile analysis with adaptive sensitivity
 * 3. Morphological cleanup and noise rejection
 * 4. Smart RTL tier grouping
 *
 * `gutterThreshold` and `splitSensitivity` are user-tunable knobs (surfaced
 * in the manual-tuning UI); both now actually affect the algorithm.
 */
export async function detectPanelsHeuristic(
  imageUrl: string,
  options: DetectOptions = {}
): Promise<Panel[]> {
  const cacheKey = `${imageUrl}::${JSON.stringify(options)}`;
  const cached = detectionCache.get(cacheKey);
  if (cached) return cached;

  const resultPromise = detectPanelsHeuristicInner(imageUrl, options);
  // Don't cache rejected promises — a transient failure (e.g. network hiccup
  // loading the image) shouldn't be permanently remembered as "no panels".
  resultPromise.catch(() => detectionCache.delete(cacheKey));
  detectionCache.set(cacheKey, resultPromise);
  return resultPromise;
}

async function detectPanelsHeuristicInner(
  imageUrl: string,
  options: DetectOptions
): Promise<Panel[]> {
  const {
    gutterThreshold: userThreshold,
    splitSensitivity: userSensitivity,
    minPanelSizePercent = 4,
  } = options;

  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return fullPageFallback();

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
    // Let the user's gutter-threshold knob override the computed value.
    if (userThreshold !== undefined) {
      adaptiveThreshold = Math.max(150, Math.min(255, userThreshold));
    }
    // Slightly relaxed threshold used only for margin pixels (see whiteMap
    // below) so faint scan-border noise still reads as gutter without
    // forcing genuinely full-bleed art at the page edge to be clipped.
    const marginThreshold = Math.max(180, adaptiveThreshold - 30);

    // Adaptive edge threshold: instead of a flat magic-number cutoff, use
    // the strongest ~6% of gradient magnitudes on THIS page as "edges".
    // Low-contrast/heavily-screentoned pages naturally get a lower cutoff;
    // high-contrast line art gets a higher one, instead of over/under
    // detecting borders with a one-size-fits-all constant.
    const gradMagnitude = new Float32Array(targetWidth * targetHeight);
    for (let i = 0; i < gradMagnitude.length; i++) {
      gradMagnitude[i] = Math.max(gradX[i], gradY[i]);
    }
    const edgeThreshold = computeAdaptiveEdgeThreshold(gradMagnitude);

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
          // Near the page edge: only count as gutter if it's actually
          // near-uniform/bright. Previously this was forced to 1
          // unconditionally, which silently cropped full-bleed panels.
          whiteMap[c] = lum[c] >= marginThreshold ? 1 : 0;
        } else {
          whiteMap[c] = lum[c] >= adaptiveThreshold ? 1 : 0;
        }
        hEdgeMap[c] = gradY[c] > edgeThreshold ? 1 : 0;
        vEdgeMap[c] = gradX[c] > edgeThreshold ? 1 : 0;
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

    // Text protection: captions/dialogue are mostly white space with thin
    // dark letters, so the white-space *between* letters and words easily
    // clears the gutter threshold above and gets misread as a gap between
    // panels — cutting a panel off mid-sentence (and often mid-artwork,
    // since the false split anchors wherever the text happens to sit).
    // Find glyph-sized dark marks, bridge the gaps between them into whole
    // words/lines/caption blocks, and force that whole area to count as
    // solid content no matter how white the surrounding gutter map says it
    // is.
    const textProtect = buildTextProtectMask(lum, targetWidth, targetHeight);
    for (let i = 0; i < closed.length; i++) {
      if (textProtect[i]) closed[i] = 0;
    }

    // Row/column gutter-detection sensitivity. The user's splitSensitivity
    // knob (0-1, higher = stricter about what counts as a gutter) now
    // actually feeds into these thresholds instead of being ignored.
    const baseInnerSensitivity = userSensitivity !== undefined
      ? clamp(userSensitivity, 0.5, 0.99)
      : 0.88;
    const baseMarginSensitivity = userSensitivity !== undefined
      ? clamp(userSensitivity + 0.07, 0.5, 0.99)
      : 0.95;
    const columnSensitivity = userSensitivity !== undefined
      ? clamp(userSensitivity - 0.03, 0.5, 0.99)
      : 0.85;

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
      const sensitivity = isInner ? baseInnerSensitivity : baseMarginSensitivity;
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
          if (y - segStart >= (targetHeight * minPanelSizePercent) / 100) {
            hSegments.push({ start: segStart, end: y - 1 });
          }
          inGutter = true;
        }
      }
      if (!inGutter && targetHeight - segStart >= (targetHeight * minPanelSizePercent) / 100) {
        hSegments.push({ start: segStart, end: targetHeight - 1 });
      }
    }

    const detectedBoxes: Box[] = [];

    for (const hSeg of hSegments) {
      const segHeight = hSeg.end - hSeg.start + 1;
      if (segHeight < (targetHeight * minPanelSizePercent) / 100) continue;

      // Vertical projection within the row
      const vGutter = new Uint8Array(targetWidth);
      for (let x = 0; x < targetWidth; x++) {
        let gutterCount = 0;
        for (let y = hSeg.start; y <= hSeg.end; y++) {
          if (closed[y * targetWidth + x]) gutterCount++;
        }
        vGutter[x] = gutterCount / segHeight >= columnSensitivity ? 1 : 0;
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
          if (x - segStart >= (targetWidth * minPanelSizePercent) / 100) {
            vSegments.push({ start: segStart, end: x - 1 });
          }
          inGutter = true;
        }
      }
      if (!inGutter && targetWidth - segStart >= (targetWidth * minPanelSizePercent) / 100) {
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
      return fullPageFallback();
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
    console.warn("Panel detection failed, using full-page fallback", err);
    // A fixed 2x2 grid used to be assumed here for every failure, which is
    // frequently wrong (e.g. single-panel splash pages) and actively worse
    // than just showing the whole page. Full-page is a safer default;
    // createGridPanels remains available for explicit manual grid mode.
    return fullPageFallback();
  }
}

function fullPageFallback(): Panel[] {
  return [{ id: 1, box: [0, 0, 1000, 1000] }];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function computeAdaptiveEdgeThreshold(grad: Float32Array): number {
  const maxVal = 255;
  const hist = new Uint32Array(maxVal + 1);
  for (let i = 0; i < grad.length; i++) {
    const v = Math.min(maxVal, Math.round(grad[i]));
    hist[v]++;
  }
  const totalPixels = grad.length;
  // Treat roughly the strongest 6% of gradient magnitudes on the page as
  // "edges". This scales with the page's own contrast instead of using a
  // single hardcoded magnitude for every page.
  const targetCount = totalPixels * 0.06;
  let total = 0;
  let threshold = 50;
  for (let i = maxVal; i >= 0; i--) {
    total += hist[i];
    if (total >= targetCount) {
      threshold = i;
      break;
    }
  }
  return clamp(threshold, 25, 90);
}

interface CCBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  area: number;
}

// Finds connected components of "ink" (dark) pixels and returns only the
// ones shaped/sized like individual glyphs — small, roughly compact blobs.
// Large connected regions (panel border lines, solid shadows, character
// linework) are walked just far enough to confirm they're too big, then
// abandoned early rather than fully traced, since we only care about
// keeping the small ones.
function findGlyphComponents(
  ink: Uint8Array,
  w: number,
  h: number,
  maxGlyphW: number,
  maxGlyphH: number,
  minArea: number
): CCBox[] {
  const visited = new Uint8Array(w * h);
  const boxes: CCBox[] = [];
  const stack: number[] = [];
  const areaBailout = minArea * 60; // comfortably bigger than any real glyph

  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || visited[start]) continue;

    let xmin = start % w;
    let xmax = xmin;
    let ymin = (start / w) | 0;
    let ymax = ymin;
    let area = 0;
    let tooBig = false;

    stack.length = 0;
    stack.push(start);
    visited[start] = 1;

    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % w;
      const y = (idx / w) | 0;
      area++;
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;

      if (area > areaBailout) {
        tooBig = true;
        break;
      }

      if (x > 0 && ink[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack.push(idx - 1); }
      if (x < w - 1 && ink[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack.push(idx + 1); }
      if (y > 0 && ink[idx - w] && !visited[idx - w]) { visited[idx - w] = 1; stack.push(idx - w); }
      if (y < h - 1 && ink[idx + w] && !visited[idx + w]) { visited[idx + w] = 1; stack.push(idx + w); }
    }

    if (tooBig) continue;

    const boxW = xmax - xmin + 1;
    const boxH = ymax - ymin + 1;
    if (area >= minArea && boxW <= maxGlyphW && boxH <= maxGlyphH) {
      boxes.push({ xmin, ymin, xmax, ymax, area });
    }
  }

  return boxes;
}

// Cheap separable dilation (two 1D passes instead of one 2D pass) — needed
// because bridging word/line gaps requires a much larger kernel than the
// noise cleanup dilation above, and a non-separable version at that size
// would be far too slow to run per-page.
function dilateSeparable(map: Uint8Array, w: number, h: number, size: number): Uint8Array {
  const half = Math.floor(size / 2);
  const temp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dx = -half; dx <= half; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && map[row + xx]) { v = 1; break; }
      }
      temp[row + x] = v;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < h && temp[yy * w + x]) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

// Builds a mask of "this is text, never split here" pixels: glyph-sized
// dark marks, expanded so letters fuse into words, words fuse into lines,
// and nearby lines of a caption/dialogue block fuse into one solid region.
function buildTextProtectMask(lum: Float32Array, w: number, h: number): Uint8Array {
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < ink.length; i++) {
    ink[i] = lum[i] < 190 ? 1 : 0;
  }

  const maxGlyphW = Math.max(6, Math.round(w * 0.035));
  const maxGlyphH = Math.max(6, Math.round(h * 0.035));
  const minArea = 3;

  const glyphBoxes = findGlyphComponents(ink, w, h, maxGlyphW, maxGlyphH, minArea);
  const mask = new Uint8Array(w * h);
  if (glyphBoxes.length === 0) return mask;

  for (const b of glyphBoxes) {
    for (let y = b.ymin; y <= b.ymax; y++) {
      const row = y * w;
      for (let x = b.xmin; x <= b.xmax; x++) {
        mask[row + x] = 1;
      }
    }
  }

  // Bridge letter/word/line gaps. Sized relative to page width so it scales
  // with typical caption font sizes rather than being a fixed pixel count.
  const bridgeSize = Math.max(5, Math.round(w * 0.03));
  return dilateSeparable(mask, w, h, bridgeSize);
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

function boxesOverlapOnAxis(
  a: Box,
  b: Box,
  axis: "x" | "y"
): boolean {
  if (axis === "y") {
    return Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin)) > 0;
  }
  return Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin)) > 0;
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

        // A horizontal adjacency (adjX) only makes sense if the two boxes
        // actually share vertical space (same row) — otherwise you can end
        // up merging two unrelated small panels that just happen to sit at
        // similar x-positions in completely different rows, producing a
        // giant bounding box. Same logic applies to adjY / shared column.
        const sameRow = boxesOverlapOnAxis(a, b, "y");
        const sameCol = boxesOverlapOnAxis(a, b, "x");
        const shouldMerge = (adjX && sameRow) || (adjY && sameCol);

        if (shouldMerge) {
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
      return minHeight > 0 && overlapY / minHeight >= 0.3;
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
 * Histogram equalization for contrast normalization
 */
function histogramEqualization(lum: Float32Array, len: number): Float32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < len; i++) {
    hist[Math.round(lum[i])]++;
  }

  const cdf = new Float32Array(256);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + hist[i];
  }

  const cdfMin = cdf.find((v) => v > 0) || 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const v = Math.round(lum[i]);
    out[i] = cdfMin > 0 ? ((cdf[v] - cdfMin) / (len - cdfMin)) * 255 : lum[i];
  }

  return out;
}

/**
 * 3x3 Median filter for noise reduction
 */
function medianFilter(lum: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(lum);
  const neighbors = new Float32Array(9);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          neighbors[n++] = lum[(y + dy) * w + (x + dx)];
        }
      }
      neighbors.sort();
      out[y * w + x] = neighbors[4];
    }
  }
  return out;
}

/**
 * Proper 3x3 Sobel gradient computation
 */
function sobelEdgeDetect(
  lum: Float32Array,
  w: number,
  h: number
): { grad: Float32Array; dir: Float32Array } {
  const grad = new Float32Array(w * h);
  const dir = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const r0 = (y - 1) * w, r1 = y * w, r2 = (y + 1) * w;
      const gx =
        -lum[r0 + (x - 1)] + lum[r0 + (x + 1)] +
        -2 * lum[r1 + (x - 1)] + 2 * lum[r1 + (x + 1)] +
        -lum[r2 + (x - 1)] + lum[r2 + (x + 1)];
      const gy =
        -lum[r0 + (x - 1)] - 2 * lum[r0 + x] - lum[r0 + (x + 1)] +
        lum[r2 + (x - 1)] + 2 * lum[r2 + x] + lum[r2 + (x + 1)];
      const c = r1 + x;
      grad[c] = Math.sqrt(gx * gx + gy * gy);
      dir[c] = Math.atan2(gy, gx);
    }
  }
  return { grad, dir };
}

/**
 * Non-maximum suppression for edge thinning
 */
function nonMaxSuppression(
  grad: Float32Array,
  dir: Float32Array,
  w: number,
  h: number
): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const angle = ((dir[c] * 180) / Math.PI + 180) % 180;
      let q = 0, r = 0;

      if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
        q = grad[y * w + (x + 1)];
        r = grad[y * w + (x - 1)];
      } else if (angle >= 22.5 && angle < 67.5) {
        q = grad[(y + 1) * w + (x - 1)];
        r = grad[(y - 1) * w + (x + 1)];
      } else if (angle >= 67.5 && angle < 112.5) {
        q = grad[(y + 1) * w + x];
        r = grad[(y - 1) * w + x];
      } else {
        q = grad[(y - 1) * w + (x - 1)];
        r = grad[(y + 1) * w + (x + 1)];
      }

      out[c] = grad[c] >= q && grad[c] >= r ? grad[c] : 0;
    }
  }
  return out;
}

/**
 * Double-threshold hysteresis: trace weak edges connected to strong edges
 */
function hysteresisThreshold(
  nms: Float32Array,
  w: number,
  h: number,
  low: number,
  high: number
): Uint8Array {
  const edge = new Uint8Array(w * h);

  for (let i = 0; i < nms.length; i++) {
    if (nms[i] >= high) edge[i] = 255;
    else if (nms[i] >= low) edge[i] = 128;
  }

  const stack: number[] = [];
  for (let i = 0; i < edge.length; i++) {
    if (edge[i] === 255) stack.push(i);
  }
  while (stack.length > 0) {
    const c = stack.pop()!;
    const cy = Math.floor(c / w);
    const cx = c % w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ni = (cy + dy) * w + (cx + dx);
        if (ni >= 0 && ni < edge.length && edge[ni] === 128) {
          edge[ni] = 255;
          stack.push(ni);
        }
      }
    }
  }

  for (let i = 0; i < edge.length; i++) {
    if (edge[i] !== 255) edge[i] = 0;
  }

  return edge;
}

/**
 * Connected component labeling via flood fill (4-connected).
 * Used on inverted edge maps to find panel regions.
 */
function connectedComponents(
  binary: Uint8Array,
  w: number,
  h: number,
  minPixels: number
): { xmin: number; ymin: number; xmax: number; ymax: number }[] {
  const visited = new Uint8Array(w * h);
  const components: { xmin: number; ymin: number; xmax: number; ymax: number }[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binary[idx] || visited[idx]) continue;

      let xmin = x, ymin = y, xmax = x, ymax = y;
      const stack = [idx];
      visited[idx] = 1;
      let pixelCount = 0;

      while (stack.length > 0) {
        const ci = stack.pop()!;
        const cy = Math.floor(ci / w);
        const cx = ci % w;
        pixelCount++;

        xmin = Math.min(xmin, cx);
        ymin = Math.min(ymin, cy);
        xmax = Math.max(xmax, cx);
        ymax = Math.max(ymax, cy);

        if (cx > 0 && binary[ci - 1] && !visited[ci - 1]) { visited[ci - 1] = 1; stack.push(ci - 1); }
        if (cx < w - 1 && binary[ci + 1] && !visited[ci + 1]) { visited[ci + 1] = 1; stack.push(ci + 1); }
        if (cy > 0 && binary[ci - w] && !visited[ci - w]) { visited[ci - w] = 1; stack.push(ci - w); }
        if (cy < h - 1 && binary[ci + w] && !visited[ci + w]) { visited[ci + w] = 1; stack.push(ci + w); }
      }

      if (pixelCount >= minPixels) {
        components.push({ xmin, ymin, xmax, ymax });
      }
    }
  }

  return components;
}

/**
 * Advanced panel detection using full Canny edge detection + connected components.
 * More robust than the heuristic gutter-detection approach for irregular layouts.
 */
export async function detectPanelsAdvanced(
  imageUrl: string,
  options: {
    minPanelSizePercent?: number;
    cannyLow?: number;
    cannyHigh?: number;
  } = {}
): Promise<Panel[]> {
  const {
    minPanelSizePercent = 3,
    cannyLow = 30,
    cannyHigh = 90,
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

    const lum = new Float32Array(targetWidth * targetHeight);
    for (let i = 0; i < targetWidth * targetHeight; i++) {
      const idx = i * 4;
      lum[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // 1. Histogram equalization for contrast normalization
    const equalized = histogramEqualization(lum, targetWidth * targetHeight);

    // 2. Median filter to reduce scan noise
    const denoised = medianFilter(equalized, targetWidth, targetHeight);

    // 3. Full Canny edge detection
    const { grad, dir } = sobelEdgeDetect(denoised, targetWidth, targetHeight);
    const nms = nonMaxSuppression(grad, dir, targetWidth, targetHeight);
    const edges = hysteresisThreshold(nms, targetWidth, targetHeight, cannyLow, cannyHigh);

    // 4. Morphological close to bridge edge gaps
    const closed = morphDilate(edges, targetWidth, targetHeight, 3);
    const closed2 = morphErode(closed, targetWidth, targetHeight, 3);

    // 5. Invert: panel interiors become white, edges become black
    const inverted = new Uint8Array(targetWidth * targetHeight);
    for (let i = 0; i < inverted.length; i++) {
      inverted[i] = closed2[i] ? 0 : 1;
    }

    // 6. Flood-fill background from image borders to isolate panels
    const bgFlood = new Uint8Array(inverted);
    const bStack: number[] = [];
    for (let x = 0; x < targetWidth; x++) {
      if (bgFlood[x]) { bStack.push(x); bgFlood[x] = 0; }
      const bIdx = (targetHeight - 1) * targetWidth + x;
      if (bgFlood[bIdx]) { bStack.push(bIdx); bgFlood[bIdx] = 0; }
    }
    for (let y = 0; y < targetHeight; y++) {
      const lIdx = y * targetWidth;
      if (bgFlood[lIdx]) { bStack.push(lIdx); bgFlood[lIdx] = 0; }
      const rIdx = y * targetWidth + targetWidth - 1;
      if (bgFlood[rIdx]) { bStack.push(rIdx); bgFlood[rIdx] = 0; }
    }
    while (bStack.length > 0) {
      const ci = bStack.pop()!;
      const cy = Math.floor(ci / targetWidth);
      const cx = ci % targetWidth;
      if (cx > 0 && bgFlood[ci - 1]) { bgFlood[ci - 1] = 0; bStack.push(ci - 1); }
      if (cx < targetWidth - 1 && bgFlood[ci + 1]) { bgFlood[ci + 1] = 0; bStack.push(ci + 1); }
      if (cy > 0 && bgFlood[ci - targetWidth]) { bgFlood[ci - targetWidth] = 0; bStack.push(ci - targetWidth); }
      if (cy < targetHeight - 1 && bgFlood[ci + targetWidth]) { bgFlood[ci + targetWidth] = 0; bStack.push(ci + targetWidth); }
    }

    // 7. Find connected components (panel regions)
    const minPixels = (minPanelSizePercent / 100) * targetWidth * targetHeight;
    const comps = connectedComponents(bgFlood, targetWidth, targetHeight, minPixels);

    if (comps.length === 0) {
      return [{ id: 1, box: [0, 0, 1000, 1000] }];
    }

    const boxes = comps.map((c) => ({
      ymin: Math.round((c.ymin / targetHeight) * 1000),
      xmin: Math.round((c.xmin / targetWidth) * 1000),
      ymax: Math.round((c.ymax / targetHeight) * 1000),
      xmax: Math.round((c.xmax / targetWidth) * 1000),
    }));

    const merged = mergeSmallBoxes(boxes, targetWidth, targetHeight);
    const sorted = sortRTL(merged);

    return sorted.map((box, idx) => ({
      id: idx + 1,
      box: [box.ymin, box.xmin, box.ymax, box.xmax],
    }));
  } catch (err) {
    console.warn("Advanced panel detection failed, using grid fallback", err);
    return createGridPanels(2, 2);
  }
}

export interface Balloon {
  id: number;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] in 0-1000 page coords
}

function sortBalloonsRTL(balloons: Balloon[]): Balloon[] {
  if (balloons.length <= 1) return balloons;

  const sorted: Balloon[] = [];
  const remaining = balloons.map((b) => ({ ...b }));

  while (remaining.length > 0) {
    remaining.sort((a, b) => a.box[0] - b.box[0]);
    const top = remaining[0];

    const tier = remaining.filter((b) => {
      const overlap = Math.max(0, Math.min(b.box[2], top.box[2]) - Math.max(b.box[0], top.box[0]));
      const minH = Math.min(b.box[2] - b.box[0], top.box[2] - top.box[0]);
      return minH > 0 && overlap / minH >= 0.4;
    });

    tier.sort((a, b) => b.box[1] - a.box[1]);

    for (const b of tier) {
      sorted.push(b);
      const idx = remaining.indexOf(b);
      if (idx > -1) remaining.splice(idx, 1);
    }
  }

  return sorted;
}

/**
 * Detects text/speech balloons within manga panels using luminance thresholding
 * and connected component analysis. Returns balloons sorted in RTL reading order.
 */
export async function detectTextBalloons(
  imageUrl: string,
  panels: { box: [number, number, number, number] }[]
): Promise<Balloon[][]> {
  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return panels.map(() => []);

    const targetWidth = Math.min(1000, img.width);
    const targetHeight = Math.round((img.height / img.width) * targetWidth);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imgData.data;

    const results: Balloon[][] = [];

    for (let pi = 0; pi < panels.length; pi++) {
      const panel = panels[pi];
      const [pYmin, pXmin, pYmax, pXmax] = panel.box;

      const pxYmin = Math.round((pYmin / 1000) * targetHeight);
      const pxYmax = Math.round((pYmax / 1000) * targetHeight);
      const pxXmin = Math.round((pXmin / 1000) * targetWidth);
      const pxXmax = Math.round((pXmax / 1000) * targetWidth);

      const pw = pxXmax - pxXmin;
      const ph = pxYmax - pxYmin;
      if (pw < 20 || ph < 20) { results.push([]); continue; }

      // Extract luminance within panel bounds
      const lum = new Float32Array(pw * ph);
      for (let y = 0; y < ph; y++) {
        for (let x = 0; x < pw; x++) {
          const srcIdx = ((pxYmin + y) * targetWidth + (pxXmin + x)) * 4;
          lum[y * pw + x] = 0.299 * data[srcIdx] + 0.587 * data[srcIdx + 1] + 0.114 * data[srcIdx + 2];
        }
      }

      // Threshold for white/bright regions (speech bubbles)
      const white = new Uint8Array(pw * ph);
      for (let i = 0; i < lum.length; i++) {
        white[i] = lum[i] > 190 ? 1 : 0;
      }

      // Morphological close to fill small gaps
      const dilated = morphDilate(white, pw, ph, 3);
      const closed = morphErode(dilated, pw, ph, 3);

      // Connected components on white regions
      const minPixels = Math.max(30, 0.015 * pw * ph);
      const comps = connectedComponents(closed, pw, ph, minPixels);

      const panelBalloons: Balloon[] = [];
      let bid = 1;

      for (const comp of comps) {
        const cw = comp.xmax - comp.xmin;
        const ch = comp.ymax - comp.ymin;
        const aspectRatio = Math.max(cw, ch) / Math.min(cw, ch);

        // Balloons shouldn't be too elongated
        if (aspectRatio > 3.5) continue;

        // Balloons typically don't touch panel edges
        const marginX = Math.round(pw * 0.03);
        const marginY = Math.round(ph * 0.03);
        if (comp.xmin <= marginX || comp.xmax >= pw - 1 - marginX ||
            comp.ymin <= marginY || comp.ymax >= ph - 1 - marginY) continue;

        const ymin = pYmin + Math.round((comp.ymin / ph) * (pYmax - pYmin));
        const ymax = pYmin + Math.round((comp.ymax / ph) * (pYmax - pYmin));
        const xmin = pXmin + Math.round((comp.xmin / pw) * (pXmax - pXmin));
        const xmax = pXmin + Math.round((comp.xmax / pw) * (pXmax - pXmin));

        panelBalloons.push({ id: bid++, box: [ymin, xmin, ymax, xmax] });
      }

      results.push(sortBalloonsRTL(panelBalloons));
    }

    return results;
  } catch (err) {
    console.warn("Balloon detection failed, returning empty", err);
    return panels.map(() => []);
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
