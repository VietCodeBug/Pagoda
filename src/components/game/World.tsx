"use client";

import { memo, Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { assetUrl } from "@/lib/assets";
import Atmosphere from './Atmosphere';
import {GardenDetails,NaturalTree,useSurface} from './SceneAssets';

type Quality = "low" | "medium" | "high";
type WorldProps = { quality: Quality; night: boolean; incenseUntil: number; bellAt: number };
const GOLD = "#bda060";
const WOOD = "#382d27";
const STONE = "#b9b6a1";
const rand = (n: number) => ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;

function Box({ position, size, color, ...props }: { position: [number, number, number]; size: [number, number, number]; color: string; rotation?: [number, number, number]; castShadow?: boolean; receiveShadow?: boolean }) {
  return <mesh position={position} castShadow receiveShadow {...props}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>;
}

/** Instances keep the courtyard and roof detail within a small draw-call budget. */
function Courtyard() {
  const earth=useSurface('earth',[38,38]);
  const paving=useSurface('stone',[1,1]);
  const garden=useSurface('moss',[4,3]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const stones = useMemo(() => {
    const rows: { x: number; z: number; color: string }[] = [];
    for (let row = 0; row < 24; row++) for (let col = 0; col < 15; col++) {
      const x = (col - 7) * 1.25;
      const z = row * 1.15 - 4;
      if (z > 16 && Math.abs(x) > 3.2) continue;
      rows.push({ x, z, color: ["#c9c6b3", "#bebcaa", "#d0ccb8", "#b9b7a5"][Math.floor(rand(row * 30 + col) * 4)] });
    }
    return rows;
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    stones.forEach((stone, i) => {
      matrix.makeTranslation(stone.x, -0.025, stone.z);
      ref.current!.setMatrixAt(i, matrix);
      ref.current!.setColorAt(i, new THREE.Color(stone.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [stones]);
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow><planeGeometry args={[170, 170]} /><meshStandardMaterial {...earth} color="#d3d7c5" roughness={1} /></mesh>
    <instancedMesh ref={ref} args={[undefined, undefined, stones.length]} receiveShadow><boxGeometry args={[1.21, 0.08, 1.11]} /><meshStandardMaterial {...paving} roughness={.86} /></instancedMesh>
    <mesh position={[0,-.035,-12.8]} receiveShadow><boxGeometry args={[15.6,.1,15.5]}/><meshStandardMaterial {...paving} color="#c1b7a1" roughness={.82}/></mesh>
    {[-7.8, 7.8].map(x => <Box key={x} position={[x, 0.025, -12.8]} size={[0.22, 0.06, 15.5]} color="#d3cbb0" />)}
    <Box position={[0, 0.035, -5.05]} size={[15.8, 0.1, 0.24]} color="#d3cbb0" />
    <mesh position={[-13.3,-.035,-7.7]} receiveShadow><boxGeometry args={[10.5,.08,8]}/><meshStandardMaterial {...garden} color="#c0c1aa" roughness={.95}/></mesh>
    <Box position={[-10.4, -0.025, -1.7]} size={[2.2, 0.08, 5]} color="#b2b09b" />
    <Box position={[13.6, -0.025, 3]} size={[10.8, 0.08, 2.1]} color="#b2b09b" />
    <Box position={[19, -0.025, 6]} size={[10.8, 0.08, 12.8]} color="#a3a28e" />
    <mesh position={[0, 0.028, 7.5]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[3.36, 3.41, 64]} /><meshStandardMaterial color="#a59a76" /></mesh>
    <mesh position={[0, 0.029, 7.5]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.95, 2.99, 64]} /><meshStandardMaterial color="#a59a76" /></mesh>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 4) * 1.25, 0.03, 7.5 + Math.cos(i * Math.PI / 4) * 1.25]} rotation={[-Math.PI / 2, 0, -i * Math.PI / 4]} scale={[0.5, 1.45, 1]}><circleGeometry args={[0.7, 24]} /><meshStandardMaterial color="#b5ae91" /></mesh>)}
  </>;
}

function roofHeight(x: number, z: number, w: number, d: number, h: number) {
  const sx = Math.abs(x) / w;
  const sz = Math.abs(z) / d;
  return h * Math.max(0, Math.min(1 - sz, (1 - sx) * 2.5)) + Math.pow(Math.max(sx, sz), 7) * 0.55;
}

function Roof({ width = 9.6, depth = 8.5, height = 2.5, y = 6.3, z = -12.6, quality }: { width?: number; depth?: number; height?: number; y?: number; z?: number; quality: Quality }) {
  const geo = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(width * 2, depth * 2, 40, 36);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setY(i, roofHeight(positions.getX(i), positions.getZ(i), width, depth, height));
    geometry.computeVertexNormals();
    return geometry;
  }, [width, depth, height]);
  const tileRef = useRef<THREE.InstancedMesh>(null);
  const rows = quality === "low" ? 20 : 34;
  const cols = quality === "low" ? 28 : 46;
  useEffect(() => {
    if (!tileRef.current) return;
    const dummy = new THREE.Object3D();
    let i = 0;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = (col / (cols - 1) - 0.5) * width * 1.98;
      const zz = (row / (rows - 1) - 0.5) * depth * 1.98;
      const yy = roofHeight(x, zz, width, depth, height);
      const slope = Math.atan2(roofHeight(x, zz + 0.05, width, depth, height) - roofHeight(x, zz - 0.05, width, depth, height), 0.1);
      dummy.position.set(x, yy + 0.06, zz);
      dummy.rotation.set(Math.PI / 2 + slope, 0, 0);
      dummy.updateMatrix();
      tileRef.current.setMatrixAt(i, dummy.matrix);
      tileRef.current.setColorAt(i, new THREE.Color(["#364e46", "#3f584c", "#485b4c", "#33483e"][Math.floor(rand(i + 91) * 4)]));
      i++;
    }
    tileRef.current.instanceMatrix.needsUpdate = true;
    if (tileRef.current.instanceColor) tileRef.current.instanceColor.needsUpdate = true;
  }, [width, depth, height, rows, cols]);
  const eaves = useMemo(() => {
    const edge = (side: number) => new THREE.CatmullRomCurve3(Array.from({ length: 31 }, (_, i) => {
      const x = (i / 30 - 0.5) * width * 2;
      return new THREE.Vector3(x, roofHeight(x, depth * side, width, depth, height) + 0.05, depth * side);
    }));
    return [-1, 1].map(side => new THREE.TubeGeometry(edge(side), 30, 0.09, 5, false));
  }, [width, depth, height]);
  useEffect(() => () => { geo.dispose(); eaves.forEach(g => g.dispose()); }, [geo, eaves]);
  return <group position={[0, y, z]}>
    <mesh geometry={geo} castShadow receiveShadow><meshStandardMaterial color="#293f39" side={THREE.DoubleSide} roughness={0.45} metalness={.14} /></mesh>
    <instancedMesh ref={tileRef} args={[undefined, undefined, rows * cols]} castShadow={quality === "high"}><cylinderGeometry args={[0.092, 0.092, depth * 2 / rows * 0.94, 5, 1, true, 0, Math.PI]} /><meshStandardMaterial roughness={0.42} metalness={.12} /></instancedMesh>
    {eaves.map((geometry, i) => <mesh key={i} geometry={geometry}><meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.42} /></mesh>)}
    <Box position={[0, height + 0.1, 0]} size={[width * 1.16, 0.18, 0.2]} color={GOLD} />
    {[-1, 1].map(side => <group key={side} position={[side * width * 0.59, height + 0.15, 0]} rotation={[0, 0, side * -0.5]}>
      <mesh rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[0.18, 0.85, 5]} /><meshStandardMaterial color={GOLD} metalness={0.35} roughness={0.55} /></mesh>
      <mesh position={[side * 0.18, 0.24, 0]}><sphereGeometry args={[0.13, 8, 8]} /><meshStandardMaterial color={GOLD} /></mesh>
    </group>)}
  </group>;
}

function Column({ x, z, height = 5.6 }: { x: number; z: number; height?: number }) {
  return <group position={[x, 0, z]}>
    <mesh position={[0, 0.16, 0]} castShadow receiveShadow><cylinderGeometry args={[0.48, 0.55, 0.32, 8]} /><meshStandardMaterial color="#8d8a79" /></mesh>
    <mesh position={[0, height / 2 + 0.3, 0]} castShadow><cylinderGeometry args={[0.23, 0.3, height, 12]} /><meshStandardMaterial color="#5a3429" roughness={0.7} /></mesh>
    {[0.45, height - 0.1, height + 0.2].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.32, 0.32, 0.12, 12]} /><meshStandardMaterial color={GOLD} metalness={0.35} roughness={0.65} /></mesh>)}
    <Box position={[0, height + 0.4, 0]} size={[0.9, 0.22, 0.9]} color={WOOD} />
    <Box position={[0, height + 0.65, 0]} size={[1.25, 0.24, 0.65]} color={WOOD} />
  </group>;
}

let glowTexture: THREE.CanvasTexture | undefined;
function getGlow() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.5)"); gradient.addColorStop(0.25, "rgba(255,255,255,0.18)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function Lantern({ position, night, seed = 0, scale = 1 }: { position: [number, number, number]; night: boolean; seed?: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + seed * 2) * 0.035; });
  return <group position={position} scale={scale} ref={ref}>
    <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.018, 0.018, 0.4, 5]} /><meshStandardMaterial color={WOOD} /></mesh>
    <mesh scale={[0.38, 0.46, 0.38]} position={[0, -0.35, 0]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#eac181" emissive="#ed9c3f" emissiveIntensity={night ? 1.1 : 0.35} roughness={0.7} /></mesh>
    {[-0.76, 0.06].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.21, 0.21, 0.08, 12]} /><meshStandardMaterial color={WOOD} /></mesh>)}
    <mesh position={[0, -0.98, 0]}><cylinderGeometry args={[0.03, 0.045, 0.35, 5]} /><meshStandardMaterial color="#9e4e37" /></mesh>
    {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 3) * 0.32, -0.35, Math.sin(i * Math.PI / 3) * 0.32]}><cylinderGeometry args={[0.012, 0.012, 0.67, 4]} /><meshStandardMaterial color="#9f683b" /></mesh>)}
    <sprite position={[0, -0.35, 0]} scale={[2.8, 2.8, 1]}><spriteMaterial map={getGlow()} color="#ffc46b" transparent opacity={night ? 0.35 : 0.12} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
  </group>;
}

function Sign({ text, position, size = [3.6, 0.86] }: { text: string; position: [number, number, number]; size?: [number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#322b25"; ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = "#b49c64"; ctx.lineWidth = 5; ctx.strokeRect(12, 12, 1000, 232);
    ctx.strokeStyle = "#786744"; ctx.lineWidth = 2; ctx.strokeRect(22, 22, 980, 212);
    ctx.fillStyle = "#e1cd96"; ctx.font = "500 90px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 512, 137);
    const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace; return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position}><boxGeometry args={[size[0], size[1], 0.12]} /><meshStandardMaterial map={texture} roughness={0.8} /></mesh>;
}

function Buddha({ path, position, height = 3.7, quality }: { path: string; position: [number, number, number]; height?: number; quality: Quality }) {
  const { scene } = useGLTF(path);
  const { clone, scale, offset } = useMemo(() => {
    const clone = scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clone);
    const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3());
    const scale = height / Math.max(size.y, 0.001);
    clone.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = quality === "high"; object.receiveShadow = true; } });
    return { clone, scale, offset: [-center.x * scale, -bounds.min.y * scale, -center.z * scale] as [number, number, number] };
  }, [scene, height, quality]);
  return <group position={position}><group position={offset} scale={scale}><primitive object={clone} /></group></group>;
}

function StatueFallback({ position }: { position: [number, number, number] }) {
  return <group position={position}>
    <mesh position={[0, 0.5, 0]} scale={[1.2, 0.5, 0.75]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#9c875a" roughness={0.75} /></mesh>
    <mesh position={[0, 1.3, 0]} scale={[0.7, 1.1, 0.5]}><sphereGeometry args={[1, 12, 10]} /><meshStandardMaterial color="#b49b64" roughness={0.75} /></mesh>
    <mesh position={[0, 2.45, 0]}><sphereGeometry args={[0.47, 12, 12]} /><meshStandardMaterial color="#b49b64" roughness={0.75} /></mesh>
  </group>;
}

function MainHall({ quality, night, incenseUntil }: Pick<WorldProps, "quality" | "night" | "incenseUntil">) {
  return <group>
    <Box position={[0, 2.55, -20.75]} size={[15.5, 5.1, 0.32]} color="#4a3529" />
    {[-7.55, 7.55].map(x => <group key={x}>
      <Box position={[x, 0.65, -13.4]} size={[0.25, 1.3, 14.5]} color="#b1a88e" />
      <Box position={[x, 4.35, -13.4]} size={[0.24, 1.2, 14.5]} color={WOOD} />
      {[-8, -10.5, -13, -15.5, -18].map(z => <group key={z}>
        <Box position={[x, 2.6, z]} size={[0.18, 2.7, 0.17]} color={WOOD} />
        {Array.from({ length: 4 }, (_, i) => <Box key={i} position={[x, 1.55 + i * 0.55, z]} size={[0.2, 0.05, 2.4]} color="#665039" />)}
      </group>)}
    </group>)}
    {[-6.4, 6.4].flatMap(x => [-7, -12, -18].map(z => <Column key={`${x}-${z}`} x={x} z={z} />))}
    {[-3, 3].map(x => <Column key={x} x={x} z={-18} height={6.5} />)}
    <Box position={[0, 5.75, -6.8]} size={[13.2, 0.42, 0.5]} color={WOOD} />
    <Box position={[0, 6.05, -12.5]} size={[14.7, 0.4, 14]} color="#3f3027" />
    <Roof quality={quality} />
    <Roof width={6.9} depth={5.4} height={1.85} y={8.3} z={-13.5} quality={quality} />
    <Sign text="TỊNH TÂM" position={[0, 5.55, -6.5]} size={[3.8, 0.92]} />
    {[-4.7, 4.7].map(x => <Lantern key={x} position={[x, 5.25, -6.2]} night={night} seed={x} scale={0.9} />)}
    {[-5, 5].map(x => <Lantern key={x} position={[x, 5.1, -12.8]} night={night} seed={x + 1} scale={0.8} />)}
    <Box position={[0, 0.32, -17.6]} size={[12.8, 0.65, 4.2]} color="#8c7a57" />
    <Box position={[0, 0.68, -17.6]} size={[12.9, 0.12, 4.3]} color="#c0ac78" />
    <Box position={[0, 1.1, -18]} size={[4.3, 0.72, 3.5]} color="#6a4b2d" />
    <Box position={[0, 1.5, -18]} size={[4.5, 0.14, 3.7]} color={GOLD} />
    <mesh position={[0, 4.1, -20.46]}><torusGeometry args={[1.98, 0.035, 6, 80]} /><meshStandardMaterial color={GOLD} emissive="#7c5c24" emissiveIntensity={0.4} /></mesh>
    <Suspense fallback={<StatueFallback position={[0, 1.55, -18]} />}><Buddha path={assetUrl('buddha-center.glb')} position={[0, 1.55, -18]} height={4.1} quality={quality} /></Suspense>
    {[-1, 1].map(side => <Suspense key={side} fallback={<StatueFallback position={[side * 4.6, 0.76, -17.7]} />}><Buddha path={assetUrl(side < 0 ? 'buddha-left.glb' : 'buddha-right.glb')} position={[side * 4.6, 0.76, -17.7]} height={3.35} quality={quality} /></Suspense>)}
    <Box position={[0, 1.25, -14]} size={[6.8, 0.22, 1.5]} color="#633e29" />
    <Box position={[0, 1.4, -14]} size={[7.1, 0.1, 1.7]} color={GOLD} />
    {[-2.8, 2.8].map(x => <Box key={x} position={[x, 0.65, -14]} size={[0.25, 1.25, 1.1]} color={WOOD} />)}
    <mesh position={[0, 1.64, -13.8]}><cylinderGeometry args={[0.65, 0.42, 0.43, 24]} /><meshStandardMaterial color="#8d794d" metalness={0.55} roughness={0.45} /></mesh>
    <mesh position={[0, 1.86, -13.8]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.62, 24]} /><meshStandardMaterial color="#887c68" /></mesh>
    {[-0.28, -0.08, 0.12, 0.32].map((x, i) => <group key={x} position={[x, 1.88, -13.8 + (i % 2) * 0.12]}>
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.014, 0.014, 0.8, 5]} /><meshStandardMaterial color="#a74930" /></mesh>
      <mesh position={[0, 0.805, 0]}><sphereGeometry args={[0.027, 6, 6]} /><meshBasicMaterial color="#ffb45a" /></mesh>
    </group>)}
    {[-2.3, 2.3].map(x => <group key={x} position={[x, 1.5, -14]}>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.11, 0.2, 0.6, 12]} /><meshStandardMaterial color={GOLD} metalness={0.4} roughness={0.5} /></mesh>
      <mesh position={[0, 0.7, 0]}><cylinderGeometry args={[0.065, 0.065, 0.28, 10]} /><meshStandardMaterial color="#f4dec0" /></mesh>
      <mesh position={[0, 0.92, 0]} scale={[0.045, 0.12, 0.045]}><sphereGeometry args={[1, 8, 8]} /><meshBasicMaterial color="#ffd585" /></mesh>
      <sprite position={[0, 0.92, 0]} scale={[1.1, 1.1, 1]}><spriteMaterial map={getGlow()} color="#ffb54a" opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>
    </group>)}
    <IncenseSmoke until={incenseUntil} quality={quality} />
    <pointLight position={[0, 4, -14.5]} intensity={night ? 35 : 18} color="#ffbd75" distance={15} decay={2} />
    {[-2.1, 0, 2.1].map(x => <mesh key={x} position={[x, 0.05, -9.6]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.64, 32]} /><meshStandardMaterial color="#88795a" roughness={1} /></mesh>)}
  </group>;
}

function IncenseSmoke({ until, quality }: { until: number; quality: Quality }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const count = quality === "low" ? 18 : quality === "medium" ? 40 : 64;
    const geo = new THREE.BufferGeometry();
    const position = new Float32Array(count * 3), seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { seeds[i * 3] = rand(i + 431); seeds[i * 3 + 1] = rand(i + 734); seeds[i * 3 + 2] = rand(i + 987); }
    geo.setAttribute("position", new THREE.BufferAttribute(position, 3)); geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    return geo;
  }, [quality]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uBoost: { value: 0 } }), []);
  useFrame(({ clock }) => { if (material.current) { material.current.uniforms.uTime.value = clock.elapsedTime; material.current.uniforms.uBoost.value = Date.now() < until ? 1 : 0.3; } });
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <points position={[0, 2.5, -13.8]} geometry={geometry} frustumCulled={false}>
    <shaderMaterial ref={material} uniforms={uniforms} transparent depthWrite={false}
      vertexShader={`attribute vec3 aSeed; uniform float uTime; uniform float uBoost; varying float vAlpha; void main(){float life=fract(aSeed.x+uTime*.095);vec3 p=position; p.y=life*3.2; p.x=sin(life*8.+aSeed.y*6.+uTime*.4)*(.03+life*.45)+(aSeed.z-.5)*.35;p.z=cos(life*7.+aSeed.z*5.)*life*.3;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(90.,(18.+life*65.)/-mv.z);vAlpha=sin(life*3.14159)*.24*uBoost;}`}
      fragmentShader={`varying float vAlpha; void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-d),2.)*vAlpha;gl_FragColor=vec4(.8,.79,.72,a);}`} />
  </points>;
}

function Tree({ position, scale = 1, seed = 1, blossom = false }: { position: [number, number, number]; scale?: number; seed?: number; blossom?: boolean }) {
  return <NaturalTree position={position} scale={scale} seed={seed+(blossom?5:0)}/>;
}

function Rock({ position, scale = 1, seed = 0 }: { position: [number, number, number]; scale?: number; seed?: number }) {
  return <mesh position={position} rotation={[0.1, seed, 0.2]} scale={[scale * 1.15, scale * 0.66, scale]} castShadow receiveShadow><dodecahedronGeometry args={[1, 0]} /><meshStandardMaterial color={["#8b8d7c", "#9d9f8b", "#767e6d"][Math.abs(Math.floor(seed)) % 3]} roughness={1} /></mesh>;
}

function Pond({ quality, night }: { quality: Quality; night: boolean }) {
  const water = useRef<THREE.ShaderMaterial>(null);
  const fish = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uNight: { value: 0 } }), []);
  useFrame(({ clock }) => {
    if (water.current) { water.current.uniforms.uTime.value = clock.elapsedTime; water.current.uniforms.uNight.value = night ? 1 : 0; }
    if (fish.current) fish.current.children.forEach((object, i) => {
      const t = clock.elapsedTime * (0.1 + i * 0.008) + i * 1.4;
      object.position.set(Math.cos(t) * (2.5 + i * 0.15), -0.01, Math.sin(t) * (3.8 - i * 0.17));
      object.rotation.y = -Math.atan2(-Math.sin(t) * (2.5 + i * 0.15), Math.cos(t) * (3.8 - i * 0.17));
    });
  });
  return <group position={[-15, 0, 5]}>
    <mesh position={[0, -0.055, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.1, 6.45, 1]}><circleGeometry args={[1, 64]} /><meshPhysicalMaterial color="#29594e" roughness={0.1} metalness={.25} clearcoat={1} clearcoatRoughness={.12} envMapIntensity={1.4}/></mesh>
    <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[5.1, 6.45, 1]}>
      <circleGeometry args={[1, 64]} />
      <shaderMaterial ref={water} uniforms={uniforms} transparent depthWrite={false}
        vertexShader={`varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
        fragmentShader={`varying vec2 vUv;uniform float uTime;uniform float uNight;void main(){vec2 uv=vUv*25.;float a=sin(uv.x*.8+sin(uv.y+uTime*.25)+uTime*.3);float b=sin(uv.y*1.2+sin(uv.x*.7-uTime*.2));float line=pow(max(0.,1.-abs(a+b)*.6),9.);vec3 c=mix(vec3(.38,.56,.47),vec3(.65,.72,.60),line*.45);c*=mix(1.,.44,uNight);gl_FragColor=vec4(c,.54);}`} />
    </mesh>
    {Array.from({ length: quality === "low" ? 20 : 32 }, (_, i) => { const t = i / (quality === "low" ? 20 : 32) * Math.PI * 2; return <Rock key={i} position={[Math.cos(t) * 5.35, 0.14, Math.sin(t) * 6.7]} scale={0.42 + rand(i) * 0.34} seed={i} />; })}
    <group ref={fish}>{Array.from({ length: 6 }, (_, i) => <group key={i}>
      <mesh scale={[0.12, 0.045, 0.4]}><sphereGeometry args={[1, 8, 8]} /><meshBasicMaterial color={i % 2 ? "#e8ba79" : "#da825c"} transparent opacity={0.76} /></mesh>
      <mesh position={[0, 0, -0.36]} rotation={[Math.PI / 2, 0, Math.PI / 4]}><coneGeometry args={[0.15, 0.2, 4]} /><meshBasicMaterial color="#dbaa7d" transparent opacity={0.66} /></mesh>
    </group>)}</group>
    {[[2.4, 3.2], [-2.6, -2.2], [3, 0.5]].map(([x, z], i) => <group key={i} position={[x, 0.02, z]}>
      <mesh rotation={[-Math.PI / 2, 0, i]}><circleGeometry args={[0.42, 24, 0.2, Math.PI * 1.82]} /><meshStandardMaterial color="#809664" side={THREE.DoubleSide} /></mesh>
      <mesh position={[0.04, 0.06, 0]} scale={[0.12, 0.09, 0.12]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#e7bfaf" /></mesh>
    </group>)}
  </group>;
}

function BellTower({ night, bellAt }: { night: boolean; bellAt: number }) {
  const bell = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!bell.current) return;
    const elapsed = (Date.now() - bellAt) / 1000;
    bell.current.rotation.z = elapsed >= 0 && elapsed < 8 ? Math.sin(elapsed * 8) * Math.exp(-elapsed * 0.7) * 0.15 : 0;
  });
  return <group position={[10, 0, -5]}>
    <Box position={[0, -0.01, 0]} size={[4.4, 0.1, 4.4]} color="#a9a58f" />
    {[-1.6, 1.6].flatMap(x => [-1.6, 1.6].map(z => <Column key={`${x}-${z}`} x={x} z={z} height={3.5} />))}
    <Box position={[0, 3.9, 0]} size={[3.5, 0.3, 3.5]} color={WOOD} />
    <group position={[0, -0.05, 0]}><Roof width={2.6} depth={2.6} height={1.15} y={4.2} z={0} quality="low" /></group>
    <group position={[0, 3.8, 0]} ref={bell}>
      <mesh position={[0, -0.35, 0]}><torusGeometry args={[0.17, 0.045, 6, 12]} /><meshStandardMaterial color="#8f7547" metalness={0.6} roughness={0.5} /></mesh>
      <mesh position={[0, -1.15, 0]} castShadow><cylinderGeometry args={[0.42, 0.7, 1.25, 24, 1, true]} /><meshStandardMaterial color="#9d8854" metalness={0.65} roughness={0.45} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, -0.55, 0]} scale={[0.42, 0.24, 0.42]}><sphereGeometry args={[1, 20, 10]} /><meshStandardMaterial color="#9d8854" metalness={0.65} roughness={0.45} /></mesh>
      {[-1.72, -1.64, -0.75].map(y => <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[y < -1.6 ? 0.68 : 0.48, 0.035, 5, 24]} /><meshStandardMaterial color="#bfaa72" metalness={0.5} roughness={0.5} /></mesh>)}
    </group>
    <Lantern position={[0, 3.6, 1.9]} scale={0.6} night={night} />
  </group>;
}

function Garden() {
  return <group>
    {[[-19, -11], [-16, -12], [-13, -12.5], [-10, -12]].map(([x, z], i) => <Tree key={i} position={[x, 0, z]} scale={0.8 + i * 0.08} seed={i + 25} />)}
    {[[-17.6, -7.5], [-15.3, -7.5], [-13, -7.5]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position={[0, 0.13, 0]} receiveShadow castShadow><cylinderGeometry args={[0.67, 0.7, 0.22, 24]} /><meshStandardMaterial color={i === 1 ? "#9d8e6a" : "#7f8262"} roughness={1} /></mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.53, 0.55, 32]} /><meshStandardMaterial color="#c6b78d" /></mesh>
    </group>)}
    <Box position={[-15, 0.04, -9.8]} size={[8.8, 0.09, 0.18]} color="#c5bda2" />
    {Array.from({ length: 13 }, (_, i) => <group key={i} position={[-22 + rand(i + 100) * 2.8, 0, -14 + rand(i + 120) * 7]}>
      <mesh position={[0, 2, 0]} rotation={[0.01, 0, (rand(i + 130) - 0.5) * 0.1]} castShadow><cylinderGeometry args={[0.055, 0.07, 4, 6]} /><meshStandardMaterial color="#74815c" /></mesh>
      {[1, 2, 3].map(y => <mesh key={y} position={[0, y, 0]}><cylinderGeometry args={[0.074, 0.074, 0.035, 6]} /><meshStandardMaterial color="#4f6546" /></mesh>)}
      <mesh position={[0.3, 3.3, 0]} rotation={[0, i, -0.6]} scale={[1, 0.25, 0.6]}><icosahedronGeometry args={[0.7, 0]} /><meshStandardMaterial color="#788653" /></mesh>
    </group>)}
  </group>;
}

function Arena() {
  return <group position={[19, 0, 6]}>
    <Box position={[0, 0.01, 0]} size={[8.8, 0.06, 10.8]} color="#a3a18a" />
    {[-1, 1].map(side => <group key={side}>
      <Box position={[side * 4.4, 0.055, 0]} size={[0.1, 0.03, 10.8]} color="#cdc29c" />
      <Box position={[0, 0.055, side * 5.4]} size={[8.9, 0.03, 0.1]} color="#cdc29c" />
    </group>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}><ringGeometry args={[2.5, 2.56, 64]} /><meshStandardMaterial color="#c1b18a" /></mesh>
    {[[-3.8, -4.7], [3.8, -4.7], [3.8, 4.7], [-3.8, 4.7]].map(([x, z], i) => <group key={i} position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]} castShadow><cylinderGeometry args={[0.12, 0.15, 1.2, 8]} /><meshStandardMaterial color="#7c6245" /></mesh>
      <mesh position={[0, 1.24, 0]}><sphereGeometry args={[0.15, 8, 8]} /><meshStandardMaterial color={GOLD} /></mesh>
    </group>)}
    <Box position={[0, 1.5, -6.05]} size={[0.16, 3, 0.15]} color={WOOD} />
    <Sign text="VÕ ĐƯỜNG" position={[0, 2.7, -5.95]} size={[2.9, 0.67]} />
    <Rock position={[4.9, 0.45, -5.7]} scale={0.8} seed={5} />
    <Tree position={[6.6, 0, -5.1]} scale={0.85} seed={41} />
  </group>;
}

function StoneLantern({ position, night }: { position: [number, number, number]; night: boolean }) {
  return <group position={position}>
    <Box position={[0, 0.1, 0]} size={[0.8, 0.2, 0.8]} color="#8d8f7d" />
    <mesh position={[0, 0.65, 0]} castShadow><cylinderGeometry args={[0.15, 0.22, 1, 6]} /><meshStandardMaterial color="#9d9e88" /></mesh>
    <Box position={[0, 1.1, 0]} size={[0.65, 0.15, 0.65]} color="#a9aa93" />
    <Box position={[0, 1.4, 0]} size={[0.42, 0.55, 0.42]} color="#8a8c76" />
    <Box position={[0, 1.42, 0.217]} size={[0.22, 0.3, 0.02]} color="#e0ba74" />
    <mesh position={[0, 1.82, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[0.63, 0.3, 4]} /><meshStandardMaterial color="#8e917b" /></mesh>
    <mesh position={[0, 2.02, 0]}><sphereGeometry args={[0.1, 8, 8]} /><meshStandardMaterial color="#8a8d77" /></mesh>
    {night && <sprite position={[0, 1.45, 0.25]} scale={[2.1, 2.1, 1]}><spriteMaterial map={getGlow()} color="#ffcd76" opacity={0.34} depthWrite={false} blending={THREE.AdditiveBlending} /></sprite>}
  </group>;
}

function Gate({ night }: { night: boolean }) {
  return <group position={[0, 0, 23]}>
    {[-4, 4].map(x => <group key={x}>
      <Box position={[x, 0.35, 0]} size={[1.2, 0.7, 1.2]} color="#999b85" />
      <Box position={[x, 2.4, 0]} size={[0.78, 4.1, 0.78]} color="#bbb69d" />
      <Box position={[x, 4.6, 0]} size={[1.1, 0.3, 1.1]} color="#9d9b83" />
      <Lantern position={[x, 4.1, -0.65]} night={night} scale={0.75} />
    </group>)}
    <Box position={[0, 4.8, 0]} size={[8.8, 0.35, 0.8]} color={WOOD} />
    <Roof width={5.4} depth={1.8} height={1.05} y={5.05} z={0} quality="low" />
    <Sign text="AN NHIÊN" position={[0, 4.24, -0.44]} size={[3.3, 0.76]} />
  </group>;
}

function Boundary() {
  return <group>
    {[-25.5, 25.5].map(x => <group key={x}>
      <Box position={[x, 0.72, -1.5]} size={[0.45, 1.5, 49]} color="#aca990" />
      <Box position={[x, 1.52, -1.5]} size={[0.68, 0.13, 49]} color="#6f7b66" />
      {Array.from({ length: 9 }, (_, i) => <Box key={i} position={[x, 1.05, -24 + i * 5.7]} size={[0.8, 2.1, 0.8]} color="#a39f88" />)}
    </group>)}
    <Box position={[0, 0.75, -25.5]} size={[51, 1.5, 0.45]} color="#aca990" />
    <Box position={[0, 1.55, -25.5]} size={[51.2, 0.15, 0.65]} color="#6f7b66" />
    {[-14.8, 14.8].map(x => <Box key={x} position={[x, 0.7, 23.3]} size={[20.5, 1.4, 0.45]} color="#aca990" />)}
    {Array.from({ length: 14 }, (_, i) => <Tree key={i} position={[-30 + i * 4.9, -0.2, -28 - rand(i + 66) * 5]} scale={1.6 + rand(i + 66) * 0.8} seed={i + 99} />)}
  </group>;
}

function Mountains({ night }: { night: boolean }) {
  return <group>
    {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[-95 + i * 20, -5, -75 - rand(i + 200) * 25]} rotation={[0, i * 0.8, 0]} scale={[1.3, 1.5 + rand(i + 300) * 1.5, 1]}>
      <coneGeometry args={[19 + rand(i + 235) * 9, 20 + rand(i + 238) * 17, 5]} /><meshStandardMaterial color={night ? "#293c47" : ["#8c9b8c", "#98a596", "#809483"][i % 3]} flatShading roughness={1} />
    </mesh>)}
    <mesh position={[-35, 34, -85]}><sphereGeometry args={[4.5, 32, 32]} /><meshBasicMaterial color={night ? "#ede6c8" : "#ffe3b1"} /></mesh>
  </group>;
}

function Petals({ quality }: { quality: Quality }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = quality === "low" ? 18 : quality === "medium" ? 42 : 72;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = rand(i + 812);
      dummy.position.set(((seed * 30 + t * 0.34) % 42) - 23, ((rand(i + 921) * 12 - t * (0.2 + seed * 0.17)) % 12 + 12) % 12, rand(i + 531) * 42 - 20 + Math.sin(t * 0.3 + i) * 0.4);
      dummy.rotation.set(t * 0.5 + i, t * 0.4 + i, t * 0.8 + i);
      dummy.scale.setScalar(0.05 + seed * 0.045); dummy.updateMatrix(); ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}><planeGeometry args={[1, 0.65]} /><meshStandardMaterial color="#e8c2ad" side={THREE.DoubleSide} roughness={1} transparent opacity={0.85} /></instancedMesh>;
}

function World({ quality, night, incenseUntil, bellAt }: WorldProps) {
  return <>
    <Atmosphere night={night} quality={quality}/>
    <Courtyard />
    <MainHall quality={quality} night={night} incenseUntil={incenseUntil} />
    <Pond quality={quality} night={night} />
    <Garden />
    <BellTower night={night} bellAt={bellAt} />
    <Arena />
    <Gate night={night} />
    <Boundary />
    <GardenDetails quality={quality}/>
    <Tree position={[-18, 0, 16]} scale={1.2} seed={3} blossom />
    <Tree position={[23, 0, 15]} scale={1.2} seed={15} blossom />
    <Tree position={[-22, 0, 14]} scale={1.1} seed={26} />
    <Tree position={[19, 0, 17]} scale={1.1} seed={37} />
    <Tree position={[-21, 0, -2]} scale={1.1} seed={48} blossom />
    <Tree position={[15, 0, -18]} scale={1.2} seed={59} />
    {[[-7, 14], [7, 14], [-7, 0], [7, 0], [-10, -8], [14, -3]].map(([x, z], i) => <StoneLantern key={i} position={[x, 0, z]} night={night} />)}
    {[[-8.6, 8], [8.8, 9], [-10, -17], [19, -19], [-21, 18], [23, 19]].map(([x, z], i) => <group key={i}>
      <Rock position={[x, 0.3, z]} scale={0.7 + rand(i) * 0.6} seed={i} />
      <mesh position={[x + 0.8, 0.35, z + 0.4]} scale={[1.1, 0.6, 0.8]}><icosahedronGeometry args={[0.7, 1]} /><meshStandardMaterial color="#7b8d59" roughness={1} /></mesh>
    </group>)}
    <Petals quality={quality} />
  </>;
}

export default memo(World);
