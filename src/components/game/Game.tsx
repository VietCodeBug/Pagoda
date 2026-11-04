'use client';
import {Component,Suspense,useEffect,useState,type ReactNode} from 'react';
import {Canvas} from '@react-three/fiber';
import {useProgress} from '@react-three/drei';
import {Physics} from '@react-three/rapier';
import {Bloom,EffectComposer,Vignette} from '@react-three/postprocessing';
import * as THREE from 'three';
import World from './World';
import Controller,{OtherPlayers,WorldColliders,ScenicCamera} from './Controller';
import HUD from './HUD';
import Network from './Network';
import {useGame} from '@/lib/game-store';
import FrameBudget from './FrameBudget';

class RenderBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="boot-screen"><span className="boot-lotus">✧</span><h2>Chưa thể mở không gian 3D</h2><p>Hãy bật tăng tốc đồ họa của trình duyệt rồi tải lại.</p><button className="primary-button" onClick={()=>location.reload()}>Thử lại</button></div>:this.props.children;}
}
function Loading(){
  const {active,progress}=useProgress();const [done,setDone]=useState(false);
  useEffect(()=>{if(!active){const timer=setTimeout(()=>setDone(true),800);return()=>clearTimeout(timer);}},[active]);
  if(done)return null;
  return <div className="loading-veil"><div className="loading-mark">✧</div><span>Đang chuẩn bị không gian</span><div className="loading-track"><i style={{width:`${progress||5}%`}}/></div><small>{Math.round(progress)}%</small></div>;
}
export default function Game(){
  const quality=useGame(s=>s.quality),night=useGame(s=>s.night),entered=useGame(s=>s.entered),incenseUntil=useGame(s=>s.incenseUntil),bellAt=useGame(s=>s.bellAt);
  const [contextLost,setContextLost]=useState(false);
  const [renderDpr,setRenderDpr]=useState(1);
  return <main className="game-shell">
    <RenderBoundary>
      <Canvas shadows={quality!=='low'} dpr={renderDpr}
        camera={{position:[19,13,23],fov:48,near:.1,far:430}}
        gl={{antialias:quality!=='low',alpha:false,powerPreference:'high-performance',toneMapping:THREE.ACESFilmicToneMapping}}
        onCreated={({gl})=>{gl.toneMappingExposure=.85;gl.domElement.addEventListener('webglcontextlost',(e)=>{e.preventDefault();setContextLost(true);});}}>
        <FrameBudget quality={quality} enabled={entered} onScale={setRenderDpr}/>
        <Suspense fallback={null}>
          <World quality={quality} night={night} incenseUntil={incenseUntil} bellAt={bellAt}/>
          <Physics gravity={[0,-9.81,0]} timeStep={1/60} interpolate updatePriority={-1}>
            <WorldColliders/>
            {entered?<Controller/>:<ScenicCamera/>}
          </Physics>
          <OtherPlayers/>
          {quality==='high'&&<EffectComposer><Bloom luminanceThreshold={1.15} intensity={.45} mipmapBlur/><Vignette eskil={false} offset={.25} darkness={.32}/></EffectComposer>}
        </Suspense>
      </Canvas>
    </RenderBoundary>
    <div className={`scene-grade ${entered?'in-game':''}`} aria-hidden="true"/>
    <HUD/>
    <Network/>
    <Loading/>
    {contextLost&&<div className="modal-backdrop"><div className="dialog"><h2>Kết nối đồ họa bị gián đoạn</h2><p>Hãy tải lại để tiếp tục hành trình.</p><button className="primary-button" onClick={()=>location.reload()}>Tải lại</button></div></div>}
  </main>;
}
