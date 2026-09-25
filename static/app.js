const $ = id => document.getElementById(id);
let stream = null;
let currentMode = null;
let cachedVoices = [];
let micProbe = null;

const stylePresets = {
  natural:{rate:1.00,pitch:1.00},
  soft:{rate:0.92,pitch:1.08},
  bright:{rate:1.03,pitch:1.18},
  deep:{rate:0.92,pitch:0.82},
  sales:{rate:1.12,pitch:1.08},
  review:{rate:1.18,pitch:1.00}
};

function alertMsg(msg){ alert(msg); }

async function health(){
  try{
    const r=await fetch('/api/health');
    const d=await r.json();
    $('serverDot').classList.add('ok');
    $('serverText').textContent='Web đang hoạt động';
    $('serverMode').textContent='v'+d.version;
    $('aiStatus').textContent=d.ai_configured?'AI API đã nối':'AI nội bộ';
  }catch(e){
    $('serverText').textContent='Mất kết nối';
    $('serverMode').textContent='Offline';
  }
}
health();

try{
  const wsProto=location.protocol==='https:'?'wss':'ws';
  const ws=new WebSocket(`${wsProto}://${location.host}/ws/control`);
  ws.onopen=()=>{$('wsStatus').textContent='Kết nối ổn';$('wsStatus').classList.add('good')};
  ws.onclose=()=>{$('wsStatus').textContent='Mất kết nối';$('wsStatus').classList.remove('good')};
}catch(e){}

function saveSession(){
  localStorage.setItem('lh_product_name',$('productName').value.trim());
  localStorage.setItem('lh_product_price',$('productPrice').value.trim());
  localStorage.setItem('lh_product_notes',$('productNotes').value.trim());
  $('lowerProduct').textContent=$('productName').value.trim()||'LIVEHOST AI';
}
function loadSession(){
  $('productName').value=localStorage.getItem('lh_product_name')||'';
  $('productPrice').value=localStorage.getItem('lh_product_price')||'';
  $('productNotes').value=localStorage.getItem('lh_product_notes')||'';
  $('lowerProduct').textContent=$('productName').value||'LIVEHOST AI';
}
loadSession();
$('saveProductBtn').onclick=()=>{saveSession();alertMsg('Đã lưu thông tin sản phẩm.')};

async function loadCurrentAvatar(){
  try{
    const r=await fetch('/api/avatar/current',{cache:'no-store'});
    const d=await r.json();
    if(d.exists && d.url){
      $('avatarImg').src=d.url;
      $('avatarUploadStatus').textContent='Đã có avatar ✓';
      return true;
    }
  }catch(e){}
  $('avatarUploadStatus').textContent='Chưa có ảnh';
  return false;
}

function setMode(mode){
  currentMode=mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  $('cameraTools').classList.add('hidden');
  $('avatarTools').classList.add('hidden');
  $('cam').style.display='none';
  $('avatarImg').style.display='none';

  if(mode==='camera'){
    $('cameraModeBtn').classList.add('active');
    $('cameraTools').classList.remove('hidden');
    $('modeStatus').textContent='Camera';
    $('lowerMode').textContent='Camera mode';
    $('emptyState').style.display=stream?'none':'flex';
    if(stream) $('cam').style.display='block';
  } else if(mode==='avatar'){
    $('avatarModeBtn').classList.add('active');
    $('avatarTools').classList.remove('hidden');
    $('modeStatus').textContent='Avatar AI';
    $('lowerMode').textContent='Avatar mode';
    $('emptyState').style.display=$('avatarImg').src?'none':'flex';
    if($('avatarImg').src) $('avatarImg').style.display='block';
  }
}
$('cameraModeBtn').onclick=()=>setMode('camera');
$('avatarModeBtn').onclick=async()=>{await loadCurrentAvatar();setMode('avatar')};

$('startCameraBtn').onclick=async()=>{
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    $('cam').srcObject=stream;
    $('emptyState').style.display='none';
    setMode('camera');
  }catch(e){alertMsg('Không mở được camera. Hãy bấm Cho phép camera trên trình duyệt.')};
};
$('stopCameraBtn').onclick=()=>{
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  $('cam').srcObject=null;
  setMode('camera');
};
$('testMicBtn').onclick=async()=>{
  try{
    micProbe=await navigator.mediaDevices.getUserMedia({audio:true});
    alertMsg('Micro đang hoạt động ✓');
    micProbe.getTracks().forEach(t=>t.stop());
  }catch(e){alertMsg('Không mở được micro. Hãy cho phép quyền microphone.')};
};

$('avatarInput').onchange=async e=>{
  const f=e.target.files[0];
  if(!f) return;
  $('avatarUploadStatus').textContent='Đang tải ảnh…';
  try{
    const fd=new FormData();fd.append('file',f);
    const r=await fetch('/api/avatar',{method:'POST',body:fd});
    const d=await r.json();
    if(!r.ok || !d.ok) throw new Error(d.error||'Upload thất bại');
    $('avatarImg').src=d.url;
    $('avatarImg').onload=()=>{
      $('avatarUploadStatus').textContent='Đã thêm avatar ✓';
      $('emptyState').style.display='none';
      setMode('avatar');
    };
  }catch(err){
    $('avatarUploadStatus').textContent='Tải ảnh lỗi';
    alertMsg('Không thêm được avatar: '+err.message);
  }
};

function sortVoices(voices){
  return [...voices].sort((a,b)=>{
    const avi=/^vi(-|_)/i.test(a.lang)?0:1;
    const bvi=/^vi(-|_)/i.test(b.lang)?0:1;
    if(avi!==bvi) return avi-bvi;
    return a.name.localeCompare(b.name);
  });
}
function loadVoices(){
  cachedVoices=sortVoices(window.speechSynthesis?.getVoices?.()||[]);
  const select=$('voiceSelect');
  select.innerHTML='';
  const vi=cachedVoices.filter(v=>/^vi(-|_)/i.test(v.lang));
  const use=vi.length?vi:cachedVoices;
  use.forEach(v=>{
    const o=document.createElement('option');
    o.value=v.voiceURI||v.name;
    o.textContent=`${v.name} — ${v.lang}`;
    select.appendChild(o);
  });
  if(!use.length){
    const o=document.createElement('option');o.value='';o.textContent='Chưa thấy giọng hệ thống';select.appendChild(o);
  }
  $('voiceCount').textContent=vi.length
    ? `Tìm thấy ${vi.length} giọng tiếng Việt trên máy`
    : `Máy chưa báo voice vi-VN; sẽ dùng voice mặc định để đọc tiếng Việt`;
}
loadVoices();
if(window.speechSynthesis){
  speechSynthesis.addEventListener('voiceschanged',loadVoices);
}
$('refreshVoicesBtn').onclick=()=>{loadVoices();alertMsg('Đã tải lại danh sách giọng từ máy.')};

function selectedVoice(){
  const key=$('voiceSelect').value;
  return cachedVoices.find(v=>(v.voiceURI||v.name)===key) || cachedVoices.find(v=>/^vi(-|_)/i.test(v.lang)) || cachedVoices[0] || null;
}
function speak(text){
  if(!text.trim()) return;
  if(!('speechSynthesis' in window)){alertMsg('Trình duyệt này không hỗ trợ đọc giọng. Hãy dùng Chrome hoặc Edge.');return;}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text.trim());
  const voice=selectedVoice();
  const preset=stylePresets[$('voiceStyle').value]||stylePresets.natural;
  if(voice) u.voice=voice;
  u.lang=voice?.lang||'vi-VN';
  u.rate=preset.rate;
  u.pitch=preset.pitch;
  u.volume=1;
  speechSynthesis.speak(u);
}
$('speakBtn').onclick=()=>speak($('ttsText').value);
$('stopSpeakBtn').onclick=()=>speechSynthesis.cancel();

function addReply(text,source){
  const box=document.createElement('div');box.className='reply';
  const p=document.createElement('p');p.textContent=text;
  const meta=document.createElement('small');meta.textContent='Nguồn: '+source;
  const actions=document.createElement('div');actions.className='reply-actions';
  const read=document.createElement('button');read.className='primary';read.textContent='Duyệt & đọc';
  read.onclick=()=>{$('ttsText').value=text;speak(text)};
  const copy=document.createElement('button');copy.textContent='Đưa vào ô giọng nói';
  copy.onclick=()=>{$('ttsText').value=text};
  actions.append(read,copy);box.append(p,meta,actions);
  const hint=$('commentFeed').querySelector('.hint');if(hint) hint.remove();
  $('commentFeed').prepend(box);
}
$('sendCommentBtn').onclick=async()=>{
  const comment=$('commentInput').value.trim();if(!comment)return;
  $('sendCommentBtn').disabled=true;$('sendCommentBtn').textContent='Đang tạo…';
  try{
    const r=await fetch('/api/ai/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      comment,
      product_name:$('productName').value.trim(),
      product_price:$('productPrice').value.trim(),
      product_notes:$('productNotes').value.trim()
    })});
    const d=await r.json();
    addReply(d.reply,d.source||'local');
    $('commentInput').value='';
  }catch(e){alertMsg('Không tạo được câu trả lời. Kiểm tra lại kết nối web.') }
  finally{$('sendCommentBtn').disabled=false;$('sendCommentBtn').textContent='Tạo câu trả lời'}
};

function obsUrl(){return location.origin+'/?obs=1'}
$('openObsBtn').onclick=()=>window.open(obsUrl(),'_blank');
$('copyObsBtn').onclick=async()=>{
  try{await navigator.clipboard.writeText(obsUrl());alertMsg('Đã sao chép link OBS Output.')}
  catch(e){prompt('Sao chép link này:',obsUrl())}
};
$('tiktokStatusBtn').onclick=async()=>{
  const r=await fetch('/api/tiktok/status');const d=await r.json();alertMsg(d.message);
};

async function initObs(){
  document.body.classList.add('obs-mode');
  const hasAvatar=await loadCurrentAvatar();
  if(hasAvatar){
    currentMode='avatar';
    $('avatarImg').style.display='block';
    $('emptyState').style.display='none';
    $('lowerMode').textContent='Avatar output';
  }else{
    $('emptyState').style.display='flex';
  }
}

if(new URLSearchParams(location.search).get('obs')==='1') initObs();
else loadCurrentAvatar();
