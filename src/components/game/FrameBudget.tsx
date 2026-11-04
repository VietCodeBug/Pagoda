'use client';
import {useEffect,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import type {Quality} from '@/lib/game-store';

/** Hysteresis avoids resolution oscillation while keeping the chosen art preset. */
export default function FrameBudget({quality,enabled,onScale}:{quality:Quality;enabled:boolean;onScale:(dpr:number)=>void}){
  const budget=useRef({scale:1,max:1,frames:0,elapsed:0,stable:0,warmUntil:0});
  useEffect(()=>{
    const max=Math.max(.8,Math.min(window.devicePixelRatio||1,quality==='high'?1.5:quality==='medium'?1.1:1));
    budget.current={scale:max,max,frames:0,elapsed:0,stable:0,warmUntil:performance.now()+1800};onScale(max);
  },[quality,enabled,onScale]);
  useFrame((_,dt)=>{
    const b=budget.current;
    if(!enabled||document.visibilityState!=='visible'||performance.now()<b.warmUntil){b.frames=0;b.elapsed=0;return;}
    b.frames++;b.elapsed+=Math.min(dt,.5);
    if(b.elapsed<1.8)return;
    const fps=b.frames/b.elapsed;b.frames=0;b.elapsed=0;
    if(fps<47&&b.scale>.75){b.scale=Math.max(.75,Math.round(b.scale*.85*100)/100);b.stable=0;onScale(b.scale);}
    else if(fps>58&&++b.stable>=4&&b.scale<b.max){b.scale=Math.min(b.max,Math.round((b.scale+.05)*100)/100);b.stable=0;onScale(b.scale);}
    else if(fps<=58)b.stable=0;
  });
  return null;
}
