/** Public game assets only. Storage credentials and bucket selection stay on the server. */
export const GAME_ASSET_NAMES = [
  'avatar.glb',
  'punch.glb',
  'garden-buddha.glb',
  'buddha-center.glb',
  'buddha-left.glb',
  'buddha-right.glb',
  'temple-ambient.mp3',
  'manifest.json',
  'golden-sky.hdr',
  'stone-color.jpg', 'stone-normal.jpg', 'stone-arm.jpg',
  'earth-color.jpg', 'earth-normal.jpg', 'earth-arm.jpg',
  'moss-color.jpg', 'moss-normal.jpg', 'moss-arm.jpg',
  'boulder.glb', 'moss-rocks.glb', 'garden-shrub.glb', 'garden-fern.glb',
  'scene-credits.json',
] as const;

export type GameAssetName = typeof GAME_ASSET_NAMES[number];

export function assetUrl(name: GameAssetName): string {
  return `/api/assets/${name}`;
}
