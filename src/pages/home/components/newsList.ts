import { Dialog } from '../../../components/dialog'
import { fetchNews, stripMarkdown, formatDate } from '../../../services/news'
import { homeState } from '../state'

export async function loadNews() {
  const newsList = document.getElementById('events-news-list')
  if (!newsList) return

  newsList.innerHTML = `
    <div class="news-skeleton-item skeleton-shimmer"></div>
    <div class="news-skeleton-item skeleton-shimmer"></div>
  `

  const feed = await fetchNews()
  homeState.newsFeed = feed
  newsList.innerHTML = ''

  if (feed.length === 0) {
    newsList.innerHTML = `
      <div class="news-empty">
        <i class="fa-regular fa-newspaper"></i>
        <span>Aucune actualité pour le moment.</span>
      </div>
    `
    return
  }

  feed.slice(0, 3).forEach((item: any, index: number) => {
    const excerpt = stripMarkdown(item.content || '').slice(0, 85) + '...'
    const isUpdate = (item.title || '').toLowerCase().includes('mise à jour') || (item.title || '').toLowerCase().includes('patch')
    const badgeLabel = isUpdate ? 'Mise à jour' : 'Annonce'
    const badgeClass = isUpdate ? 'badge-update' : 'badge-event'
    const iconClass = isUpdate ? 'fa-sparkles' : 'fa-bullhorn'

    newsList.insertAdjacentHTML(
      'beforeend',
      `
      <div class="news-event-item" data-index="${index}">
        <div class="news-event-thumb"><i class="fa-solid ${iconClass}"></i></div>
        <div class="news-event-body">
          <div class="news-event-title">${item.title}</div>
          <div class="news-event-desc">${excerpt}</div>
          <div class="news-event-meta">${formatDate(item.createdAt)}</div>
        </div>
        <div class="news-event-badge ${badgeClass}">${badgeLabel}</div>
      </div>
    `
    )
  })

  newsList.querySelectorAll('.news-event-item[data-index]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = homeState.newsFeed[Number((node as HTMLElement).dataset.index)]
      if (!item) return
      await Dialog.show(`${item.title}\n\n${stripMarkdown(item.content || '')}`, [{ text: 'Fermer', type: 'ok' }])
    })
  })
}
