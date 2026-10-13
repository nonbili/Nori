// There is no Escape key to stack layers for; the system back action already
// reaches the topmost Modal through onRequestClose.
export function useEscape(_onEscape: () => void, _enabled = true) {}
