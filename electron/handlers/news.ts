import { ipcMain } from 'electron'
import { News } from 'eml-lib'
import type { INews} from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'
import { IPC } from '../ipc-channels'

export function registerNewsHandlers() {
  ipcMain.handle(IPC.news.getNews, async () => {
    try {
      const news = new News(ADMINTOOL_URL)
      const feed = (await news.getNews()) as INews[]
      return feed
    } catch (err) {
      logger.error('Failed to fetch news:', err)
      return []
    }
  })

  ipcMain.handle(IPC.news.getCategories, async () => {
    try {
      const news = new News(ADMINTOOL_URL)
      const feed = await news.getCategories()
      return feed
    } catch (err) {
      logger.error('Failed to fetch news:', err)
      return []
    }
  })
}


