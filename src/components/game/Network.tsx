'use client';
import {useEffect} from 'react';
import type {ServerMessage,ClientMessage} from '@/lib/protocol';
import {runtime,useGame,showToast} from '@/lib/game-store';
import {ringBell} from '@/lib/audio';

export default function Network() {
  const entered=useGame(s=>s.entered);const room=useGame(s=>s.room);
  useEffect(()=>{
    if(!entered) return;
    let disposed=false;let socket:WebSocket;let retry:ReturnType<typeof setTimeout>;
    let attempts=0;
    function connect() {
      if(disposed) return;
      const state=useGame.getState();
      const configured=process.env.NEXT_PUBLIC_REALTIME_URL;
      if(!configured && location.hostname!=='localhost' && location.hostname!=='127.0.0.1' && !/^192\.168\./.test(location.hostname)) {
        useGame.setState({status:'offline'});showToast('Chế độ khám phá · Chưa cấu hình server phòng cho bản deploy này.');return;
      }
      const host=configured || `${location.protocol==='https:'?'wss:':'ws:'}//${location.hostname}:1999`;
      useGame.setState({status:attempts?'reconnecting':'connecting'});
      socket=new WebSocket(`${host.replace(/\/$/,'')}/parties/temple/${room}`);
      runtime.send=(message:ClientMessage)=>{if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(message));};
      socket.onopen=()=>{attempts=0;runtime.send({type:'join',name:state.name,avatar:state.avatar});};
      socket.onmessage=event=>{
        let data:ServerMessage;
        try{data=JSON.parse(event.data);}catch{return;}
        const current=useGame.getState();
        if(data.type==='welcome') {
          const me=data.players.find(p=>p.id===data.id);
          runtime.teleport={x:me?.x??0,z:me?.z??16};
          useGame.setState({localId:data.id,players:data.players,status:'online',hp:me?.hp??100,inCombat:false});
        } else if(data.type==='state') {
          const me=data.players.find(p=>p.id===current.localId);
          const patch:{players:typeof data.players;hp?:number;inCombat?:boolean;respawnAt?:number}={players:data.players};
          if(me){patch.hp=me.hp;patch.inCombat=me.inCombat;patch.respawnAt=me.respawnAt??0;
            if(Math.hypot(me.x-current.position.x,me.z-current.position.z)>2.5) runtime.teleport={x:me.x,z:me.z};
          }
          useGame.setState(patch);
        } else if(data.type==='chat') {
          useGame.setState({messages:[...current.messages,data].slice(-60),bubbles:{...current.bubbles,[data.playerId]:{text:data.text,until:Date.now()+7000}}});
        } else if(data.type==='error') showToast(data.message);
        else if(data.type==='event') {
          if(data.event==='incense') useGame.setState({incenseUntil:Date.now()+22000});
          if(data.event==='bell') {
            useGame.setState({bellAt:Date.now()});
            ringBell(Math.hypot(current.position.x-10,current.position.z+5));
          }
          if(data.event==='emote') useGame.setState({bubbles:{...current.bubbles,[data.playerId]:{text:data.emoji??'🙏',until:Date.now()+4500}}});
          if(data.event==='respawn'&&data.playerId===current.localId){runtime.teleport={x:0,z:16};showToast('Đã hồi phục tại sân chùa. Bạn có thể quay lại luyện tập.');}
        }
      };
      socket.onclose=(event)=>{
        if(disposed) return;
        if(event.code===4001||event.code===4003||event.reason.toLowerCase().includes('full')) {useGame.setState({status:'offline'});showToast('Phòng đã đầy. Hãy chọn phòng khác trong cài đặt.');return;}
        useGame.setState({status:'reconnecting',players:[]});
        attempts++;retry=setTimeout(connect,Math.min(15000,1000*2**Math.min(attempts,4)));
      };
      socket.onerror=()=>{};
    }
    connect();
    const heartbeat=setInterval(()=>runtime.send({type:'ping'}),20000);
    return ()=>{disposed=true;clearTimeout(retry);clearInterval(heartbeat);runtime.send=()=>{};socket?.close();};
  },[entered,room]);
  return null;
}
