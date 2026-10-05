import { useState } from "react"

/**
 * The mark a published component shows when it has no icon of its own.
 *
 * Lives with the other static images in `public/assets/images`, so it is served
 * from `/assets` in development and by the same mount in production.
 */
export const DEFAULT_COMPONENT_ICON = "/assets/images/component-default.svg"

interface ComponentIconProps {
  /** The component's own icon — an image URL or a `data:` URL — if it has one. */
  icon?: string | null
  /** Sizing and shape classes; the caller decides how big the mark is. */
  className?: string
  /** Hover text, e.g. which component the mark came from. */
  title?: string
  testId?: string
}

/**
 * A component's image, or the shared default when it has none.
 *
 * A component whose own URL fails to load falls back to the default too, so a
 * dead link never leaves a broken-image glyph on the canvas or in the palette.
 */
const ComponentIcon = ({
  icon,
  className,
  title,
  testId,
}: ComponentIconProps) => {
  // The source that failed rather than a flag, so a changed icon is retried.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = !icon || failedSrc === icon ? DEFAULT_COMPONENT_ICON : icon

  return (
    <img
      src={src}
      alt=""
      title={title}
      data-testid={testId}
      onError={() => setFailedSrc(icon ?? null)}
      className={className}
    />
  )
}

export default ComponentIcon
