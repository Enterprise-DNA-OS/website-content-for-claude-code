#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {page,table,writeOut} from './lib/render.mjs';
import {table as textTable} from './lib/format.mjs';
const printTable=rows=>console.log(textTable(rows,Object.keys(rows[0]||{result:''}).map(key=>({key,label:key,width:key==='id'?12:75,format:v=>v&&typeof v==='object'?JSON.stringify(v):v}))));

export const usage={
 help:'Show commands',datasets:'List datasets','add-dataset':'--name=NAME',types:'--dataset=NAME',
 'set-type':'--dataset=NAME --name=TYPE --rules=FILE --actor=NAME',
 list:'[--dataset=NAME] [--type=TYPE]',show:'ID or exact name','content-week':'Content plan',attention:'Overdue work and missing evidence',
 'review-queue':'Current review decisions',references:'Missing or cross-dataset references',compliance:'Evidence checks, not a compliance certificate',insights:'Ten cross-record questions',
 add:'--dataset=NAME --data=FILE --owner=NAME --due=DATE --actor=NAME',
 revise:'ID --data=FILE --actor=NAME --note=TEXT',assign:'ID --owner=NAME --due=DATE --review-due=DATE --actor=NAME',
 classify:'ID --privacy=business|personal --purpose=TEXT --retention=DATE --actor=NAME',
 verify:'ID --evidence=TEXT --actor=NAME',approve:'ID --decision=approved|changes --evidence=TEXT --actor=NAME',
 archive:'ID --note=TEXT --actor=NAME',history:'ID',
 import:'sanity FILE.ndjson --dataset=NAME --owner=NAME --actor=NAME [--dry-run]',
 imports:'Import receipts',export:'--out=FILE.json [--format=sanity --dataset=NAME]',
 bundle:'--dataset=NAME --name=NAME --actor=NAME',bundles:'Saved local delivery snapshots',
 'draft-brief':'ID','weekly-review':'Draft Monday summary from week, attention and compliance'
};
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const required=(o,k)=>{const v=o[k];if(typeof v!=='string'||!v.trim())throw Error(`Required --${k}=VALUE`);return v.trim();};
const date=v=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Use a valid YYYY-MM-DD date');return v;};
const today=()=>new Date().toISOString().slice(0,10);
const iso=v=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
const canonical=x=>JSON.stringify(x&&typeof x==='object'?Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):x);
const jsonFile=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function safeObject(v,depth=0){if(depth>60)throw Error('Content exceeds 60 levels');if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Reserved property in content');safeObject(x,depth+1);}}
function documentData(data){safeObject(data);if(!data||Array.isArray(data)||typeof data!=='object'||typeof data._id!=='string'||!data._id.trim()||typeof data._type!=='string'||!data._type.trim())throw Error('Each document needs string _id and _type');return data;}
function variant(d){return d._id.startsWith('drafts.')?'draft':d._id.startsWith('versions.')?'release':d._type==='sanity.imageAsset'||d._type==='sanity.fileAsset'?'asset':d._id.startsWith('_.')||d._type.startsWith('system.')?'system':'content';}
function label(d){return typeof d.title==='string'?d.title:typeof d.name==='string'?d.name:d._id;}
export function extractLinks(v,at='$',out=[]){if(v&&typeof v==='object'){if(typeof v._ref==='string')out.push({target:v._ref,path:at,weak:v._weak===true,external:Boolean(v._dataset||v._projectId)});for(const[k,x]of Object.entries(v))if(x&&typeof x==='object')extractLinks(x,`${at}.${k}`,out);}return out;}
async function tx(db,fn){await db.exec('BEGIN');try{const x=await fn();await db.exec('COMMIT');return x;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function resolve(db,tableName,q){if(!q)throw Error('Provide an ID or exact name');const rows=await db.query(`select * from ${tableName} where id::text=$1 or lower(name)=lower($1) or left(id::text,length($1))=$1 order by name,id`,[q]);if(rows.length!==1)throw Error(`${rows.length?'Ambiguous':'No match'}: ${q}\n${rows.map(r=>`${r.id}  ${r.name}`).join('\n')}`);return rows[0];}
async function record(db,d,actor,note){await db.query('insert into revisions(document_id,revision,snapshot,actor,note) values($1,$2,$3,$4,$5)',[d.id,d.revision,JSON.stringify(d),actor,note]);await db.query('delete from content_links where document_id=$1',[d.id]);for(const l of extractLinks(d.payload))await db.query('insert into content_links(document_id,target_source_id,field_path,weak,external) values($1,$2,$3,$4,$5)',[d.id,l.target,l.path,l.weak,l.external]);}
async function update(db,d,fields,actor,note){if(d.archived)throw Error('Record is archived');const locked=(await db.query('select revision from documents where id=$1 for update',[d.id]))[0];if(locked.revision!==d.revision)throw Error('Concurrent update: reload the document');const ks=Object.keys(fields);const vals=ks.map(k=>k==='payload'?JSON.stringify(fields[k]):fields[k]);const [next]=await db.query(`update documents set ${ks.map((k,i)=>`${k}=$${i+2}`).join(',')},revision=revision+1,last_actor=$${ks.length+2} where id=$1 returning *`,[d.id,...vals,actor]);await record(db,next,actor,note);return next;}
async function insert(db,ds,data,owner,actor,due=null){const[d]=await db.query('insert into documents(dataset_id,source_id,name,type_name,variant,payload,owner,due,last_actor) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *',[ds.id,data._id,label(data),data._type,variant(data),JSON.stringify(data),owner,due,actor]);await record(db,d,actor,'Created from content');return d;}
export function validateRules(rules){safeObject(rules);if(!rules||Array.isArray(rules)||typeof rules!=='object')throw Error('Rules must be an object');for(const [k,v]of Object.entries(rules)){if(!k||!v||typeof v!=='object'||!['string','number','boolean','array','object'].includes(v.type)||typeof v.required!=='boolean')throw Error('Each field rule needs type and boolean required');if(Object.keys(v).some(k=>!['type','required'].includes(k)))throw Error('Unsupported rule property');}return rules;}
function schemaIssues(d,t){if(!t)return ['content type has no reviewed field rules'];const issues=[];for(const[k,r]of Object.entries(t.rules)){const v=d.payload[k];if(v===undefined||v===null||v===''){if(r.required)issues.push(`missing required field: ${k}`);}else if((Array.isArray(v)?'array':typeof v)!==r.type)issues.push(`wrong field type: ${k}`);}return issues;}
async function issues(db,d,{approval=false}={}){
 const [t]=await db.query('select * from content_types where dataset_id=$1 and name=$2',[d.dataset_id,d.type_name]);const out=schemaIssues(d,t);
 if(d.archived)out.push('archived');if(d.privacy==='unclassified')out.push('classification missing');
 if(!d.review_due||iso(d.review_due)<today())out.push('current review date required');
 if(d.privacy==='personal'){if(!d.purpose||!d.retention_due)out.push('personal information needs purpose and retention decision');if(!d.accuracy_evidence)out.push('accuracy evidence missing');if(d.retention_due&&iso(d.retention_due)<today())out.push('retention decision due');}
 if(approval){const[a]=await db.query('select * from approvals where document_id=$1 order by created_at desc,id desc limit 1',[d.id]);if(!a||a.revision!==d.revision||a.type_version!==t?.version||a.decision!=='approved')out.push('current independent approval required');}
 return out;
}
const source8='https://www.privacy.org.nz/privacy-principles/8/';
const source9='https://www.privacy.org.nz/privacy-principles/9/';
export async function run(db,cmd,args=[],o={}){
 if(!Object.hasOwn(usage,cmd))throw Error(`Unknown command ${cmd}; run help`);
 const allowed={help:[],datasets:[],'add-dataset':['name'],types:['dataset'],'set-type':['dataset','name','rules','actor'],list:['dataset','type'],show:[],'content-week':[],attention:[],'review-queue':[],references:[],compliance:[],insights:[],add:['dataset','data','owner','due','actor'],revise:['data','actor','note'],assign:['owner','due','review-due','actor'],classify:['privacy','purpose','retention','actor'],verify:['evidence','actor'],approve:['decision','evidence','actor'],archive:['note','actor'],history:[],import:['dataset','owner','actor','dry-run'],imports:[],export:['out','format','dataset'],bundle:['dataset','name','actor'],bundles:[],'draft-brief':[],'weekly-review':[]};
 for(const k of Object.keys(o))if(k!=='json'&&!allowed[cmd].includes(k))throw Error(`Unknown option --${k} for ${cmd}`);
 for(const k of ['json','dry-run'])if(k in o&&o[k]!==true)throw Error(`--${k} is a boolean flag without a value`);
 if(cmd==='help')return Object.entries(usage).map(([command,arguments_])=>({command,arguments:arguments_}));
 if(cmd==='datasets')return db.query('select id,name from datasets order by name');
 if(cmd==='add-dataset'){const [d]=await db.query('insert into datasets(name) values($1) returning *',[required(o,'name')]);return d;}
 if(cmd==='types'){const d=await resolve(db,'datasets',required(o,'dataset'));return db.query('select name,rules,version from content_types where dataset_id=$1 order by name',[d.id]);}
 if(cmd==='set-type'){const d=await resolve(db,'datasets',required(o,'dataset'));required(o,'actor');const rules=validateRules(jsonFile(required(o,'rules')));const [t]=await db.query('insert into content_types(dataset_id,name,rules) values($1,$2,$3) on conflict(dataset_id,name) do update set rules=excluded.rules,version=content_types.version+1 returning *',[d.id,required(o,'name'),JSON.stringify(rules)]);return t;}
 if(cmd==='list'){const ds=o.dataset?await resolve(db,'datasets',o.dataset):null;return db.query('select d.id,d.name,s.name dataset,d.type_name,d.variant,d.owner,d.revision,d.archived from documents d join datasets s on s.id=d.dataset_id where ($1::uuid is null or d.dataset_id=$1) and ($2::text is null or d.type_name=$2) order by s.name,d.name,d.id',[ds?.id||null,o.type||null]);}
 if(['content-week','attention','review-queue'].includes(cmd))return db.query(`select * from ${{'content-week':'content_week',attention:'attention','review-queue':'review_queue'}[cmd]} order by name,id`);
 if(cmd==='references')return db.query(`select d.name,l.field_path,l.target_source_id,l.weak,l.external, case when l.external then 'external reference requires mapping' when t.id is null then 'missing target' when t.archived then 'archived target' else 'present' end state from content_links l join documents d on d.id=l.document_id left join documents t on t.dataset_id=d.dataset_id and t.source_id=l.target_source_id where not d.archived order by d.name,l.field_path`);
 if(cmd==='imports')return db.query('select id,source_name,sha256,receipt,actor,created_at from import_runs order by created_at,id');
 if(cmd==='bundles')return db.query('select id,name,sha256,actor,created_at from bundles order by created_at,id');
 if(cmd==='show'||cmd==='history'){const d=await resolve(db,'documents',args[0]);const revisions=await db.query('select revision,actor,note,created_at from revisions where document_id=$1 order by revision',[d.id]);if(cmd==='history')return revisions;return {document:d,issues:await issues(db,d,{approval:true}),history:revisions};}
 if(cmd==='compliance'){const out=[];for(const d of await db.query('select * from documents order by name,id')){const warnings=d.archived?(d.privacy==='personal'&&d.retention_due&&iso(d.retention_due)<today()?['retention decision due']:[]):await issues(db,d);for(const issue of warnings)out.push({name:d.name,owner:d.owner,issue,source:/accuracy/.test(issue)?source8:/retention|purpose/.test(issue)?source9:'House rule: docs/compliance.md'});}return out;}
 if(cmd==='insights'){
 const docs=await db.query('select * from documents order by name,id'),refs=await run(db,'references'),queue=await run(db,'review-queue'),checks=await run(db,'compliance');
 const count=(question,rows)=>({question,count:rows.length,records:rows.map(r=>r.name).join('; ')||'None'});
 return [count('Which overdue items still lack a current approval?',docs.filter(d=>!d.archived&&d.due&&iso(d.due)<today()&&!queue.some(q=>q.id===d.id&&q.current_review&&q.decision==='approved'))),
 count('Which content contains broken references?',refs.filter(r=>r.state!=='present')),
 count('Which personal records have expired retention decisions?',docs.filter(d=>d.privacy==='personal'&&d.retention_due&&iso(d.retention_due)<today())),
 count('Which documents are missing required fields?',checks.filter(c=>c.issue.startsWith('missing required'))),
 count('Which approved records became stale after edits or rule changes?',queue.filter(q=>q.decision==='approved'&&!q.current_review)),
 count('Which drafts are overdue?',docs.filter(d=>!d.archived&&d.variant==='draft'&&d.due&&iso(d.due)<today())),
 count('Which owners have work due this week?',docs.filter(d=>!d.archived&&d.due&&iso(d.due)>=today()&&iso(d.due)<=new Date(Date.now()+7*86400000).toISOString().slice(0,10)).map(d=>({name:`${d.owner}: ${d.name}`}))),
 count('Which imports still need classification?',docs.filter(d=>!d.archived&&d.privacy==='unclassified')),
 count('Which personal documents lack accuracy evidence?',docs.filter(d=>!d.archived&&d.privacy==='personal'&&!d.accuracy_evidence)),
 count('Which content depends on another dataset?',refs.filter(r=>r.external))];
 }
 if(cmd==='add'){const ds=await resolve(db,'datasets',required(o,'dataset'));const data=documentData(jsonFile(required(o,'data')));return tx(db,()=>insert(db,ds,data,required(o,'owner'),required(o,'actor'),date(required(o,'due'))));}
 if(['revise','assign','classify','verify','archive'].includes(cmd)){
 const d=await resolve(db,'documents',args[0]);const actor=required(o,'actor');let fields,note=cmd;
 if(cmd==='revise'){const data=documentData(jsonFile(required(o,'data')));if(data._id!==d.source_id||data._type!==d.type_name)throw Error('A revision must retain _id and _type');fields={payload:data,name:label(data),accuracy_evidence:null};note=required(o,'note');}
 if(cmd==='assign')fields={owner:required(o,'owner'),due:date(required(o,'due')) ,review_due:date(required(o,'review-due'))};
 if(cmd==='classify'){const privacy=required(o,'privacy');if(!['business','personal'].includes(privacy))throw Error('Privacy must be business or personal');fields={privacy,purpose:privacy==='personal'?required(o,'purpose'):null,retention_due:privacy==='personal'?date(required(o,'retention')):null,accuracy_evidence:null};}
 if(cmd==='verify')fields={accuracy_evidence:required(o,'evidence')};
 if(cmd==='archive'){fields={archived:true};note=required(o,'note');}
 return tx(db,()=>update(db,d,fields,actor,note));
 }
 if(cmd==='approve')return tx(db,async()=>{
 let d=await resolve(db,'documents',args[0]);[d]=await db.query('select * from documents where id=$1 for update',[d.id]);const actor=required(o,'actor'),decision=required(o,'decision'),evidence=required(o,'evidence');
 if(!['approved','changes'].includes(decision))throw Error('Decision must be approved or changes');
 if(actor.toLowerCase()===d.last_actor.trim().toLowerCase())throw Error('Reviewer must differ from last editor');
 const[t]=await db.query('select * from content_types where dataset_id=$1 and name=$2 for share',[d.dataset_id,d.type_name]);
 if(!t)throw Error('Define field rules before review');
 if(decision==='approved'){const checks=await issues(db,d);if(checks.length)throw Error(checks.join('; '));}
 const[a]=await db.query('insert into approvals(document_id,revision,type_version,decision,actor,evidence) values($1,$2,$3,$4,$5,$6) returning *',[d.id,d.revision,t.version,decision,actor,evidence]);return a;
 });
 if(cmd==='import'){
 if(args[0]!=='sanity')throw Error('Supported import: sanity FILE.ndjson');const file=args[1];if(!file||!/\.ndjson$/i.test(file))throw Error('Extract data.ndjson from the Sanity export archive first; binary assets remain separate');
 const raw=fs.readFileSync(file,'utf8');if(Buffer.byteLength(raw)>50*1024*1024)throw Error('Import exceeds 50 MB; split into NDJSON batches');
 const data=raw.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim()).map((line,i)=>{try{return documentData(JSON.parse(line));}catch(e){throw Error(`Line ${i+1}: ${e.message}`);}});if(!data.length)throw Error('Empty import');if(new Set(data.map(d=>d._id)).size!==data.length)throw Error('Duplicate _id in import');
 const ds=await resolve(db,'datasets',required(o,'dataset')),owner=required(o,'owner'),actor=required(o,'actor');
 return tx(db,async()=>{const receipt={inserted:0,unchanged:0,documents:data.length,variants:{}};const plan=[];
 for(const d of data){const [old]=await db.query('select * from documents where dataset_id=$1 and source_id=$2 for update',[ds.id,d._id]);if(old&&(old.archived||canonical(old.payload)!==canonical(d)))throw Error(`Import conflict: ${d._id}. Reconcile through revise; no records were changed.`);receipt[old?'unchanged':'inserted']++;receipt.variants[variant(d)]=(receipt.variants[variant(d)]||0)+1;plan.push({d,old});}
 if(o['dry-run'])return {...receipt,dry_run:true};
 for(const {d,old}of plan)if(!old)await insert(db,ds,d,owner,actor);
 if(receipt.inserted)await db.query('insert into import_runs(dataset_id,sha256,source_name,receipt,actor) values($1,$2,$3,$4,$5)',[ds.id,hash(raw),path.basename(file),JSON.stringify(receipt),actor]);return receipt;
 });
 }
 if(cmd==='export')return tx(db,async()=>{
 await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const out=path.resolve(required(o,'out'));let body;
 if(o.format&&o.format!=='sanity')throw Error('Format must be sanity or omitted for complete JSON');
 if(o.format==='sanity'){const ds=await resolve(db,'datasets',required(o,'dataset'));body=(await db.query('select payload from documents where dataset_id=$1 order by source_id',[ds.id])).map(d=>JSON.stringify(d.payload)).join('\n')+'\n';}
 else{const records={};for(const t of ['datasets','content_types','documents','revisions','approvals','content_links','import_runs','bundles'])records[t]=await db.query(`select * from ${t} order by id`);body=JSON.stringify({format:'website-content-v1',records},null,2)+'\n';}
 fs.mkdirSync(path.dirname(out),{recursive:true,mode:0o700});fs.writeFileSync(out,body,{flag:'wx',mode:0o600});return {file:out,sha256:hash(body)};
 });
 if(cmd==='bundle')return tx(db,async()=>{
 const ds=await resolve(db,'datasets',required(o,'dataset')),name=required(o,'name'),actor=required(o,'actor');
 // Freeze source content and rules until validation and snapshot insertion complete.
 await db.query('select id from content_types where dataset_id=$1 for share',[ds.id]);
 const docs=await db.query("select * from documents where dataset_id=$1 and not archived and variant in ('content','asset') order by source_id for share",[ds.id]);if(!docs.length)throw Error('No content or asset records to bundle');
 const ids=new Set(docs.map(d=>d.source_id)),blocked=[];for(const d of docs){const checks=await issues(db,d,{approval:true});for(const l of extractLinks(d.payload)){if(l.external)checks.push(`external reference needs mapping: ${l.target}`);else if(!ids.has(l.target))checks.push(`reference not in bundle: ${l.target}${l.weak?' (weak)':''}`);}if(checks.length)blocked.push(`${d.name}: ${checks.join('; ')}`);}
 if(blocked.length)throw Error('Bundle held:\n'+blocked.join('\n'));
 const snapshot=docs.map(d=>({id:d.id,revision:d.revision,document:d.payload})),body=JSON.stringify(snapshot),sha=hash(body);
 const[b]=await db.query('insert into bundles(dataset_id,name,snapshot,sha256,actor) values($1,$2,$3,$4,$5) returning id',[ds.id,name,body,sha,actor]);
 const dir=path.resolve(process.env.OUTPUT_DIR||REPO_ROOT,'exports');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`bundle-${b.id}.json`);fs.writeFileSync(file,body,{flag:'wx',mode:0o600});return {id:b.id,file,documents:docs.length,sha256:sha,published:false};
 });
 if(cmd==='draft-brief'){const d=await resolve(db,'documents',args[0]);const sections=[{title:'Content',html:table([{name:d.name,owner:d.owner,revision:d.revision,content:d.payload}])},{title:'Checks',html:table((await issues(db,d,{approval:true})).map(issue=>({issue})))},{title:'History',html:table(await run(db,'history',[d.id]))}];return {file:writeOut('drafts',`brief-${d.id}`,page({title:'Content review brief',subtitle:d.name,sections})),sent:false};}
 if(cmd==='weekly-review'){const sections=[];for(const c of ['content-week','attention','compliance'])sections.push({title:c,html:table(await run(db,c))});return {file:writeOut('drafts',`weekly-${today()}`,page({title:'Monday content review',sections})),sent:false};}
}

export function parseArgs(argv){const args=[],o=Object.create(null);for(const a of argv){if(!a.startsWith('--'))args.push(a);else{const i=a.indexOf('=');const k=a.slice(2,i<0?undefined:i);if(Object.hasOwn(o,k))throw Error(`Duplicate option --${k}`);o[k]=i<0?true:a.slice(i+1);}}return {cmd:args.shift()||'help',args,o};}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){let db;try{const {cmd,args,o}=parseArgs(process.argv.slice(2));db=await getDb();const result=await run(db,cmd,args,o);if(o.json)console.log(JSON.stringify(result,null,2));else if(Array.isArray(result))printTable(result);else console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}finally{if(db)await db.close();}}
