(()=>{
  const send=(message)=>new Promise(resolve=>chrome.runtime.sendMessage(message,resolve));
  const esc=(value)=>String(value??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  function mount(){
    if(document.getElementById("kfs-license-card"))return;
    const card=document.createElement("section");
    card.id="kfs-license-card";
    card.innerHTML=`<div class="kfs-license-head"><strong>Licença KFS</strong><span id="kfs-license-state">Verificando…</span></div><div id="kfs-license-body"></div>`;
    const main=document.querySelector("main");
    const footer=main?.querySelector("footer");
    if(footer)main.insertBefore(card,footer);else main?.appendChild(card);
    refresh();
  }
  async function refresh(){
    const state=await send({type:"KFS_LICENSE_STATUS"});
    const label=document.getElementById("kfs-license-state"),body=document.getElementById("kfs-license-body");
    if(!label||!body)return;
    label.textContent=state?.state||"UNKNOWN";
    if(state?.entitled){
      const exp=state.expires_at?new Date(state.expires_at).toLocaleString():"Sem expiração";
      const lease=state.lease_expires_at?new Date(state.lease_expires_at).toLocaleString():"";
      body.innerHTML=`<p>Plano: <b>${esc(state.plan||"—")}</b></p><p>Expira: ${esc(exp)}</p><p>Lease: ${esc(lease)}</p><button id="kfs-license-deactivate">Desativar</button>`;
      document.getElementById("kfs-license-deactivate")?.addEventListener("click",async()=>{await send({type:"KFS_LICENSE_DEACTIVATE"});refresh()});
      return;
    }
    body.innerHTML=`<p>${esc(state?.reason||state?.state||"Licença não ativada.")}</p><button id="kfs-license-trial">Iniciar teste de 20 minutos</button><div class="kfs-license-activate"><input id="kfs-license-key" autocomplete="off" placeholder="Chave de licença" maxlength="256"><button id="kfs-license-activate">Ativar</button></div><small>O teste é único e controlado pelo servidor.</small>`;
    document.getElementById("kfs-license-trial")?.addEventListener("click",async()=>{const r=await send({type:"KFS_LICENSE_TRIAL"});showResult(r);refresh()});
    document.getElementById("kfs-license-activate")?.addEventListener("click",async()=>{const key=document.getElementById("kfs-license-key")?.value||"";const r=await send({type:"KFS_LICENSE_ACTIVATE",license_key:key});showResult(r);refresh()});
  }
  function showResult(result){if(!result)return;const body=document.getElementById("kfs-license-body");if(body&&!result.ok){const p=document.createElement("p");p.className="kfs-license-error";p.textContent=result.message||result.code||result.state||"Licensing error";body.prepend(p)}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();
