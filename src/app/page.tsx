'use client';
import dynamic from 'next/dynamic';
const Game = dynamic(()=>import('@/components/game/Game'),{ssr:false,loading:()=> <div className="boot-screen"><span className="boot-lotus">✧</span><span>AN NHIÊN</span><small>Đang mở một khoảng bình yên…</small></div>});
export default function Page(){return <Game/>;}
