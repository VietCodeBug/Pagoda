/**
 * Decimate the original garden statue without changing the user's source GLB.
 * Tool setup (kept outside app dependencies):
 *   mkdir .wrangler/garden-asset-tools
 *   pnpm add --dir .wrangler/garden-asset-tools @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
 * Run: node scripts/optimize-garden.mjs
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, '.wrangler/garden-asset-tools/package.json'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplify, dedup, prune, quantize } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
await MeshoptSimplifier.ready;
const sourcePath = path.join(root, 'tượng phật ngoài vườn.glb');
const outputPath = path.join(root, 'public/assets/garden-buddha.glb');
const sourceBytes = await readFile(sourcePath);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.readBinary(new Uint8Array(sourceBytes));
function count(doc) {
  let vertices = 0, triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    vertices += primitive.getAttribute('POSITION').getCount();
    triangles += (primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION').getCount()) / 3;
  }
  return { vertices, triangles };
}
const before = count(document);
const ratio = .04, error = .0015;
await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }), dedup(), prune());
const afterSimplify = count(document);
const textureStats = [];
for (const [index, texture] of document.getRoot().listTextures().entries()) {
  const original = texture.getImage();
  if (!original) continue;
  const metadata = await sharp(original).metadata();
  // The supplied statue is fully opaque. JPEG keeps it browser-native and avoids decoder downloads.
  const converted = await sharp(original).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .removeAlpha().jpeg({ quality: index === 0 ? 91 : 86, chromaSubsampling: '4:4:4' }).toBuffer();
  texture.setImage(converted).setMimeType('image/jpeg').setURI(`garden-statue-${index}.jpg`);
  const resized = await sharp(converted).metadata();
  textureStats.push({ originalWidth: metadata.width, originalHeight: metadata.height, width: resized.width, height: resized.height, bytes: converted.length });
}
// Integer vertex attributes are supported natively by GLTFLoader (KHR_mesh_quantization).
await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }), prune());
const outputBytes = Buffer.from(await io.writeBinary(document));
await writeFile(outputPath, outputBytes);
const after = count(document);
const report = {
  source: 'tượng phật ngoài vườn.glb', output: 'garden-buddha.glb',
  sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
  sourceBytes: sourceBytes.length, outputBytes: outputBytes.length,
  before, after, afterSimplify, ratio, maximumRelativeError: error,
  verticesRemovedPercent: +(100 * (1 - after.vertices / before.vertices)).toFixed(2),
  trianglesRemovedPercent: +(100 * (1 - after.triangles / before.triangles)).toFixed(2),
  textures: textureStats,
  sha256: createHash('sha256').update(outputBytes).digest('hex'),
  placement: { x: -18, z: -14.2, plinthTop: .52, statueHeight: 4, baseWidth: 4.7, baseDepth: 4 },
  compression: 'meshoptimizer simplification; 14-bit positions; 10-bit normals; 12-bit UVs; embedded 1K JPEG; no external decoder',
};
await writeFile(path.join(root, 'public/assets/garden-buddha.metadata.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
