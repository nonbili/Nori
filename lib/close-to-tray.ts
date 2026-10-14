let supported = false

/**
 * Whether this shell has a window that can be closed to a tray icon. Only the
 * desktop app does, and says so at startup.
 */
export const canCloseToTray = () => supported

export function setCloseToTraySupported(value: boolean) {
  supported = value
}
