(()=>{
  if(window.__KFS_LICENSE_GATE_V1__)return;
  window.__KFS_LICENSE_GATE_V1__=1;
  const send=(message)=>new Promise(resolve=>chrome.runtime.sendMessage(message,resolve));
  let overlay=null,busy=false,shown=false;
  const esc=v=>String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const messageFor=s=>({
    NOT_ACTIVATED:"Enter a valid license key or start your one-time 20-minute trial.",
    EXPIRED:"Your KFS access has expired. Activate a license to continue.",
    REVOKED:"This license has been revoked. Please contact support.",
    TRIAL_ALREADY_USED:"Your one-time trial has already been used. Enter a license key to continue.",
    INVALID_KEY:"That license key is invalid.",
    ALREADY_ACTIVATED:"This license is already activated on another installation.",
    INSTALLATION_MISMATCH:"This license is bound to another installation.",
    NETWORK_UNAVAILABLE:"KFS could not contact the licensing server. Connect to the internet and try again.",
    RATE_LIMITED:"Too many licensing requests. Please wait and try again."
  }[s]||"A valid KFS license or an available trial is required.");
  function remove(){if(!overlay)return;overlay.remove();overlay=null;shown=false;document.documentElement.classList.remove("kfs-license-locked");}
  function styles(){if(document.getElementById("kfs-license-gate-style"))return;const s=document.createElement("style");s.id="kfs-license-gate-style";s.textContent=`html.kfs-license-locked body>*:not(#kfs-license-gate-overlay){pointer-events:none!important}.kfs-license-gate-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,10,14,.94);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff}.kfs-license-gate-card{width:min(560px,calc(100vw - 32px));box-sizing:border-box;background:#12151b;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.5)}.kfs-license-gate-brand{font-size:11px;letter-spacing:.16em;font-weight:800;opacity:.72;margin-bottom:12px}.kfs-license-gate-card h1{margin:0 0 10px;font-size:28px;line-height:1.15}.kfs-license-gate-card p{margin:0 0 20px;color:#b9bec8;line-height:1.5}.kfs-license-gate-card label{display:block;font-size:12px;font-weight:700;margin-bottom:7px}.kfs-license-gate-card input{width:100%;box-sizing:border-box;padding:13px 14px;border-radius:10px;border:1px solid #3a404c;background:#0c0f14;color:#fff;outline:none;margin-bottom:10px}.kfs-license-gate-card button{width:100%;padding:13px 14px;border:0;border-radius:10px;font-weight:800;cursor:pointer;margin-top:8px}.kfs-license-gate-card button:disabled{opacity:.55;cursor:wait}.kfs-license-primary{background:#fff;color:#101216}.kfs-license-secondary{background:#242934;color:#fff}.kfs-license-result{min-height:20px;margin-top:12px;font-size:12px;color:#ffb4b4}.kfs-license-note{margin-top:14px!important;margin-bottom:0!important;font-size:11px!important;color:#858c98!important}`;document.head.appendChild(s)}
  function show(status){
    if(overlay){update(status);return;}
    shown=true;styles();document.documentElement.classList.add("kfs-license-locked");
    overlay=document.createElement("div");overlay.id="kfs-license-gate-overlay";overlay.className="kfs-license-gate-overlay";
    overlay.innerHTML=`<section class="kfs-license-gate-card" role="dialog" aria-modal="true" aria-label="KFS license"><div class="kfs-license-gate-brand">KILLERS FROM SAGRES</div><h1 id="kfs-lg-title">Activate KFS to continue</h1><p id="kfs-lg-message">${esc(messageFor(status?.state))}</p><label for="kfs-lg-key">License key</label><input id="kfs-lg-key" type="text" autocomplete="off" spellcheck="false" maxlength="256" placeholder="Enter your license key"><button id="kfs-lg-activate" class="kfs-license-primary" type="button">ACTIVATE LICENSE</button><button id="kfs-lg-trial" class="kfs-license-secondary" type="button">START 20-MINUTE FREE TRIAL</button><div id="kfs-lg-result" class="kfs-license-result" role="status" aria-live="polite"></div><p class="kfs-license-note">Access is verified by the KFS licensing server. The trial is one-time and server controlled.</p></section>`;
    (document.body||document.documentElement).appendChild(overlay);
    $("kfs-lg-activate").addEventListener("click",()=>act("activate"));
    $("kfs-lg-trial").addEventListener("click",()=>act("trial"));
    $("kfs-lg-key").addEventListener("keydown",e=>{if(e.key==="Enter")act("activate")});
  }
  function $(id){return document.getElementById(id)}
  function update(status){const t=$("kfs-lg-title"),m=$("kfs-lg-message");if(t)t.textContent=status?.state==="EXPIRED"?"Your KFS access has expired":status?.state==="REVOKED"?"KFS license revoked":"Activate KFS to continue";if(m)m.textContent=status?.message||messageFor(status?.state)}
  async function act(kind){
    if(busy)return;busy=true;const key=$("kfs-lg-key")?.value?.trim()||"";if(kind==="activate"&&!key){$("kfs-lg-result").textContent="Enter a license key.";busy=false;return}
    $("kfs-lg-activate").disabled=true;$("kfs-lg-trial").disabled=true;
    try{const r=await send(kind==="trial"?{type:"KFS_LICENSE_TRIAL"}:{type:"KFS_LICENSE_ACTIVATE",license_key:key});if(r?.ok){const check=await send({type:"KFS_LICENSE_STATUS"});if(check?.entitled){remove();return}}$("kfs-lg-result").textContent=r?.message||messageFor(r?.state)}catch(_){$("kfs-lg-result").textContent=messageFor("NETWORK_UNAVAILABLE")}finally{busy=false;$("kfs-lg-activate").disabled=false;$("kfs-lg-trial").disabled=false}
  }
  async function check(){try{const status=await send({type:"KFS_LICENSE_STATUS"});if(status?.entitled){if(shown)remove();return true}show(status);return false}catch(_){show({state:"NETWORK_UNAVAILABLE"});return false}}
  function boot(){void check();setInterval(()=>void check(),3000)}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
