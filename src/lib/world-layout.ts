export type Obstacle = { x: number; z: number; hx: number; hz: number; height: number };
export const POND = { x: -15, z: 5, rx: 5.2, rz: 6.5 };
export const OBSTACLES: Obstacle[] = [
  { x: -18, z: -14.2, hx: 2.35, hz: 2, height: 4.6 },
  { x: 0, z: -20.75, hx: 7.75, hz: .16, height: 5.1 },
  { x: -7.55, z: -13.4, hx: .15, hz: 7.25, height: 5 },
  { x: 7.55, z: -13.4, hx: .15, hz: 7.25, height: 5 },
  { x: 0, z: -14, hx: 3.55, hz: .85, height: 1.5 },
  { x: 0, z: -17.6, hx: 6.45, hz: 2.15, height: .8 },
  ...[-6.4, 6.4].flatMap(x => [-7, -12, -18].map(z => ({ x, z, hx: .35, hz: .35, height: 5.3 }))),
  ...[8.4, 11.6].flatMap(x => [-6.6, -3.4].map(z => ({ x, z, hx: .2, hz: .2, height: 4 }))),
  { x: 0, z: -25.5, hx: 25.6, hz: .34, height: 1.65 },
  { x: -25.5, z: -1.5, hx: .34, hz: 24.5, height: 2.1 },
  { x: 25.5, z: -1.5, hx: .34, hz: 24.5, height: 2.1 },
  ...[-14.8, 14.8].map(x => ({ x, z: 23.3, hx: 10.25, hz: .23, height: 1.4 })),
  ...[-4, 4].map(x => ({ x, z: 23, hx: .6, hz: .6, height: 4.75 })),
  // Close the short entrance corridor after the visible gate.
  { x: 0, z: 26, hx: 25.6, hz: .2, height: 2 },
];
export const INTERACTIONS = [
  { id: 'incense', x: 0, z: -11.9, radius: 3, label: 'Dâng hương', description: 'Gửi một lời nguyện bình an', icon: 'flame' },
  { id: 'sit', x: -15, z: -8, radius: 3.7, label: 'Ngồi thiền', description: 'Dừng lại, hít thở và lắng nghe', icon: 'flower' },
  { id: 'bell', x: 10, z: -2.7, radius: 3, label: 'Thỉnh chuông', description: 'Một tiếng chuông, một khoảng lặng', icon: 'bell' },
  { id: 'fishing', x: -8.7, z: 6, radius: 2.4, label: 'Câu cá', description: 'Thả câu · 12 loài cá · 5 độ hiếm', icon: 'fish' },
  { id: 'lanterns', x: -8.5, z: 12.5, radius: 2.8, label: 'Thả đèn cùng phòng', description: 'Hợp sức thắp sáng bầu trời', icon: 'lantern' },
  { id: 'training', x: 20, z: 2, radius: 2.5, label: 'Luyện quyền', description: 'Đấm mộc nhân trong 30 giây', icon: 'target' },
  { id: 'games', x: 0, z: 16, radius: 2, label: 'Hoạt động & bộ sưu tập', description: 'G · 8 hoạt động để khám phá', icon: 'game' },
  { id: 'combat', x: 19, z: 6, radius: 6, label: 'Vào luyện võ', description: 'Giao đấu tự nguyện · 100 HP', icon: 'swords' },
] as const;
export type Interaction = typeof INTERACTIONS[number];
export const isInArena = (x: number, z: number) => x >= 14 && x <= 24 && z >= 0 && z <= 12;
export function isWalkable(x: number, z: number, margin = .5) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (x < -25.1 + margin || x > 25.1 - margin || z < -25.1 + margin || z > 25.8 - margin) return false;
  if (((x - POND.x) / (POND.rx + margin)) ** 2 + ((z - POND.z) / (POND.rz + margin)) ** 2 < 1) return false;
  return !OBSTACLES.some(o => Math.abs(x-o.x) < o.hx+margin && Math.abs(z-o.z) < o.hz+margin);
}

function clearSegment(sx: number, sz: number, tx: number, tz: number, clearance = .28) {
  const steps = Math.max(1, Math.ceil(Math.hypot(tx-sx, tz-sz) / .15));
  for (let i=0; i<=steps; i++) {
    if (!isWalkable(sx+(tx-sx)*i/steps, sz+(tz-sz)*i/steps, clearance)) return false;
  }
  return true;
}

function nearestCell(x: number, z: number): [number, number] | undefined {
  const candidates: [number, number][] = [];
  // A body may stand beside a column whose rounded grid cell is blocked.
  for (let dx=-2; dx<=2; dx++) for (let dz=-2; dz<=2; dz++) candidates.push([Math.round(x)+dx, Math.round(z)+dz]);
  candidates.sort((a,b) => Math.hypot(a[0]-x,a[1]-z)-Math.hypot(b[0]-x,b[1]-z));
  return candidates.find(([cx,cz]) => isWalkable(cx,cz,.45) && clearSegment(x,z,cx,cz));
}

// Bounded grid A*: clicks route around walls and the pond instead of through them.
export function findPath(sx: number, sz: number, tx: number, tz: number): [number, number][] {
  if (!isWalkable(sx,sz,.28) || !isWalkable(tx,tz,.28)) return [];
  if (clearSegment(sx,sz,tx,tz,.45)) return [[tx,tz]];
  const start = nearestCell(sx,sz), end = nearestCell(tx,tz);
  if (!start || !end) return [];
  const key = (x: number,z: number) => `${x},${z}`;
  const startKey = key(start[0],start[1]);
  const open = new Map<string, {x:number;z:number;g:number;f:number}>();
  const closed = new Set<string>();
  const previous = new Map<string,string>();
  open.set(startKey,{x:start[0],z:start[1],g:0,f:0});
  for (let step=0; open.size && step<3500; step++) {
    let best = open.values().next().value!;
    for (const v of open.values()) if (v.f<best.f) best=v;
    const k=key(best.x,best.z); open.delete(k); closed.add(k);
    if (best.x===end[0] && best.z===end[1]) {
      const path: [number,number][] = [[best.x,best.z],[tx,tz]]; let current=k;
      while (previous.has(current)) { current=previous.get(current)!; path.unshift(current.split(',').map(Number) as [number,number]); }
      return path;
    }
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const x=best.x+dx,z=best.z+dz,nk=key(x,z);
      if(closed.has(nk)||!isWalkable(x,z,.45)) continue;
      if(dx&&dz&&(!isWalkable(best.x+dx,best.z,.45)||!isWalkable(best.x,best.z+dz,.45))) continue;
      const g=best.g+Math.hypot(dx,dz);
      if(open.has(nk)&&open.get(nk)!.g<=g) continue;
      previous.set(nk,k);open.set(nk,{x,z,g,f:g+Math.hypot(end[0]-x,end[1]-z)});
    }
  }
  return [];
}
