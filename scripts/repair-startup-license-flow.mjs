import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const write=(p,s)=>fs.writeFileSync(p,s);
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};

// 1) Make the startup gate deterministic: packaged local tutorial, no remote startup dependency.
let gate=read('content/gate.js');
if(!gate.includes('const LOCAL_VIDEO=')){
  gate=gate.replace(
    'const REMOTE_VIDEO="https://fbhpdqykoptxnrbdcspr.supabase.co/storage/v1/object/public/kfs-media/tutorial/kfs-quickstart.mp4";let overlay=null,busy=false,fallbackUsed=false;',
    'const LOCAL_VIDEO=url("assets/gate/tutorial.mp4");let overlay=null,busy=false,fallbackUsed=false;'
  );
  gate=gate.replace('<source src="${REMOTE_VIDEO}" type="video/mp4">','<source src="${LOCAL_VIDEO}" type="video/mp4">');
  gate=gate.replace('Não foi possível carregar o vídeo remoto. Usando a cópia local otimizada.','Não foi possível carregar o vídeo local. Verifique a instalação oficial da extensão.');
  gate=gate.replace('chrome.runtime.sendMessage({type:"KFS_MEDIA_ENSURE"}).then(result=>{if(result?.ready&&result.url&&video&&video.paused&&video.currentTime===0){video.src=result.url;video.load()}}).catch(()=>{});','');
  gate=gate.replace('{type:"KFS_GATE_PASS",challenge:state.challenge}','{type:"KFS_GATE_CONTINUE",challenge:state.challenge}');
}
write('content/gate.js',gate);

// 2) Replace fragile webpage window.open with a background-owned extension page.
let licenseGate=read('content/license-gate.js');
if(licenseGate.includes('window.open(chrome.runtime.getURL("popup.html")')){
  licenseGate=licenseGate.replace(
    'function openExtension(){try{const url=chrome.runtime.getURL("popup.html");const w=window.open(url,"_blank","noopener");if(!w){const a=document.createElement("a");a.href=url;a.target="_blank";a.rel="noopener";a.click()}}catch(_){}}',
    'async function openExtension(){try{const result=await send({type:"KFS_OPEN_LICENSE_UI"});if(!result?.ok){const m=document.getElementById("kfs-lg-message");if(m)m.textContent=result?.message||"Não foi possível abrir a tela de licença."}}catch(_){const m=document.getElementById("kfs-lg-message");if(m)m.textContent="Não foi possível abrir a tela de licença. Abra a extensão manualmente."}}'
  );
}
write('content/license-gate.js',licenseGate);

// 3) Popup: stay inside Chrome's documented action-popup height budget and remain scroll-safe.
let css=read('popup.css');
css=css.replace('html,body{margin:0;width:342px;min-height:682px;background:transparent}', 'html,body{margin:0;width:342px;height:590px;min-height:0;max-height:590px;background:transparent;overflow:hidden}');
css=css.replace('.shell{position:relative;min-height:682px;padding:16px 14px 14px;overflow:hidden;', '.shell{position:relative;height:590px;min-height:0;padding:12px 14px 14px;overflow:auto;');
css=css.replace('.menu{position:relative;z-index:1;display:flex;', '.menu{position:relative;z-index:1;display:flex;padding-bottom:70px;');
write('popup.css',css);

// 4) Extension-owned license surface.
write('license.html', '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <title>KFS · License</title>\n</head>\n<body>\n  <script src="license-ui.js"></script>\n</body>\n</html>\n');

// 5) Manifest: declare the Keymaster host and the extension-owned full-page license surface.
const manifest=JSON.parse(read('manifest.json'));
manifest.host_permissions=[...new Set([...(manifest.host_permissions||[]),'https://kfs-keymaster.lovable.app/*'])];
manifest.options_ui={page:'license.html',open_in_tab:true};
manifest.web_accessible_resources=manifest.web_accessible_resources||[];
write('manifest.json',JSON.stringify(manifest));

// 6) Background-owned navigation + gate continuation. Keep licensing.js server-authoritative.
let bg=read('background.js');
if(!bg.includes('async function openLicenseUi()')){
  const helper='async function openLicenseUi(){try{await chrome.runtime.openOptionsPage();return{ok:true}}catch(error){return{ok:false,message:String(error?.message||"Não foi possível abrir a tela de licença.")}}}async function continueGate(challenge){const state=await getGateState();if(!state.integrityOk)return{ok:false,passed:false,message:"Integridade da extensão alterada."};if(String(challenge||"")!==state.challenge)return{ok:false,passed:false,message:"Sessão de acesso inválida."};const license=await getLicenseStatus();if(!license?.entitled){const opened=await openLicenseUi();if(!opened.ok)return opened;await chrome.storage.session.set({kfsGatePassed:true});return{ok:true,passed:true,opened:true}}await chrome.storage.session.set({kfsGatePassed:true});return{ok:true,passed:true,opened:false}}';
  const anchor='async function kfsLicenseDenial()';
  must(bg.includes(anchor),'background helper anchor missing');
  bg=bg.replace(anchor,helper+anchor);
}
if(!bg.includes('KFS_GATE_CONTINUE')){
  const anchor='if(message.type==="KFS_GATE_STATUS")return sendResponse(await getGateState());';
  must(bg.includes(anchor),'background message anchor missing');
  bg=bg.replace(anchor,anchor+'if(message.type==="KFS_GATE_CONTINUE")return sendResponse(await continueGate(message.challenge));if(message.type==="KFS_OPEN_LICENSE_UI")return sendResponse(await openLicenseUi());');
}
const gateHash='2db624574f771ca2dc99349e217dc83be37a3cd874f3db4d15cf4bf7667fe2e0';
const licenseHash='c9c9c684b3480487bbd9be16ff921a45d3540d187966900337604c530f0c469d';
bg=bg.replace(/("content\/gate\.js":")[0-9a-f]{64}("\s*,)/, `$1${gateHash}$2`);
if(bg.includes('"content/license-gate.js"')){bg=bg.replace(/("content\/license-gate\.js":")[0-9a-f]{64}("\s*,)/, `$1${licenseHash}$2`)}else{bg=bg.replace(/("content\/gate\.js":"[0-9a-f]{64}",)("content\/lovable\.js)/, `$1"content/license-gate.js":"${licenseHash}",$2`)}
must(bg.includes(gateHash),'gate integrity hash not updated');
must(bg.includes(licenseHash),'license-gate integrity hash not updated');
write('background.js',bg);

// 7) Make the CI licensing application script tolerant of an already-integrated background.
let apply=read('scripts/apply-keymaster-licensing.mjs');
if(!apply.includes('guardedSaveNeedle')){
  apply=apply.replace(
    'const saveNeedle=\'if(message.type==="KFS_SAVE_CONFIG"){const allowed=\';\nif(!bg.includes(saveNeedle))throw new Error("KFS_SAVE_CONFIG anchor missing");\nbg=bg.replace(saveNeedle,\'if(message.type==="KFS_SAVE_CONFIG"){if(message.patch?.hideLovableBranding===true){const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}const allowed=\');',
    'const saveNeedle=\'if(message.type==="KFS_SAVE_CONFIG"){const allowed=\';\nconst guardedSaveNeedle=\'if(message.type==="KFS_SAVE_CONFIG"){if(message.patch?.hideLovableBranding===true){const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}const allowed=\';\nif(!bg.includes(saveNeedle)&&!bg.includes(guardedSaveNeedle))throw new Error("KFS_SAVE_CONFIG anchor missing");\nif(bg.includes(saveNeedle))bg=bg.replace(saveNeedle,guardedSaveNeedle);'
  );
}
write('scripts/apply-keymaster-licensing.mjs',apply);

// 8) Keep the verification workflow aligned with the repaired architecture.
const verify=`name: Verify extension\n\non:\n  push:\n    branches: [main, fix/startup-license-mobile-flow]\n  pull_request:\n    branches: [main]\n\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - name: Check JavaScript syntax\n        run: |\n          for f in $(find . -type f \\( -name "*.js" -o -name "*.mjs" \\) -not -path './.git/*'); do node --check "$f"; done\n      - name: Validate extension architecture\n        run: |\n          node - <<'NODE'\n          const fs=require('fs');\n          const m=JSON.parse(fs.readFileSync('manifest.json','utf8'));\n          if(m.manifest_version!==3)throw new Error('manifest_version must be 3');\n          if(!m.options_ui?.page||m.options_ui.open_in_tab!==true)throw new Error('license options page missing');\n          if(!m.host_permissions.includes('https://kfs-keymaster.lovable.app/*'))throw new Error('Keymaster host permission missing');\n          if(!m.content_scripts?.some(x=>(x.js||[]).includes('content/license-gate.js')))throw new Error('license gate missing');\n          if(!fs.existsSync('license.html'))throw new Error('license.html missing');\n          if(!fs.existsSync('assets/gate/tutorial.mp4'))throw new Error('local tutorial missing');\n          const gate=fs.readFileSync('content/gate.js','utf8');\n          const lg=fs.readFileSync('content/license-gate.js','utf8');\n          const bg=fs.readFileSync('background.js','utf8');\n          const css=fs.readFileSync('popup.css','utf8');\n          if(!gate.includes('const LOCAL_VIDEO='))throw new Error('startup gate is not local-first');\n          if(gate.includes('KFS_MEDIA_ENSURE'))throw new Error('remote media ensure remains in startup gate');\n          if(lg.includes('window.open('))throw new Error('fragile window.open remains in license gate');\n          if(!bg.includes('KFS_OPEN_LICENSE_UI')||!bg.includes('KFS_GATE_CONTINUE'))throw new Error('background startup handlers missing');\n          if(!css.includes('height:590px')||css.includes('min-height:682px'))throw new Error('popup sizing not repaired');\n          console.log('architecture OK');\n          NODE\n`; 
write('.github/workflows/verify-extension.yml',verify);

console.log('Startup/license repair applied.');
