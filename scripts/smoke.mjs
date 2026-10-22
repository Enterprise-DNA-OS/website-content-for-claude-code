import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {migrate} from './migrate.mjs';
import {seed} from './seed.mjs';
import {run,usage,hash,extractLinks} from './content.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'website-content-'));
process.env.DATA_DIR=path.join(temp,'db');process.env.OUTPUT_DIR=temp;process.env.DATABASE_URL='';
const seen=new Set();let db;
const call=(c,a=[],o={})=>{seen.add(c);return run(db,c,a,o);};
const write=(n,b)=>{const f=path.join(temp,n);fs.writeFileSync(f,b);return f;};
const json=(n,v)=>write(n,JSON.stringify(v));
const future=new Date(Date.now()+40*86400000).toISOString().slice(0,10),past=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
const actor='Editor';
try{
 db=await getDb();assert.equal((await migrate(db)).ran.length,1);assert.equal((await migrate(db)).ran.length,0);await seed(db);await seed(db);
 assert.equal((await call('list')).length,4);assert.equal((await call('insights')).length,10);
 for(const c of ['help','datasets','content-week','attention','review-queue','references','compliance','imports','bundles'])assert(Array.isArray(await call(c)));
 assert((await call('attention')).some(x=>x.issue==='retention decision due'));assert((await call('references')).some(x=>x.state==='missing target'));
 const ds=await call('add-dataset',[],{name:'Test site'}),rules=json('rules.json',{title:{type:'string',required:true},body:{type:'string',required:true}});
 await call('set-type',[],{dataset:ds.id,name:'page',rules,actor});assert.equal((await call('types',[],{dataset:ds.id})).length,1);
 const data={_id:'about',_type:'page',title:'About <script>alert(1)</script>',body:'A & B',blocks:[{_type:'block',children:[{text:'Portable text retained'}]}]};
 const d=await call('add',[],{dataset:ds.id,data:json('about.json',data),owner:'Owner',due:past,actor});
 assert.equal((await call('show',[d.id.slice(0,12)])).document.source_id,'about');
 await assert.rejects(()=>call('approve',[d.id],{actor,decision:'approved',evidence:'Checked'}),/differ/);
 await assert.rejects(()=>call('assign',[d.id],{actor,owner:'Owner',due:'2026-02-30','review-due':future}),/valid/);
 await call('assign',[d.id],{actor,owner:'Owner',due:future,'review-due':future});
 await call('classify',[d.id],{actor,privacy:'personal',purpose:'Team biography',retention:future});
 await assert.rejects(()=>call('approve',[d.id],{actor:'Reviewer',decision:'approved',evidence:'Checked'}),/accuracy/);
 await call('verify',[d.id],{actor,evidence:'Compared with source and owner sign-off'});
 await call('approve',[d.id],{actor:'Reviewer',decision:'approved',evidence:'Read exact revision'});
 const b=await call('bundle',[],{dataset:ds.id,name:'First handover',actor:'Operator'});assert.equal(b.published,false);assert.equal(b.documents,1);assert.equal(hash(fs.readFileSync(b.file,'utf8')),b.sha256);
 const bundleRecord=(await db.query('select snapshot from bundles where id=$1',[b.id]))[0];assert.equal(bundleRecord.snapshot[0].document.body,'A & B');
 await call('revise',[d.id],{actor,note:'New wording',data:json('changed.json',{...data,body:'Changed'})});
 await assert.rejects(()=>call('bundle',[],{dataset:ds.id,name:'Stale',actor:'Operator'}),/accuracy.*approval/s);
 await call('verify',[d.id],{actor,evidence:'Rechecked changed wording'});
 await call('approve',[d.id],{actor:'Reviewer',decision:'changes',evidence:'Needs another check'});
 await assert.rejects(()=>call('bundle',[],{dataset:ds.id,name:'Rejected',actor:'Operator'}),/approval/);
 await call('approve',[d.id],{actor:'Reviewer',decision:'approved',evidence:'Now checked'});
 await call('set-type',[],{dataset:ds.id,name:'page',rules,actor});
 await assert.rejects(()=>call('bundle',[],{dataset:ds.id,name:'Rules changed',actor:'Operator'}),/approval/);
 await call('approve',[d.id],{actor:'Reviewer',decision:'approved',evidence:'New field rules checked'});
 // Strong, weak, external, draft-only and missing references all require deliberate mapping.
 assert.equal(extractLinks({link:{_ref:'x',_weak:true,_dataset:'other'}})[0].external,true);
 await call('revise',[d.id],{actor,note:'Broken link',data:json('ref.json',{...data,link:{_ref:'unknown',_weak:true}})});
 await call('classify',[d.id],{actor,privacy:'business'});await call('approve',[d.id],{actor:'Reviewer',decision:'approved',evidence:'Words checked'});
 await assert.rejects(()=>call('bundle',[],{dataset:ds.id,name:'Broken link',actor:'Operator'}),/reference not in bundle/);
 // Native NDJSON preserves IDs, draft/release variants, assets and source metadata without executing anything.
 const incoming=[{_id:'home',_type:'page',title:'Home',body:'Imported',_rev:'source-rev',_createdAt:'2020-01-01T00:00:00Z'},
 {_id:'drafts.home',_type:'page',title:'Home draft',body:'Draft'},
 {_id:'versions.release1.home',_type:'page',title:'Scheduled Home',body:'Later'},
 {_id:'image-abc-10x10-png',_type:'sanity.imageAsset',url:'https://example.invalid/image.png'},
 {_id:'_.internal',_type:'system.note',title:'Internal metadata'}];
 const file=write('data.ndjson','\uFEFF'+incoming.map(x=>JSON.stringify(x)).join('\r\n')+'\r\n');const io={dataset:ds.id,owner:'Importer',actor:'Importer'};
 const before=(await call('list')).length;const dry=await call('import',['sanity',file],{...io,'dry-run':true});assert.equal(dry.inserted,5);assert.equal((await call('list')).length,before);
 await assert.rejects(()=>call('import',['sanity',file],{...io,dryrun:true}),/Unknown option/);
 await assert.rejects(()=>call('import',['sanity',file],{...io,'dry-run':'false'}),/boolean flag/);
 const receipt=await call('import',['sanity',file],io);assert.equal(receipt.inserted,5);assert.equal(receipt.variants.asset,1);assert.equal(receipt.variants.release,1);
 assert.equal((await call('import',['sanity',file],io)).unchanged,5);assert.equal((await call('imports')).length,1);
 const bad=write('conflict.ndjson',JSON.stringify({_id:'first-new',_type:'page',title:'New'})+'\n'+JSON.stringify({...incoming[0],body:'Conflict'}));await assert.rejects(()=>call('import',['sanity',bad],io),/conflict/);assert.equal((await db.query("select count(*)::int n from documents where source_id='first-new'"))[0].n,0);
 await assert.rejects(()=>call('import',['sanity',write('duplicate.ndjson',JSON.stringify(incoming[0])+'\n'+JSON.stringify(incoming[0]))],io),/Duplicate/);
 await assert.rejects(()=>call('import',['sanity',write('bad.ndjson','{"_id":')],io),/Line 1/);
 await assert.rejects(()=>call('import',['sanity',write('poison.ndjson','{"_id":"bad","_type":"page","__proto__":{}}')],io),/Reserved/);
 await assert.rejects(()=>call('import',['sanity','archive.tar.gz'],io),/Extract/);
 const native=await call('export',[],{format:'sanity',dataset:ds.id,out:path.join(temp,'export.ndjson')});const exported=fs.readFileSync(native.file,'utf8').trim().split('\n').map(JSON.parse);for(const x of incoming)assert.deepEqual(exported.find(d=>d._id===x._id),x);
 const roundtrip=await call('add-dataset',[],{name:'Roundtrip'});assert.equal((await call('import',['sanity',native.file],{...io,dataset:roundtrip.id})).inserted,6);
 await assert.rejects(()=>call('show',['Home']),/Ambiguous/);assert.equal((await call('show',['services overview'])).document.source_id,'services');
 await assert.rejects(()=>db.query('update revisions set note=$1',['tampered']),/append-only/);
 await assert.rejects(()=>db.query('delete from bundles'),/append-only/);
 await call('archive',[d.id],{actor,note:'Retired after review'});await assert.rejects(()=>call('revise',[d.id],{actor,note:'No',data:json('old.json',data)}),/archived/);
 await assert.rejects(()=>call('import',['sanity',write('archived.ndjson',JSON.stringify(data))],io),/conflict/);
 assert((await call('history',[d.id])).length>5);
 const draft=await call('draft-brief',[d.id]);const html=fs.readFileSync(draft.file,'utf8');assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert.equal(draft.sent,false);
 const weekly=await call('weekly-review');assert(fs.readFileSync(weekly.file,'utf8').includes('compliance'));
 const backup=await call('export',[],{out:path.join(temp,'all.json')});const records=JSON.parse(fs.readFileSync(backup.file)).records;assert.equal(records.bundles.length,1);assert(records.revisions.length>8);await assert.rejects(()=>call('export',[],{out:backup.file}),/EEXIST/);
 // SQL constraints and RLS prevent accidental access through an untrusted database role.
 await db.exec('create role content_reader');await db.exec('grant usage on schema public to content_reader');await db.exec('grant select on documents,datasets,content_week to content_reader');await db.exec('set role content_reader');assert.equal((await db.query('select * from documents')).length,0);assert.equal((await db.query('select * from content_week')).length,0);await db.exec('reset role');
 assert.deepEqual([...seen].sort(),Object.keys(usage).sort());await db.close();db=null;
 for(const script of ['view','docs']){const out=spawnSync(process.execPath,[`scripts/${script}.mjs`],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});assert.equal(out.status,0,out.stderr);}
 assert.equal(fs.readdirSync(path.join(temp,'views')).length,3);assert(fs.readdirSync(path.join(temp,'docs-out')).includes('delivery-manifest'));
 const cli=spawnSync(process.execPath,['scripts/content.mjs','datasets','--json'],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).length,3);
 const ambiguous=spawnSync(process.execPath,['scripts/content.mjs','show','Home'],{cwd:REPO_ROOT,env:process.env,encoding:'utf8'});assert.equal(ambiguous.status,1);assert.match(ambiguous.stderr,/Ambiguous/);
 console.log(`PASS: ${seen.size} CLI commands; imports, conflicts, roundtrip, review invalidation, bundle gates, RLS, immutable evidence, HTML and CLI exits`);
}finally{if(db)await db.close();fs.rmSync(temp,{recursive:true,force:true});}
