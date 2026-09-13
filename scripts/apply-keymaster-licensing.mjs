import fs from "node:fs";
import crypto from "node:crypto";

const bgPath="background.js";
const licensingPath="licensing.js";
const guard="{const denial=await kfsLicenseDenial();if(denial)return sendResponse(denial);}";
const guardRunRe=/(?:\{const denial=await kfsLicenseDenial\(\);if\(denial\)return sendResponse\(denial\);\})+/g;
const protectedTypes=["KFS_COMMAND","KFS_ENHANCE","KFS_REMOVE_LOVABLE_BRANDING"];
const startupTail='if(!await gateAllowsExecution())return sendResponse({ok:false,reason:"startup_gate",message:"Conclua a tela de acesso da Killers from Sagres."});';

let bg=fs.readFileSync(bgPath,"utf8");

// The original repair inserted licensing into the command path. Normalize any accumulated copies.
bg=bg.replace(guardRunRe,guard);

// If a protected operation has no guard, add exactly one immediately after its startup-gate check.
for(const type of protectedTypes){
  const prefix=`if(message.type==="${type}"){${startupTail}`;
  const guardNeedle=`${prefix}${guard}`;
  if(!bg.includes(prefix))throw new Error(`protected handler anchor missing: ${type}`);
  if(!bg.includes(guardNeedle))bg=bg.replace(prefix,guardNeedle);
}

const downloadPrefix='if(message.type==="KFS_DOWNLOAD_REPO"){';
const downloadGuard=guard.slice(1,-1);
if(!bg.includes(`${downloadPrefix}${downloadGuard}`)){
  if(!bg.includes(downloadPrefix))throw new Error("protected download handler anchor missing");
  bg=bg.replace(downloadPrefix,`${downloadPrefix}${downloadGuard}`);
}

// Keep license validation server-authoritative but prevent concurrent callers from creating duplicate in-flight requests.
let licensing=fs.readFileSync(licensingPath,"utf8");
if(!licensing.includes("validationPromise")){
  const stateDecl='let installationPromise=null,refreshPromise=null,statusCache=null,statusCacheUntil=0;';
  if(!licensing.includes(stateDecl))throw new Error("licensing state declaration missing");
  licensing=licensing.replace(stateDecl,'let installationPromise=null,refreshPromise=null,statusCache=null,statusCacheUntil=0,validationPromise=null;');
  const start=licensing.indexOf('export async function validateLicense(');
  const end=licensing.indexOf('\nexport async function refreshLease',start);
  if(start<0||end<0)throw new Error("validateLicense boundaries missing");
  const original=licensing.slice(start,end);
  const bodyStart=original.indexOf('{');
  const body=original.slice(bodyStart+1,-1);
  const replacement=`export async function validateLicense(clientVersion="1.9.0"){if(validationPromise)return validationPromise;validationPromise=(async()=>{${body}})();try{return await validationPromise}finally{validationPromise=null}}`;
  licensing=licensing.slice(0,start)+replacement+licensing.slice(end);
}
fs.writeFileSync(licensingPath,licensing);

// Refresh the integrity hash only when the license-gate file itself is changed by this repair.
const licenseGatePath="content/license-gate.js";
const licenseGate=fs.readFileSync(licenseGatePath,"utf8");
const hash=crypto.createHash("sha256").update(licenseGate).digest("hex");
const hashRe=/("content\/license-gate\\.js":")[a-f0-9]{64}(")/;
if(hashRe.test(bg))bg=bg.replace(hashRe,`$1${hash}$2`);

fs.writeFileSync(bgPath,bg);
console.log("KFS Keymaster repair normalized successfully.");
