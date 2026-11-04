/**
 * Prepare the user-supplied GLBs without changing the original files.
 * Embedded textures are resized to 1024 px and encoded as browser-native JPEG
 * (PNG when alpha is required). The four exports share one rig and one mesh,
 * so only animation accessors are copied into the Walking export.
 *
 * Run: pnpm assets (requires sharp, installed with the project dependencies).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  // Optional local tooling location; useful before the application is installed.
  const require = createRequire(path.join(process.env.TEMP || '/tmp', 'virtual-temple-asset-tools', 'package.json'));
  sharp = require('sharp');
}

const output = path.join(root, 'public', 'assets');
await fs.mkdir(output, { recursive: true });

async function readGLB(name) {
  const bytes = await fs.readFile(path.join(root, name));
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${name} is not a glTF 2.0 binary`);
  }
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  const binHeader = 20 + jsonLength;
  const bin = bytes.subarray(binHeader + 8, binHeader + 8 + bytes.readUInt32LE(binHeader));
  return { json, bin, sourceBytes: bytes.length };
}

function mergeClip(target, source, name) {
  const nodeByName = new Map(target.json.nodes.map((node, index) => [node.name, index]));
  const accessorMap = new Map();
  const viewMap = new Map();
  function copyAccessor(index) {
    if (accessorMap.has(index)) return accessorMap.get(index);
    const accessor = structuredClone(source.json.accessors[index]);
    if (accessor.sparse || accessor.bufferView == null) throw new Error('Animation accessors must be dense');
    if (!viewMap.has(accessor.bufferView)) {
      const view = structuredClone(source.json.bufferViews[accessor.bufferView]);
      const originalStart = view.byteOffset || 0;
      const padding = (4 - target.bin.length % 4) % 4;
      view.byteOffset = target.bin.length + padding;
      view.buffer = 0;
      viewMap.set(accessor.bufferView, target.json.bufferViews.length);
      target.json.bufferViews.push(view);
      target.bin = Buffer.concat([target.bin, Buffer.alloc(padding), source.bin.subarray(originalStart, originalStart + view.byteLength)]);
    }
    accessor.bufferView = viewMap.get(accessor.bufferView);
    accessorMap.set(index, target.json.accessors.length);
    target.json.accessors.push(accessor);
    return target.json.accessors.length - 1;
  }
  const animation = structuredClone(source.json.animations[0]);
  animation.name = name;
  for (const sampler of animation.samplers) {
    sampler.input = copyAccessor(sampler.input);
    sampler.output = copyAccessor(sampler.output);
  }
  for (const channel of animation.channels) {
    const nodeName = source.json.nodes[channel.target.node].name;
    if (!nodeByName.has(nodeName)) throw new Error(`Incompatible rig: missing ${nodeName}`);
    channel.target.node = nodeByName.get(nodeName);
  }
  target.json.animations.push(animation);
}

async function optimizeTextures(glb) {
  const replacements = new Map();
  for (const image of glb.json.images || []) {
    const view = glb.json.bufferViews[image.bufferView];
    const original = glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const metadata = await sharp(original).metadata();
    const pipeline = sharp(original).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true });
    // These exports have opaque RGB textures. Preserve alpha for future inputs.
    const encoded = metadata.hasAlpha
      ? await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer()
      : await pipeline.jpeg({ quality: 86, chromaSubsampling: '4:4:4' }).toBuffer();
    image.mimeType = metadata.hasAlpha ? 'image/png' : 'image/jpeg';
    replacements.set(image.bufferView, encoded);
  }
  const pieces = [];
  let offset = 0;
  for (let index = 0; index < glb.json.bufferViews.length; index++) {
    const view = glb.json.bufferViews[index];
    const piece = replacements.get(index) || glb.bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const padding = (4 - offset % 4) % 4;
    if (padding) pieces.push(Buffer.alloc(padding));
    offset += padding;
    view.buffer = 0;
    view.byteOffset = offset;
    view.byteLength = piece.length;
    pieces.push(piece);
    offset += piece.length;
  }
  glb.bin = Buffer.concat(pieces);
  glb.json.buffers = [{ byteLength: glb.bin.length }];
  glb.json.asset.generator = 'Virtual Temple asset preparation — embedded JPEG/PNG 1024px';
}

async function writeGLB(name, glb) {
  const jsonBytes = Buffer.from(JSON.stringify(glb.json));
  const jsonPadding = Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20);
  const binPadding = Buffer.alloc((4 - glb.bin.length % 4) % 4);
  const jsonLength = jsonBytes.length + jsonPadding.length;
  const binLength = glb.bin.length + binPadding.length;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  header.writeUInt32LE(jsonLength, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  await fs.writeFile(path.join(output, name), Buffer.concat([header, jsonBytes, jsonPadding, binHeader, glb.bin, binPadding]));
  console.log(`${name}: ${(total / 1024 / 1024).toFixed(2)} MiB`);
  return total;
}

const avatarSources = [
  ['Meshy_AI_o_biped_Animation_Walking_withSkin.glb', 'Walk'],
  ['Meshy_AI_o_biped_Animation_Running_withSkin.glb', 'Run'],
  ['Meshy_AI_o_biped_Animation_Skill_01_withSkin.glb', 'Attack'],
  ['Meshy_AI_o_biped_Animation_Agree_Gesture_withSkin.glb', 'Agree'],
];
const avatar = await readGLB(avatarSources[0][0]);
avatar.json.animations[0].name = 'Walk';
let originalAvatarBytes = avatar.sourceBytes;
for (const [name, clip] of avatarSources.slice(1)) {
  const source = await readGLB(name);
  originalAvatarBytes += source.sourceBytes;
  mergeClip(avatar, source, clip);
}
await optimizeTextures(avatar);
const avatarBytes = await writeGLB('avatar.glb', avatar);
const manifest = {
  textureMaximum: 1024,
  compression: 'Embedded JPEG/PNG; no remote decoder required',
  avatar: {
    file: '/assets/avatar.glb',
    heightMeters: 1.7,
    vertices: 12092,
    bones: 32,
    clips: ['Walk', 'Run', 'Attack', 'Agree'],
    sourceBytes: originalAvatarBytes,
    outputBytes: avatarBytes,
    note: 'The four supplied character exports share one skin. Idle, Sit, Bow and Pray are procedural runtime poses.',
  },
  statues: [],
};
for (const [source, filename] of [
  ['tượng phật ở giữa.glb', 'buddha-center.glb'],
  ['tượng phật bên trái.glb', 'buddha-left.glb'],
  ['tượng phật bên phải.glb', 'buddha-right.glb'],
]) {
  const glb = await readGLB(source);
  await optimizeTextures(glb);
  const bytes = await writeGLB(filename, glb);
  manifest.statues.push({ file: `/assets/${filename}`, sourceBytes: glb.sourceBytes, outputBytes: bytes });
}
await fs.copyFile(path.join(root, 'nhạc nền chùa.mp3'), path.join(output, 'temple-ambient.mp3'));
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Original assets preserved. Asset manifest written.');
