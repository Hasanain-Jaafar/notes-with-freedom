import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import { SlashMenu, type SlashMenuHandle } from '../components/editor/SlashMenu'
import { filterSlashItems, type SlashContext, type SlashItem } from './slashItems'

export interface SlashCommandOptions {
  contextRef: { current: SlashContext }
}

interface SlashMenuComponentProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

const SlashCommandPluginKey = new PluginKey('slashCommand')

function toMenuProps(props: SuggestionProps<SlashItem>): SlashMenuComponentProps {
  return { items: props.items, command: (item) => props.command(item) }
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      contextRef: {
        current: { pickAndInsertImage: () => {}, startAudioRecording: () => {} }
      }
    }
  },

  addProseMirrorPlugins() {
    const contextRef = this.options.contextRef

    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        pluginKey: SlashCommandPluginKey,
        allowSpaces: false,
        // Only trigger at the very start of a line, or right after a space —
        // not e.g. mid-word, where "/" is more likely a literal character.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          const textBefore = $from.parent.textBetween(
            Math.max(0, $from.parentOffset - 1),
            $from.parentOffset,
            undefined,
            '￼'
          )
          return !textBefore || /\s/.test(textBefore)
        },
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          props.run(editor, range, contextRef.current)
        },
        render: () => {
          let component: ReactRenderer<SlashMenuHandle, SlashMenuComponentProps> | null = null

          function position(clientRect: SuggestionProps<SlashItem>['clientRect']): void {
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
              component = new ReactRenderer(SlashMenu, {
                props: toMenuProps(props),
                editor: props.editor
              })
              document.body.appendChild(component.element)
              position(props.clientRect)
            },

            onUpdate: (props) => {
              if (!component) return
              component.updateProps(toMenuProps(props))
              position(props.clientRect)
            },

            onKeyDown: (props) => {
              if (!component) return false
              // Escape fully tears the popup down rather than just hiding it,
              // so the query text is left in place and nothing gets inserted.
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
