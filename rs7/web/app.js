"use strict";
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
let S=null,TOKEN="",sel=0,keys=[],MAC=[],mi=0,recording=false,lastT=0,LANG="en",P={};
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const t=(k,...a)=>{const v=(I18N[LANG]&&I18N[LANG][k])??I18N.en[k]??k;return typeof v==="string"?v:v};
// ---------- language / theme
function resolveLang(s){return s==="en"||s==="pt-BR"?s:(navigator.language||"en").toLowerCase().startsWith("pt")?"pt-BR":"en"}
function setLang(s,persist){LANG=resolveLang(s);document.documentElement.lang=LANG;if(persist)ls.set("rs7.lang",s);i18n();if(S){renderAll()}}
function i18n(){document.querySelectorAll("[data-i18n]").forEach(e=>e.textContent=t(e.dataset.i18n))}
function setTheme(s,persist){const th=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=th;if(persist)ls.set("rs7.theme",s)}
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change",()=>{if((ls.get("rs7.theme")||"auto")==="auto")setTheme("auto")});
setTheme(ls.get("rs7.theme")||"auto");LANG=resolveLang(ls.get("rs7.lang")||"auto");document.documentElement.lang=LANG;
// ---------- helpers
function toast(m,e){const x=$("toast");x.textContent=m;x.className="show"+(e?" err":"");clearTimeout(x._t);x._t=setTimeout(()=>x.className="",2600)}
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json","X-RS7-Token":TOKEN},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j}
function opts(el,list,f){el.innerHTML=list.map((x,i)=>`<option value="${i}">${esc(f(x,i))}</option>`).join("")}
function seg(el,items,get,set){el.innerHTML="";items.forEach(([lab,val])=>{const b=document.createElement("button");b.textContent=lab;b.className=get()===val?"on":"";b.onclick=()=>{set(val);[...el.children].forEach(c=>c.className="");b.className="on"};el.appendChild(b)})}
function ask(title,def){return new Promise(res=>{const d=$("dlg");$("dtitle").textContent=title;$("dinput").value=def||"";d.onclose=()=>res(d.returnValue==="ok"?$("dinput").value.trim():null);d.showModal();$("dinput").focus();$("dinput").select()})}
// ---------- tabs
const ICONS={home:'<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',buttons:'<path d="M6 3h12a3 3 0 013 3v8a9 9 0 01-18 0V6a3 3 0 013-3zM12 3v7"/>',dpi:'<circle cx="12" cy="12" r="9"/><path d="M12 12l5-4"/>',perf:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',macro:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 15h8"/>',light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',about:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'};
const TABS=["home","buttons","dpi","perf","macro","light","settings","about"];
function renderTabs(){const cur=document.querySelector("#tabs .on")?.dataset.k||"home";$("tabs").innerHTML=TABS.map(k=>`<button data-k="${k}" class="${k==cur?"on":""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg><span>${esc(t("tab."+k))}</span></button>`).join("")}
$("tabs").onclick=e=>{const b=e.target.closest("button");if(!b)return;const k=b.dataset.k;document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.k==k));document.querySelectorAll("section").forEach(s=>s.classList.toggle("on",s.id=="t-"+k))};
// ---------- profiles
function renderProfiles(){const st=S.profiles,bar=$("profbar");bar.innerHTML="";
 st.profiles.forEach(p=>{const b=document.createElement("button");b.className="pchip"+(p.id==st.active?" on":"");b.textContent=p.name;b.role="tab";b.onclick=()=>p.id==st.active||applyProfile(p.id);bar.appendChild(b)});
 const ed=document.createElement("button");ed.className="pedit";ed.title=t("prof.rename");ed.textContent="✎";ed.onclick=renameProfile;bar.appendChild(ed);
 const del=document.createElement("button");del.className="pedit";del.title=t("prof.del");del.textContent="🗑";del.disabled=st.profiles.length<=1;del.onclick=deleteProfile;bar.appendChild(del);
 const add=document.createElement("button");add.className="pchip add";add.title=t("prof.add");add.textContent="+";add.onclick=addProfile;bar.appendChild(add)}
const activeProf=()=>S.profiles.profiles.find(p=>p.id==S.profiles.active);
async function applyProfile(id){try{const r=await api("/api/profiles/apply",{id});S.profiles=r.profiles;S.config=r.config;S.keys=r.keys;keys=normKeys(r.keys);renderAll();toast(t("prof.applied"))}catch(e){toast(e.message,1)}}
async function addProfile(){const n=await ask(t("prof.add"),t("prof.default")+" "+(S.profiles.profiles.length+1));if(!n)return;try{S.profiles=await api("/api/profiles",{action:"add",name:n});renderProfiles();toast(t("prof.created"))}catch(e){toast(e.message,1)}}
async function renameProfile(){const n=await ask(t("prof.rename"),activeProf().name);if(!n)return;try{S.profiles=await api("/api/profiles",{action:"rename",id:S.profiles.active,name:n});renderProfiles()}catch(e){toast(e.message,1)}}
async function deleteProfile(){if(!confirm(t("prof.delq")))return;try{S.profiles=await api("/api/profiles",{action:"delete",id:S.profiles.active});await applyProfile(S.profiles.active)}catch(e){toast(e.message,1)}}
// ---------- buttons
const MOUSE=[1,2,4,8,16,0],MEDIA=[[233,0],[234,0],[226,0],[205,0],[183,0],[182,0],[181,0],[35,2],[39,2],[36,2],[37,2],[146,1],[148,1],[138,1]];
const KEYS=[...Array(26)].map((_,i)=>[String.fromCharCode(65+i),4+i]).concat([..."1234567890"].map((c,i)=>[c,30+i]),[["Enter",40],["Esc",41],["Backspace",42],["Tab",43],["Space",44],["Delete",76],["Insert",73],["Home",74],["End",77],["Page Up",75],["Page Down",78],["Print Screen",70],["→",79],["←",80],["↓",81],["↑",82]],[...Array(12)].map((_,i)=>["F"+(i+1),58+i]));
const MODS=[["Ctrl",1],["Shift",2],["Alt",4],["Super",8]],ATYPES=["mouse","dpi","wup","wdn","key","media","macro"],DEFK=[[0x20,1,0,0],[0x20,2,0,0],[0x20,4,0,0],[0x20,8,0,0],[0x20,16,0,0],[0x21,0x55,0,0]];
const normKeys=k=>k.slice(0,6).map((e,i)=>e[0]==255?DEFK[i]:e);
function decode(e){const[ty,a,b]=e;if(ty==0x20)return["mouse",MOUSE.indexOf(a)];if(ty==0x21&&a==0x55)return["dpi",0];if(ty==0x21&&a==0x38)return[b==1?"wup":"wdn",0];if(ty==0x10)return["key",KEYS.findIndex(k=>k[1]==b),a];if(ty==0x70)return["macro",a,b,e[3]];if(ty==0x30)return["media",MEDIA.findIndex(m=>m[0]==a&&m[1]==b)];return["mouse",5]}
function showSel(){const e=keys[sel],d=decode(e);for(let i=0;i<6;i++)$("b"+i).classList.toggle("on",i==sel);$("bname").textContent=t("btn.names")[sel];
 $("atype").value=ATYPES.indexOf(d[0]);if(d[1]>=0){if(d[0]=="mouse")$("amouse").value=d[1];if(d[0]=="key")$("akey").value=d[1];if(d[0]=="media")$("amedia").value=d[1];if(d[0]=="macro"){$("amacro").value=d[1];$("mcount").value=d[2]||1;$("mmode").value=d[3]}}
 [...$("mods").querySelectorAll("input")].forEach((c,i)=>c.checked=d[0]=="key"&&!!(d[2]&MODS[i][1]));vis()}
function vis(){const ty=ATYPES[$("atype").value];$("rmouse").style.display=ty=="mouse"?"":"none";$("rkey").style.display=$("rmods").style.display=ty=="key"?"":"none";$("rmedia").style.display=ty=="media"?"":"none";$("rmacro").style.display=ty=="macro"?"":"none"}
function stage(){const ty=ATYPES[$("atype").value];let e;
 if(ty=="mouse")e=[0x20,MOUSE[$("amouse").value],0,0];else if(ty=="dpi")e=[0x21,0x55,0,0];else if(ty=="wup")e=[0x21,0x38,1,0];else if(ty=="wdn")e=[0x21,0x38,255,0];
 else if(ty=="key"){let m=0;[...$("mods").querySelectorAll("input")].forEach((c,i)=>{if(c.checked)m|=MODS[i][1]});e=[0x10,m,KEYS[$("akey").value][1],0]}
 else if(ty=="macro"){const md=+$("mmode").value;e=[0x70,+$("amacro").value||0,md==0?+$("mcount").value||1:1,md]}else{const x=MEDIA[$("amedia").value];e=[0x30,x[0],x[1],0]}keys[sel]=e}
async function applyKeys(){stage();try{const r=await api("/api/keys",{keys:keys.slice(0,6)});keys=normKeys(r);toast(t("applied.btn"));showSel()}catch(e){toast(e.message,1)}}
async function resetKeys(){try{const r=await api("/api/keys/reset",{});keys=normKeys(r);showSel();toast(t("reset.btn"))}catch(e){toast(e.message,1)}}
// ---------- dpi / perf / light / settings
function renderDpi(){const c=S.config;$("dpis").innerHTML="";c.dpis.forEach((v,i)=>{const d=document.createElement("div");d.className="dpi"+(i>=c.dpi_count?" off":"");
 d.innerHTML=`<span><input type="radio" name="cur" ${i==c.dpi_index?"checked":""}></span><input type="range" min="100" max="20000" step="50" value="${v}"><input type="number" min="100" max="20000" step="50" value="${v}">`;
 const[r,rg,n]=[d.children[0].firstChild,d.children[1],d.children[2]];rg.oninput=()=>n.value=rg.value;n.onchange=()=>rg.value=n.value;$("dpis").appendChild(d)});
 opts($("dcount"),[1,2,3,4,5,6],x=>x);$("dcount").value=c.dpi_count-1}
async function applyDpi(){const rows=[...document.querySelectorAll(".dpi")],dpis=rows.map(r=>+r.children[2].value),cur=rows.findIndex(r=>r.children[0].firstChild.checked);
 try{S.config=await api("/api/config",{dpis,dpi_count:+$("dcount").value+1,dpi_index:Math.max(0,cur)});renderDpi();toast(t("applied.dpi"))}catch(e){toast(e.message,1)}}
function renderPerf(){const c=S.config;opts($("rate"),S.meta.rates,x=>x+" Hz");$("rate").value=c.report_rate;
 P.lod=c.lod;seg($("lod"),[["1 mm",1],["2 mm",2]],()=>P.lod,v=>P.lod=v);$("deb").value=c.debounce_ms==255?2:c.debounce_ms;
 opts($("sleep"),S.meta.sleep,x=>x==255?t("perf.default"):x+" "+t("perf.min"));$("sleep").value=Math.max(0,S.meta.sleep.indexOf(c.sleep_min));
 P.scr=c.scroll_reverse;seg($("scroll"),[[t("perf.normal"),false],[t("perf.reversed"),true]],()=>P.scr,v=>P.scr=v);
 $("esp").checked=c.e_sports;document.querySelectorAll("[data-s]").forEach(e=>e.checked=!!(c.sensor_flag&S.meta.sensor_bits[e.dataset.s]));
 seg($("light"),S.meta.lights.map((l,i)=>[t("light.names")[i],i]),()=>c.light_mode,async v=>{try{await api("/api/light",{mode:v});c.light_mode=v;toast(t("light.set"))}catch(e){toast(e.message,1)}})}
async function applyPerf(){let sf=0;document.querySelectorAll("[data-s]").forEach(e=>{if(e.checked)sf|=S.meta.sensor_bits[e.dataset.s]});
 try{S.config=await api("/api/config",{report_rate:+$("rate").value,lod:P.lod,debounce_ms:+$("deb").value,sleep_min:S.meta.sleep[$("sleep").value],scroll_reverse:P.scr,e_sports:$("esp").checked,sensor_flag:sf});renderPerf();toast(t("applied.perf"))}catch(e){toast(e.message,1)}}
function renderSettings(){const s=S.settings;opts($("slang"),["auto","en","pt-BR"],x=>x=="auto"?t("set.auto"):x=="en"?"English":"Português (Brasil)");$("slang").value=["auto","en","pt-BR"].indexOf(s.lang);
 opts($("stheme"),["auto","light","dark"],x=>t("set."+x));$("stheme").value=["auto","light","dark"].indexOf(s.theme);$("stray").checked=!!s.tray;$("trayhint").style.display=s.tray_supported?"none":""}
async function saveSettings(patch){try{S.settings={...S.settings,...await api("/api/settings",patch)};if("lang"in patch)setLang(patch.lang,true);if("theme"in patch)setTheme(patch.theme,true);renderSettings();toast(t("set.saved"))}catch(e){toast(e.message,1)}}
$("slang").onchange=e=>saveSettings({lang:["auto","en","pt-BR"][e.target.value]});$("stheme").onchange=e=>saveSettings({theme:["auto","light","dark"][e.target.value]});$("stray").onchange=e=>saveSettings({tray:e.target.checked});
// ---------- macros
const HID={Enter:40,Escape:41,Backspace:42,Tab:43,Space:44,ArrowRight:79,ArrowLeft:80,ArrowDown:81,ArrowUp:82,ControlLeft:0xE0,ShiftLeft:0xE1,AltLeft:0xE2,MetaLeft:0xE3,ControlRight:0xE4,ShiftRight:0xE5,AltRight:0xE6,Delete:76};
for(let i=0;i<26;i++)HID["Key"+String.fromCharCode(65+i)]=4+i;for(let i=1;i<=9;i++)HID["Digit"+i]=29+i;HID.Digit0=39;for(let i=1;i<=12;i++)HID["F"+i]=57+i;
const HIDN={};for(const k in HID)HIDN[HID[k]]=k.replace(/^Key|^Digit/,"");const MBTN={1:"Left",2:"Right",4:"Middle",8:"Back",16:"Forward"};const cur=()=>MAC[mi];
function mRender(){const l=$("mlist");l.innerHTML=MAC.map((m,i)=>`<option value="${i}">${i+1}. ${esc(m.name||t("mac.def"))}</option>`).join("")||`<option>${esc(t("mac.none"))}</option>`;l.value=mi;
 opts($("amacro"),MAC.length?MAC:[{name:t("mac.none")}],m=>m.name);$("rec").textContent=t(recording?"mac.rec0":"mac.rec1");
 const m=cur();$("mname").value=m?m.name:"";const tb=$("evs");tb.innerHTML="";if(!m)return;
 m.events.forEach((e,i)=>{const r=tb.insertRow();const codes=e.kind=="mouse"?Object.entries(MBTN):Object.entries(HIDN);
  r.innerHTML=`<td>${i+1}</td><td><select data-k="kind"><option>key</option><option>mouse</option></select></td><td><select data-k="code">${codes.map(([c,n])=>`<option value="${c}">${esc(n)}</option>`).join("")}</select></td><td><select data-k="down"><option value="1">${esc(t("mac.down"))}</option><option value="0">${esc(t("mac.up"))}</option></select></td><td><input type="number" data-k="delay_ms" min="0" max="65535" style="width:90px"> ms</td><td><button class="sec" onclick="mRm(${i})">✕</button></td>`;
  const s=r.querySelectorAll("[data-k]");s[0].value=e.kind;s[1].value=e.code;s[2].value=e.down?1:0;s[3].value=e.delay_ms;
  s.forEach(x=>x.onchange=()=>{const k=x.dataset.k;if(k=="kind"){e.kind=x.value;e.code=e.kind=="mouse"?1:4;mRender()}else if(k=="down")e.down=x.value=="1";else e[k]=+x.value})})}
function mNew(){MAC.push({name:t("mac.def")+" "+(MAC.length+1),events:[]});mi=MAC.length-1;mRender()}
function mDel(){MAC.splice(mi,1);mi=Math.max(0,mi-1);mRender()}
function mAdd(){if(!cur())mNew();cur().events.push({kind:"key",code:4,down:true,delay_ms:0},{kind:"key",code:4,down:false,delay_ms:30});mRender()}
function mRm(i){cur().events.splice(i,1);mRender()}function mClear(){if(cur()){cur().events=[];mRender()}}
function mRec(){if(!cur())mNew();recording=!recording;if(recording){cur().events=[];lastT=0}mRender();if(recording)$("rec").focus()}
function recEv(ev,down){if(!recording||ev.repeat)return;const c=HID[ev.code];if(c===undefined)return;ev.preventDefault();const now=ev.timeStamp,E=cur().events;if(E.length)E[E.length-1].delay_ms=Math.min(65535,Math.round(now-lastT));lastT=now;E.push({kind:"key",code:c,down,delay_ms:0});mRender()}
addEventListener("keydown",e=>recEv(e,true));addEventListener("keyup",e=>recEv(e,false));
$("mlist").onchange=e=>{mi=+e.target.value;mRender()};$("mname").oninput=e=>{if(cur()){cur().name=e.target.value;const o=$("mlist").options[mi];if(o)o.textContent=`${mi+1}. ${cur().name}`}};
async function mSave(){try{await api("/api/macros",{macros:MAC});toast(t("mac.uploaded"));mRender()}catch(e){toast(e.message,1)}}
// ---------- home: live mouse view + movement pad
const HB={0:"h0",2:"h1",1:"h2",3:"h3",4:"h4"},HN={0:"L",2:"R",1:"M",3:"B",4:"F"};let counts={0:0,2:0,1:0,3:0,4:0,up:0,dn:0,dpi:0};
const homeOn=()=>$("t-home").classList.contains("on");
function homeRender(){$("counts").innerHTML=Object.entries(HN).map(([b,n])=>`<span>${n} <b>${counts[b]}</b></span>`).join("")+`<span>▲ <b>${counts.up}</b></span><span>▼ <b>${counts.dn}</b></span><span>DPI <b>${counts.dpi}</b></span>`;
 if(S){const c=S.config;$("hdpi").textContent=c.dpis[c.dpi_index]+" "+t("home.dpi")}}
// DPI button is handled by the mouse (no click reaches the OS): detect it by watching the active DPI stage.
let dpiBusy=false,dpiFlash;
setInterval(async()=>{if(!S||!homeOn()||document.hidden||dpiBusy)return;dpiBusy=true;
 try{const r=await api("/api/status");if(r.dpi_index!==S.config.dpi_index){S.config.dpi_index=r.dpi_index;S.config.dpis=r.dpis;counts.dpi++;lit("h5",true);clearTimeout(dpiFlash);dpiFlash=setTimeout(()=>lit("h5",false),900);homeRender()}}catch(e){}
 dpiBusy=false},1200);
function homeReset(){for(const k in counts)counts[k]=0;homeRender()}
const SIDE={h0:"sh01",h1:"sh01",h2:"sh2",h3:"sh3",h4:"sh4",h5:"sh5"};
function lit(id,on){window.Mouse3D&&Mouse3D.set(id,on);const e=$(id);if(e)e.classList.toggle("on",on);const s=SIDE[id];if(s){const el=$(s);if(on)el.dataset["n"+id]=1;else delete el.dataset["n"+id];el.classList.toggle("on",Object.keys(el.dataset).some(k=>k[0]=="n"&&el.dataset[k]))}}
// top / side view with a flip animation (vector drawings traced from the product photos)
function flipView(){const f=$("flipper");f.classList.toggle("side");ls.set("rs7.view",f.classList.contains("side")?"side":"top");$("vtoggle").textContent=t(f.classList.contains("side")?"home.viewtop":"home.viewside")}
let v3=false;
function applyView(){const ok=!!window.Mouse3D;v3=ok&&(ls.get("rs7.view")||"3d")==="3d";const side=ls.get("rs7.view")==="side";
 $("m3d").style.display=v3?"block":"none";$("flipper").style.display=v3?"none":"";$("flipper").classList.toggle("side",side);
 $("v3d").style.display=ok?"":"none";$("v3d").textContent=t(v3?"home.view2d":"home.view3d");$("vtoggle").style.display=v3?"none":"";
 $("vtoggle").textContent=t(side?"home.viewtop":"home.viewside");$("vreset").style.display=$("vauto").style.display=v3?"":"none";$("tip3d").style.display=v3?"":"none"}
function toggle3d(){ls.set("rs7.view",v3?"top":"3d");applyView()}
document.addEventListener("mouse3d-ready",applyView);
// Button state machine: every press stays lit for at least MINLIT ms so even a quick click is visible.
const MASK={0:1,2:2,1:4,3:8,4:16},MINLIT=200,bst={},btm={};
function bDown(b){if(bst[b])return;bst[b]=true;btm[b]=performance.now();lit(HB[b],true);counts[b]++;homeRender();
 if(b>2){clearTimeout(bst.t3);bst["x"+b]=setTimeout(()=>bUp(b),700)}}   // side buttons: failsafe if the browser eats the release (history navigation)
function bUp(b){if(!bst[b])return;bst[b]=false;clearTimeout(bst["x"+b]);const d=Math.max(0,MINLIT-(performance.now()-btm[b]));setTimeout(()=>{if(!bst[b])lit(HB[b],false)},d)}
function bSync(e){if(!homeOn()||e.buttons===undefined)return;for(const b in MASK){const on=!!(e.buttons&MASK[b]);if(on)bDown(+b);else if(b<3||e.type.endsWith("up"))bUp(+b)}}
for(const type of ["pointerdown","pointermove","pointerup","mousedown","mousemove","mouseup"])addEventListener(type,e=>{
 if(!homeOn())return;bSync(e);
 if(e.type.endsWith("down")&&HB[e.button]!==undefined){bDown(e.button);if(e.button>2)e.preventDefault()}
 if(e.type.endsWith("up")&&HB[e.button]!==undefined){bUp(e.button);if(e.button>2)e.preventDefault()}},true);
addEventListener("auxclick",e=>{if(homeOn()&&e.button>2)e.preventDefault()},true);
addEventListener("contextmenu",e=>{if(homeOn()&&e.target.closest("#t-home"))e.preventDefault()});
history.pushState({rs7:1},"");addEventListener("popstate",()=>history.pushState({rs7:1},""));   // swallow browser Back/Forward mouse buttons
let wt={};addEventListener("wheel",e=>{if(!homeOn()||!e.target.closest("#t-home"))return;const up=e.deltaY<0,id=up?"hup":"hdn";counts[up?"up":"dn"]++;lit(id,true);window.Mouse3D&&Mouse3D.scroll(up?-1:1);clearTimeout(wt[id]);wt[id]=setTimeout(()=>lit(id,false),240);homeRender()},{passive:true});
const pad=$("pad"),pc=pad.getContext("2d");let pts=[],last=null,speed=0,evs=[],rate=0;
function padXY(e){const r=pad.getBoundingClientRect();return[(e.clientX-r.left)*pad.width/r.width,(e.clientY-r.top)*pad.height/r.height]}
pad.addEventListener("mousemove",e=>{const[x,y]=padXY(e),n=performance.now(),co=e.getCoalescedEvents?e.getCoalescedEvents().length||1:1;
 const dx=last?x-last[0]:0,dy=last?y-last[1]:0;if(last)speed=speed*.8+Math.hypot(dx,dy)/Math.max(1,n-last[2])*1000*.2;last=[x,y,n];pts.push([x,y,n]);
 evs.push([n,co]);while(evs.length&&n-evs[0][0]>1000)evs.shift();rate=evs.reduce((s,v)=>s+v[1],0);
 $("spos").textContent=Math.round(x)+", "+Math.round(y);$("sdelta").textContent=Math.round(dx)+", "+Math.round(dy);$("sspeed").textContent=Math.round(speed)+" px/s";$("srate").textContent="≈ "+rate+" Hz"});
pad.addEventListener("mouseleave",()=>{last=null;speed=0});
function drawPad(){requestAnimationFrame(drawPad);if(!homeOn())return;const W=pad.width,H=pad.height,cs=getComputedStyle(document.documentElement),acc=cs.getPropertyValue("--acc").trim(),line=cs.getPropertyValue("--line").trim();
 pc.clearRect(0,0,W,H);pc.strokeStyle=line;pc.lineWidth=1;pc.globalAlpha=.6;for(let i=1;i<10;i++){pc.beginPath();pc.moveTo(i*W/10,0);pc.lineTo(i*W/10,H);pc.moveTo(0,i*H/10);pc.lineTo(W,i*H/10);pc.stroke()}
 pc.globalAlpha=1;pc.beginPath();pc.arc(W/2,H/2,W/4,0,7);pc.arc(W/2,H/2,W/2-2,0,7);pc.stroke();
 const n=performance.now();pts=pts.filter(p=>n-p[2]<1400);pc.lineCap="round";pc.lineJoin="round";
 for(let i=1;i<pts.length;i++){const a=1-(n-pts[i][2])/1400;pc.strokeStyle=acc;pc.globalAlpha=Math.max(0,a);pc.lineWidth=2+4*a;pc.beginPath();pc.moveTo(pts[i-1][0],pts[i-1][1]);pc.lineTo(pts[i][0],pts[i][1]);pc.stroke()}
 pc.globalAlpha=1;if(last&&n-last[2]<1400){pc.fillStyle=acc;pc.shadowColor=acc;pc.shadowBlur=14;pc.beginPath();pc.arc(last[0],last[1],6,0,7);pc.fill();pc.shadowBlur=0}}
drawPad();
// ---------- init
function buildStatic(){const L=I18N[LANG];opts($("atype"),ATYPES,a=>t("act."+a));opts($("amouse"),MOUSE,(m,i)=>t("mouse.names")[i]);opts($("akey"),KEYS,k=>k[0]);opts($("amedia"),MEDIA,(m,i)=>t("media.names")[i]);
 $("mmode").innerHTML=[0,2,3].map(m=>`<option value="${m}">${esc(t("mode."+m))}</option>`).join("");$("mods").innerHTML=MODS.map(m=>`<label><input type="checkbox"> ${m[0]}</label>`).join("")}
function renderAll(){i18n();homeRender();applyView();renderTabs();buildStatic();renderProfiles();renderDpi();renderPerf();renderSettings();mRender();showSel();
 $("bat").textContent=t("bat")+" "+S.info.percent+"%"+(S.info.charging?" ⚡":"");$("fw").textContent=t("fw")+" "+S.info.fw+" · "+S.info.date;$("ver").textContent="v"+S.version;$("fver").textContent="v"+S.version}
async function load(){try{S=await api("/api/state");TOKEN=S.token;$("err").style.display="none";$("app").style.display="flex";
  const sv=S.settings;if(!ls.get("rs7.lang")){LANG=resolveLang(sv.lang)}if(!ls.get("rs7.theme"))setTheme(sv.theme);
  keys=normKeys(S.keys);MAC=S.macros||[];if(!document.querySelector("section.on"))$("t-home").classList.add("on");renderAll()}
 catch(e){$("app").style.display="none";$("err").style.display="block";$("errmsg").textContent=e.message;i18n()}}
$("atype").onchange=()=>{vis();stage()};["amouse","akey","amedia","amacro","mmode","mcount"].forEach(i=>$(i).onchange=stage);$("mods").onchange=stage;
for(let i=0;i<6;i++)$("b"+i).onclick=()=>{stage();sel=i;showSel()};
i18n();load();
