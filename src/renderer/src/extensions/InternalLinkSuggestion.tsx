import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import type { PageListAllDTO } from '@shared/ipc-channels'
import { PageLinkMenu, type PageLinkMenuHandle } from '../components/editor/PageLinkMenu'

interface PageLinkMenuComponentProps {
  items: PageListAllDTO[]
  command: (page: PageListAllDTO) => void
}

const InternalLinkPluginKey = new PluginKey('internalLinkSuggestion')

function filterPages(pages: PageListAllDTO[], query: string): PageListAllDTO[] {
  const q = query.trim().toLowerCase()
  if (!q) return pages
  return pages.filter((p) => p.title.toLowerCase().includes(q))
}

function toMenuProps(
  items: PageListAllDTO[],
  command: (page: PageListAllDTO) => void
): PageLinkMenuComponentProps {
  return { items, command }
}

// "[[" typeahead for internal page links — structurally mirrors
// SlashCommand.tsx's Suggestion scaffold almost exactly, but lists pages
// instead of block types, and (unlike "/") is allowed anywhere inline, not
// just at the start of a line. The "/" menu's own "Link to page" item
// (slashItems.tsx) hands off to this same trigger by inserting the literal
// "[[" text rather than duplicating picker logic — one picker, two entry
// points, same as how the existing "Math equation" slash item hands off to
// the math extension's own "$$" trigger.
export const InternalLinkSuggestion = Extension.create({
  name: 'internalLinkSuggestion',

  addStorage() {
    return { pages: [] as PageListAllDTO[] }
  },

  // Runs once per editor instance — a best-effort warm cache so the very
  // first "[[" of a session already has something to filter against.
  // Refreshed again on every trigger (see onStart below) to pick up pages
  // created since, without refetching on every keystroke.
  onCreate() {
    void window.api.pages.listAll().then((pages) => {
      this.storage.pages = pages
    })
  },

  addProseMirrorPlugins() {
    const storage = this.storage as { pages: PageListAllDTO[] }

    return [
      Suggestion<PageListAllDTO>({
        editor: this.editor,
        char: '[[',
        pluginKey: InternalLinkPluginKey,
        // Page titles routinely contain spaces ("Project Kickoff") — unlike
        // SlashCommand's single-word block names, the query here must not
        // terminate at the first space.
        allowSpaces: true,
        items: ({ query }) => filterPages(storage.pages, query),
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertInternalLink({ pageId: props.id, pageTitle: props.title })
            .run()
        },
        render: () => {
          let component: ReactRenderer<PageLinkMenuHandle, PageLinkMenuComponentProps> | null = null
          let latestQuery = ''

          function position(clientRect: SuggestionProps<PageListAllDTO>['clientRect']): void {
            if (!component) return
            const rect = clientRect?.()
            if (!rect) return
            const el = component.element as HTMLElement
            el.style.position = 'fixed'
            el.style.top = `${rect.bottom + 4}px`
            el.style.left = `${rect.left}px`
            el.style.zIndex = '30'
            requestAnimationFrame(() => {
              if (!component) return
              const bounds = el.getBoundingClientRect()
              const overflowX = bounds.right - window.innerWidth
              if (overflowX > 0) el.style.left = `${Math.max(8, rect.left - overflowX - 8)}px`
              const overflowY = bounds.bottom - window.innerHeight
              if (overflowY > 0) el.style.top = `${Math.max(8, rect.top - bounds.height - 6)}px`
            })
          }

          return {
            onStart: (props) => {
              latestQuery = props.query
              component = new ReactRenderer(PageLinkMenu, {
                props: toMenuProps(props.items, (page) => props.command(page)),
                editor: props.editor
              })
              document.body.appendChild(component.element)
              position(props.clientRect)

              // storage.pages is only as fresh as the last onCreate/onStart
              // fetch — refetch on every trigger (not every keystroke while
              // narrowing the query) so a page created earlier this session
              // still shows up.
              void window.api.pages.listAll().then((pages) => {
                storage.pages = pages
                if (!component) return
                component.updateProps(
                  toMenuProps(filterPages(pages, latestQuery), (page) => props.command(page))
                )
              })
            },

            onUpdate: (props) => {
              latestQuery = props.query
              if (!component) return
              component.updateProps(toMenuProps(props.items, (page) => props.command(page)))
              position(props.clientRect)
            },

            onKeyDown: (props) => {
              if (!component) return false
              // Escape fully tears the popup down rather than just hiding
              // it, so the "[[query" text is left in place, unconverted.
              if (props.event.key === 'Escape') {
                component.element.remove()
                component.destroy()
                component = null
                return true
              }
              return component.ref?.onKeyDown(props.event) ?? false
            },

            onExit: () => {
              component?.element.remove()
              component?.destroy()
              component = null
            }
          }
        }
      })
    ]
  }
})
