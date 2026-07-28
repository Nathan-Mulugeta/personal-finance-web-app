/**
 * Downscale + re-encode an image File to a compact JPEG data URL so receipt
 * uploads stay small — phone photos are often several megabytes, which makes
 * scanning slow, costlier, and more likely to fail. Draws the image onto a
 * canvas capped at `maxDim` on its longest side and exports JPEG at `quality`.
 *
 * Falls back to the original data URL if anything goes wrong (an exotic format,
 * a decode failure, or a result that somehow isn't smaller), so scanning never
 * breaks just because compression didn't help.
 *
 * @param {File} file
 * @param {{ maxDim?: number, quality?: number }} [opts]
 * @returns {Promise<string>} a base64 data URL (with prefix)
 */
export async function compressImage(file, { maxDim = 1600, quality = 0.8 } = {}) {
  const original = await readAsDataURL(file);

  try {
    const img = await loadImage(original);
    const { width, height } = img;
    if (!width || !height) return original;

    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    return compressed && compressed.length < original.length
      ? compressed
      : original;
  } catch {
    return original;
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
