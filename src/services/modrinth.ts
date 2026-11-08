export interface IModGalleryItem {
  url: string
  rawUrl?: string
  title?: string
  description?: string
}

export interface IModDependency {
  projectId: string
  versionId?: string | null
  fileName?: string | null
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface IModDetails {
  id: string
  slug: string
  title: string
  description: string
  iconUrl?: string
  bodyHtml: string
  gallery: IModGalleryItem[]
  categories: string[]
  author?: string
  downloads?: number
  modrinthUrl: string
  sourceUrl?: string
  wikiUrl?: string
  discordUrl?: string
  dependencies: IModDependency[]
}

const modCache = new Map<string, IModDetails | null>()
const projectToModMap = new Map<string, string>() // projectId/slug -> mod.id

export function registerModProjectMapping(modId: string, projectIdOrSlug: string) {
  if (projectIdOrSlug) {
    projectToModMap.set(projectIdOrSlug.toLowerCase(), modId)
  }
}

export function getModIdByProject(projectIdOrSlug: string): string | undefined {
  return projectToModMap.get(projectIdOrSlug.toLowerCase())
}

export const CATEGORY_LABELS_FR: Record<string, string> = {
  adventure: 'Aventure',
  cursed: 'Fun & Insolite',
  decoration: 'Décoration',
  economy: 'Économie',
  equipment: 'Équipement',
  food: 'Alimentation',
  game_mechanics: 'Mécaniques de jeu',
  library: 'Bibliothèque',
  magic: 'Magie',
  management: 'Gestion',
  minigame: 'Mini-jeu',
  mobs: 'Créatures',
  optimization: 'Optimisation',
  social: 'Social & Multijoueur',
  storage: 'Stockage & Coffres',
  technology: 'Technologie',
  transportation: 'Transport',
  utility: 'Utilitaire',
  worldgen: 'Génération de monde'
}

export function formatCategoryLabel(cat: string): string {
  const normalized = cat.toLowerCase().trim()
  return CATEGORY_LABELS_FR[normalized] || (cat.charAt(0).toUpperCase() + cat.slice(1))
}

export function cleanModQuery(rawName?: string): string {
  if (!rawName) return ''
  let clean = rawName.replace(/\.jar$/i, '')
  for (const pat of ['-neoforge', '-fabric', '-forge', '_neoforge', '_fabric', '_forge']) {
    const idx = clean.toLowerCase().indexOf(pat)
    if (idx !== -1) clean = clean.slice(0, idx)
  }
  // Supprime les segments de version type -1.21.1, -0.5.8, _v2.0, +mc1.21.1
  clean = clean.replace(/[-_]v?\d+(\.\d+)+.*$/i, '')
  clean = clean.replace(/[-_]mc\d+.*$/i, '')
  clean = clean.replace(/[-_]/g, ' ').trim()
  return clean
}

export async function fetchModDetails(fileName: string, sha1?: string): Promise<IModDetails | null> {
  const cacheKey = (sha1 || fileName).toLowerCase()
  if (modCache.has(cacheKey)) {
    return modCache.get(cacheKey) || null
  }

  try {
    let projectId: string | null = null
    let versionDeps: IModDependency[] = []

    // 1. Essai par empreinte SHA1 (précis à 100%)
    if (sha1 && sha1.length === 40) {
      try {
        const hashRes = await fetch(`https://api.modrinth.com/v2/version_file/${sha1}?algorithm=sha1`, {
          headers: { 'User-Agent': 'ModeyLauncher/26.1 (contact@flowcrea.fr)' }
        })
        if (hashRes.ok) {
          const versionData = await hashRes.json()
          if (versionData?.project_id) {
            projectId = versionData.project_id
          }
          if (Array.isArray(versionData?.dependencies)) {
            versionDeps = versionData.dependencies.map((d: any) => ({
              projectId: d.project_id,
              versionId: d.version_id,
              fileName: d.file_name,
              dependencyType: d.dependency_type || 'required'
            }))
          }
        }
      } catch (_) {}
    }

    // 2. Repli par recherche par nom
    if (!projectId) {
      const q = cleanModQuery(fileName)
      if (q) {
        const facets = encodeURIComponent(JSON.stringify([['project_type:mod']]))
        const searchRes = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&facets=${facets}&limit=1`, {
          headers: { 'User-Agent': 'ModeyLauncher/26.1 (contact@flowcrea.fr)' }
        })
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          if (searchData.hits && searchData.hits.length > 0) {
            projectId = searchData.hits[0].project_id
          }
        }
      }
    }

    if (!projectId) {
      modCache.set(cacheKey, null)
      return null
    }

    // 3. Récupération des informations complètes du projet Modrinth
    const projRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}`, {
      headers: { 'User-Agent': 'ModeyLauncher/26.1 (contact@flowcrea.fr)' }
    })

    if (!projRes.ok) {
      modCache.set(cacheKey, null)
      return null
    }

    const data = await projRes.json()

    // 4. Si pas de dépendances issues de la version SHA-1, essayer l'endpoint dependencies du projet
    if (versionDeps.length === 0) {
      try {
        const depRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/dependencies`, {
          headers: { 'User-Agent': 'ModeyLauncher/26.1 (contact@flowcrea.fr)' }
        })
        if (depRes.ok) {
          const depData = await depRes.json()
          if (Array.isArray(depData?.projects)) {
            for (const p of depData.projects) {
              if (p?.id) {
                versionDeps.push({
                  projectId: p.id,
                  dependencyType: 'required'
                })
              }
            }
          }
        }
      } catch (_) {}
    }

    // Galerie
    const gallery: IModGalleryItem[] = Array.isArray(data.gallery)
      ? data.gallery.map((g: any) => ({
          url: g.url || g.raw_url,
          rawUrl: g.raw_url || g.url,
          title: g.title || '',
          description: g.description || ''
        }))
      : []

    const details: IModDetails = {
      id: data.id || projectId,
      slug: data.slug || projectId,
      title: data.title || fileName,
      description: data.description || '',
      iconUrl: data.icon_url || undefined,
      bodyHtml: data.body || '',
      gallery,
      categories: Array.isArray(data.categories) ? data.categories : [],
      author: data.organization || (Array.isArray(data.members) && data.members[0]?.user?.username) || undefined,
      downloads: typeof data.downloads === 'number' ? data.downloads : undefined,
      modrinthUrl: `https://modrinth.com/mod/${data.slug || projectId}`,
      sourceUrl: data.source_url || undefined,
      wikiUrl: data.wiki_url || undefined,
      discordUrl: data.discord_url || undefined,
      dependencies: versionDeps
    }

    modCache.set(cacheKey, details)
    return details
  } catch (err) {
    console.warn('[Modrinth API] Error fetching details for', fileName, err)
    modCache.set(cacheKey, null)
    return null
  }
}
