/**
 * Detects browser canvas WebP encoding support
 */
export function isWebPSupported(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    return false;
  }
}

/**
 * Resizes an image file if it exceeds max dimension, converting to modern WebP (or fallback JPEG) base64
 */
export async function optimizeAndConvertImage(
  fileOrBlob: File | Blob,
  maxDimension = 960,
  quality = 0.80
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const preferredMime = isWebPSupported() ? "image/webp" : "image/jpeg";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to create canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = canvas.toDataURL(preferredMime, quality);
        let mimeType = preferredMime;

        // Fallback to JPEG if browser returned PNG or uncompressed data
        if (preferredMime === "image/webp" && !dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          mimeType = "image/jpeg";
        }

        const base64 = dataUrl.split(",")[1] || "";

        resolve({
          base64,
          mimeType,
          previewUrl: dataUrl,
        });
      };
      img.onerror = () => reject(new Error("Failed to load image element"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(fileOrBlob);
  });
}

/**
 * Creates an ultra-lightweight thumbnail (max 160px, WebP/JPEG) for list views
 * Avoids loading full-resolution images when a smaller size works for the display area
 */
export async function createImageThumbnail(
  sourceUrlOrData: string,
  maxDimension = 160,
  quality = 0.75
): Promise<string> {
  if (!sourceUrlOrData) return "";
  // If it's a remote URL or data URL
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(sourceUrlOrData);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const preferredMime = isWebPSupported() ? "image/webp" : "image/jpeg";
        const thumbUrl = canvas.toDataURL(preferredMime, quality);
        resolve(thumbUrl);
      } catch {
        resolve(sourceUrlOrData);
      }
    };
    img.onerror = () => resolve(sourceUrlOrData);
    img.src = sourceUrlOrData;
  });
}

/**
 * Utility to fetch a remote image URL (e.g. sample image) and optimize to base64
 */
export async function urlToBase64(
  url: string
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  // If already a data URL, extract base64 directly
  if (url.startsWith("data:")) {
    const parts = url.split(",");
    const mimeMatch = url.match(/data:([^;]+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64 = parts[1] || "";
    return {
      base64,
      mimeType,
      previewUrl: url,
    };
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return optimizeAndConvertImage(blob);
  } catch {
    // Fallback using HTML Image element with crossOrigin
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const maxDim = 1024;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Unable to create canvas context"));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const preferredMime = isWebPSupported() ? "image/webp" : "image/jpeg";
          const dataUrl = canvas.toDataURL(preferredMime, 0.80);
          resolve({
            base64: dataUrl.split(",")[1] || "",
            mimeType: preferredMime,
            previewUrl: dataUrl,
          });
        } catch (canvasErr) {
          reject(canvasErr);
        }
      };
      img.onerror = () => reject(new Error("Failed to load image from URL"));
      img.src = url;
    });
  }
}

