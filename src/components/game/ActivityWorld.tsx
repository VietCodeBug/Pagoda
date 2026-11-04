'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ACTIVITY_MODES, FISHING_SPOT, FISH_RARITIES, LOTUS_POINTS, MEMORY_NOTES, MEMORY_SPOT, RACE_CHECKPOINTS, TRAINING_SPOT, LANTERN_SPOT, fishSpecies, type ActivityEffect } from '@/lib/activities';
import { useGame } from '@/lib/game-store';
import { POND } from '@/lib/world-layout';

const GOLD = '#d6bc79';

function StationLabel({ text, position, color = GOLD }: { text: string; position: [number, number, number]; color?: string }) {
  return <Html position={position} center distanceFactor={11} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}><span className="activity-world-label" style={{ color }}>{text}</span></Html>;
}

function FishModel({ color = '#d7b769', scale = 1 }: { color?: string; scale?: number }) {
  return <group scale={scale}>
    <mesh scale={[.42, .19, .15]}><sphereGeometry args={[1, 12, 8]}/><meshStandardMaterial color={color} roughness={.4} metalness={.2}/></mesh>
    <mesh position={[-.46, 0, 0]} rotation={[0, 0, -Math.PI / 2]} scale={[.22, .28, .08]}><coneGeometry args={[1, 1, 3]}/><meshStandardMaterial color={color} roughness={.6}/></mesh>
    <mesh position={[.27, .065, .135]}><sphereGeometry args={[.028, 6, 6]}/><meshBasicMaterial color="#1e302d"/></mesh>
    <mesh position={[.27, .065, -.135]}><sphereGeometry args={[.028, 6, 6]}/><meshBasicMaterial color="#1e302d"/></mesh>
    <mesh position={[-.03, .16, 0]} scale={[.16, .13, .025]} rotation={[0, 0, -.2]}><coneGeometry args={[1, 1, 3]}/><meshStandardMaterial color={color}/></mesh>
  </group>;
}

function FishingStation() {
  return <group position={[FISHING_SPOT.x, 0, FISHING_SPOT.z]}>
    <mesh position={[-.1, .025, 0]} receiveShadow><boxGeometry args={[1.6, .06, 2.5]}/><meshStandardMaterial color="#6a5841" roughness={.95}/></mesh>
    {[-.95, -.48, 0, .48, .95].map(z => <mesh key={z} position={[-.1, .061, z]}><boxGeometry args={[1.58, .008, .026]}/><meshStandardMaterial color="#443c2d"/></mesh>)}
    <mesh position={[.6, .35, -.92]} castShadow><cylinderGeometry args={[.3, .24, .62, 12]}/><meshStandardMaterial color="#7b6544" roughness={.9}/></mesh>
    <mesh position={[.6, .68, -.92]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[.28, .035, 6, 16]}/><meshStandardMaterial color="#c5b78a"/></mesh>
    <mesh position={[.48, 1.18, -.98]} rotation={[0, 0, -.18]}><cylinderGeometry args={[.018, .026, 1.9, 6]}/><meshStandardMaterial color="#8c6c42"/></mesh>
    <StationLabel text="CÂU CÁ · E" position={[0, 1.95, 0]}/>
    <group position={[-1.1, -.045, 0]}><mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.24, .265, 32]}/><meshBasicMaterial color="#f0dfb0" transparent opacity={.65}/></mesh><mesh position={[0, .08, 0]}><sphereGeometry args={[.06, 8, 8]}/><meshStandardMaterial color="#de7e58"/></mesh></group>
  </group>;
}

function Rod({ x, z, local = false }: { x: number; z: number; local?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const bobber = useRef<THREE.Group>(null);
  const line = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2.24, 1.13), new THREE.Vector3(0, .08, 3.1)]), []);
  const initialized = useRef(false);
  useEffect(() => () => line.dispose(), [line]);
  useFrame(({ clock }, dt) => {
    if (!group.current) return;
    const current = local ? useGame.getState().position : null;
    const targetX = current?.x ?? x;
    const targetZ = current?.z ?? z;
    if (!initialized.current) { group.current.position.set(targetX, 0, targetZ); initialized.current = true; }
    else { const blend = 1 - Math.exp(-Math.min(dt, .15) * 14); group.current.position.x += (targetX - group.current.position.x) * blend; group.current.position.z += (targetZ - group.current.position.z) * blend; }
    const dx = POND.x - targetX, dz = POND.z - targetZ, distance = Math.max(.001, Math.hypot(dx, dz));
    group.current.rotation.y = Math.atan2(dx, dz);
    const radius = 1 / Math.sqrt((dx / distance / POND.rx) ** 2 + (dz / distance / POND.rz) ** 2);
    const castDistance = Math.max(2, distance - radius + 1.4);
    const positions = line.getAttribute('position');
    positions.setXYZ(1, 0, .08, castDistance); positions.needsUpdate = true;
    if (bobber.current) { bobber.current.position.y = .08 + Math.sin(clock.elapsedTime * 2.8) * .02; bobber.current.position.z = castDistance; }
  });
  return <group ref={group}>
    <group position={[.25, 1.05, .15]} rotation={[.63, 0, -.08]}><mesh position={[0, .72, 0]}><cylinderGeometry args={[.013, .024, 1.8, 6]}/><meshStandardMaterial color="#aa8650" roughness={.7}/></mesh><mesh position={[0, -.04, 0]}><cylinderGeometry args={[.035, .035, .27, 8]}/><meshStandardMaterial color="#423d2d"/></mesh></group>
    <lineSegments geometry={line} frustumCulled={false}><lineBasicMaterial color="#f2e5bf" transparent opacity={.68}/></lineSegments>
    <group ref={bobber} position={[0, .08, 3.1]}><mesh><sphereGeometry args={[.065, 8, 8]}/><meshStandardMaterial color="#e69a6b"/></mesh><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.04, 0]}><ringGeometry args={[.15, .17, 24]}/><meshBasicMaterial color="#efe0ac" transparent opacity={.5}/></mesh></group>
  </group>;
}

function LotusPickup({ x, z, index }: { x: number; z: number; index: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (group.current) { group.current.position.y = .38 + Math.sin(clock.elapsedTime * 1.8 + index) * .06; group.current.rotation.y = clock.elapsedTime * .4 + index; } });
  return <group position={[x, 0, z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .045, 0]}><ringGeometry args={[.36, .39, 24]}/><meshBasicMaterial color="#dcb3c3" transparent opacity={.65}/></mesh>
    <group ref={group} position={[0, .38, 0]}>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 3) * .15, 0, Math.cos(i * Math.PI / 3) * .15]} rotation={[.25, i * Math.PI / 3, .35]} scale={[.14, .28, .07]}><sphereGeometry args={[1, 8, 8]}/><meshStandardMaterial color={i % 2 ? '#dba0be' : '#edc3d0'} emissive="#b65d87" emissiveIntensity={.22} roughness={.7}/></mesh>)}
      <mesh position={[0, .04, 0]}><sphereGeometry args={[.095, 8, 8]}/><meshStandardMaterial color="#e7cc87" emissive="#b99b48" emissiveIntensity={.3}/></mesh>
    </group>
  </group>;
}

function RaceGate({ x, z, index, current }: { x: number; z: number; index: number; current: boolean }) {
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (pulse.current && current) pulse.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * .045); });
  return <group position={[x, .08, z]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.15, 1.23, 48]}/><meshBasicMaterial color={current ? '#f0d29b' : '#bacbbc'} transparent opacity={current ? .9 : .32}/></mesh>
    {[-1.18, 1.18].map(side => <mesh key={side} position={[side, .7, 0]}><cylinderGeometry args={[.035, .035, 1.4, 6]}/><meshStandardMaterial color={current ? GOLD : '#87988a'} emissive={current ? '#b7974f' : '#000'} emissiveIntensity={.35}/></mesh>)}
    <mesh ref={pulse} position={[0, 1.4, 0]}><torusGeometry args={[1.18, .035, 6, 48]}/><meshBasicMaterial color={current ? '#f0d29b' : '#c1d0bd'} transparent opacity={current ? .82 : .2}/></mesh>
    {current && <StationLabel text={`CỔNG ${index + 1}`} position={[0, 2.8, 0]}/>}
  </group>;
}

function Dummy() {
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!body.current) return;
    const events = useGame.getState().activityEffects;
    let hit: ActivityEffect | undefined;
    for (let index = events.length - 1; index >= 0; index--) if (events[index].kind === 'strike') { hit = events[index]; break; }
    const elapsed = hit ? (Date.now() - hit.at) / 1000 : 99;
    body.current.rotation.z = elapsed < .65 ? Math.sin(elapsed * 24) * .12 * Math.exp(-elapsed * 5) : Math.sin(clock.elapsedTime * .4) * .005;
  });
  return <group position={[TRAINING_SPOT.x, 0, TRAINING_SPOT.z]}>
    <mesh position={[0, .07, 0]} receiveShadow><cylinderGeometry args={[.75, .85, .12, 16]}/><meshStandardMaterial color="#7d8170" roughness={.95}/></mesh>
    <group ref={body}>
      <mesh position={[0, .8, 0]} castShadow><cylinderGeometry args={[.21, .25, 1.45, 12]}/><meshStandardMaterial color="#976c42" roughness={.85}/></mesh>
      <mesh position={[0, 1.25, .23]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.28, .28, .11, 16]}/><meshStandardMaterial color="#b7483d" roughness={.85}/></mesh>
      <mesh position={[0, 1.25, .294]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.18, .022, 6, 20]}/><meshStandardMaterial color="#e7cf9c"/></mesh>
      <mesh position={[.39, 1.08, 0]} rotation={[0, 0, -.23]}><boxGeometry args={[.48, .09, .1]}/><meshStandardMaterial color="#785534"/></mesh>
      <mesh position={[-.39, .99, 0]} rotation={[0, 0, .2]}><boxGeometry args={[.48, .09, .1]}/><meshStandardMaterial color="#785534"/></mesh>
      <mesh position={[0, 1.72, 0]} castShadow><sphereGeometry args={[.22, 12, 8]}/><meshStandardMaterial color="#b38c58" roughness={.75}/></mesh>
    </group>
    <StationLabel text="MỘC NHÂN · E" position={[0, 2.35, 0]} color="#e7bc99"/>
  </group>;
}

function Lantern({ index }: { index: number }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const cycle = (clock.elapsedTime * .28 + index * 1.7) % 12;
    group.current.position.set(LANTERN_SPOT.x + Math.sin(index * 2.4) * (1.1 + cycle * .12), .55 + cycle, LANTERN_SPOT.z + Math.cos(index * 1.8) * 1.4 - cycle * .2);
    group.current.rotation.y = clock.elapsedTime * .13 + index;
    group.current.rotation.z = Math.sin(clock.elapsedTime + index) * .055;
  });
  return <group ref={group}>
    <mesh><cylinderGeometry args={[.21, .16, .43, 6, 1, true]}/><meshStandardMaterial color={index % 3 ? '#e9bb7e' : '#de9d79'} emissive="#f7ad54" emissiveIntensity={1.15} side={THREE.DoubleSide} transparent opacity={.9}/></mesh>
    <mesh position={[0, -.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[.16, .016, 4, 6]}/><meshStandardMaterial color="#8c653c"/></mesh>
    <mesh position={[0, -.13, 0]}><sphereGeometry args={[.065, 8, 8]}/><meshBasicMaterial color="#ffdda5"/></mesh>
  </group>;
}

function EventEffect({ effect }: { effect: ActivityEffect }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const fish = effect.fish ? fishSpecies(effect.fish.speciesId) : undefined;
  const color = fish ? FISH_RARITIES[fish.rarity].color : effect.kind === 'lotus' ? '#e5b5cf' : GOLD;
  useFrame(() => {
    if (!group.current) return;
    const age = (Date.now() - effect.at) / 1000;
    group.current.visible = age >= 0 && age < 2;
    if (!group.current.visible) return;
    if (ring.current) ring.current.scale.setScalar(.3 + age * .75);
    if (effect.kind === 'catch') { group.current.position.y = .4 + Math.sin(Math.min(1, age / 1.6) * Math.PI) * 1.5; group.current.rotation.y = age * 3; }
  });
  return <group ref={group} position={[effect.x, .055, effect.z]}>
    {effect.kind === 'catch' ? <FishModel color={color} scale={.8}/> : <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[.3, .34, 32]}/><meshBasicMaterial color={color} transparent opacity={.55} depthWrite={false}/></mesh>}
  </group>;
}

export default function ActivityWorld() {
  const activity = useGame(state => state.activity);
  const room = useGame(state => state.activityRoom);
  const effects = useGame(state => state.activityEffects);
  const players = useGame(state => state.players);
  const localId = useGame(state => state.localId);
  const entered = useGame(state => state.entered);
  const localFishing = activity?.mode && ['fishing', 'fishing-contest'].includes(activity.mode) && ['waiting', 'bite'].includes(activity.phase);
  const remoteFishing = players.filter(player => player.id !== localId && String(player.animation) === 'fish');
  const collected = activity?.collected || [];
  const raceIndex = activity?.checkpoint || 0;
  const lanternCount = Math.min(24, room?.lanterns?.count || 0);
  const raceStart = ACTIVITY_MODES.find(mode => mode.id === 'race')!.location;
  return <group>
    <FishingStation/>
    <Dummy/>
    <group position={[LANTERN_SPOT.x, 0, LANTERN_SPOT.z]}><mesh position={[0, .2, 0]}><boxGeometry args={[.9, .35, .7]}/><meshStandardMaterial color="#735d40" roughness={.9}/></mesh><mesh position={[0, .57, 0]}><cylinderGeometry args={[.2, .16, .4, 6]}/><meshStandardMaterial color="#dfb57c" emissive="#ce853c" emissiveIntensity={.4}/></mesh><StationLabel text="THẢ ĐÈN · E" position={[0, 1.75, 0]}/></group>
    {entered && !activity?.mode && <StationLabel text="ĐƯỜNG ĐUA · HOẠT ĐỘNG" position={[raceStart.x, 2.8, raceStart.z]}/>}
    {entered && localFishing && <Rod x={0} z={0} local/>}
    {remoteFishing.map(player => <Rod key={player.id} x={player.x} z={player.z}/>)}
    {activity?.mode === 'lotus-hunt' && activity.phase !== 'finished' && LOTUS_POINTS.filter(point => !collected.includes(point.id)).map((point, index) => <LotusPickup key={point.id} x={point.x} z={point.z} index={index}/>)}
    {activity?.mode === 'race' && activity.phase !== 'finished' && RACE_CHECKPOINTS.map((point, index) => index >= raceIndex && <RaceGate key={index} x={point.x} z={point.z} index={index} current={index === raceIndex}/>)}
    {activity?.mode === 'memory' && <group position={[MEMORY_SPOT.x, 0, MEMORY_SPOT.z]}>{MEMORY_NOTES.map((note, index) => <mesh key={note.name} position={[(index - 1.5) * .38, 1.25, .8]}><sphereGeometry args={[.12, 10, 8]}/><meshStandardMaterial color={note.color} emissive={note.color} emissiveIntensity={.55}/></mesh>)}</group>}
    {Array.from({ length: lanternCount }, (_, index) => <Lantern key={`${room?.lanterns?.id}-${index}`} index={index}/>)}
    {effects.slice(-16).map((effect, index) => <EventEffect key={`${effect.playerId}-${effect.at}-${effect.kind}-${index}`} effect={effect}/>)}
  </group>;
}
