import { createContext, useContext, useEffect, useRef } from 'react'

/** Counts the images under it still on their way, for a view that is captured as a picture. */
export interface ImageLoadTracker {
  start: (id: object) => void
  finish: (id: object) => void
}

export const ImageLoadTrackerContext = createContext<ImageLoadTracker | null>(null)

/**
 * Registers an image with the tracker above it, if any, from mount until it has drawn or failed.
 * `uri` is undefined while its file is read and '' once the read finds none, which also finishes it.
 * Returns the callback for the image's onLoad and onError.
 */
export function useTrackedImage(uri: string | undefined) {
  const tracker = useContext(ImageLoadTrackerContext)
  const id = useRef({}).current
  // Child effects run before their parent's, so every image is counted before the tracker's owner checks.
  useEffect(() => {
    if (!tracker) return
    tracker.start(id)
    return () => tracker.finish(id)
  }, [tracker, id])
  useEffect(() => {
    if (uri === '') tracker?.finish(id)
  }, [tracker, id, uri])
  return () => tracker?.finish(id)
}
