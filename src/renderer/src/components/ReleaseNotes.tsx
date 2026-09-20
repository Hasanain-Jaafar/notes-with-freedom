// Renders release notes from a GitHub Release body — not a full markdown
// parser, just the handful of constructs the release template this app
// actually writes uses (## and ### headers, - bullets, **bold**, `code`).
// A real markdown library felt like overkill for a small changelog blurb,
// but showing the literal ## / ** / ` characters as plain text read as
// broken, not "simple." Shared by WhatsNewDialog.tsx and SettingsPanel.tsx
// so the two release-notes displays can't drift apart.

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`)/g

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let index = 0
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const start = match.index ?? 0
    if (start > lastIndex) parts.push(text.slice(lastIndex, start))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      parts.push(
        <code
          key={key}
          className="rounded-sm bg-black/[0.06] px-1 py-0.5 font-sans text-[11px] dark:bg-white/10"
        >
          {token.slice(1, -1)}
        </code>
      )
    }
    lastIndex = start + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export function ReleaseNotes({ text }: { text: string }): React.JSX.Element {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let listBuffer: React.ReactNode[] = []

  function flushList(): void {
    if (listBuffer.length === 0) return
    blocks.push(
      <ul key={`list-${blocks.length}`} className="mt-1 list-disc space-y-1 pl-4 marker:text-muted-foreground/60">
        {listBuffer.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
    listBuffer = []
  }

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim()
    if (!line) {
      flushList()
      return
    }
    if (line.startsWith('## ')) {
      flushList()
      blocks.push(
        <p key={i} className="mt-3 text-sm font-semibold text-foreground first:mt-0">
          {renderInline(line.slice(3), `h-${i}`)}
        </p>
      )
    } else if (line.startsWith('### ')) {
      flushList()
      blocks.push(
        <p key={i} className="mt-2.5 font-medium text-foreground first:mt-0">
          {renderInline(line.slice(4), `h3-${i}`)}
        </p>
      )
    } else if (line.startsWith('- ')) {
      listBuffer.push(renderInline(line.slice(2), `li-${i}`))
    } else {
      flushList()
      blocks.push(<p key={i}>{renderInline(line, `p-${i}`)}</p>)
    }
  })
  flushList()

  return <>{blocks}</>
}
