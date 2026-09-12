import fs from "node:fs";
import crypto from "node:crypto";

const read=(path)=>fs.readFileSync(path,"utf8");
const fail=(message)=>{throw new Error(message)};
const manifest=JSON.parse(read("manifest.json"));

if(manifest.manifest_version!==3)fail("manifest_version must be 3");
if(manifest.action?.default_popup!=="popup.html")fail("default action popup missing");
if(manifest.options_ui?.page!=="license.html"||manifest.options_ui?.open_in_tab!==true)fail("license options page missing");
if(!(manifest.host_permissions||[]).includes("https://kfs-keymaster.lovable.app/*"))fail("Keymaster host permission missing");
if(!fs.existsSync("license.html"))fail("license.html missing");
if(!fs.existsSync("assets/gate/tutorial.mp4"))fail("local tutorial missing");

const gate=read("content/gate.js");
const licenseGate=read("content/license-gate.js");
const background=read("background.js");
const popupCss=read("popup.css");

if(!gate.includes('const LOCAL_VIDEO='))fail("startup gate is not local-first");
if(gate.includes("KFS_MEDIA_ENSURE"))fail("remote media ensure remains in startup gate");
if(gate.includes("REMOTE_VIDEO"))fail("remote tutorial source remains in startup gate");
if(licenseGate.includes("window.open("))fail("fragile window.open remains in license gate");
if(!background.includes("KFS_OPEN_LICENSE_UI")||!background.includes("KFS_GATE_CONTINUE"))fail("background startup handlers missing");
if(!background.includes("function openLicenseUi()"))fail("extension-owned license opener missing");
if(!background.includes("authorizePaidOperation(\"1.9.0\")"))fail("server-authoritative licensing guard missing");
if(popupCss.includes("min-height:682px")||!popupCss.includes("height:590px"))fail("popup sizing regression detected");
if(!popupCss.includes("max-height:590px"))fail("popup max-height guard missing");

const expected={
  "content/gate.js":"2db624574f771ca2dc99349e217dc83be37a3cd874f3db4d15cf4bf7667fe2e0",
  "content/license-gate.js":"c9c9c684b3480487bbd9be16ff921a45d3540d187966900337604c530f0c469d",
  "content/lovable.js":"9641f6f8797c78551d0479b1724c0551830768d7951dd8de72ea002104333f40",
  "content/chatgpt.js":"4a6eeb3db7867a4aa2f117b8c6c40fea198b003aae1f4f260257ee00e7ae7c9a",
  "styles/gate.css":"32ca2c147d37646f40db6050c9c4eaac096e7359876ae5899a79d276eb897d79"
};
for(const [path,hash] of Object.entries(expected)){
  if(!fs.existsSync(path))fail(`integrity target missing: ${path}`);
  const actual=crypto.createHash("sha256").update(read(path),"utf8").digest("hex");
  if(actual!==hash)fail(`integrity mismatch: ${path}`);
  if(!background.includes(`"${path}":"${hash}"`))fail(`background integrity map mismatch: ${path}`);
}

console.log("startup architecture and integrity verification OK");
