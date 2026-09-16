/**
 * Client-Side Image Optimizer for High-Accuracy Packaging OCR
 * 
 * Compresses and scales down high-resolution smartphone camera photos (often 12-50MP, 5-15MB)
 * to an optimal ~1600px resolution (~200-350KB).
 * 
 * Benefits:
 * - Preserves crystal-clear fine print (MRP, date stamps, PIN codes, ingredients).
 * - Reduces total network payload by ~95% (e.g. from 40MB down to ~1.2MB for 4 photos).
 * - Prevents network timeouts, socket read timeouts, and Out-Of-Memory errors on mobile devices and APK runtimes.
 */

export async function optimizeImageForOcr(
  input: string | File | Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    // If not in browser environment, return as-is
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      if (typeof input === 'string') return resolve(input);
      return resolve('');
    }

    const img = new Image();

    const processImage = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          // If dimension extraction failed, return original if string
          return resolve(typeof input === 'string' ? input : img.src);
        }

        // If already within dimensions, check if it's already reasonably small
        if (width <= maxDimension && height <= maxDimension) {
          // If it's a data url and small enough, we can still recompress to normalize format
          if (typeof input === 'string' && input.length < 500_000) {
            return resolve(input);
          }
        }

        // Calculate proportional scale
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return resolve(typeof input === 'string' ? input : img.src);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(optimizedDataUrl);
      } catch (err) {
        console.warn('Image optimization canvas error, falling back to original:', err);
        resolve(typeof input === 'string' ? input : img.src);
      }
    };

    img.onload = processImage;
    img.onerror = () => {
      console.warn('Failed to load image for OCR optimization');
      resolve(typeof input === 'string' ? input : '');
    };

    if (typeof input === 'string') {
      // Input is already a data URL or base64
      img.src = input.startsWith('data:') ? input : `data:image/jpeg;base64,${input}`;
    } else {
      // Input is a File or Blob
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = () => {
        resolve('');
      };
      reader.readAsDataURL(input);
    }
  });
}

/**
 * Optimizes an array of images concurrently
 */
export async function optimizeMultipleImages(
  inputs: (string | File | Blob | null | undefined)[],
  maxDimension = 1600,
  quality = 0.85
): Promise<(string | undefined)[]> {
  return Promise.all(
    inputs.map(async (item) => {
      if (!item) return undefined;
      return optimizeImageForOcr(item, maxDimension, quality);
    })
  );
}
