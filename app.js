// ===== cookies + localStorage =====
const AUTH_KEY = "auth";
const cookie = {
  set(n,v,d=3){document.cookie=`${n}=${encodeURIComponent(v)};Expires=${new Date(Date.now()+d*864e5).toUTCString()};Path=/;SameSite=Lax`},
  get(n){return document.cookie.split("; ").find(r=>r.startsWith(n+"="))?.split("=")[1]?decodeURIComponent(document.cookie.split("; ").find(r=>r.startsWith(n+"="))?.split("=")[1]||""):null},
  del(n){document.cookie=`${n}=;Expires=Thu,01 Jan 1970 00:00:00 GMT;Path=/`}
};
const auth={
  get user(){const c=cookie.get(AUTH_KEY)||localStorage.getItem(AUTH_KEY);return c?{username:c}:null},
  login(u,p){u=u.trim();p=p.trim();if(!/^[a-zA-ZА-Яа-яІіЇїЄєҐґ]+[0-9]+$/u.test(u))throw Error("Логін має бути 'ім’я+номер курсу'");if(p!==u)throw Error("Пароль має збігатися з логіном");cookie.set(AUTH_KEY,u,3);localStorage.setItem(AUTH_KEY,u)},
  logout(){cookie.del(AUTH_KEY);localStorage.removeItem(AUTH_KEY)}
};

// ===== routing =====
const routes={"/login":renderLogin,"/dashboard":renderDashboard};
function getPath(){return(location.hash||"#/login").replace(/^#/,"")||"/login";}
function navigate(p){location.hash!==`#${p}`?location.hash=p:onRouteChange();}
window.addEventListener("hashchange",onRouteChange);document.addEventListener("DOMContentLoaded",onRouteChange);

function onRouteChange(){
  renderHeader();
  const app=document.getElementById("app");const path=getPath();
  // фон по маршруту
  document.body.classList.toggle("bg-login",path==="/login");
  document.body.classList.toggle("bg-dashboard",path==="/dashboard");

  if(path==="/dashboard"&&!auth.user)return navigate("/login");
  if(path==="/login"&&auth.user)return navigate("/dashboard");

  app.innerHTML="";(routes[path]||renderLogin)(app);
}

// ===== header =====
function renderHeader(){
  const slot=document.getElementById("auth-slot");slot.innerHTML="";
  const u=auth.user;
  if(u){const s=document.createElement("span");s.className="small";s.innerHTML=`Вітаємо, <b>${u.username}</b>`;
    const b=document.createElement("button");b.className="btn secondary";b.textContent="Вийти";b.onclick=()=>{auth.logout();navigate("/login")};
    slot.append(s,b);
  }else{const a=document.createElement("a");a.href="#/login";a.className="btn";a.textContent="Увійти";slot.append(a);}
}

// ===== login page =====
function renderLogin(c){
  c.append(document.getElementById("tpl-login").content.cloneNode(true));
  const f=c.querySelector("#login-form"),uE=c.querySelector("#login-username"),pE=c.querySelector("#login-password"),
        err=c.querySelector("#login-error"),btnT=c.querySelector("#login-btn-text"),
        btnS=c.querySelector("#login-btn-spin"),tBtn=c.querySelector("#toggle-pass");

  tBtn.addEventListener("click",()=>{
    const is=pE.type==="password";pE.type=is?"text":"password";
    tBtn.textContent=is?"🙈":"👁️";tBtn.title=is?"Сховати":"Показати";
  });

  f.addEventListener("submit",e=>{
    e.preventDefault();err.style.display="none";
    btnT.textContent="Вхід…";btnS.style.display="inline-block";f.querySelector("button[type='submit']").disabled=true;
    try{auth.login(uE.value,pE.value);navigate("/dashboard")}
    catch(e){err.textContent=e.message;err.style.display="block"}
    finally{btnT.textContent="Увійти";btnS.style.display="none";f.querySelector("button[type='submit']").disabled=false;}
  });
}

// ===== weather =====
const KYIV={name:"Київ",lat:50.4501,lon:30.5234};
const mapWeatherCode=c=>{
  const g=[{codes:[0],l:"Ясно",e:"☀️"},{codes:[1,2],l:"Мінлива хмарність",e:"🌤️"},{codes:[3],l:"Похмуро",e:"☁️"},
    {codes:[45,48],l:"Туман",e:"🌫️"},{codes:[51,53,55],l:"Мряка",e:"🌦️"},
    {codes:[61,63,65,80,81,82],l:"Дощ",e:"🌧️"},{codes:[71,73,75,85,86],l:"Сніг",e:"🌨️"},
    {codes:[95,96,99],l:"Гроза",e:"⛈️"}];for(const x of g)if(x.codes.includes(c))return x;return{l:"Погода",e:"🌡️"}};
async function fetchForecast({lat,lon,tz}){
  const u=new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude",lat);u.searchParams.set("longitude",lon);
  u.searchParams.set("daily","weathercode,temperature_2m_max,temperature_2m_min");
  u.searchParams.set("timezone",tz||Intl.DateTimeFormat().resolvedOptions().timeZone);
  const r=await fetch(u);if(!r.ok)throw Error("Помилка погоди "+r.status);
  const j=await r.json();return j.daily.time.map((d,i)=>({date:d,code:j.daily.weathercode[i],tmax:j.daily.temperature_2m_max[i],tmin:j.daily.temperature_2m_min[i]})).slice(0,5);
}
function card(d){
  const m=mapWeatherCode(d.code),dt=new Date(d.date);
  const el=document.createElement("div");el.className="card pad";
  el.innerHTML=`<div class="small muted">${dt.toLocaleDateString(undefined,{weekday:"short"})}</div>
  <div class="kpi">${dt.toLocaleDateString()}</div>
  <div class="emoji" style="margin:.5rem 0">${m.e}</div>
  <div>${m.l}</div>
  <div class="row small" style="margin-top:.5rem;"><span>⬆️ ${Math.round(d.tmax)}°C</span><span>⬇️ ${Math.round(d.tmin)}°C</span></div>`;
  return el;
}
function renderDashboard(c){
  c.append(document.getElementById("tpl-dashboard").content.cloneNode(true));
  const where=c.querySelector("#where-line"),load=c.querySelector("#load-line"),err=c.querySelector("#error-line"),
        grid=c.querySelector("#days-grid"),btn=c.querySelector("#refresh-btn");
  let coords={...KYIV},city=KYIV.name;
  async function loadData(){
    load.style.display="block";err.style.display="none";grid.innerHTML="";
    try{const d=await fetchForecast(coords);d.forEach(x=>grid.append(card(x)));}
    catch(e){err.textContent=e.message;err.style.display="block";}
    finally{load.style.display="none";}
  }
  if("geolocation"in navigator){
    navigator.geolocation.getCurrentPosition(p=>{
      coords={lat:p.coords.latitude,lon:p.coords.longitude};city="Моє місце";
      where.textContent=`Локація: ${city} (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})`;loadData();
    },()=>{where.textContent=`Локація: ${city} (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})`;loadData();});
  }else{where.textContent=`Локація: ${city}`;loadData();}
  btn.addEventListener("click",loadData);
}
