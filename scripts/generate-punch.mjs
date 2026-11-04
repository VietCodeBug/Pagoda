/**
 * Author a jab/cross on the user's original rig. This is an animation-only GLB:
 * it reuses avatar.glb's mesh/skin at runtime and never substitutes the roar clip.
 * Run: node scripts/generate-punch.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Group, Object3D, Quaternion, Vector3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = await readFile(path.join(root, 'public/assets/avatar.glb'));
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
const binStart = 28 + jsonLength;
const sourceBin = bytes.subarray(binStart);
const components = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function readAccessor(index) {
  const a = source.accessors[index], view = source.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.sparse || view.byteStride) throw new Error('Expected dense float animation accessors.');
  const start = (view.byteOffset || 0) + (a.byteOffset || 0);
  return Array.from(new Float32Array(sourceBin.buffer, sourceBin.byteOffset + start, a.count * components[a.type]));
}

// The source bind pose is not neutral. Sample the same relaxed Agree start that Avatar uses.
const nodes = source.nodes.map(({ name, children, translation, rotation, scale }) => ({
  name, ...(children ? { children: [...children] } : {}),
  translation: [...(translation || [0, 0, 0])],
  rotation: [...(rotation || [0, 0, 0, 1])],
  scale: [...(scale || [1, 1, 1])],
}));
const agree = source.animations.find((clip) => clip.name === 'Agree');
if (!agree) throw new Error('The compatible Agree neutral clip is missing.');
for (const channel of agree.channels) {
  const sampler = agree.samplers[channel.sampler];
  if (sampler.interpolation === 'CUBICSPLINE') throw new Error('Unexpected cubic source animation.');
  const size = channel.target.path === 'rotation' ? 4 : 3;
  nodes[channel.target.node][channel.target.path] = readAccessor(sampler.output).slice(0, size);
}
// Object3D preserves the source hierarchy while giving us reliable world-space bone aiming.
const scene = new Group();
const objects = nodes.map((n) => {
  const object = new Object3D();
  object.name = n.name;
  object.position.fromArray(n.translation);
  object.quaternion.fromArray(n.rotation);
  object.scale.fromArray(n.scale);
  return object;
});
nodes.forEach((n, i) => n.children?.forEach((child) => objects[i].add(objects[child])));
source.scenes[source.scene || 0].nodes.forEach((index) => scene.add(objects[index]));
const byName = new Map(objects.map((object) => [object.name, object]));
const yAxis = new Vector3(0, 1, 0), xAxis = new Vector3(1, 0, 0);
function bone(suffix) { return byName.get(`mixamorig:${suffix}`) || byName.get(suffix); }
function reset() {
  nodes.forEach((n, i) => { objects[i].position.fromArray(n.translation); objects[i].quaternion.fromArray(n.rotation); objects[i].scale.fromArray(n.scale); });
  scene.updateMatrixWorld(true);
}
function aim(suffix, direction) {
  const object = bone(suffix);
  if (!object?.parent) throw new Error(`Missing compatible bone ${suffix}`);
  scene.updateMatrixWorld(true);
  const world = object.getWorldQuaternion(new Quaternion());
  const current = yAxis.clone().applyQuaternion(world).normalize();
  const desired = new Quaternion().setFromUnitVectors(current, new Vector3(...direction).normalize()).multiply(world);
  object.quaternion.copy(object.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desired));
  scene.updateMatrixWorld(true);
}
function capture() { return objects.map((o) => o.quaternion.clone()); }
function twist(suffix, radians) { bone(suffix)?.quaternion.multiply(new Quaternion().setFromAxisAngle(yAxis, radians)); }
function guard() {
  aim('LeftArm', [0.30, -0.38, 0.68]);
  aim('LeftForeArm', [-0.16, 0.86, 0.30]);
  aim('LeftHand', [0.04, 0.76, 0.34]);
  aim('RightArm', [-0.34, -0.42, 0.64]);
  aim('RightForeArm', [0.14, 0.88, 0.24]);
  aim('RightHand', [-0.04, 0.82, 0.26]);
  // These two helper chains cover the limited finger weighting present in this rig.
  for (const name of ['Bone_022', 'Bone_017']) bone(name)?.quaternion.multiply(new Quaternion().setFromAxisAngle(xAxis, .45));
}
reset(); const neutral = capture();
guard(); const ready = capture();
reset(); twist('Spine', -.08); twist('Spine2', -.15); guard();
aim('LeftArm', [-.03, .07, 1]); aim('LeftForeArm', [.02, .01, 1]); aim('LeftHand', [.02, -.06, 1]);
const jab = capture();
reset(); twist('Spine', .10); twist('Spine2', .21); guard();
aim('RightArm', [.06, .04, 1]); aim('RightForeArm', [-.08, -.01, 1]); aim('RightHand', [-.08, -.04, 1]);
const cross = capture();

const frames = [
  { time: 0, pose: neutral }, { time: .075, pose: ready }, { time: .12, pose: ready },
  { time: .205, pose: jab }, { time: .245, pose: jab }, { time: .325, pose: ready },
  { time: .36, pose: ready }, { time: .45, pose: cross }, { time: .49, pose: cross },
  { time: .59, pose: ready }, { time: .68, pose: neutral },
];
const bufferViews = [], accessors = [], chunks = []; let offset = 0;
function accessor(values, type, range = false) {
  const data = Buffer.from(new Float32Array(values).buffer);
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length });
  chunks.push(data); offset += data.length;
  const value = { bufferView: bufferViews.length - 1, componentType: 5126, count: values.length / components[type], type };
  if (range) { value.min = [Math.min(...values)]; value.max = [Math.max(...values)]; }
  accessors.push(value); return accessors.length - 1;
}
const time = accessor(frames.map((frame) => frame.time), 'SCALAR', true);
const restTime = accessor([0, .68], 'SCALAR', true);
const samplers = [], channels = [];
function channel(node, targetPath, values, type, input) {
  const output = accessor(values, type);
  channels.push({ sampler: samplers.length, target: { node, path: targetPath } });
  samplers.push({ input, output, interpolation: 'LINEAR' });
}
nodes.forEach((n, index) => {
  if (!n.name.startsWith('mixamorig:') && !n.name.startsWith('Bone_')) return;
  const rotations = frames.flatMap((frame, frameIndex) => {
    const q = frame.pose[index].clone();
    // Hemisphere continuity avoids long-path quaternion interpolation in other viewers.
    if (frameIndex && q.dot(frames[frameIndex - 1].pose[index]) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
    return q.toArray();
  });
  channel(index, 'rotation', rotations, 'VEC4', time);
  channel(index, 'translation', [...n.translation, ...n.translation], 'VEC3', restTime);
  channel(index, 'scale', [...n.scale, ...n.scale], 'VEC3', restTime);
});
const binary = Buffer.concat(chunks);
const document = {
  asset: { version: '2.0', generator: 'An Nhien authored rig animation: jab, cross and recovery v1' },
  scene: 0, scenes: source.scenes.map(({ name, nodes }) => ({ name, nodes })), nodes,
  animations: [{ name: 'PunchCombo', channels, samplers }],
  buffers: [{ byteLength: binary.length }], bufferViews, accessors,
  extras: { duration: .68, sourceRig: 'avatar.glb', description: 'Authored left jab and right cross. Original roar animation is not used.' },
};
const jsonBytes = Buffer.from(JSON.stringify(document));
const jsonPadding = Buffer.alloc((4 - jsonBytes.length % 4) % 4, 0x20);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + jsonBytes.length + jsonPadding.length + binary.length, 8);
header.writeUInt32LE(jsonBytes.length + jsonPadding.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
const result = Buffer.concat([header, jsonBytes, jsonPadding, binHeader, binary]);
await writeFile(path.join(root, 'public/assets/punch.glb'), result);
console.log(JSON.stringify({ file: 'public/assets/punch.glb', bytes: result.length, clip: 'PunchCombo', duration: .68, channels: channels.length, authoredKeys: frames.length }));
