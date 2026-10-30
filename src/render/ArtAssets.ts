/**
 * Small lazy loader for public game art. Drawing code can keep its procedural
 * fallback until a PNG has loaded; the renderer never waits on network I/O.
 */
const ASSET_PATHS = {
  forgeBackground: 'bg_lv1_tiejiangpu.png',
  chenfeng: 'char_chenfeng_battle.png',
  tiejiangdao: 'wpn_tiejiangdao.png',
  hitVfx: 'vfx_hit.png',
  clashVfx: 'vfx_clash.png',
  hudFrame: 'ui_hud_frame.png',
  banditLackey: 'enm_shanfeilouluo.png',
} as const;

export type GameArtId = keyof typeof ASSET_PATHS;

const imageCache = new Map<GameArtId, HTMLImageElement>();

/** Return a loaded image, or null while loading / outside a browser / on failure. */
export function getGameArt(id: GameArtId): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;

  let image = imageCache.get(id);
  if (!image) {
    image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}assets/art/${ASSET_PATHS[id]}`;
    imageCache.set(id, image);
  }

  return image.complete && image.naturalWidth > 0 ? image : null;
}
