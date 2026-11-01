type IconWeight = 'regular' | 'bold' | 'fill'

export function icon(name: string, opts: { weight?: IconWeight; size?: number; className?: string } = {}) {
  const { weight = 'regular', size = 16, className = '' } = opts
  const prefix = weight === 'regular' ? 'ph' : `ph-${weight}`
  return `<i class="${prefix} ph-${name} ${className}" style="font-size:${size}px" aria-hidden="true"></i>`
}

import discordSvg from '../static/icons/discord.svg?raw'

export const brandIcon = {
  discord: (size = 20) => discordSvg.replace('<svg', `<svg width="${size}" height="${size}"`)
}
