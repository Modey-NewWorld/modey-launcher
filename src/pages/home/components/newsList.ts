import { NewsModal } from '../../../components/newsModal'
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

  // Uniquement les vraies actualités de l\'API — AUCUNE donnée inventée
  const feed: any[] = (await fetchNews()) || []
  homeState.newsFeed = feed
  newsList.innerHTML = ''

  if (feed.length === 0) {
    newsList.innerHTML = `
      <div class="news-empty-state">
        <svg class="solar-icon solar-bold news-empty-icon" aria-hidden="true"><use href="#solar-feed-bold"></use></svg>
        <span class="news-empty-text">Aucune actualité pour le moment</span>
      </div>
    `
    initNav(0)
    return
  }

  feed.forEach((item: any, index: number) => {
    const rawContent = item.content || ''
    const teaser = (item.summary && String(item.summary).trim())
      ? String(item.summary).trim()
      : stripMarkdown(rawContent).slice(0, 110)
    const category = (item.category || '').toLowerCase()
    const isUpdate =
      category === 'update' ||
      category === 'patchnote' ||
      (item.title || '').toLowerCase().includes('mise à jour') ||
      (item.badge || '').toLowerCase().includes('mise')
    const isMaintenance = category === 'maintenance'
    
    let badgeLabel = item.badge
    let badgeClass = item.badgeClass
    if (!badgeLabel) {
      if (isMaintenance) {
        badgeLabel = 'Maintenance'
        badgeClass = 'badge-maintenance'
      } else if (isUpdate) {
        badgeLabel = 'Mise à jour'
        badgeClass = 'badge-update'
      } else {
        badgeLabel = 'Événement'
        badgeClass = 'badge-event'
      }
    }
    const dateText = item.createdAt ? formatDate(item.createdAt) : 'Récent'
    const thumbImg = item.icon || item.icon_url || item.image || bgImage

    newsList.insertAdjacentHTML(
      'beforeend',
      `
      <div class="news-event-item" data-index="${index}">
        <div class="news-event-banner" style="background-image: url('${thumbImg}')">
          <div class="news-event-banner-badges">
            <span class="news-event-badge ${badgeClass}">${badgeLabel}</span>
            <span class="news-event-date-pill">${dateText}</span>
          </div>
        </div>
        <div class="news-event-body">
          <div class="news-event-title" title="${item.title}">${item.title}</div>
          <div class="news-event-desc" title="${teaser}">${teaser}</div>
        </div>
      </div>
    `
    )
  })

  // Clic pour ouvrir le modal immersif de l'actualité
  newsList.querySelectorAll('.news-event-item[data-index]').forEach((node) => {
    node.addEventListener('click', () => {
      const item = homeState.newsFeed[Number((node as HTMLElement).dataset.index)]
      if (!item) return
      NewsModal.show(item)
    })
  })

  initNav(feed.length)
}

function initNav(itemCount: number) {
  const newsList = document.getElementById('events-news-list')
  const navWrap = document.getElementById('news-nav-arrows')
  const btnPrev = document.getElementById('news-nav-prev') as HTMLButtonElement | null
  const btnNext = document.getElementById('news-nav-next') as HTMLButtonElement | null

  if (!newsList || !navWrap || !btnPrev || !btnNext) return

  // Si 2 éléments ou moins, masquer les flèches car ils s\'affichent directement
  if (itemCount <= 2) {
    navWrap.style.display = 'none'
    return
  }

  navWrap.style.display = 'inline-flex'

  function updateButtons() {
    if (!newsList || !btnPrev || !btnNext) return
    const maxScroll = newsList.scrollHeight - newsList.clientHeight
    btnPrev.disabled = newsList.scrollTop <= 5
    btnNext.disabled = newsList.scrollTop >= maxScroll - 5
  }

  btnPrev.onclick = () => {
    if (!newsList) return
    const firstItem = newsList.querySelector('.news-event-item') as HTMLElement | null
    const step = firstItem ? (firstItem.offsetHeight + 12) : 180
    newsList.scrollBy({ top: -step, behavior: 'smooth' })
  }

  btnNext.onclick = () => {
    if (!newsList) return
    const firstItem = newsList.querySelector('.news-event-item') as HTMLElement | null
    const step = firstItem ? (firstItem.offsetHeight + 12) : 180
    newsList.scrollBy({ top: step, behavior: 'smooth' })
  }

  newsList.addEventListener('scroll', updateButtons, { passive: true })
  setTimeout(updateButtons, 100)
}
