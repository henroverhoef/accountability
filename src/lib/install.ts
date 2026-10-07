// Installing the app from inside the page (Android Chrome / desktop Chrome / Edge).
// The browser fires "beforeinstallprompt" when the app can be installed; we keep that
// event so a button can open the install dialog later. iPhone never fires it (people use
// Share → Add to Home Screen instead).
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // we show our own "Install" button instead of Chrome's mini banner
  deferred = e as InstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  notify()
})

export function canPromptInstall(): boolean {
  return deferred !== null
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens the browser's install dialog. Returns true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const event = deferred
  deferred = null
  await event.prompt()
  const choice = await event.userChoice
  notify()
  return choice.outcome === 'accepted'
}
