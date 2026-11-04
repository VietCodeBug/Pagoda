'use client';
import { assetUrl } from './assets';
let ambience: HTMLAudioElement | undefined;
let context: AudioContext | undefined;
let muted = false;
export function setAudioMuted(value: boolean) {
  muted=value;
  if(ambience) { ambience.muted=value; if(!value) void ambience.play().catch(()=>{}); }
}
export function startAudio() {
  if(!ambience) { ambience=new Audio(assetUrl('temple-ambient.mp3'));ambience.loop=true;ambience.volume=.22; }
  ambience.muted=muted;
  void ambience.play().catch(()=>{});
  context ??= new AudioContext();
  void context.resume();
}
export function ringBell(distance=0) {
  if(muted||!context) return;
  const now=context.currentTime;
  for(const [index,freq] of [164.81,330.2,466.3,659.3].entries()) {
    const osc=context.createOscillator(); const gain=context.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(freq,now);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.exponentialRampToValueAtTime(.17/(index+1)/(1+distance*.07),now+.025);
    gain.gain.exponentialRampToValueAtTime(.0001,now+7-index*.7);
    osc.connect(gain);gain.connect(context.destination);osc.start(now);osc.stop(now+8);
  }
}
