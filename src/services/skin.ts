import type { Account, IAvatar, ICape, ISkin } from 'eml-lib'
import { skin } from '../ipc'
import logger from 'electron-log/renderer'

export interface SkinAssets {
  skins: ISkin[] | null
  capes: ICape[] | null
  avatar: IAvatar | null
}

/** Recharge puis charge skins/capes/avatar après une session. Ne lève jamais. */
export async function loadSkinAssets(account: Account): Promise<SkinAssets> {
  try {
    const [, skins, capes, avatar] = await Promise.all([skin.reload(account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
    return { skins, capes, avatar }
  } catch (err) {
    logger.warn('Chargement des skins ignoré :', err)
    return { skins: [], capes: [], avatar: null }
  }
}
