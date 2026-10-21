import { Dialog } from '../../../components/dialog'
import { fetchNews, stripMarkdown, readingTime, formatDate, tagBackgroundColor } from '../../../services/news'
import { homeState } from '../state'

export async function loadNews() {
  const newsList = document.getElementById('news-list')
  if (!newsList) return
  newsList.innerHTML = `
<div class="news-skeleton-item skeleton-shimmer"></div>
<div class="news-skeleton-item skeleton-shimmer"></div>
`
  const feed = await fetchNews()
  homeState.newsFeed = feed

  newsList.innerHTML = ''

  if (feed.length === 0) {
    newsList.innerHTML = '<div style="text-align:center; color: #888;">Aucune actualité pour le moment.</div>'
    return
  }

  feed.forEach((item: any, index: number) => {
    let tagsHTML = ''
    item.tags?.slice(0, 1).forEach((tag: any) => {
      tagsHTML += `<span class="tag" style="color: ${tag.color}; background-color: ${tagBackgroundColor(tag.color)}">${tag.name}</span>`
    })
    const excerpt = stripMarkdown(item.content || '').slice(0, 140) + '...'
    newsList.insertAdjacentHTML(
      'beforeend',
      `
        <article class="news-article">
          <div class="article-meta">
            <div class="tags-container">${tagsHTML || '<span class="tag">Annonce officielle</span>'}</div>
            <span class="date">${formatDate(item.createdAt)}</span>
            <span class="open-ext" data-index="${index}">↗</span>
          </div>

          <h3>${item.title}</h3>

          <div class="article-content">
            <p>${excerpt}</p>
          </div>
          <div class="article-foot">
            <span><i class="fa-solid fa-clock"></i>&nbsp;${readingTime(item.content || '')} min de lecture</span>
            <button data-index="${index}">Consulter →</button>
          </div>
        </article>
      `
    )
  })

  newsList.querySelectorAll('button[data-index], .open-ext[data-index]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = homeState.newsFeed[Number((node as HTMLElement).dataset.index)]
      if (!item) return
      await Dialog.show(`${item.title}\n\n${stripMarkdown(item.content || '')}`, [{ text: 'Fermer', type: 'ok' }])
    })
  })
}
