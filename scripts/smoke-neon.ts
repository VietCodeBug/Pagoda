import assert from 'node:assert/strict';
import {config} from 'dotenv';
import {neon} from '@neondatabase/serverless';
import {createRealtime,rawSql} from '@neon/realtime/server';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {neonRealtimeConfig} from '../src/lib/server/neon-realtime-config';
import {PUBLIC_PRAYERS_SQL,type PublicPrayer} from '../src/lib/prayer-stream';

config({path:'.env',quiet:true});config({path:'.env.local',override:true,quiet:true});
const base=process.env.SMOKE_URL||'http://localhost:3000';
const sql=neon((process.env.DATABASE_URL||process.env.NEON_KEY)!);
const settings=neonRealtimeConfig(process.env);
const clients=[0,1].map(()=>createRealtime({...settings,db:settings.database,debugMode:false,logLevel:'silent'}));
const subs:Awaited<ReturnType<typeof clients[0]['subscribe']>>[]=[];
const playerId=crypto.randomUUID(),publicId=crypto.randomUUID(),privateId=crypto.randomUUID();
async function main(){try{
  for(const client of clients){const subscription=await client.subscribe(rawSql<PublicPrayer>(PUBLIC_PRAYERS_SQL));subs.push(subscription);await subscription.awaitRows(()=>true,20_000);}
  await sql`INSERT INTO vto_players (id,name,avatar) VALUES (${playerId}::uuid,'QA Neon live',0)`;
  await sql`INSERT INTO vto_prayers (id,player_id,name,text,is_public) VALUES (${privateId}::uuid,${playerId}::uuid,'QA Neon live','QA private visibility check',false),(${publicId}::uuid,${playerId}::uuid,'QA Neon live','QA public live check',true)`;
  for(const subscription of subs){
    await subscription.awaitRows(rows=>rows.some(row=>row.id===publicId),20_000);
    const rows=subscription.getSnapshot().data||[];
    assert(!rows.some(row=>row.id===privateId),'Private prayer must never reach a live public query');
    assert(rows.every(row=>!('player_id' in row)&&!('playerId' in row)),'Public projection must not disclose internal player IDs');
  }
  await sql`DELETE FROM vto_prayers WHERE id=${publicId}::uuid`;
  for(const subscription of subs)await subscription.awaitRows(rows=>!rows.some(row=>row.id===publicId),20_000);
  console.log('Two real Neon Realtime subscriptions: insert/delete propagated, private row excluded.');
  const [privileges]=await sql.query("SELECT has_table_privilege('anonymous','vto_players','SELECT') AS guest_profiles,has_table_privilege('authenticated','vto_prayers','SELECT') AS raw_prayers,has_table_privilege('anonymous','vto_public_prayers','SELECT') AS public_view");
  assert.equal(privileges.guest_profiles,false);assert.equal(privileges.raw_prayers,false);assert.equal(privileges.public_view,true);
  console.log('Data API roles: profiles/private source denied, public projection read-only.');
  for(const name of ['avatar.glb','golden-sky.hdr','garden-shrub.glb']){
    const response=await fetch(`${base}/api/assets/${name}`);
    assert.equal(response.status,200,`Storage download ${name}`);
    const got=Buffer.from(await response.arrayBuffer()),local=await readFile(`public/assets/${name}`);
    assert.equal(createHash('sha256').update(got).digest('hex'),createHash('sha256').update(local).digest('hex'));
  }
  const range=await fetch(`${base}/api/assets/temple-ambient.mp3`,{headers:{Range:'bytes=0-31'}});
  assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
  console.log('Neon S3: redirected model/sky downloads match SHA-256; audio byte-range works.');
}finally{
  subs.forEach(subscription=>subscription.unsubscribe());clients.forEach(client=>client.close());
  await sql`DELETE FROM vto_prayers WHERE player_id=${playerId}::uuid`;
  await sql`DELETE FROM vto_players WHERE id=${playerId}::uuid`;
}}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Neon verification failed');process.exitCode=1;});
