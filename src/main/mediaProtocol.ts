import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { normalize, join } from 'path'
import { MEDIA_SCHEME } from '@shared/ipc-channels'

/** Must run before app.whenReady() — Electron requires privileged scheme
 * registration at module load time. */
export function registerMediaProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Serves files from mediaRoot as `app-media:///<relative-path>` — used
 * instead of raw file:// src attributes, which some Chromium configurations
 * refuse to load from a non-file:// page origin (e.g. Vite's http://
 * dev server). Works identically in dev and production. */
export function registerMediaProtocolHandler(mediaRoot: string): void {
  const root = normalize(mediaRoot)

  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url)
    // Chromium treats this as a "standard" scheme (registered above), which
    // means the first path segment is parsed as the URL's host, not folded
    // into pathname — regardless of how many slashes follow the scheme. Both
    // pieces have to be reassembled to recover the actual relative path.
    const relativePath = decodeURIComponent(url.hostname + url.pathname).replace(/^\/+/, '')
    const filePath = normalize(join(root, relativePath))

    if (!filePath.startsWith(root)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
