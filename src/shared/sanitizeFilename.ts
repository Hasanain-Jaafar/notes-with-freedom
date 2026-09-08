// Windows forbids \ / : * ? " < > | in filenames, and trailing dots/spaces
// get silently stripped by the OS anyway — normalize both away up front so
// the name we show the user in a save dialog is the name that actually lands
// on disk.
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .trim()
  return cleaned || 'Untitled'
}
