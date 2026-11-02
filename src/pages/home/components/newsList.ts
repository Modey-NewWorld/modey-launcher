import { Dialog } from '../../../components/dialog'
import { fetchNews, stripMarkdown, formatDate } from '../../../services/news'
import { homeState } from '../state'
import bgImage from '../../../static/images/bg-thumb.webp'

export async function loadNews() {
  const newsList = document.getElementById('events-news-list')
  if (!newsList) return

  newsList.innerHTML = `
    <div class="news-skeleton-item skeleton-shimmer"></div>
    <div class="news-skeleton-item skeleton-shimmer"></div>
  `

  let feed: any[] = (await fetchNews()) || []

  // Si l'API renvoie vide, fournir les deux annonces clés représentées sur le mockup
  if (feed.length === 0) {
    feed = [
      {
        title: "Nouvelle mise à jour d'Athéna",
        content: 'Plus de quêtes, de bâtiments et d’améliorations pour enrichir votre quotidien dans la cité.',
        createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
        badge: 'Mise à jour',
        badgeClass: 'badge-update'
      },
      {
        title: 'Événement communautaire',
        content: 'Concours de constructions — Thème : Les cités. Préparez vos blocs et vos plans !',
        createdAt: new Date().toISOString(),
        badge: 'Événement',
        badgeClass: 'badge-event'
      }
    ]
  }

  homeState.newsFeed = feed
  newsList.innerHTML = ''

  feed.slice(0, 2).forEach((item: any, index: number) => {
    const rawContent = item.content || ''
    const excerpt = stripMarkdown(rawContent).slice(0, 80)
    const isUpdate = (item.title || '').toLowerCase().includes('mise à jour') || (item.badge || '').toLowerCase().includes('mise')
    const badgeLabel = item.badge || (isUpdate ? 'Mise à jour' : 'Événement')
    const badgeClass = item.badgeClass || (isUpdate ? 'badge-update' : 'badge-event')
    const dateText = item.title?.includes('Athéna') ? 'Il y a 2 jours' : item.title?.includes('Événement') ? 'Bientôt' : formatDate(item.createdAt)

    newsList.insertAdjacentHTML(
      'beforeend',
      `
      <div class="news-event-item" data-index="${index}">
        <div class="news-event-thumb" style="background-image: url('${bgImage}')"></div>
        <div class="news-event-body">
          <div class="news-event-title">${item.title}</div>
          <div class="news-event-desc">${excerpt}</div>
          <div class="news-event-bottom">
            <span class="news-event-meta">${dateText}</span>
            <span class="news-event-badge ${badgeClass}">${badgeLabel}</span>
          </div>
        </div>
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
