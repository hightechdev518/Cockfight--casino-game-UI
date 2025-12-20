/**
 * Preloads all chip images to prevent display issues
 * Call this function when the app initializes
 */

const CHIP_VALUES = [1, 5, 10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 50000]

/**
 * Preloads all chip SVG images
 * @returns Promise that resolves when all images are loaded or failed
 */
export const preloadChipImages = (): Promise<void> => {
  return new Promise((resolve) => {
    if (CHIP_VALUES.length === 0) {
      resolve()
      return
    }

    let resolvedCount = 0
    const totalImages = CHIP_VALUES.length

    const checkComplete = () => {
      resolvedCount++
      if (resolvedCount === totalImages) {
        resolve()
      }
    }

    CHIP_VALUES.forEach((value) => {
      const img = new Image()
      
      img.onload = () => {
        checkComplete()
      }
      
      img.onerror = () => {
        // Still count as resolved even if failed - images will load on demand
        checkComplete()
      }
      
      // Set source to trigger load
      img.src = `./${value}.svg`
    })
  })
}

/**
 * Preloads chip images with timeout
 * @param timeoutMs - Maximum time to wait for images to load (default: 5000ms)
 * @returns Promise that resolves when images are loaded or timeout reached
 */
export const preloadChipImagesWithTimeout = (timeoutMs: number = 5000): Promise<void> => {
  return Promise.race([
    preloadChipImages(),
    new Promise<void>((resolve) => setTimeout(() => resolve(), timeoutMs))
  ])
}

