'use client';
import { create } from 'zustand';
import type { Player, ChatMessage, ClientMessage } from './protocol';
import type { Interaction } from './world-layout';

export type Quality = 'low'|'medium'|'high';
export type Panel = 'none'|'settings'|'map'|'prayer'|'journal'|'help';
export type AnimationName = 'idle'|'walk'|'run'|'sit'|'bow'|'pray'|'attack'|'wave';
export type ConnectionIssue = ''|'missing'|'invalid'|'full'|'unreachable';
type GameState = {
  entered: boolean; name: string; avatar: number; room: string; quality: Quality;
  night: boolean; muted: boolean; clickToMove: boolean; panel: Panel; chatOpen: boolean;
  localId: string; players: Player[]; messages: ChatMessage[];
  status: 'offline'|'connecting'|'online'|'reconnecting'; connectionIssue: ConnectionIssue; storage: string;
  position: {x:number;z:number}; nearby: Interaction|null;
  action: AnimationName; actionUntil: number; incenseUntil: number; bellAt: number;
  inCombat: boolean; hp: number; respawnAt: number; toast: string;
  bubbles: Record<string,{text:string;until:number}>;
  set: (patch: Partial<GameState>) => void;
};
export const useGame = create<GameState>((set) => ({
  entered:false,name:'',avatar:0,room:'lotus-1',quality:'medium',night:false,muted:false,clickToMove:false,
  panel:'none',chatOpen:false,localId:'',players:[],messages:[],status:'connecting',connectionIssue:'',storage:'',
  position:{x:0,z:16},nearby:null,action:'idle',actionUntil:0,incenseUntil:0,bellAt:0,
  inCombat:false,hp:100,respawnAt:0,toast:'',bubbles:{},set:patch=>set(patch),
}));
export const runtime = {
  keys: new Set<string>(), joystick:{x:0,y:0},
  cameraYaw:0,cameraPitch:.34,cameraDistance:6.8,
  path: [] as [number,number][],
  send: (_message: ClientMessage) => {},
  reconnect: () => {},
  teleport: null as null|{x:number;z:number},
};
let toastTimer: ReturnType<typeof setTimeout>;
export function showToast(toast:string) {
  useGame.setState({toast});clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>useGame.setState({toast:''}),4500);
}
export function playAction(action:AnimationName, duration=2400) {
  const state=useGame.getState();
  if(state.hp<=0) return;
  runtime.path=[];
  useGame.setState({action,actionUntil:Date.now()+duration});
  if(action!=='attack') runtime.send({type:'action',action: action==='pray'?'pray':action==='walk'||action==='run'?'idle':action});
}
