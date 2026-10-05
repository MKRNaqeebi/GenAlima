/**
 * Component icons.
 *
 * An icon is a PNG: either a link the author pasted, or a file the browser
 * scales to 128px and sends inline as a data URL. The server writes the PNG to
 * object storage in production and to disk in development, keeps only its public
 * URL on the component, and hands that URL back — so the palette, the component
 * list and every node copied from the component all render the same link.
 */

/** Matches `ICON_MAX_CHARS` in `app/models.py`; the server rejects more. */
export const ICON_MAX_CHARS = 100_000

/** Biggest file worth reading before scaling; anything larger is not an icon. */
const MAX_FILE_BYTES = 2_000_000

/** Icons render at 16–20px, so 128px covers a retina display several times over. */
const ICON_PX = 128

export interface IconResult {
  /** The value to publish, or null when the file could not be used. */
  icon: string | null
  error: string | null
}

/**
 * Whether a pasted URL is something the server will accept, or null when it is.
 *
 * An empty string is "no icon" rather than an error, so the caller can let the
 * author clear the field.
 */
export function checkIconUrl(url: string): string | null {
  const value = url.trim()
  if (!value) return null
  if (!/^(https?:\/\/|data:image\/)/i.test(value)) {
    return "Use an http(s) image URL or a PNG data URL."
  }
  if (value.length > ICON_MAX_CHARS) return "That icon is too large."
  return null
}

/**
 * Read a picked image file into a small PNG data URL.
 *
 * The image is scaled to fit `ICON_PX`, preserving its aspect ratio, so a
 * screenshot dropped in by mistake still publishes as a few kilobytes.
 */
export async function readIconFile(file: File): Promise<IconResult> {
  if (!file.type.startsWith("image/")) {
    return { icon: null, error: "Choose an image file (PNG, JPEG, SVG…)." }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { icon: null, error: "That image is larger than 2 MB." }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error("could not decode the image"))
      image.src = url
    })

    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) {
      return { icon: null, error: "That image has no size to scale from." }
    }

    const scale = Math.min(1, ICON_PX / Math.max(sourceWidth, sourceHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(sourceWidth * scale))
    canvas.height = Math.max(1, Math.round(sourceHeight * scale))

    const context = canvas.getContext("2d")
    if (!context) {
      return { icon: null, error: "This browser cannot resize images." }
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    const icon = canvas.toDataURL("image/png")
    if (icon.length > ICON_MAX_CHARS) {
      return {
        icon: null,
        error: "That image is too detailed to use as an icon.",
      }
    }
    return { icon, error: null }
  } catch {
    return { icon: null, error: "That image could not be read." }
  } finally {
    // Safe here: the browser has already decoded what the image element holds.
    // A blob URL is same-origin, so the canvas is not tainted either.
    URL.revokeObjectURL(url)
  }
}
