'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Html, useAnimations, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  AnimationMixer, Bone, Color, Group, LoopOnce, LoopRepeat, Material, Mesh,
  MeshStandardMaterial, Quaternion, Vector3,
} from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimationName } from '@/lib/protocol';
import { assetUrl } from '@/lib/assets';

export const AVATAR_STYLES = [
  { name: 'An Nhiên', color: '#d9c194' },
  { name: 'Thanh Trúc', color: '#8fc6ad' },
  { name: 'Minh Nguyệt', color: '#a8b8df' },
  { name: 'Hổ Phách', color: '#e8ab81' },
] as const;

type AvatarProps = {
  animation: AnimationName;
  avatar: number;
  name?: string;
  hp?: number;
  inCombat?: boolean;
  bubble?: string;
};
type BonePose = { quaternion: Quaternion; position: Vector3 };
type Pose = Map<string, BonePose>;
const UP = new Vector3(0, 1, 0);

function capturePose(scene: Group): Pose {
  const result: Pose = new Map();
  scene.traverse((node) => {
    if ((node as Bone).isBone) result.set(node.name, { quaternion: node.quaternion.clone(), position: node.position.clone() });
  });
  return result;
}

function restorePose(scene: Group, pose: Pose) {
  scene.traverse((node) => {
    const value = pose.get(node.name);
    if (value) {
      node.quaternion.copy(value.quaternion);
      node.position.copy(value.position);
    }
  });
  scene.updateMatrixWorld(true);
}

function findBone(scene: Group, suffix: string) {
  // GLTFLoader removes ':' when it sanitizes names for animation track binding.
  return (scene.getObjectByName(`mixamorig${suffix}`) || scene.getObjectByName(`mixamorig:${suffix}`)) as Bone | undefined;
}

/** Keep each bone's roll while aiming its +Y axis in a world-space direction. */
function aimBone(scene: Group, suffix: string, direction: [number, number, number]) {
  const bone = findBone(scene, suffix);
  if (!bone?.parent) return;
  scene.updateMatrixWorld(true);
  const worldRotation = bone.getWorldQuaternion(new Quaternion());
  const currentDirection = UP.clone().applyQuaternion(worldRotation).normalize();
  const delta = new Quaternion().setFromUnitVectors(currentDirection, new Vector3(...direction).normalize());
  const desiredWorld = delta.multiply(worldRotation);
  const parentInverse = bone.parent.getWorldQuaternion(new Quaternion()).invert();
  bone.quaternion.copy(parentInverse.multiply(desiredWorld));
  scene.updateMatrixWorld(true);
}

function createPoses(scene: Group, neutral: Pose) {
  const poses = new Map<string, Pose>();
  poses.set('idle', neutral);
  restorePose(scene, neutral);
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1;
    aimBone(scene, `${side}Arm`, [sign * 0.26, -0.62, 0.46]);
    aimBone(scene, `${side}ForeArm`, [-sign * 0.22, 0.58, 0.32]);
  }
  poses.set('pray', capturePose(scene));
  const spine = findBone(scene, 'Spine');
  if (spine) spine.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.42));
  const neck = findBone(scene, 'Neck');
  if (neck) neck.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.13));
  poses.set('bow', capturePose(scene));
  restorePose(scene, neutral);
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1;
    aimBone(scene, `${side}Arm`, [sign * 0.23, -0.52, 0.70]);
    aimBone(scene, `${side}ForeArm`, [-sign * 0.16, 0.04, 0.98]);
    aimBone(scene, `${side}Hand`, [-sign * 0.08, -0.08, 0.98]);
  }
  poses.set('fish', capturePose(scene));
  restorePose(scene, neutral);
  const hips = findBone(scene, 'Hips');
  if (hips) hips.position.y -= 0.22;
  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1;
    aimBone(scene, `${side}UpLeg`, [sign * 0.60, -0.16, 0.65]);
    aimBone(scene, `${side}Leg`, [-sign * 0.60, -0.08, -0.68]);
    aimBone(scene, `${side}Foot`, [sign * 0.8, 0.05, 0.3]);
    aimBone(scene, `${side}Arm`, [sign * 0.44, -0.50, 0.25]);
    aimBone(scene, `${side}ForeArm`, [sign * 0.20, -0.1, 0.55]);
  }
  poses.set('sit', capturePose(scene));
  restorePose(scene, neutral);
  return poses;
}

function Nameplate({ name, hp = 100, inCombat, bubble }: Pick<AvatarProps, 'name' | 'hp' | 'inCombat' | 'bubble'>) {
  if (!name && !bubble) return null;
  return (
    <Html position={[0, 1.96, 0]} center distanceFactor={9} zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, width: 150, fontFamily: 'var(--font-sans), sans-serif', userSelect: 'none' }}>
        {bubble && <div style={{ background: '#fff9ec', color: '#303f37', padding: '9px 12px', borderRadius: '12px 12px 12px 2px', fontSize: 12, lineHeight: 1.4, textAlign: 'center', maxWidth: 190, overflowWrap: 'anywhere', boxShadow: '0 4px 18px #0002' }}>{bubble}</div>}
        {name && <span style={{ background: 'rgba(24,38,31,.72)', border: '1px solid #e4d5ae44', color: '#fff8e8', borderRadius: 20, padding: '3px 9px', fontSize: 10, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{name}{inCombat ? ' · ⚔' : ''}</span>}
        {(inCombat || hp < 100) && <div style={{ width: 60, height: 5, borderRadius: 5, overflow: 'hidden', background: '#261d1dbb', border: '1px solid #fff3' }}><div style={{ width: `${Math.max(0, Math.min(100, hp))}%`, height: '100%', background: hp > 30 ? '#9dc78c' : '#d97565', transition: 'width .2s' }} /></div>}
      </div>
    </Html>
  );
}

export default function Avatar({ animation, avatar, ...label }: AvatarProps) {
  const loaded = useGLTF(assetUrl('avatar.glb'));
  const punch = useGLTF(assetUrl('punch.glb'));
  const clips = useMemo(() => [
    // The source's "Attack" export is a roar. Use the separately authored rig clip.
    ...loaded.animations.filter((clip) => clip.name !== 'Attack'),
    ...punch.animations,
  ], [loaded.animations, punch.animations]);
  const style = AVATAR_STYLES[((avatar % AVATAR_STYLES.length) + AVATAR_STYLES.length) % AVATAR_STYLES.length];
  const { scene, neutral, poses, materials } = useMemo(() => {
    const instance = clone(loaded.scene) as Group;
    const ownedMaterials: Material[] = [];
    instance.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const copies = originals.map((original) => {
        const material = original.clone();
        if ((material as MeshStandardMaterial).isMeshStandardMaterial) {
          const standard = material as MeshStandardMaterial;
          standard.color.multiply(new Color(style.color).lerp(new Color('#ffffff'), 0.55));
          standard.roughness = Math.max(standard.roughness, 0.45);
        }
        ownedMaterials.push(material);
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? copies : copies[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    });
    // Agree starts from a relaxed standing stance; the export's bind pose is not an idle animation.
    const agree = loaded.animations.find((clip) => clip.name === 'Agree');
    if (agree) {
      const poseMixer = new AnimationMixer(instance);
      poseMixer.clipAction(agree).play();
      poseMixer.update(0);
      const sampled = capturePose(instance);
      poseMixer.stopAllAction();
      poseMixer.uncacheRoot(instance);
      restorePose(instance, sampled);
    }
    const base = capturePose(instance);
    return { scene: instance, neutral: base, poses: createPoses(instance, base), materials: ownedMaterials };
  }, [loaded.scene, loaded.animations, style.color]);
  const group = useRef<Group>(null);
  const { actions } = useAnimations(clips, scene);
  const clipName = animation === 'walk' ? 'Walk' : animation === 'run' ? 'Run' : animation === 'attack' ? 'PunchCombo' : animation === 'wave' ? 'Agree' : null;

  useEffect(() => {
    if (!clipName) return;
    const action = actions[clipName];
    if (!action) return;
    const punching = clipName === 'PunchCombo';
    action.clampWhenFinished = punching;
    action.reset().setLoop(punching ? LoopOnce : LoopRepeat, punching ? 1 : Infinity)
      .setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(punching ? 0.07 : 0.18).play();
    return () => { action.fadeOut(punching ? 0.12 : 0.18); };
  }, [actions, clipName]);

  useEffect(() => () => { materials.forEach((material) => material.dispose()); }, [materials]);

  useFrame(({ clock }, delta) => {
    if (clipName) return;
    const target = poses.get(animation) || neutral;
    const blend = 1 - Math.exp(-Math.min(delta, 0.1) * 14);
    scene.traverse((node) => {
      const value = target.get(node.name);
      if (!value) return;
      node.quaternion.slerp(value.quaternion, blend);
      node.position.lerp(value.position, blend);
    });
    if (group.current) group.current.scale.y = 1 + Math.sin(clock.elapsedTime * 1.8) * 0.003;
  });

  return <group>
    <group ref={group}><primitive object={scene} dispose={null} /></group>
    <Nameplate {...label} />
  </group>;
}

export function SimpleAvatar({ avatar = 0, ...label }: Partial<AvatarProps>) {
  const color = AVATAR_STYLES[Math.abs(avatar) % AVATAR_STYLES.length].color;
  return <group>
    <mesh position={[0, 0.75, 0]} castShadow><capsuleGeometry args={[0.27, 0.65, 6, 12]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
    <mesh position={[0, 1.48, 0]} castShadow><sphereGeometry args={[0.25, 14, 12]} /><meshStandardMaterial color="#ddbea0" /></mesh>
    <Nameplate {...label} />
  </group>;
}

useGLTF.preload(assetUrl('avatar.glb'));
useGLTF.preload(assetUrl('punch.glb'));
