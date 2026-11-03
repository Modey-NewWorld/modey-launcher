import { Dialog } from '../../../components/dialog'
import { fetchNews, stripMarkdown, formatDate } from '../../../services/news'
import { homeState } from '../state'
import bgImage from '../../../static/images/bg-thumb.webp'

const DEFAULT_ANNOUNCEMENTS = [
  {
    title: "Nouvelle mise à jour d'Athéna",
    content: "Plus de quêtes, de bâtiments et d'améliorations pour enrichir votre quotidien dans la cité.",
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
  },
  {
    title: 'Guide du Citoyen : Bien débuter',
    content: 'Découvrez les bases de l’économie, les métiers et comment fonder votre première ville sur Athéna.',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    badge: 'Guide',
    badgeClass: 'badge-update'
  }
]

export async function loadNews() {
  const newsList = document.getElementById('events-news-list')
  if (!newsList) return

  newsList.innerHTML = `
    <div class="news-skeleton-item skeleton-shimmer"></div>
    <div class="news-skeleton-item skeleton-shimmer"></div>
  `

  let feed: any[] = (await fetchNews()) || []

  // S'assurer d'avoir toujours au moins 3 éléments pour que le slider affiche 2 cartes et permette de glisser
  if (feed.length === 0) {
    feed = [...DEFAULT_ANNOUNCEMENTS]
  } else if (feed.length < 3) {
    DEFAULT_ANNOUNCEMENTS.forEach((def) => {
      if (!feed.some((item) => item.title?.toLowerCase() === def.title.toLowerCase())) {
        feed.push(def)
      }
    })
  }

  homeState.newsFeed = feed
  newsList.innerHTML = ''

  feed.forEach((item: any, index: number) => {
    const rawContent = item.content || ''
    const excerpt = stripMarkdown(rawContent).slice(0, 95)
    const isUpdate = (item.title || '').toLowerCase().includes('mise à jour') || (item.badge || '').toLowerCase().includes('mise')
    const badgeLabel = item.badge || (isUpdate ? 'Mise à jour' : 'Événement')
    const badgeClass = item.badgeClass || (isUpdate ? 'badge-update' : 'badge-event')
    const dateText = item.title?.includes('Athéna')
      ? 'Il y a 2 jours'
      : item.title?.includes('Événement')
      ? 'Bientôt'
      : item.title?.includes('Guide')
      ? 'Guide utile'
      : formatDate(item.createdAt)

    newsList.insertAdjacentHTML(
      'beforeend',
      `
      <div class="news-event-item" data-index="${index}">
        <div class="news-event-thumb" style="background-image: url('${bgImage}')"></div>
        <div class="news-event-body">
          <div class="news-event-title" title="${item.title}">${item.title}</div>
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

  // Gestion du clic pour afficher le dialogue de l'article
  newsList.querySelectorAll('.news-event-item[data-index]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = homeState.newsFeed[Number((node as HTMLElement).dataset.index)]
      if (!item) return
      await Dialog.show(`${item.title}\n\n${stripMarkdown(item.content || '')}`, [{ text: 'Fermer', type: 'ok' }])
    })
  })

  // Configuration des boutons flèches du slider
  const btnPrev = document.getElementById('news-nav-prev') as HTMLButtonElement | null
  const btnNext = document.getElementById('news-nav-next') as HTMLButtonElement | null

  function updateNav() {
    if (!newsList || !btnPrev || !btnNext) return
    const maxScroll = newsList.scrollWidth - newsList.clientWidth
    if (maxScroll <= 8) {
      btnPrev.style.display = 'none'
      btnNext.style.display = 'none'
    } else {
      btnPrev.style.display = 'inline-flex'
      btnNext.style.display = 'inline-flex'
      btnPrev.disabled = newsList.scrollLeft <= 5
      btnNext.disabled = newsList.scrollLeft >= maxScroll - 5
    }
  }

  btnPrev?.addEventListener('click', () => {
    if (!newsList) return
    const firstCard = newsList.querySelector('.news-event-item') as HTMLElement | null
    const step = firstCard ? firstCard.offsetWidth + 12 : 260
    newsList.scrollBy({ left: -step, behavior: 'smooth' })
  })

  btnNext?.addEventListener('click', () => {
    if (!newsList) return
    const firstCard = newsList.querySelector('.news-event-item') as HTMLElement | null
    const step = firstCard ? firstCard.offsetWidth + 12 : 260
    newsList.scrollBy({ left: step, behavior: 'smooth' })
  })

  newsList.addEventListener('scroll', updateNav, { passive: true })
  window.addEventListener('resize', updateNav)
  setTimeout(updateNav, 120)
}
