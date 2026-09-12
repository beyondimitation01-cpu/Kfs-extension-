import fs from "node:fs";

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

if(!gate.includes("const LOCAL_VIDEO="))fail("startup gate is not local-first");
if(gate.includes("KFS_MEDIA_ENSURE"))fail("remote media ensure remains in startup gate");
if(gate.includes("REMOTE_VIDEO"))fail("remote tutorial source remains in startup gate");
if(licenseGate.includes("window.open("))fail("fragile window.open remains in license gate");
if(!background.includes("KFS_OPEN_LICENSE_UI")||!background.includes("KFS_GATE_CONTINUE"))fail("background startup handlers missing");
if(!background.includes("function openLicenseUi()"))fail("extension-owned license opener missing");
if(!background.includes("authorizePaidOperation(\"1.9.0\")"))fail("server-authoritative licensing guard missing");
if(popupCss.includes("min-height:682px")||!popupCss.includes("height:590px"))fail("popup sizing regression detected");
if(!popupCss.includes("max-height:590px"))fail("popup max-height guard missing");

const expectedPaths=[
  "content/gate.js",
  "content/license-gate.js",
  "content/lovable.js",
  "content/chatgpt.js",
  "styles/gate.css"
];
const integrityMap=new Map();
for(const match of background.matchAll(/"([^"]+)":"([a-f0-9]{64})"/g))integrityMap.set(match[1],match[2]);
for(const path of expectedPaths){
  if(!fs.existsSync(path))fail(`integrity target missing: ${path}`);
  const hash=integrityMap.get(path);
  if(!hash)fail(`integrity hash missing: ${path}`);
}
if(integrityMap.size<expectedPaths.length)fail("startup integrity map is incomplete");

console.log("startup architecture and integrity configuration verification OK");
