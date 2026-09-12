const KEYMASTER_ORIGIN="https://kfs-keymaster.lovable.app";
const API_BASE=`${KEYMASTER_ORIGIN}/api/public/v1`;
const LEASE_MAX_MS=6*60*60*1000;
const TRIAL_MAX_MS=20*60*1000;
const CLOCK_TOLERANCE_MS=2*60*1000;
const REFRESH_ALARM="kfs-license-refresh";
const STORAGE_KEYS=["installation_id","license_key","license_plan","license_status","license_expires_at","lease_token","lease_expires_at","last_server_time","last_local_wall_time","last_validation_at","clock_rollback_detected"];
let installationPromise=null;
let refreshPromise=null;

const text=(v,max=2048)=>String(v??"").trim().slice(0,max);
const validInstallationId=v=>/^[A-Za-z0-9_-]{16,128}$/.test(String(v||""));
const now=()=>Date.now();

export async function getInstallationId(){
  if(installationPromise)return installationPromise;
  installationPromise=(async()=>{
    const current=await chrome.storage.local.get("installation_id");
    if(validInstallationId(current.installation_id))return current.installation_id;
    const id=crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
    await chrome.storage.local.set({installation_id:id});
    return id;
  })().finally(()=>{installationPromise=null});
  return installationPromise;
}

async function readState(){return chrome.storage.local.get(STORAGE_KEYS);}
async function writeState(patch){await chrome.storage.local.set(patch);return readState();}

function parseServerTime(value){const t=Date.parse(String(value||""));return Number.isFinite(t)?t:0;}
function safeDate(value){const t=Date.parse(String(value||""));return Number.isFinite(t)?new Date(t).toISOString():"";}

async function recordServerTime(serverTime){
  const serverMs=parseServerTime(serverTime);
  if(!serverMs)return {rollback:false};
  const localMs=now();
  const previous=await chrome.storage.local.get(["last_server_time","last_local_wall_time"]);
  const previousLocal=Number(previous.last_local_wall_time)||0;
  const rollback=previousLocal>0&&localMs<previousLocal-CLOCK_TOLERANCE_MS;
  await chrome.storage.local.set({last_server_time:new Date(serverMs).toISOString(),last_local_wall_time:localMs,clock_rollback_detected:rollback||previous.clock_rollback_detected===true});
  return {rollback};
}

async function post(path,payload){
  try{
    const response=await fetch(`${API_BASE}/${path}`,{method:"POST",headers:{"content-type":"application/json","x-kfs-client":"kfs-extension/1.9"},cache:"no-store",body:JSON.stringify(payload)});
    let body=null;try{body=await response.json()}catch(_){body={ok:false,code:"INVALID_RESPONSE",message:"Servidor de licenciamento retornou uma resposta inválida."};}
    if(body?.server_time)await recordServerTime(body.server_time);
    return {http:response.status,body};
  }catch(error){return {network:true,error:String(error?.message||error)}}
}

function normalizedLicense(body){
  const license=body?.license||{};
  return {
    plan:text(license.plan,64),
    status:text(license.status,64),
    expires_at:safeDate(license.expires_at),
    activated:license.activated===true,
    activated_at:safeDate(license.activated_at),
    server_time:safeDate(license.server_time||body?.server_time)
  };
}

async function persistSuccess(body){
  const license=normalizedLicense(body);
  const leaseToken=text(body?.lease_token,4096);
  const leaseExpires=safeDate(body?.lease_expires_at);
  const patch={license_plan:license.plan,license_status:license.status,license_expires_at:license.expires_at,last_validation_at:now()};
  if(leaseToken)patch.lease_token=leaseToken;
  if(leaseExpires)patch.lease_expires_at=leaseExpires;
  if(body?.server_time)await recordServerTime(body.server_time);
  await chrome.storage.local.set(patch);
  await ensureRefreshAlarm();
  return readState();
}

export async function startTrial(clientVersion="1.9.0"){
  const installation_id=await getInstallationId();
  const result=await post("trial",{installation_id,client_version:text(clientVersion,32)});
  if(result.network)return {ok:false,state:"NETWORK_UNAVAILABLE",message:"Não foi possível contactar o servidor de licenciamento."};
  if(!result.body?.ok)return mapFailure(result.body);
  await persistSuccess(result.body);
  return {ok:true,state:"TRIAL_ACTIVE",license:normalizedLicense(result.body),lease_expires_at:safeDate(result.body.lease_expires_at)};
}

export async function activateLicense(licenseKey,clientVersion="1.9.0"){
  const key=text(licenseKey,256);
  if(!key)return {ok:false,state:"NOT_ACTIVATED",code:"INVALID_REQUEST",message:"Informe uma chave de licença."};
  const installation_id=await getInstallationId();
  const result=await post("activate",{license_key:key,installation_id,client_version:text(clientVersion,32)});
  if(result.network)return {ok:false,state:"NETWORK_UNAVAILABLE",message:"Não foi possível contactar o servidor de licenciamento."};
  if(!result.body?.ok)return mapFailure(result.body);
  await chrome.storage.local.set({license_key:key,clock_rollback_detected:false});
  await persistSuccess(result.body);
  return {ok:true,state:"LICENSE_ACTIVE",license:normalizedLicense(result.body),lease_expires_at:safeDate(result.body.lease_expires_at)};
}

export async function deactivateLicense(clientVersion="1.9.0"){
  const state=await readState();
  if(!state.license_key)return {ok:true,state:"NOT_ACTIVATED"};
  const installation_id=await getInstallationId();
  const result=await post("deactivate",{license_key:text(state.license_key,256),installation_id,client_version:text(clientVersion,32)});
  if(result.network)return {ok:false,state:"NETWORK_UNAVAILABLE",message:"Não foi possível contactar o servidor para desativar a licença."};
  if(!result.body?.ok)return mapFailure(result.body);
  await chrome.storage.local.remove(["license_key","license_plan","license_status","license_expires_at","lease_token","lease_expires_at","last_validation_at","clock_rollback_detected"]);
  return {ok:true,state:"NOT_ACTIVATED"};
}

function mapFailure(body){
  const code=text(body?.code,64)||"LICENSING_ERROR";
  const state=code==="REVOKED"?"REVOKED":code==="EXPIRED"?"EXPIRED":code==="LEASE_EXPIRED"?"LEASE_EXPIRED":code==="ALREADY_ACTIVATED"?"ALREADY_ACTIVATED":code==="INSTALLATION_MISMATCH"?"INSTALLATION_MISMATCH":code==="LEASE_INVALID"?"LEASE_INVALID":code==="NOT_ACTIVATED"?"NOT_ACTIVATED":"NOT_ACTIVATED";
  return {ok:false,state,code,message:text(body?.message,512)||code,server_time:safeDate(body?.server_time)};
}

export async function validateLicense(clientVersion="1.9.0",force=false){
  const state=await readState();
  if(!state.license_key)return {ok:true,entitled:false,state:"NOT_ACTIVATED"};
  const installation_id=await getInstallationId();
  const result=await post("validate",{license_key:text(state.license_key,256),installation_id,lease_token:text(state.lease_token,4096)||undefined,client_version:text(clientVersion,32)});
  if(result.network){
    const local=await evaluateLocalLease();
    return force?{...local,state:local.entitled?local.state:"NETWORK_UNAVAILABLE",networkUnavailable:true}:{...local,networkUnavailable:true};
  }
  if(!result.body?.ok){
    const failure=mapFailure(result.body);
    await chrome.storage.local.set({license_status:failure.state,last_validation_at:now()});
    return {...failure,entitled:false};
  }
  await persistSuccess(result.body);
  const evaluated=await evaluateLocalLease();
  return {ok:true,...evaluated,license:normalizedLicense(result.body)};
}

export async function refreshLease(clientVersion="1.9.0"){
  if(refreshPromise)return refreshPromise;
  refreshPromise=(async()=>{
    const state=await readState();
    if(!state.license_key||!state.lease_token)return validateLicense(clientVersion,true);
    const installation_id=await getInstallationId();
    const result=await post("lease",{lease_token:text(state.lease_token,4096),installation_id,client_version:text(clientVersion,32)});
    if(result.network)return evaluateLocalLease();
    if(!result.body?.ok){
      const failure=mapFailure(result.body);
      await chrome.storage.local.set({license_status:failure.state,last_validation_at:now()});
      return {...failure,entitled:false};
    }
    await persistSuccess(result.body);
    return evaluateLocalLease();
  })().finally(()=>{refreshPromise=null});
  return refreshPromise;
}

async function evaluateLocalLease(){
  const state=await readState();
  if(state.clock_rollback_detected===true)return {entitled:false,state:"CLOCK_ROLLBACK",plan:text(state.license_plan,64),expires_at:safeDate(state.license_expires_at),lease_expires_at:safeDate(state.lease_expires_at)};
  const licenseExpiry=parseServerTime(state.license_expires_at);
  const leaseExpiry=parseServerTime(state.lease_expires_at);
  const current=now();
  const status=text(state.license_status,64).toUpperCase();
  if(status==="REVOKED")return {entitled:false,state:"REVOKED",plan:text(state.license_plan,64),expires_at:safeDate(state.license_expires_at),lease_expires_at:safeDate(state.lease_expires_at)};
  if(licenseExpiry&&current>=licenseExpiry)return {entitled:false,state:"EXPIRED",plan:text(state.license_plan,64),expires_at:safeDate(state.license_expires_at),lease_expires_at:safeDate(state.lease_expires_at)};
  if(leaseExpiry&&current<leaseExpiry)return {entitled:true,state:status==="TRIAL"||status==="TRIAL_ACTIVE"?"TRIAL_ACTIVE":"LICENSE_ACTIVE",plan:text(state.license_plan,64),expires_at:safeDate(state.license_expires_at),lease_expires_at:safeDate(state.lease_expires_at)};
  return {entitled:false,state:"LEASE_EXPIRED",plan:text(state.license_plan,64),expires_at:safeDate(state.license_expires_at),lease_expires_at:safeDate(state.lease_expires_at)};
}

export async function getLicenseStatus(){
  const state=await readState();
  const evaluated=await evaluateLocalLease();
  return {ok:true,...evaluated,license_key_present:!!state.license_key,server_time:safeDate(state.last_server_time),clock_rollback_detected:state.clock_rollback_detected===true};
}

export async function authorizePaidOperation(clientVersion="1.9.0"){
  const status=await getLicenseStatus();
  if(status.clock_rollback_detected)return status;
  if(status.entitled)return status;
  if(status.state==="NOT_ACTIVATED")return status;
  if(status.state==="LEASE_EXPIRED"||status.state==="NETWORK_UNAVAILABLE"){
    const refreshed=await refreshLease(clientVersion);
    if(refreshed?.entitled)return refreshed;
    if(refreshed?.state!=="LEASE_EXPIRED")return refreshed;
  }
  return status;
}

export async function ensureRefreshAlarm(){
  try{await chrome.alarms.create(REFRESH_ALARM,{delayInMinutes:240,periodInMinutes:240});}catch(_){}
}

export async function initializeLicensing(){
  await getInstallationId();
  await ensureRefreshAlarm();
  const state=await readState();
  if(state.license_key&&state.lease_token){
    const leaseExpiry=parseServerTime(state.lease_expires_at);
    if(!leaseExpiry||leaseExpiry-now()<2*60*60*1000)void refreshLease();
  }
}

export const LICENSE_REFRESH_ALARM=REFRESH_ALARM;
export const LICENSE_LEASE_MAX_MS=LEASE_MAX_MS;
export const LICENSE_TRIAL_MAX_MS=TRIAL_MAX_MS;
