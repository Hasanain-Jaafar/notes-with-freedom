import type { ElectronAPI } from '@electron-toolkit/preload'
import type { NotebookApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: NotebookApi
  }
}
