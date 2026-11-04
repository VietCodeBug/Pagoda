/** Download selected CC0 Poly Haven assets, embed model textures and keep a source ledger. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const output=path.resolve('public/assets');
const cache=path.resolve('.wrangler/scene-source-cache');
await fs.mkdir(output,{recursive:true});await fs.mkdir(cache,{recursive:true});
const credits=[];
async function download(url){
  if(!['api.polyhaven.com','dl.polyhaven.org'].includes(new URL(url).hostname))throw new Error('Unexpected asset host');
  const key=createHash('sha256').update(url).digest('hex');
  try{return await fs.readFile(path.join(cache,key));}catch{}
  const response=await fetch(url,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':'VirtualTempleOnline asset preparation'}});
  if(!response.ok)throw new Error(`Asset download failed (${response.status})`);
  if(Number(response.headers.get('content-length'))>25_000_000)throw new Error('Source exceeds web asset budget');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>25_000_000)throw new Error('Source exceeds web asset budget');
  await fs.writeFile(path.join(cache,key),bytes);return bytes;
}
async function info(id){return JSON.parse((await download(`https://api.polyhaven.com/files/${id}`)).toString());}
async function write(name,bytes,id){
  await fs.writeFile(path.join(output,name),bytes);
  credits.push({file:name,asset:id,source:`https://polyhaven.com/a/${id}`,license:'CC0-1.0',licenseUrl:'https://polyhaven.com/license',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  console.log(`${name}: ${(bytes.length/1048576).toFixed(2)} MiB`);
}
async function textureSet(id,prefix){
  const data=await info(id);
  for(const [kind,key] of [['color','Diffuse'],['normal','nor_gl'],['arm','arm']]){
    const item=(data[key]||data[key.toLowerCase()])['1k'].jpg;
    const bytes=await sharp(await download(item.url)).resize(1024,1024,{fit:'inside'}).jpeg({quality:kind==='color'?86:90,chromaSubsampling:'4:4:4'}).toBuffer();
    await write(`${prefix}-${kind}.jpg`,bytes,id);
  }
}
async function model(id,name){
  const data=await info(id),file=data.gltf['1k'].gltf;
  if(Object.values(file.include).some(f=>f.size>25_000_000))throw new Error('Model is too large for the browser');
  const json=JSON.parse((await download(file.url)).toString());
  const chunks=[];let length=0;
  function append(bytes){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const start=length;chunks.push(bytes);length+=bytes.length;return start;}
  const offsets=[];
  for(const buffer of json.buffers){const source=file.include[buffer.uri];if(!source)throw new Error('Missing model buffer');offsets.push(append(await download(source.url)));}
  for(const view of json.bufferViews){view.byteOffset=(view.byteOffset||0)+offsets[view.buffer];view.buffer=0;}
  for(const image of json.images||[]){
    const source=file.include[image.uri];if(!source)throw new Error('Missing embedded model texture');
    const raw=await download(source.url),meta=await sharp(raw).metadata();
    const resized=sharp(raw).resize({width:1024,height:1024,fit:'inside',withoutEnlargement:true});
    const encoded=meta.hasAlpha?await resized.png({compressionLevel:9}).toBuffer():await resized.jpeg({quality:86,chromaSubsampling:'4:4:4'}).toBuffer();
    image.bufferView=json.bufferViews.length;image.mimeType=meta.hasAlpha?'image/png':'image/jpeg';delete image.uri;
    json.bufferViews.push({buffer:0,byteOffset:append(encoded),byteLength:encoded.length});
  }
  json.asset.generator='Virtual Temple Online CC0 web asset pipeline';json.buffers=[{byteLength:length}];
  const binary=Buffer.concat(chunks),j=Buffer.from(JSON.stringify(json)),jp=Buffer.alloc((4-j.length%4)%4,32),bp=Buffer.alloc((4-binary.length%4)%4);
  const head=Buffer.alloc(20),bh=Buffer.alloc(8),total=28+j.length+jp.length+binary.length+bp.length;
  head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);head.writeUInt32LE(j.length+jp.length,12);head.writeUInt32LE(0x4e4f534a,16);
  bh.writeUInt32LE(binary.length+bp.length,0);bh.writeUInt32LE(0x004e4942,4);
  await write(name,Buffer.concat([head,j,jp,bh,binary,bp]),id);
}
const skyId='kloofendal_48d_partly_cloudy_puresky';
const sky=await info(skyId);
await write('golden-sky.hdr',await download(sky.hdri['2k'].hdr.url),skyId);
await textureSet('stone_floor','stone');
await textureSet('aerial_grass_rock','earth');
await textureSet('mossy_cobblestone','moss');
await model('boulder_01','boulder.glb');
await model('rock_moss_set_01','moss-rocks.glb');
await model('shrub_04','garden-shrub.glb');
await model('fern_02','garden-fern.glb');
await fs.writeFile(path.join(output,'scene-credits.json'),JSON.stringify({provider:'Poly Haven',license:'CC0-1.0',assets:credits},null,2)+'\n');
console.log(`Prepared ${credits.length} licensed scene assets (${(credits.reduce((s,a)=>s+a.bytes,0)/1048576).toFixed(2)} MiB).`);
