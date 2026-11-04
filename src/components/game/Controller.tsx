'use client';
import {Suspense,useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {ConvexHullCollider,CuboidCollider,RigidBody} from '@react-three/rapier';
import {Ecctrl,type EcctrlHandle} from 'ecctrl';
import * as THREE from 'three';
import Avatar,{SimpleAvatar} from './Avatar';
import {playAction,runtime,showToast,useGame,type AnimationName} from '@/lib/game-store';
import {findPath,INTERACTIONS,isInArena,OBSTACLES,POND} from '@/lib/world-layout';
import type {Player} from '@/lib/protocol';
import {ringBell} from '@/lib/audio';

const cameraBoxes=OBSTACLES.map(o=>new THREE.Box3(new THREE.Vector3(o.x-o.hx,-.1,o.z-o.hz),new THREE.Vector3(o.x+o.hx,o.height,o.z+o.hz)));
cameraBoxes.push(new THREE.Box3(new THREE.Vector3(-9.6,6.05,-21.1),new THREE.Vector3(9.6,9.3,-4.1)));
cameraBoxes.push(new THREE.Box3(new THREE.Vector3(-6.9,8.3,-18.9),new THREE.Vector3(6.9,10.7,-8.1)));
cameraBoxes.push(new THREE.Box3(new THREE.Vector3(7.4,4.1,-7.6),new THREE.Vector3(12.6,5.9,-2.4)));
cameraBoxes.push(new THREE.Box3(new THREE.Vector3(-5.4,5,21.2),new THREE.Vector3(5.4,6.65,24.8)));
export function interact(){
  const state=useGame.getState();if(!state.entered||state.panel!=='none'||state.chatOpen||state.hp<=0)return;
  if(state.action==='sit'){playAction('idle',0);return;}
  if(Date.now()<state.actionUntil)return;
  const near=state.nearby;
  if(!near){showToast('Đến gần bàn hương, vườn thiền hoặc tháp chuông để tương tác.');return;}
  if(near.id==='incense'){useGame.setState({panel:'prayer'});return;}
  if(near.id==='sit'){playAction('sit',Infinity);return;}
  if(near.id==='combat'){
    if(state.status!=='online'){showToast('Kết nối phòng online để tham gia giao đấu.');return;}
    runtime.send({type:'combat',enabled:!state.inCombat});return;
  }
  runtime.path=[];
  useGame.setState({action:'bow',actionUntil:Date.now()+2000});
  if(state.status==='online')runtime.send({type:'action',action:'bell'});
  else {useGame.setState({bellAt:Date.now()});ringBell();}
}
export function attack(){
  const state=useGame.getState();
  if(!state.entered||state.panel!=='none'||state.chatOpen||!state.inCombat||state.hp<=0||Date.now()<state.actionUntil)return;
  playAction('attack',720);runtime.send({type:'attack'});
}

export function WorldColliders(){
  const pondHull=useMemo(()=>{
    const vertices:number[]=[];
    for(const y of [-.3,1.05])for(let i=0;i<40;i++){
      const angle=i/40*Math.PI*2;
      vertices.push(Math.cos(angle)*POND.rx,y,Math.sin(angle)*POND.rz);
    }
    return new Float32Array(vertices);
  },[]);
  return <RigidBody type="fixed" colliders={false}>
    <CuboidCollider args={[32,.15,32]} position={[0,-.15,-2]}/>
    {OBSTACLES.map((o,i)=><CuboidCollider key={i} args={[o.hx,o.height/2,o.hz]} position={[o.x,o.height/2,o.z]}/>)}
    {/* Explicit ellipse vertices avoid nonuniform cylinder scaling changing its radius. */}
    <ConvexHullCollider args={[pondHull]} position={[POND.x,0,POND.z]}/>
  </RigidBody>;
}
export function ScenicCamera(){
  useFrame(({camera,clock})=>{
    const t=clock.elapsedTime*.018;
    camera.position.set(20+Math.sin(t)*1.2,8.2,25+Math.cos(t)*1.1);
    camera.lookAt(-1,3.2,-7);
  });return null;
}
export default function Controller(){
  const body=useRef<EcctrlHandle>(null);
  const visual=useRef<THREE.Group>(null);
  const {camera,gl}=useThree();
  const [animation,setAnimation]=useState<AnimationName>('idle');
  const lastAnimation=useRef<AnimationName>('idle');
  const lastSent=useRef(0);const yaw=useRef(Math.PI);const initialized=useRef(false);
  const name=useGame(s=>s.name),avatar=useGame(s=>s.avatar),hp=useGame(s=>s.hp),inCombat=useGame(s=>s.inCombat);
  const localId=useGame(s=>s.localId),bubbles=useGame(s=>s.bubbles);
  const bubble=bubbles[localId];
  const target=useMemo(()=>new THREE.Vector3(),[]),desired=useMemo(()=>new THREE.Vector3(),[]),direction=useMemo(()=>new THREE.Vector3(),[]);
  const renderedPosition=useMemo(()=>new THREE.Vector3(),[]),cameraOffset=useMemo(()=>new THREE.Vector3(),[]);
  const ray=useMemo(()=>new THREE.Ray(),[]),hit=useMemo(()=>new THREE.Vector3(),[]),euler=useMemo(()=>new THREE.Euler(0,0,0,'YXZ'),[]);
  useEffect(()=>{
    // Give movement keys to the game immediately after the entry form closes.
    gl.domElement.tabIndex=0;
    gl.domElement.focus({preventScroll:true});
    const clear=()=>{runtime.keys.clear();runtime.joystick={x:0,y:0};};
    const keydown=(e:KeyboardEvent)=>{
      const state=useGame.getState();const typing=(e.target as HTMLElement)?.matches('input,textarea,select');
      if(e.code==='Escape'){clear();runtime.path=[];if(state.panel!=='none')useGame.setState({panel:'none'});else if(state.chatOpen)useGame.setState({chatOpen:false});else if(state.action==='sit')playAction('idle',0);return;}
      if(typing||state.panel!=='none'||state.chatOpen)return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)){e.preventDefault();runtime.path=[];}
      runtime.keys.add(e.code);
      if(e.repeat)return;
      if(e.code==='KeyE')interact();
      if(e.code==='KeyF')attack();
      if(e.code==='Enter'){e.preventDefault();clear();useGame.setState({chatOpen:true});}
      if(e.code==='KeyM')useGame.setState({panel:'map'});
    };
    const keyup=(e:KeyboardEvent)=>runtime.keys.delete(e.code);
    let pointer: {id:number;x:number;y:number;startX:number;startY:number;dragged:boolean}|null=null;
    const down=(e:PointerEvent)=>{
      if(e.button!==0&&e.button!==2)return;
      pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,dragged:false};
      gl.domElement.setPointerCapture(e.pointerId);
    };
    const move=(e:PointerEvent)=>{
      if(!pointer||pointer.id!==e.pointerId)return;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
      if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)>5)pointer.dragged=true;
      if(pointer.dragged){runtime.cameraYaw-=dx*.005;runtime.cameraPitch=THREE.MathUtils.clamp(runtime.cameraPitch+dy*.004,.08,1.1);}
      pointer.x=e.clientX;pointer.y=e.clientY;
    };
    const up=(e:PointerEvent)=>{
      if(!pointer||pointer.id!==e.pointerId)return;
      if(!pointer.dragged&&useGame.getState().clickToMove&&useGame.getState().panel==='none'){
        const rect=gl.domElement.getBoundingClientRect();const r=new THREE.Raycaster();
        r.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1),camera);
        const point=r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
        const pos=useGame.getState().position;
        if(point){runtime.path=findPath(pos.x,pos.z,point.x,point.z);if(!runtime.path.length)showToast('Chọn một vị trí trống trên lối đi.');}
      }
      pointer=null;
    };
    const wheel=(e:WheelEvent)=>{e.preventDefault();runtime.cameraDistance=THREE.MathUtils.clamp(runtime.cameraDistance+e.deltaY*.004,2.5,12);};
    const menu=(e:Event)=>e.preventDefault();
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);
    const canvas=gl.domElement;canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('contextmenu',menu);
    return()=>{clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',menu);};
  },[camera,gl]);

  // Input and ritual locks are applied before Rapier's fixed simulation step.
  useFrame(()=>{
    const h=body.current,rigidBody=h?.body;
    // The imperative Ecctrl handle can mount before Rapier creates its body.
    if(!h||!rigidBody||!rigidBody.isValid())return;
    const now=Date.now(),state=useGame.getState();
    if(runtime.teleport){rigidBody.setTranslation({x:runtime.teleport.x,y:.9,z:runtime.teleport.z},true);rigidBody.setLinvel({x:0,y:0,z:0},true);runtime.teleport=null;runtime.path=[];initialized.current=false;}
    const p=rigidBody.translation();
    const locked=now<state.actionUntil||state.panel!=='none'||state.chatOpen||state.hp<=0;
    let jx=runtime.joystick.x,jy=runtime.joystick.y;
    if(runtime.path.length&&!locked){
      const [px,pz]=runtime.path[0],dx=px-p.x,dz=pz-p.z;
      if(Math.hypot(dx,dz)<.25)runtime.path.shift();
      else {const len=Math.hypot(dx,dz);jx=(dx*Math.cos(runtime.cameraYaw)-dz*Math.sin(runtime.cameraYaw))/len;jy=(-dx*Math.sin(runtime.cameraYaw)-dz*Math.cos(runtime.cameraYaw))/len;}
    }
    const keys=runtime.keys;
    h.setMovement({forward:!locked&&(keys.has('KeyW')||keys.has('ArrowUp')),backward:!locked&&(keys.has('KeyS')||keys.has('ArrowDown')),leftward:!locked&&(keys.has('KeyA')||keys.has('ArrowLeft')),rightward:!locked&&(keys.has('KeyD')||keys.has('ArrowRight')),run:!locked&&(keys.has('ShiftLeft')||keys.has('ShiftRight')),jump:false,joystick:{x:locked?0:jx,y:locked?0:jy}});
    if(locked) {const vel=rigidBody.linvel();rigidBody.setLinvel({x:0,y:vel.y,z:0},true);}
    if(state.actionUntil>0&&state.actionUntil!==Infinity&&now>=state.actionUntil){useGame.setState({action:'idle',actionUntil:0});runtime.send({type:'action',action:'idle'});}
  },-2);

  // Rapier runs at -1. Follow its interpolated render object before Html/render.
  useFrame((_,rawDt)=>{
    const h=body.current,rigidBody=h?.body;
    if(!h||!rigidBody||!rigidBody.isValid())return;
    const dt=Math.min(rawDt,.2),now=Date.now(),state=useGame.getState(),p=rigidBody.translation();
    const locked=now<state.actionUntil||state.panel!=='none'||state.chatOpen||state.hp<=0;
    let next:AnimationName=now<state.actionUntil?state.action:state.hp<=0?'bow':h.moveSpeed>.23?(h.moveSpeed>3.3?'run':'walk'):'idle';
    if(next!==lastAnimation.current){lastAnimation.current=next;setAnimation(next);}
    if(h.moveSpeed>.2) {euler.setFromQuaternion(h.currQuat);yaw.current=euler.y;}
    if(visual.current)visual.current.rotation.y=0;
    if(visual.current)visual.current.getWorldPosition(renderedPosition);else renderedPosition.set(p.x,0,p.z);
    target.set(renderedPosition.x,1.35,renderedPosition.z);
    const distance=runtime.cameraDistance,cp=runtime.cameraPitch,cy=runtime.cameraYaw;
    direction.set(Math.sin(cy)*Math.cos(cp),Math.sin(cp),Math.cos(cy)*Math.cos(cp));
    ray.set(target,direction);
    let allowed=distance;
    for(const box of cameraBoxes){if(ray.intersectBox(box,hit)){const d=hit.distanceTo(target);if(d>.15)allowed=Math.min(allowed,Math.max(.85,d-.3));}}
    desired.copy(direction).multiplyScalar(allowed);
    if(!initialized.current){cameraOffset.copy(desired);initialized.current=true;}
    else cameraOffset.lerp(desired,1-Math.exp(-dt*12));
    if(cameraOffset.length()>allowed)cameraOffset.setLength(allowed);
    // Translate with the visible avatar; damp orbit/zoom, not the follow target.
    camera.position.copy(target).add(cameraOffset);camera.position.y=Math.max(.55,camera.position.y);camera.lookAt(target);
    if(now-lastSent.current>100){
      lastSent.current=now;
      const nearby=INTERACTIONS.find(i=>(i.id!=='combat'||isInArena(p.x,p.z))&&Math.hypot(p.x-i.x,p.z-i.z)<i.radius)??null;
      useGame.setState({position:{x:p.x,z:p.z},nearby});
      // Action changes travel as explicit events; movement only carries locomotion.
      if(!locked)runtime.send({type:'move',x:p.x,z:p.z,yaw:yaw.current,animation:next==='walk'||next==='run'?next:'idle'});
    }
  },-.5);
  return <>
    {/* Social avatars stay upright at collisions; Ecctrl still turns freely around Y. */}
    {/* Keep Ecctrl's tested yaw tuning: excessive damping impulses destabilize this light capsule. */}
    <Ecctrl ref={body} position={[0,.9,16]} rotation={[0,Math.PI,0]} enabledRotations={[false,true,false]} capsuleHalfHeight={.35} capsuleRadius={.28} floatHeight={.18} maxWalkVel={2.8} maxRunVel={5.8} enableToggleRun={false} followPlatform={false} applyCounterMass={false}>
      <group ref={visual} position={[0,-.81,0]}>
        <Suspense fallback={<SimpleAvatar/>}><Avatar animation={animation} avatar={avatar} name={name} hp={hp} inCombat={inCombat} bubble={bubble&&bubble.until>Date.now()?bubble.text:undefined}/></Suspense>
      </group>
    </Ecctrl>
    {runtime.path.length>0&&<mesh position={[runtime.path.at(-1)![0],.04,runtime.path.at(-1)![1]]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.28,.35,32]}/><meshBasicMaterial color="#f5d99c" transparent opacity={.7}/></mesh>}
  </>;
}

function RemotePlayer({player,bubble}:{player:Player;bubble?:string}){
  const group=useRef<THREE.Group>(null);
  const initialPosition=useRef<[number,number,number]>([player.x,0,player.z]);
  useFrame((_,dt)=>{if(!group.current)return;const g=group.current;const alpha=1-Math.exp(-Math.min(dt,.2)*12);g.position.x=THREE.MathUtils.lerp(g.position.x,player.x,alpha);g.position.z=THREE.MathUtils.lerp(g.position.z,player.z,alpha);g.rotation.y+=Math.atan2(Math.sin(player.yaw-g.rotation.y),Math.cos(player.yaw-g.rotation.y))*alpha;},-.25);
  return <group ref={group} position={initialPosition.current}><Avatar animation={player.animation} avatar={player.avatar} name={player.name} hp={player.hp} inCombat={player.inCombat} bubble={bubble}/></group>;
}
function TempleNPC({index}:{index:number}){
  const group=useRef<THREE.Group>(null);const [walk,setWalk]=useState(false);const last=useRef(false);const phase=useRef(index*2);
  const names=['Thiện Tâm · NPC','An Lạc · NPC','Người giữ vườn · NPC'];
  useFrame(({clock},delta)=>{
    if(!group.current)return;
    if(index===1){group.current.position.set(-15.3,.03,-7.5);return;}
    const moving=(clock.elapsedTime+index*5)%17<12;
    if(moving)phase.current+=Math.min(delta,.05)*(index===0?.26:.28);
    const t=phase.current;
    if(index===0){group.current.position.set(-3+Math.sin(t)*2,0,4+Math.cos(t)*4);group.current.rotation.y=Math.atan2(Math.cos(t)*2,-Math.sin(t)*4);}
    else {group.current.position.set(8+Math.sin(t)*2,0,12+Math.cos(t)*3);group.current.rotation.y=Math.atan2(Math.cos(t)*2,-Math.sin(t)*3);}
    if(moving!==last.current){last.current=moving;setWalk(moving);}
  });
  return <group ref={group}><Avatar avatar={index} animation={index===1?'sit':walk?'walk':'idle'} name={names[index]}/></group>;
}
export function OtherPlayers(){
  const players=useGame(s=>s.players),localId=useGame(s=>s.localId),bubbles=useGame(s=>s.bubbles),position=useGame(s=>s.position);
  return <Suspense fallback={null}>
    {players.filter(p=>p.id!==localId).map(p=><RemotePlayer key={p.id} player={p} bubble={Math.hypot(p.x-position.x,p.z-position.z)<12&&bubbles[p.id]?.until>Date.now()?bubbles[p.id].text:undefined}/>)}
    {[0,1,2].map(i=><TempleNPC key={i} index={i}/>)}
  </Suspense>;
}
