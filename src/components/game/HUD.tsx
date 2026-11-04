'use client';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {RefreshCw,Radio,ArrowRight,AudioLines,Bell,Check,ChevronDown,Compass,Flame,Flower2,Footprints,Heart,HelpCircle,Map,Maximize,MessageCircle,MessagesSquare,Moon,Send,Settings2,Shield,Smile,Sun,Swords,Users,Volume2,VolumeX,Waves,Wind,X} from 'lucide-react';
import {AVATAR_STYLES} from './Avatar';
import {attack,interact} from './Controller';
import {playAction,runtime,showToast,useGame,type Panel,type Quality} from '@/lib/game-store';
import {isInArena} from '@/lib/world-layout';
import {ROOM_IDS} from '@/lib/protocol';
import {setAudioMuted,startAudio} from '@/lib/audio';
import {usePublicPrayers} from '@/lib/use-public-prayers';
import ActivitiesPanel,{ActivityOverlay} from './ActivitiesPanel';

function Lotus({size=32}:{size?:number}){return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 6c-7 8-10 17 0 25 10-8 7-17 0-25Z" stroke="currentColor" strokeWidth="1.4"/><path d="M21 31C10 32 5 24 6 15c11 1 18 7 15 16Zm6 0c11 1 16-7 15-16-11 1-18 7-15 16Z" stroke="currentColor" strokeWidth="1.4"/><path d="M7 32c7 9 27 9 34 0-5-2-10-1-17 4-7-5-12-6-17-4Z" stroke="currentColor" strokeWidth="1.4"/></svg>;}
function IconButton({label,children,onClick,active=false}:{label:string;children:ReactNode;onClick:()=>void;active?:boolean}){return <button type="button" className={`icon-button ${active?'active':''}`} title={label} aria-label={label} onClick={onClick}>{children}</button>;}
function AvatarMark({index,size=40}:{index:number;size?:number}){return <div className="avatar-mark" style={{width:size,height:size,'--avatar-color':AVATAR_STYLES[index]?.color} as React.CSSProperties}><span/><i/></div>;}

function Entry(){
  const name=useGame(s=>s.name),avatar=useGame(s=>s.avatar),room=useGame(s=>s.room);
  const [busy,setBusy]=useState(false);
  async function enter(event:FormEvent){
    event.preventDefault();if(busy)return;
    const value=name.trim()||'Khách phương xa';setBusy(true);startAudio();
    try{
      const res=await fetch('/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:value,avatar})});const data=await res.json();
      if(!res.ok)throw new Error(data.error);
      useGame.setState({storage:data.persistence});
    }catch{showToast('Hồ sơ chưa được lưu. Game vẫn đang thử kết nối phòng online.');useGame.setState({storage:'unavailable'});}
    useGame.setState({entered:true,name:value});setBusy(false);
  }
  return <>
    <section className="entry-card">
      <div className="eyebrow"><span/> VIRTUAL TEMPLE ONLINE</div>
      <h1>Một khoảng<br/><em>an nhiên.</em></h1>
      <p className="entry-description">Bỏ lại những vội vàng. Bước vào chốn bình yên,<br className="desktop-only"/> gặp một người bạn và gửi một lời nguyện.</p>
      <form onSubmit={enter}>
        <label className="field-label" htmlFor="guest-name">CHÚNG MÌNH GỌI BẠN LÀ</label>
        <div className="name-field"><Flower2 size={18}/><input id="guest-name" maxLength={24} placeholder="Tên của bạn" value={name} onChange={e=>useGame.setState({name:e.target.value})} autoComplete="nickname"/><span>Khách</span></div>
        <div className="avatar-label"><span className="field-label">CHỌN MỘT PHONG THÁI</span><small>{AVATAR_STYLES[avatar].name}</small></div>
        <div className="avatar-options">{AVATAR_STYLES.map((style,index)=><button type="button" key={style.name} aria-label={`Chọn ${style.name}`} aria-pressed={avatar===index} className={`avatar-option ${avatar===index?'selected':''}`} onClick={()=>useGame.setState({avatar:index})}><AvatarMark index={index} size={43}/>{avatar===index&&<span className="avatar-check"><Check size={9}/></span>}</button>)}<p>Cùng một hành trình.<br/>Một sắc thái của riêng bạn.</p></div>
        <button type="submit" className="enter-button" disabled={busy}><span>{busy?'Đang mở cổng…':'Bước vào chùa'}</span><ArrowRight size={19}/></button>
        <div className="entry-meta"><Shield size={12}/><span>Không cần tài khoản</span><i/><Users size={12}/><select aria-label="Chọn phòng" value={room} onChange={e=>useGame.setState({room:e.target.value})}>{ROOM_IDS.map((r,i)=><option key={r} value={r}>Liên Hoa {i+1} · tối đa 20 người</option>)}</select></div>
      </form>
    </section>
    <div className="entry-scene-caption"><span className="caption-line"/><span>CHÙA AN NHIÊN</span><small>Nơi những hành trình gặp nhau</small></div>
    <footer className="entry-footer"><span><Wind size={14}/> Một thế giới nhỏ. Một khoảng bình yên.</span><button onClick={()=>useGame.setState({panel:'help'})}>Hướng dẫn khám phá <ArrowRight size={13}/></button></footer>
  </>;
}

function MiniMap({large=false}:{large?:boolean}){
  const position=useGame(s=>s.position),players=useGame(s=>s.players),localId=useGame(s=>s.localId);
  const map=(n:number)=>(n+28)/56*200;
  return <div className={`minimap ${large?'large':''}`}>
    <svg viewBox="0 0 200 200" role="img" aria-label="Bản đồ chùa và vị trí của bạn"><defs><pattern id="map-grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#d7d1b8" strokeWidth=".5" opacity=".3"/></pattern></defs><rect width="200" height="200" fill="#283b31"/><rect width="200" height="200" fill="url(#map-grid)"/><path d="M100 182V75M52 85h85M55 146h114" stroke="#8c9577" strokeWidth="9"/><rect x="71" y="24" width="56" height="58" rx="3" fill="#b7a076"/><path d="m67 28 32-10 32 10" fill="none" stroke="#e3cc9d" strokeWidth="4"/><ellipse cx="45" cy="119" rx="22" ry="26" fill="#496c63" stroke="#78948a"/><circle cx="45" cy="70" r="13" fill="#718563"/><rect x="148" y="102" width="34" height="40" rx="3" fill="#877a61"/><rect x="130" y="75" width="12" height="12" rx="2" fill="#bd9c68"/><text x="100" y="54">正殿</text>{large&&<><text className="map-label" x="45" y="157">HỒ SEN</text><text className="map-label" x="44" y="49">VƯỜN THIỀN</text><text className="map-label" x="164" y="155">VÕ ĐÀI</text><text className="map-label" x="143" y="67">CHUÔNG</text></>}{players.filter(p=>p.id!==localId).map(p=><circle key={p.id} cx={map(p.x)} cy={map(p.z)} r={2.2} fill="#ded7bd"/>)}<circle cx={map(position.x)} cy={map(position.z)} r={6} fill="#ddc390" opacity=".2"/><circle cx={map(position.x)} cy={map(position.z)} r={3} fill="#ffe2a9" stroke="#fff5d8" strokeWidth="1"/></svg>
    <span className="map-north">N</span>
    {!large&&<button aria-label="Mở bản đồ" onClick={()=>useGame.setState({panel:'map'})}><Map size={14}/></button>}
  </div>;
}
function Chat(){
  const open=useGame(s=>s.chatOpen),messages=useGame(s=>s.messages),status=useGame(s=>s.status),name=useGame(s=>s.name);
  const [text,setText]=useState('');const input=useRef<HTMLInputElement>(null);const log=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(open)input.current?.focus();},[open]);
  useEffect(()=>{log.current?.scrollTo({top:log.current.scrollHeight,behavior:'smooth'});},[messages]);
  function send(e:FormEvent){e.preventDefault();if(!text.trim())return;if(status!=='online'){showToast('Chat cần kết nối server phòng.');return;}runtime.send({type:'chat',text:text.trim()});setText('');useGame.setState({chatOpen:false});input.current?.blur();}
  return <section className={`chat-panel ${open?'chat-expanded':''}`} aria-label="Trò chuyện trong phòng"><div className="chat-heading"><span><MessagesSquare size={13}/> Trò chuyện</span><small>Toàn phòng</small></div><div ref={log} className="chat-log" aria-live="polite">{messages.length===0?<p className="chat-empty">Một lời chào có thể bắt đầu một tình bạn.</p>:messages.slice(-12).map(m=><p key={m.id}><b style={{color:m.name===name?'#dfc18d':undefined}}>{m.name}</b><span>{m.text}</span></p>)}</div><form onSubmit={send}><MessageCircle size={14}/><input ref={input} aria-label="Tin nhắn" maxLength={240} placeholder={open?'Gửi một lời chào…':'Enter để trò chuyện'} value={text} onFocus={()=>useGame.setState({chatOpen:true})} onBlur={()=>useGame.setState({chatOpen:false})} onChange={e=>setText(e.target.value)}/>{text?<button type="submit" aria-label="Gửi tin nhắn"><Send size={14}/></button>:<kbd>↵</kbd>}</form></section>;
}
function TouchControls(){
  const stick=useRef<HTMLDivElement>(null);const [thumb,setThumb]=useState({x:0,y:0});
  const move=(event:React.PointerEvent<HTMLDivElement>)=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.getBoundingClientRect(),dx=event.clientX-(rect.left+rect.width/2),dy=event.clientY-(rect.top+rect.height/2),len=Math.hypot(dx,dy),scale=len>36?36/len:1;setThumb({x:dx*scale,y:dy*scale});runtime.joystick={x:dx*scale/36,y:-dy*scale/36};runtime.path=[];};
  const reset=()=>{runtime.joystick={x:0,y:0};setThumb({x:0,y:0});};
  return <div className="touch-controls"><div ref={stick} className="joystick" aria-label="Joystick di chuyển" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);move(e);}} onPointerMove={move} onPointerUp={reset} onPointerCancel={reset}><i style={{transform:`translate(${thumb.x}px,${thumb.y}px)`}}/></div><button className="touch-interact" aria-label="Tương tác" onClick={interact}>E</button>{useGame(s=>s.inCombat)&&<button className="touch-attack" aria-label="Đánh" onClick={attack}><Swords size={22}/></button>}</div>;
}

function Dialog({panel}:{panel:Panel}){
  const state=useGame();const close=()=>useGame.setState({panel:'none'});
  const [prayer,setPrayer]=useState(''),[isPublic,setIsPublic]=useState(false),[saving,setSaving]=useState(false);
  const {prayers,status:prayerStatus,message:journalStatus,refresh:refreshPrayers}=usePublicPrayers(panel==='journal');
  async function offer(e:FormEvent){
    e.preventDefault();if(saving)return;setSaving(true);
    if(prayer.trim()){
      try{const res=await fetch('/api/prayers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:prayer.trim(),isPublic})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Chưa thể gửi lời nguyện.');showToast(isPublic?'Lời nguyện của bạn đã được gửi vào sổ chung.':'Lời nguyện riêng tư của bạn đã được lưu.');}
      catch(e){showToast(e instanceof Error?e.message:'Chưa thể lưu lời nguyện.');setSaving(false);return;}
    }else showToast('Nguyện một ngày bình an đến với bạn.');
    runtime.path=[];useGame.setState({panel:'none',action:'pray',actionUntil:Date.now()+3500});
    runtime.send({type:'action',action:'incense'});
    if(state.status!=='online')useGame.setState({incenseUntil:Date.now()+22000});
    setSaving(false);
  }
  const titles:Record<string,string>={settings:'Không gian của bạn',map:'Một nơi để khám phá',prayer:'Gửi một lời bình an',journal:'Những điều tốt lành',help:'Chậm lại. Và khám phá.'};
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}><section className={`dialog ${panel==='map'?'map-dialog':''}`} role="dialog" aria-modal="true" aria-label={titles[panel]}><button className="dialog-close" aria-label="Đóng" onClick={close}><X size={20}/></button><div className="dialog-symbol"><Lotus size={38}/></div><div className="eyebrow">AN NHIÊN · VIRTUAL TEMPLE</div><h2>{titles[panel]}</h2>
    {panel==='settings'&&<><p className="dialog-intro">Một chút điều chỉnh cho hành trình thoải mái hơn.</p><label className="field-label">CHẤT LƯỢNG ĐỒ HỌA</label><div className="quality-options">{(['low','medium','high'] as Quality[]).map((q,i)=><button key={q} className={state.quality===q?'selected':''} onClick={()=>{useGame.setState({quality:q});localStorage.setItem('vto-quality',q);}}><span>{['Low','Medium','High'][i]}</span><small>{['Nhẹ nhàng','Cân bằng','Rực rỡ'][i]}</small>{state.quality===q&&<Check size={13}/>}</button>)}</div><div className="settings-row"><span><Moon size={17}/> Đêm hoa đăng</span><button role="switch" aria-checked={state.night} aria-label="Đêm hoa đăng" className={`switch ${state.night?'on':''}`} onClick={()=>useGame.setState({night:!state.night})}/></div><div className="settings-row"><span><Footprints size={17}/> Nhấp để tự đi tới</span><button role="switch" aria-checked={state.clickToMove} aria-label="Nhấp để tự đi tới" className={`switch ${state.clickToMove?'on':''}`} onClick={()=>useGame.setState({clickToMove:!state.clickToMove})}/></div><div className="settings-row"><span><Users size={17}/> Phòng đang chọn</span><select aria-label="Đổi phòng" value={state.room} onChange={e=>{useGame.setState({room:e.target.value,inCombat:false,action:'idle',actionUntil:0,messages:[]});runtime.path=[];}}>{ROOM_IDS.map((r,i)=><option key={r} value={r}>Liên Hoa {i+1}</option>)}</select></div><p className="settings-note">{state.storage==='neon'?'Hồ sơ khách đang được lưu trên Neon.':state.storage==='unavailable'?'Hồ sơ chưa được lưu.':'Bạn có thể vào chơi bằng hồ sơ khách.'}</p></>}
    {panel==='settings'&&<div className="connection-settings"><div><Radio size={15}/><strong>{state.status==='online'?`Đang online · ${state.players.length}/20 người`:state.connectionIssue==='full'?'Phòng đã đầy':state.connectionIssue==='missing'?'Máy chủ phòng chưa sẵn sàng':state.connectionIssue==='invalid'?'Cấu hình máy chủ chưa hợp lệ':state.connectionIssue==='replaced'?'Phiên chơi đã được mở lại':'Đang kết nối phòng online'}</strong></div><p>{state.status==='online'?'Di chuyển, chat và hành động đang được đồng bộ với người trong phòng.':state.connectionIssue==='full'?'Chọn phòng khác hoặc đợi game tự thử lại khi có chỗ trống.':state.connectionIssue==='replaced'?'Bấm Kết nối lại để tiếp tục chơi ở tab này.':'Chưa đồng bộ với người chơi khác. Game sẽ tự kết nối lại khi máy chủ sẵn sàng.'}</p>{state.status!=='online'&&<button type="button" onClick={()=>runtime.reconnect()}><RefreshCw size={13}/> Kết nối lại</button>}</div>}
    {panel==='map'&&<><p className="dialog-intro">Mỗi lối đi là một cách tìm về sự bình yên.</p><MiniMap large/><div className="map-legend"><span><i/> Vị trí của bạn</span><span><i/> Người cùng phòng</span></div><p className="settings-note">WASD để di chuyển · M để mở bản đồ</p></>}
    {panel==='prayer'&&<form onSubmit={offer}><p className="dialog-intro">Một nén hương, một ý nguyện. Giữ trong lòng hoặc chia sẻ cùng mọi người.</p><textarea autoFocus aria-label="Lời nguyện" maxLength={500} rows={4} value={prayer} onChange={e=>setPrayer(e.target.value)} placeholder="Mong cho những người tôi thương luôn bình an…"/><div className="prayer-options"><label><input type="checkbox" checked={isPublic} onChange={e=>setIsPublic(e.target.checked)}/> Chia sẻ lên sổ lời nguyện</label><small>{prayer.length}/500</small></div><p className="private-note"><Shield size={13}/>{isPublic?'Lời nguyện hiển thị cùng tên của bạn.':'Chỉ bạn có quyền xem lời nguyện này.'}</p><button className="primary-button" disabled={saving} type="submit"><Flame size={17}/>{saving?'Đang gửi…':'Dâng hương & gửi lời nguyện'}</button></form>}
    {panel==='journal'&&<><p className="dialog-intro">Những lời nguyện công khai từ người ghé chùa.</p><div className="journal-sync"><span className={`journal-sync-indicator ${prayerStatus}`}><Radio size={13}/>{prayerStatus==='live'?'Đang cập nhật trực tiếp':prayerStatus==='connecting'?'Đang kết nối cập nhật':prayerStatus==='reconnecting'?'Đang nối lại':'Cập nhật thủ công'}</span><button type="button" aria-label="Làm mới lời nguyện" disabled={prayerStatus==='connecting'} onClick={refreshPrayers}><RefreshCw size={13}/> Làm mới</button></div>{journalStatus&&<p className="journal-sync-note" role="status">{journalStatus}</p>}<div className="prayer-journal">{prayers.map(p=><article key={p.id}><Flower2 size={17}/><p>{p.text}<small>{p.name} · {new Date(p.createdAt).toLocaleDateString('vi-VN')}</small></p></article>)}{!prayers.length&&prayerStatus!=='connecting'&&<p className="empty-journal">Chưa có lời nguyện công khai. Hãy gửi điều tốt lành đầu tiên.</p>}</div>{state.entered&&<button className="primary-button" onClick={()=>{close();showToast('Đến bàn hương trong chính điện, nhấn E để gửi lời nguyện.');}}><Flame size={16}/> Gửi một lời nguyện</button>}</>}
    {panel==='help'&&<><p className="dialog-intro">Hành trình không có vội vàng. Bạn cứ đi theo cách của mình.</p><div className="help-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><p>Di chuyển theo hướng camera</p><span><kbd>Shift</kbd></span><p>Giữ để chạy</p><span><Compass size={21}/></span><p>Kéo chuột để nhìn · Lăn chuột để zoom</p><span><kbd>E</kbd></span><p>Tương tác · Đứng dậy khi đang thiền</p><span><kbd>Enter</kbd></span><p>Chat cùng những người trong phòng</p><span><kbd>F</kbd></span><p>Đánh trong võ đài sau khi bật giao đấu</p></div><p className="help-mobile">Điện thoại: joystick trái để đi, vuốt bên phải để nhìn.</p><div className="help-tip"><Flower2 size={20}/><p>Đến chính điện để dâng hương, ghé vườn thiền hoặc thử thỉnh một tiếng chuông.</p></div></>}
  </section></div>;
}

export default function HUD(){
  const entered=useGame(s=>s.entered),name=useGame(s=>s.name),avatar=useGame(s=>s.avatar),panel=useGame(s=>s.panel),night=useGame(s=>s.night),muted=useGame(s=>s.muted),status=useGame(s=>s.status),players=useGame(s=>s.players),nearby=useGame(s=>s.nearby),action=useGame(s=>s.action),actionUntil=useGame(s=>s.actionUntil),inCombat=useGame(s=>s.inCombat),hp=useGame(s=>s.hp),position=useGame(s=>s.position),toast=useGame(s=>s.toast),room=useGame(s=>s.room);
  const connectionIssue=useGame(s=>s.connectionIssue);
  const activity=useGame(s=>s.activity);
  const activityOwnsInteraction=Boolean(activity?.mode&&activity.phase!=='finished');
  const [emotes,setEmotes]=useState(false);const [now,setNow]=useState(Date.now());
  useEffect(()=>{const q=localStorage.getItem('vto-quality');if(q==='low'||q==='medium'||q==='high')useGame.setState({quality:q});else if(matchMedia('(pointer: coarse)').matches)useGame.setState({quality:'low'});fetch('/api/guest').then(r=>r.json()).then(d=>{if(!useGame.getState().entered&&d.player)useGame.setState({name:d.player.name,avatar:d.player.avatar,storage:d.persistence});}).catch(()=>{});},[]);
  useEffect(()=>{setAudioMuted(muted);},[muted]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[]);
  const showPanel=(value:Panel)=>{runtime.keys.clear();runtime.joystick={x:0,y:0};useGame.setState({panel:panel===value?'none':value});};
  const toggleAudio=()=>{if(muted)startAudio();useGame.setState({muted:!muted});};
  const location=position.z<-5&&Math.abs(position.x)<8?'Chính điện':position.x<-8&&position.z<0?'Vườn thiền':isInArena(position.x,position.z)?'Võ đài':position.x<-8?'Hồ an nhiên':'Sân chùa';
  const remaining=actionUntil!==Infinity&&actionUntil>now?Math.ceil((actionUntil-now)/1000):0;
  return <div className="hud">
    <header className="topbar"><a className="brand" href="/" aria-label="An Nhiên"><Lotus size={38}/><div><strong>AN NHIÊN</strong><span>VIRTUAL TEMPLE ONLINE</span></div></a><div className="world-status"><span className="status-dot"/><span>{entered?location:'MỘT CHỐN BÌNH YÊN'}</span><i/><span className="world-time">{night?<Moon size={13}/>:<Sun size={13}/>} {night?'Đêm hoa đăng':'Nắng chiều'}</span></div><nav className="top-actions"><span className="version-tag">EARLY ACCESS</span><IconButton label={muted?'Bật âm thanh':'Tắt âm thanh'} onClick={toggleAudio}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</IconButton><IconButton label="Toàn màn hình" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(()=>showToast('Trình duyệt chưa hỗ trợ toàn màn hình.'));}}><Maximize size={17}/></IconButton><IconButton label="Cài đặt" active={panel==='settings'} onClick={()=>showPanel('settings')}><Settings2 size={18}/></IconButton></nav></header>
    {!entered?<Entry/>:<>
      <div className="room-badge" title={connectionIssue==='missing'?'Máy chủ phòng chưa sẵn sàng. Game sẽ tự thử kết nối lại.':connectionIssue==='invalid'?'Cấu hình máy chủ phòng chưa hợp lệ.':connectionIssue==='full'?'Phòng đã đủ người. Hãy chọn phòng khác trong cài đặt.':status==='online'?'Đã kết nối máy chủ phòng.':'Đang kết nối online, bạn chưa thấy được những người khác.'}><span className={`connection-dot ${status==='online'?'connected':''}`}/><span>Liên Hoa {ROOM_IDS.indexOf(room as typeof ROOM_IDS[number])+1}</span><i/><Users size={12}/><span>{status==='online'?`${players.length}/20`:status==='connecting'?'Đang kết nối':status==='reconnecting'?'Đang nối lại':connectionIssue==='full'?'Phòng đã đầy':connectionIssue==='invalid'?'Lỗi cấu hình':connectionIssue==='missing'?'Chưa có máy chủ':'Chưa kết nối'}</span>{status!=='online'&&<button className="connection-retry" type="button" aria-label="Kết nối lại" title="Kết nối lại" onClick={()=>runtime.reconnect()}><RefreshCw size={12}/></button>}</div>
      <div className="player-card"><AvatarMark index={avatar} size={43}/><div><strong>{name}</strong><span>{inCombat?'Võ sinh tự do':'Lữ khách an nhiên'}</span></div>{inCombat&&<div className="player-hp"><Heart size={11}/><span>{hp}/100</span><i style={{width:`${hp}%`}}/></div>}</div>
      <Chat/>
      <div className="game-hints"><span><kbd>W A S D</kbd> Di chuyển</span><span><kbd>⇧</kbd> Chạy</span><span><Compass size={12}/> Kéo để nhìn</span><button onClick={()=>showPanel('help')} aria-label="Hướng dẫn"><HelpCircle size={16}/></button></div>
      <div className="action-area">
        {hp<=0?<div className="interaction-prompt">Đang hồi phục… <span>{Math.max(0,Math.ceil((useGame.getState().respawnAt-now)/1000))}s</span></div>:action==='sit'?<button className="interaction-prompt" onClick={()=>playAction('idle',0)}><kbd>E</kbd><span>Đứng dậy</span><small>Hít thở thật chậm</small></button>:remaining>0?<div className="interaction-prompt ritual-progress"><Flame size={17}/><span>{action==='attack'?'Đang ra đòn…':'Một khoảng tĩnh tâm…'}</span><small>{remaining}s</small></div>:!activityOwnsInteraction&&nearby&&<button className="interaction-prompt" onClick={interact}><kbd>E</kbd><span>{nearby.id==='combat'&&inCombat?'Rời giao đấu':nearby.label}</span><small>{nearby.description}</small></button>}
        {emotes&&<div className="emote-picker">{['🙏','🌸','❤️','👋','✨','😊'].map(emoji=><button aria-label={`Cảm xúc ${emoji}`} key={emoji} onClick={()=>{runtime.send({type:'emote',emoji});setEmotes(false);}}>{emoji}</button>)}</div>}
        <div className="action-bar"><button onClick={()=>playAction('wave',2400)} title="Vẫy chào"><span>👋</span><small>Vẫy chào</small></button><button onClick={()=>playAction('bow',2200)} title="Chắp tay"><Flower2 size={21}/><small>Chắp tay</small></button><button onClick={()=>action==='sit'?playAction('idle',0):playAction('sit',Infinity)} title="Ngồi thiền"><Wind size={22}/><small>Ngồi thiền</small></button><i/><button onClick={()=>setEmotes(!emotes)} title="Cảm xúc" className={emotes?'selected':''}><Smile size={22}/><small>Cảm xúc</small></button><button onClick={()=>showPanel('journal')} title="Sổ lời nguyện"><Heart size={21}/><small>Lời nguyện</small></button>{inCombat&&<><i/><button onClick={attack} title="F · Đánh" className="attack-action"><Swords size={23}/><small>F · Đánh</small></button></>}</div>
      </div>
      <div className="minimap-area"><MiniMap/><span>{location} <ChevronDown size={10}/></span></div>
      <TouchControls/>
      <ActivityOverlay/>
    </>}
    {toast&&<div className="toast" role="status"><Flower2 size={17}/><span>{toast}</span><button aria-label="Đóng thông báo" onClick={()=>useGame.setState({toast:''})}><X size={14}/></button></div>}
    {panel==='activities'?<ActivitiesPanel/>:panel!=='none'&&<Dialog key={panel} panel={panel}/>}
  </div>;
}
