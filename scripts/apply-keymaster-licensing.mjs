import fs from "node:fs";
import crypto from "node:crypto";

const bgPath="background.js";
const cleanerPath="content/cleaner.js";
const manifestPath="manifest.json";
const popupPath="popup.html";
const licensingPath="licensing.js";
const licenseGatePath="content/license-gate.js";

const guard="{const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}";
const guardRunRe=/(?:\{const denial=await kfsLicenseDenial\(\);if\(denial\)return sendResponse\(denial\);\})+/g;
const protectedTypes=["KFS_COMMAND","KFS_ENHANCE","KFS_REMOVE_LOVABLE_BRANDING"];
const startupPrefix='if(message.type==="__TYPE__"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});';

let bg=fs.readFileSync(bgPath,"utf8");
if(!bg.includes('from "./licensing.js"')){
  bg=`import {authorizePaidOperation,initializeLicensing,startTrial,activateLicense,deactivateLicense,getLicenseStatus,refreshLease,LICENSE_REFRESH_ALARM} from "./licensing.js";\n${bg}`;
}
if(!bg.includes("function kfsLicenseDenial")){
  const anchor='async function getConfig()';
  if(!bg.includes(anchor))throw new Error("background insertion anchor missing: getConfig");
  const helper='async function kfsLicenseDenial(){const s=await authorizePaidOperation("1.9.0");return s.entitled?null:{ok:false,reason:"license_required",state:s.state,code:s.code||undefined,message:s.message||"Licença necessária para esta função."};}';
  bg=bg.replace(anchor,`${helper}${anchor}`);
}

// Collapse every adjacent run of licensing guards to exactly one.
bg=bg.replace(guardRunRe,guard);

// Ensure every protected message handler has exactly one guard immediately after the startup gate.
for(const type of protectedTypes){
  const prefix=startupPrefix.replace("__TYPE__",type);
  const start=bg.indexOf(prefix);
  if(start<0)throw new Error(`protected handler anchor missing: ${type}`);
  const next=bg.indexOf('if(message.type===',start+prefix.length);
  const end=next<0?bg.length:next;
  const segment=bg.slice(start,end);
  const guardCount=(segment.match(/kfsLicenseDenial\(\)/g)||[]).length;
  if(guardCount===0){
    bg=bg.slice(0,start)+prefix+guard+bg.slice(start+prefix.length);
  }else if(guardCount!==1){
    throw new Error(`unexpected guard normalization state: ${type} count=${guardCount}`);
  }
}

// Keep the license-page enforcement from racing the startup gate overlay.
let licenseGate=fs.readFileSync(licenseGatePath,"utf8");
if(!licenseGate.includes("kfsStartupGateReady")){
  licenseGate=licenseGate.replace(
    'async function check(){try{const status=await send({type:"KFS_LICENSE_STATUS"});if(status?.entitled){if(shown)remove();return true}show(status);return false}catch(_){show({state:"NETWORK_UNAVAILABLE"});return false}}\n  function boot(){void check();timer=setInterval(()=>{if(!document.hidden)void check()},10000)}',
    'let kfsStartupGateReady=false;let kfsStartupGatePromise=null;\n  async function waitForStartupGate(){if(kfsStartupGateReady)return true;if(kfsStartupGatePromise)return kfsStartupGatePromise;kfsStartupGatePromise=(async()=>{try{const state=await send({type:"KFS_GATE_STATUS"});if(state?.passed){kfsStartupGateReady=true;return true}}catch(_){}await new Promise(resolve=>window.addEventListener("kfs:gate-passed",()=>{kfsStartupGateReady=true;resolve()}, {once:true}));return true})().finally(()=>{kfsStartupGatePromise=null});return kfsStartupGatePromise}\n  async function check(){if(!(await waitForStartupGate()))return false;try{const status=await send({type:"KFS_LICENSE_STATUS"});if(status?.entitled){if(shown)remove();return true}show(status);return false}catch(_){show({state:"NETWORK_UNAVAILABLE"});return false}}\n  function boot(){void check();timer=setInterval(()=>{if(!document.hidden)void check()},10000)}'
  );
}
fs.writeFileSync(licenseGatePath,licenseGate);

// Share one in-flight Keymaster validation across all extension callers.
let licensing=fs.readFileSync(licensingPath,"utf8");
if(!licensing.includes("validationPromise")){
  licensing=licensing.replace(
    'let installationPromise=null,refreshPromise=null,statusCache=null,statusCacheUntil=0;',
    'let installationPromise=null,refreshPromise=null,statusCache=null,statusCacheUntil=0,validationPromise=null;'
  );
  const match=licensing.match(/export async function validateLicense\(clientVersion="1\.9\.0"\)\{([\s\S]*?)\}\nexport async function refreshLease/);
  if(!match)throw new Error("validateLicense function boundary not found");
  const body=match[1];
  const wrapped='export async function validateLicense(clientVersion="1.9.0"){if(validationPromise)return validationPromise;validationPromise=(async()=>{'+body+'})();try{return await validationPromise}finally{validationPromise=null}}\nexport async function refreshLease';
  licensing=licensing.replace(match[0],wrapped);
}
fs.writeFileSync(licensingPath,licensing);

// Preserve the existing cleaner behavior; only enforce shared authorization at the background boundary.
let cleaner=fs.readFileSync(cleanerPath,"utf8");
if(!cleaner.includes("kfsBrandingAuthorized")){
  cleaner=cleaner.replace('let config={hideLovableBranding:false};','let config={hideLovableBranding:false};let kfsBrandingAuthorized=false;let kfsBrandingAuthPromise=null;async function refreshBrandingAuthorization(){if(kfsBrandingAuthPromise)return kfsBrandingAuthPromise;kfsBrandingAuthPromise=chrome.runtime.sendMessage({type:"KFS_LICENSE_STATUS"}).then(r=>{kfsBrandingAuthorized=r?.entitled===true;return kfsBrandingAuthorized}).catch(()=>false).finally(()=>{kfsBrandingAuthPromise=null});return kfsBrandingAuthPromise}');
  cleaner=cleaner.replace('function apply(){if(!config.hideLovableBranding){restore();if(heartbeat){clearInterval(heartbeat);heartbeat=null}return}hideBranding();if(!heartbeat)heartbeat=setInterval(()=>{if(!document.hidden)hideBranding()},1200)}','async function apply(){if(!config.hideLovableBranding){restore();if(heartbeat){clearInterval(heartbeat);heartbeat=null}return}if(!(await refreshBrandingAuthorization())){restore();if(heartbeat){clearInterval(heartbeat);heartbeat=null}return}hideBranding();if(!heartbeat)heartbeat=setInterval(()=>{if(!document.hidden)hideBranding()},1200)}');
  cleaner=cleaner.replace('if(message?.type==="KFS_BRANDING_APPLY"){config.hideLovableBranding=true;const removed=hideBranding();sendResponse({ok:true,removed});return}','if(message?.type==="KFS_BRANDING_APPLY"){refreshBrandingAuthorization().then(authorized=>{if(!authorized){sendResponse({ok:false,reason:"license_required"});return}config.hideLovableBranding=true;const removed=hideBranding();sendResponse({ok:true,removed})});return true}');
}
fs.writeFileSync(cleanerPath,cleaner);

const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
manifest.permissions=[...new Set([...(manifest.permissions||[]),"alarms"])];
fs.writeFileSync(manifestPath,JSON.stringify(manifest));

let popup=fs.readFileSync(popupPath,"utf8");
if(!popup.includes('license-ui.js'))popup=popup.replace('</body>','<script src="license-ui.js"></script></body>');
fs.writeFileSync(popupPath,popup);

// Update the runtime integrity hash for the repaired license gate.
const newLicenseGateHash=crypto.createHash("sha256").update(licenseGate).digest("hex");
const hashPattern=new RegExp(`("content/license-gate\\.js":")[a-f0-9]{64}("`);
bg=bg.replace(hashPattern,`$1${newLicenseGateHash}$2`);
fs.writeFileSync(bgPath,bg);

console.log("KFS Keymaster control-plane repair applied deterministically.");
