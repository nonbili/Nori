let check: (() => Promise<void>) | undefined

export const canCheckDesktopUpdates = () => check != null
export function setDesktopUpdateCheck(handler: () => Promise<void>) { check = handler }
export async function checkDesktopUpdates() { await check?.() }
