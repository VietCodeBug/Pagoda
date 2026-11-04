'use client';
import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Environment,Stars} from '@react-three/drei';
import * as THREE from 'three';
import {assetUrl} from '@/lib/assets';

function Landscape({night}:{night:boolean}){
  const geometry=useMemo(()=>{
    const geo=new THREE.PlaneGeometry(420,330,160,110);geo.rotateX(-Math.PI/2);
    const p=geo.getAttribute('position'),colors=new Float32Array(p.count*3),color=new THREE.Color();
    const base=new THREE.Color(night?'#243c47':'#45645b'),high=new THREE.Color(night?'#52616a':'#8a9c91');
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i)-60,r=Math.hypot(x,z);
      const edge=THREE.MathUtils.smoothstep(r,58,125);
      const peaks=5+14*Math.sin(x*.026+z*.012)**2+8*Math.sin(x*.045-z*.023)**2;
      const detail=Math.sin(x*.12+Math.sin(z*.08))*2+Math.sin(z*.17+x*.07)*1.5;
      const y=-5+edge*(peaks+detail);p.setY(i,y);
      color.copy(base).lerp(high,THREE.MathUtils.clamp((y-12)/55,0,.8));color.multiplyScalar(.92+Math.sin(x*.09+z*.04)*.08);
      colors[i*3]=color.r;colors[i*3+1]=color.g;colors[i*3+2]=color.b;
    }
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();return geo;
  },[night]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} position={[0,-1,-60]}><meshStandardMaterial vertexColors roughness={1}/></mesh>;
}

function Birds(){
  const group=useRef<THREE.Group>(null);
  useFrame(({clock})=>{if(!group.current)return;const t=clock.elapsedTime;group.current.position.set(Math.sin(t*.025)*50,24+Math.sin(t*.08)*2,-42);group.current.rotation.y=Math.cos(t*.025)*.4;group.current.children.forEach((bird,i)=>{bird.rotation.z=Math.sin(t*3+i)*.12;});});
  return <group ref={group}>{Array.from({length:7},(_,i)=><group key={i} position={[i*2.4,(i%3)*.6,-Math.abs(i-3)*1.5]} scale={.6}>
    {[-1,1].map(side=><mesh key={side} position={[side*.45,0,0]} rotation={[0,0,side*.22]} scale={[1,.08,.3]}><sphereGeometry args={[.6,7,4]}/><meshBasicMaterial color="#3c4140"/></mesh>)}
  </group>)}</group>;
}

export default function Atmosphere({night,quality}:{night:boolean;quality:'low'|'medium'|'high'}){
  return <>
    <Environment files={assetUrl('golden-sky.hdr')} background backgroundBlurriness={0} backgroundIntensity={night?.055:.85} environmentIntensity={night?.16:.62} environmentRotation={[0,-.7,0]} backgroundRotation={[0,-.7,0]}/>
    <fog attach="fog" args={[night?'#182a37':'#c2b5a0',70,quality==='low'?190:270]}/>
    <ambientLight color={night?'#9daecb':'#fff0d6'} intensity={night?.18:.2}/>
    <hemisphereLight args={[night?'#8aa8cb':'#e8e9e1',night?'#161f20':'#655b42',night?.36:.48]}/>
    <directionalLight position={[-35,24,35]} intensity={night?.8:3.4} color={night?'#adc8ed':'#ffdda5'} castShadow={quality!=='low'} shadow-mapSize={[quality==='high'?2048:1024,quality==='high'?2048:1024]} shadow-camera-left={-31} shadow-camera-right={31} shadow-camera-top={31} shadow-camera-bottom={-31} shadow-camera-near={1} shadow-camera-far={110} shadow-normalBias={.055} shadow-bias={-.00015} shadow-radius={3}/>
    <Landscape night={night}/>
    {night?<><Stars radius={180} depth={70} count={quality==='low'?700:2200} factor={2} saturation={0} fade speed={.2}/><mesh position={[-55,65,-120]}><sphereGeometry args={[3.2,32,32]}/><meshBasicMaterial color="#eee6d0"/></mesh></>:<Birds/>}
  </>;
}
