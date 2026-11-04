'use client';
import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Detailed,useGLTF,useTexture} from '@react-three/drei';
import * as THREE from 'three';
import {assetUrl,type GameAssetName} from '@/lib/assets';
import {isWalkable} from '@/lib/world-layout';
import {useGame} from '@/lib/game-store';

export function useSurface(kind:'stone'|'earth'|'moss',repeat:[number,number]=[1,1]){
  const quality=useGame(s=>s.quality);
  const sources=useTexture([assetUrl(`${kind}-color.jpg`),assetUrl(`${kind}-normal.jpg`),assetUrl(`${kind}-arm.jpg`)]);
  const textures=useMemo(()=>sources.map((source,index)=>{
    const texture=source.clone();texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(...repeat);
    texture.anisotropy=quality==='low'?2:quality==='medium'?4:8;texture.colorSpace=index===0?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;return texture;
  }),[sources,repeat[0],repeat[1],quality]);
  useEffect(()=>()=>textures.forEach(t=>t.dispose()),[textures]);
  return {map:textures[0],normalMap:textures[1],roughnessMap:textures[2],aoMap:textures[2],normalScale:new THREE.Vector2(.65,.65),aoMapIntensity:.6};
}

export function ScannedAsset({file,position=[0,0,0],height=1,rotation=0,shadow=true}:{file:GameAssetName;position?:[number,number,number];height?:number;rotation?:number;shadow?:boolean}){
  const {scene}=useGLTF(assetUrl(file));
  const fitted=useMemo(()=>{
    const instance=scene.clone(true),box=new THREE.Box3().setFromObject(instance),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const scale=height/Math.max(size.y,.01);
    instance.traverse(node=>{if((node as THREE.Mesh).isMesh){node.castShadow=shadow;node.receiveShadow=true;if(file==='garden-shrub.glb'){
      const mesh=node as THREE.Mesh;const originals=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const tinted=originals.map(original=>{const m=original.clone() as THREE.MeshStandardMaterial;m.color?.multiply(new THREE.Color('#7a9d50'));m.roughness=.9;return m;});
      mesh.material=Array.isArray(mesh.material)?tinted:tinted[0];
    }}});
    return {instance,scale,offset:[-center.x*scale,-box.min.y*scale,-center.z*scale] as [number,number,number]};
  },[scene,height,shadow,file]);
  useEffect(()=>()=>{if(file==='garden-shrub.glb')fitted.instance.traverse(node=>{const mesh=node as THREE.Mesh;if(mesh.isMesh)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>m.dispose());});},[file,fitted]);
  return <group position={position} rotation={[0,rotation,0]}><group scale={fitted.scale}><primitive object={fitted.instance} position={fitted.offset.map(v=>v/fitted.scale) as [number,number,number]} dispose={null}/></group></group>;
}

export function NaturalTree({position,scale=1,seed=1}:{position:[number,number,number];scale?:number;seed?:number}){
  const quality=useGame(s=>s.quality);
  const crown=useRef<THREE.Group>(null);
  const branches=useMemo(()=>[-1,1].map(side=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,1.5,0),new THREE.Vector3(side*.4,2.6,.05),new THREE.Vector3(side*1.1,3.8,.2),
  ]),8,.1,6,false)),[]);
  useEffect(()=>()=>branches.forEach(g=>g.dispose()),[branches]);
  useFrame(({clock})=>{if(crown.current)crown.current.rotation.z=Math.sin(clock.elapsedTime*.6+seed)*.012;});
  return <group position={position} scale={scale} rotation={[0,seed*.37,0]}>
    <mesh position={[0,1.8,0]} rotation={[0,0,.055]} castShadow={quality==='high'}><cylinderGeometry args={[.12,.33,3.6,10]}/><meshStandardMaterial color="#554738" roughness={.94}/></mesh>
    {branches.map((g,i)=><mesh key={i} geometry={g} castShadow={quality==='high'}><meshStandardMaterial color="#5e503a" roughness={1}/></mesh>)}
    <group ref={crown} position={[0,2.7,0]}>
      {quality==='low'?<TreeProxy/>:<Detailed distances={[0,quality==='high'?32:17]} hysteresis={.18}>
        <group><ScannedAsset file="garden-shrub.glb" height={3.8} rotation={seed} shadow={quality==='high'}/>{quality==='high'&&<ScannedAsset file="garden-shrub.glb" position={[.7,.4,-.35]} height={2.7} rotation={seed+2}/>}</group>
        <TreeProxy/>
      </Detailed>}
    </group>
  </group>;
}

function TreeProxy(){
  return <group>{[[-.7,1.1,0],[.6,1.3,-.2],[0,2,.1]].map(([x,y,z],i)=><mesh key={i} position={[x,y,z]} scale={[1.35,1,1.2]}><sphereGeometry args={[1,8,6]}/><meshStandardMaterial color={['#4c693c','#6b824c','#587943'][i]} roughness={1}/></mesh>)}</group>;
}

export function GardenDetails({quality}:{quality:'low'|'medium'|'high'}){
  return <>
    <GroundGrass quality={quality}/>
    {quality!=='low'&&<>
      <ScannedAsset file="boulder.glb" position={[-21,-.2,12]} height={2.1} rotation={.8}/>
      <ScannedAsset file="boulder.glb" position={[21,-.15,-17]} height={2.7} rotation={2.2}/>
      <ScannedAsset file="moss-rocks.glb" position={[-18,-.08,-3]} height={.75} rotation={.3}/>
      <ScannedAsset file="moss-rocks.glb" position={[12,-.08,18]} height={.9} rotation={2}/>
    </>}
    {[[ -20,8],[-21,10],[-20,-5],[-12,-10],[-16,-12],[17,-17],[19,-15],[21,18]].slice(0,quality==='low'?2:8).map(([x,z],i)=><ScannedAsset key={i} file="garden-fern.glb" position={[x,-.02,z]} height={.7+(i%3)*.16} rotation={i*1.9} shadow={quality==='high'}/>)}
  </>;
}

function GroundGrass({quality}:{quality:'low'|'medium'|'high'}){
  const ref=useRef<THREE.InstancedMesh>(null);
  const count=quality==='low'?180:quality==='medium'?550:1100;
  const time=useMemo(()=>({value:0}),[]);
  const geometry=useMemo(()=>{
    const positions:number[]=[],colors:number[]=[],indices:number[]=[];
    for(let blade=0;blade<3;blade++){
      const angle=blade*Math.PI/3,base=positions.length/3;
      for(const [x,y,z] of [[-.035,0,0],[.035,0,0],[.025,.6,.04],[0,1,.12]]){
        positions.push(x*Math.cos(angle)+z*Math.sin(angle),y,z*Math.cos(angle)-x*Math.sin(angle));
        colors.push(.13+y*.12,.23+y*.15,.055+y*.05);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));result.setIndex(indices);result.computeVertexNormals();return result;
  },[]);
  const material=useMemo(()=>{
    const result=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
    result.onBeforeCompile=shader=>{
      shader.uniforms.uGrassTime=time;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uGrassTime;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(uGrassTime*1.4 + instanceMatrix[3].x*.7 + instanceMatrix[3].z*.4)*position.y*position.y*.18;');
    };
    result.customProgramCacheKey=()=> 'vto-grass-v1';return result;
  },[time]);
  useEffect(()=>{
    if(!ref.current)return;
    const centers=[[-22,14],[-22,0],[-16,16],[13,-22],[21,-18],[21,20],[-12,22]],dummy=new THREE.Object3D();
    const random=(n:number)=>{const x=Math.sin(n*78.233)*43758.5453;return x-Math.floor(x);};
    let placed=0;
    for(let i=0;placed<count&&i<count*8;i++){
      const c=centers[i%centers.length],x=c[0]+(random(i+17)-.5)*6,z=c[1]+(random(i+401)-.5)*6;
      if(!isWalkable(x,z,.1))continue;
      dummy.position.set(x,-.1,z);dummy.rotation.set(0,random(i+71)*Math.PI*2,0);dummy.scale.setScalar(.2+random(i+123)*.35);dummy.updateMatrix();ref.current.setMatrixAt(placed++,dummy.matrix);
    }
    ref.current.count=placed;ref.current.instanceMatrix.needsUpdate=true;
  },[count]);
  useEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  useFrame(({clock})=>{time.value=clock.elapsedTime;});
  return <instancedMesh ref={ref} args={[geometry,material,count]} receiveShadow frustumCulled={false}/>;
}
