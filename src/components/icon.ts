/**
 * Solar Icons Helper (Solar Icons — 480 Design, CC BY 4.0)
 * Rendu par Sprite SVG local intégré, zéro CDN.
 */
export type SolarVariant = 'bold' | 'linear'

export function solarIcon(name: string, variant: SolarVariant = 'linear', extraClass = '', extraAttrs = ''): string {
  const cls = ['solar-icon', `solar-${variant}`, extraClass].filter(Boolean).join(' ')
  return `<svg class="${cls}" aria-hidden="true" ${extraAttrs}><use href="#solar-${name}-${variant}"></use></svg>`
}
