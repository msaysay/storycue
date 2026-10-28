const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..')),issues=[];
const ignored=new Set(['node_modules','.git','.next','.storycue-data','.storycue-work']);
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const full=path.join(dir,entry.name),name=path.relative(root,full).replaceAll('\\','/');
 if(entry.isDirectory()){if(!ignored.has(entry.name))walk(full);continue;}
 if(/(^|\/)(\.env(?!\.example$)|auth\.json|credentials.*|known_hosts|id_ed25519|.*\.pem$|.*\.key$)/i.test(name)){issues.push({file:name,reason:'private file path'});continue;}
 if(!/\.(?:[cm]?[jt]sx?|json|md|example|txt|yml|yaml)$/.test(name))continue;
 if(name==='tools/audit-storycue.cjs')continue;
 const content=fs.readFileSync(full,'utf8');
 if(/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(content)||/\b(?:sk-[A-Za-z0-9_-]{24,}|apikey_[A-Za-z0-9_]{24,})\b/.test(content))issues.push({file:name,reason:'credential-like value'});
 if(/\.niner[\\/]|wbSeedToken=/.test(content))issues.push({file:name,reason:'private runtime/account material'});
}}
walk(root);console.log(JSON.stringify({ok:issues.length===0,issues},null,2));if(issues.length)process.exitCode=1;
