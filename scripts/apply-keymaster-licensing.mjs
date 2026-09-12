import fs from "node:fs";

const bgPath="background.js";
const cleanerPath="content/cleaner.js";
const manifestPath="manifest.json";
const popupPath="popup.html";

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
const commandNeedle='if(message.type==="KFS_COMMAND"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});';
if(!bg.includes(commandNeedle))throw new Error("KFS_COMMAND anchor missing");
bg=bg.replace(commandNeedle,'if(message.type==="KFS_COMMAND"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});{const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}');
const enhanceNeedle='if(message.type==="KFS_ENHANCE"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});';
if(!bg.includes(enhanceNeedle))throw new Error("KFS_ENHANCE anchor missing");
bg=bg.replace(enhanceNeedle,'if(message.type==="KFS_ENHANCE"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});{const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}');
const brandNeedle='if(message.type==="KFS_REMOVE_LOVABLE_BRANDING"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});';
if(!bg.includes(brandNeedle))throw new Error("branding anchor missing");
bg=bg.replace(brandNeedle,'if(message.type==="KFS_REMOVE_LOVABLE_BRANDING"){if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});{const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}');

const saveNeedle='if(message.type==="KFS_SAVE_CONFIG"){const allowed=';
const guardedSaveNeedle='if(message.type==="KFS_SAVE_CONFIG"){if(message.patch?.hideLovableBranding===true){const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}const allowed=';
if(!bg.includes(saveNeedle)&&!bg.includes(guardedSaveNeedle))throw new Error("KFS_SAVE_CONFIG anchor missing");
if(bg.includes(saveNeedle))bg=bg.replace(saveNeedle,guardedSaveNeedle);

const licensingMessages='if(message.type==="KFS_LICENSE_STATUS")return sendResponse(await getLicenseStatus());if(message.type==="KFS_LICENSE_TRIAL")return sendResponse(await startTrial("1.9.0"));if(message.type==="KFS_LICENSE_ACTIVATE")return sendResponse(await activateLicense(message.license_key,"1.9.0"));if(message.type==="KFS_LICENSE_DEACTIVATE")return sendResponse(await deactivateLicense("1.9.0"));';
const messageAnchor='if(message.type==="KFS_GATE_STATUS")return sendResponse(await getGateState());';
if(!bg.includes(messageAnchor))throw new Error("message insertion anchor missing");
if(!bg.includes("KFS_LICENSE_STATUS"))bg=bg.replace(messageAnchor,`${messageAnchor}${licensingMessages}`);

if(!bg.includes(`chrome.alarms.onAlarm.addListener`)){
  bg+=`\nvoid initializeLicensing();\nchrome.alarms.onAlarm.addListener((alarm)=>{if(alarm?.name===LICENSE_REFRESH_ALARM)void refreshLease("1.9.0");});\n`;
}
fs.writeFileSync(bgPath,bg);

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

console.log("Keymaster licensing integration applied.");
