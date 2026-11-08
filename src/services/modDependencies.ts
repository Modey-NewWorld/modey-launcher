import type { IOptionalModItem } from '../../electron/handlers/optionalMods'
import { optionalMods } from '../ipc'
import { fetchModDetails, getModIdByProject, registerModProjectMapping } from './modrinth'
import logger from 'electron-log/renderer'

/**
 * Normalise un nom de mod pour comparaison floue
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.jar$/i, '')
    .replace(/[-_]neoforge.*$/i, '')
    .replace(/[-_]fabric.*$/i, '')
    .replace(/[-_]forge.*$/i, '')
    .replace(/[-_]v?\d+.*$/i, '')
    .replace(/[-_]/g, '')
    .trim()
}

/**
 * Enregistre le projet Modrinth associé à chaque mod
 */
export async function indexModProject(mod: IOptionalModItem) {
  try {
    const details = await fetchModDetails(mod.name, mod.sha1)
    if (details) {
      registerModProjectMapping(mod.id, details.id)
      registerModProjectMapping(mod.id, details.slug)
    }
  } catch (_) {}
}

/**
 * Indexe en arrière-plan tous les mods d'une liste
 */
export async function indexAllModsProjects(mods: IOptionalModItem[]) {
  await Promise.allSettled(mods.map((m) => indexModProject(m)))
}

/**
 * Trouve le mod correspondant à un ID ou un slug de projet Modrinth
 */
export function findModByProject(projectIdOrSlug: string, allMods: IOptionalModItem[]): IOptionalModItem | undefined {
  if (!projectIdOrSlug) return undefined
  const mappedId = getModIdByProject(projectIdOrSlug)
  if (mappedId) {
    const found = allMods.find((m) => m.id === mappedId)
    if (found) return found
  }

  // Repli flou par slug / nom
  const cleanTarget = normalizeName(projectIdOrSlug)
  return allMods.find((m) => {
    const modNorm = normalizeName(m.name)
    const idNorm = normalizeName(m.id)
    return modNorm.includes(cleanTarget) || cleanTarget.includes(modNorm) || idNorm.includes(cleanTarget)
  })
}

/**
 * Résout les dépendances directes et transitives d'un mod
 */
export async function resolveRequiredDependencies(
  mod: IOptionalModItem,
  allMods: IOptionalModItem[],
  visited = new Set<string>()
): Promise<IOptionalModItem[]> {
  if (visited.has(mod.id)) return []
  visited.add(mod.id)

  const details = await fetchModDetails(mod.name, mod.sha1)
  if (!details || !details.dependencies || details.dependencies.length === 0) {
    return []
  }

  const result: IOptionalModItem[] = []
  const reqDeps = details.dependencies.filter((d) => d.dependencyType === 'required')

  for (const dep of reqDeps) {
    const depMod = findModByProject(dep.projectId, allMods)
    if (depMod && depMod.id !== mod.id && !visited.has(depMod.id)) {
      result.push(depMod)
      // Récursion pour dépendances transitives (ex: emf_compat_core -> entity_model_features -> entity_texture_features)
      const subDeps = await resolveRequiredDependencies(depMod, allMods, visited)
      for (const s of subDeps) {
        if (!result.some((r) => r.id === s.id)) {
          result.push(s)
        }
      }
    }
  }

  return result
}

/**
 * Trouve tous les mods dans la liste qui dépendent directement ou indirectement de ce mod
 */
export async function resolveDependents(
  mod: IOptionalModItem,
  allMods: IOptionalModItem[]
): Promise<IOptionalModItem[]> {
  const dependents: IOptionalModItem[] = []

  for (const other of allMods) {
    if (other.id === mod.id) continue
    const deps = await resolveRequiredDependencies(other, allMods)
    if (deps.some((d) => d.id === mod.id)) {
      dependents.push(other)
    }
  }

  return dependents
}

/**
 * Installe un mod ainsi que toutes ses dépendances requises manquantes
 */
export async function installWithDependencies(
  slug: string,
  mod: IOptionalModItem,
  allMods: IOptionalModItem[],
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; installedCount: number; error?: string }> {
  try {
    const deps = await resolveRequiredDependencies(mod, allMods)
    const missingDeps = deps.filter((d) => !d.isInstalled)

    let installedCount = 0

    // Installer les dépendances d'abord
    for (const dep of missingDeps) {
      if (onStatus) onStatus(`Installation de la dépendance requise : ${dep.name}...`)
      logger.info(`[AutoDep] Installing dependency ${dep.id} for ${mod.id}`)
      const res = await optionalMods.install(slug, dep.id)
      if (!res.success) {
        return { success: false, installedCount, error: `Échec d'installation de la dépendance ${dep.name}: ${res.error}` }
      }
      installedCount++
    }

    // Installer le mod cible
    if (!mod.isInstalled) {
      if (onStatus) onStatus(`Installation de ${mod.name}...`)
      const res = await optionalMods.install(slug, mod.id)
      if (!res.success) {
        return { success: false, installedCount, error: res.error }
      }
      installedCount++
    }

    return { success: true, installedCount }
  } catch (err: any) {
    logger.error('Failed to install with dependencies:', err)
    return { success: false, installedCount: 0, error: err?.message || 'Erreur inattendue' }
  }
}

/**
 * Active un mod et s'assure que toutes ses dépendances requises sont installées ET activées
 */
export async function enableWithDependencies(
  slug: string,
  mod: IOptionalModItem,
  allMods: IOptionalModItem[],
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; activatedMods: string[]; error?: string }> {
  try {
    const deps = await resolveRequiredDependencies(mod, allMods)
    const activatedMods: string[] = []

    // 1. Dépendances : installer si absentes et activer si désactivées
    for (const dep of deps) {
      if (!dep.isInstalled) {
        if (onStatus) onStatus(`Installation de la dépendance requise ${dep.name}...`)
        const instRes = await optionalMods.install(slug, dep.id)
        if (!instRes.success) {
          return { success: false, activatedMods, error: `Impossible d'installer la dépendance ${dep.name}` }
        }
      }
      if (!dep.isEnabled) {
        if (onStatus) onStatus(`Activation de la dépendance requise ${dep.name}...`)
        const toggleRes = await optionalMods.toggle(slug, dep.id, true)
        if (!toggleRes.success) {
          return { success: false, activatedMods, error: `Impossible d'activer la dépendance ${dep.name}` }
        }
        activatedMods.push(dep.id)
      }
    }

    // 2. Mod cible : installer si nécessaire puis activer
    if (!mod.isInstalled) {
      if (onStatus) onStatus(`Installation de ${mod.name}...`)
      const instRes = await optionalMods.install(slug, mod.id)
      if (!instRes.success) {
        return { success: false, activatedMods, error: instRes.error }
      }
    }

    if (!mod.isEnabled) {
      if (onStatus) onStatus(`Activation de ${mod.name}...`)
      const toggleRes = await optionalMods.toggle(slug, mod.id, true)
      if (!toggleRes.success) {
        return { success: false, activatedMods, error: toggleRes.error }
      }
      activatedMods.push(mod.id)
    }

    return { success: true, activatedMods }
  } catch (err: any) {
    logger.error('Failed to enable with dependencies:', err)
    return { success: false, activatedMods: [], error: err?.message || 'Erreur inattendue' }
  }
}

/**
 * Désactive un mod et désactive en cascade les mods qui en dépendent
 */
export async function disableWithDependents(
  slug: string,
  mod: IOptionalModItem,
  allMods: IOptionalModItem[],
  onStatus?: (msg: string) => void
): Promise<{ success: boolean; disabledMods: string[]; error?: string }> {
  try {
    const dependents = await resolveDependents(mod, allMods)
    const activeDependents = dependents.filter((d) => d.isEnabled)
    const disabledMods: string[] = []

    // 1. Désactiver les mods dépendants actifs d'abord pour éviter des crashs
    for (const dep of activeDependents) {
      if (onStatus) onStatus(`Désactivation du mod dépendant : ${dep.name}...`)
      const res = await optionalMods.toggle(slug, dep.id, false)
      if (res.success) {
        disabledMods.push(dep.id)
      }
    }

    // 2. Désactiver le mod cible
    if (mod.isEnabled) {
      if (onStatus) onStatus(`Désactivation de ${mod.name}...`)
      const res = await optionalMods.toggle(slug, mod.id, false)
      if (!res.success) {
        return { success: false, disabledMods, error: res.error }
      }
      disabledMods.push(mod.id)
    }

    return { success: true, disabledMods }
  } catch (err: any) {
    logger.error('Failed to disable with dependents:', err)
    return { success: false, disabledMods: [], error: err?.message || 'Erreur inattendue' }
  }
}
