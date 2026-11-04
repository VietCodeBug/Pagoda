import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { AnimationMixer, LoopOnce, PropertyBinding, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let gltf, sourceNames;
beforeAll(async () => {
  const bytes = await readFile('public/assets/punch.glb');
  gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const source = await readFile('public/assets/avatar.glb');
  const json = JSON.parse(source.subarray(20, 20 + source.readUInt32LE(12)).toString('utf8'));
  sourceNames = new Set(json.nodes.map((node) => PropertyBinding.sanitizeNodeName(node.name)));
});

describe('authored punch GLB on the supplied character rig', () => {
  it('loads as a small independent punch clip whose tracks bind the existing avatar bones', () => {
    const [clip] = gltf.animations;
    expect(clip.name).toBe('PunchCombo');
    expect(clip.duration).toBeCloseTo(.68, 5);
    expect(clip.tracks.length).toBeGreaterThan(20);
    for (const track of clip.tracks) {
      expect(sourceNames.has(PropertyBinding.parseTrackName(track.name).nodeName)).toBe(true);
      expect(Array.from(track.values).every(Number.isFinite)).toBe(true);
    }
  });
  it('extends each fist forward on its strike while feet remain planted and returns to neutral', () => {
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(gltf.animations[0]).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true; action.play();
    const position = (suffix) => gltf.scene.getObjectByName(`mixamorig${suffix}`).getWorldPosition(new Vector3());
    const sample = (time) => {
      mixer.setTime(time); gltf.scene.updateMatrixWorld(true);
      return { left: position('LeftHand'), right: position('RightHand'), feet: [position('LeftFoot'), position('RightFoot')] };
    };
    const neutral = sample(0), guard = sample(.075), jab = sample(.205), cross = sample(.45), recover = sample(.68);
    expect(jab.left.z - guard.left.z).toBeGreaterThan(.12);
    expect(cross.right.z - guard.right.z).toBeGreaterThan(.15);
    for (const pose of [guard, jab, cross, recover]) {
      pose.feet.forEach((foot, index) => expect(foot.distanceTo(neutral.feet[index])).toBeLessThan(.00001));
    }
    expect(recover.left.distanceTo(neutral.left)).toBeLessThan(.00001);
    expect(recover.right.distanceTo(neutral.right)).toBeLessThan(.00001);
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  });
});
