const $ = (id) => document.getElementById(id);
let stream = null;
let micEnabled = false;
let avatarMode = false;

function toast(msg){ alert(msg); }

async function health(){
  try{
    const r = await fetch('/api/health');
    const d = await r.json();
    $('serverDot').classList.add('ok');
    $('serverText').textContent = 'Backend online';
    $('serverMode').textContent = ('v' + d.version).toUpperCase();
    $('aiStatus').textContent = d.ai_configured ? 'AI API ✓' : 'Local fallback';
    $('avatarEngineStatus').textContent = d.avatar_engine_configured ? 'Configured ✓' : 'Chưa cấu hình';
  }catch(e){
    $('serverText').textContent = 'Backend offline';
  }
}
health();

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
let ws;
try{
  ws = new WebSocket(`${wsProto}://${location.host}/ws/control`);
  ws.onopen = () => $('wsStatus').textContent = 'WS: connected';
  ws.onclose = () => $('wsStatus').textContent = 'WS: disconnected';
}catch(e){}

function loadSession(){
  $('productName').value = localStorage.getItem('lh_product_name') || '';
  $('productPrice').value = localStorage.getItem('lh_product_price') || '';
  $('productNotes').value = localStorage.getItem('lh_product_notes') || '';
  $('lowerProduct').textContent = $('productName').value || 'LIVEHOST AI';
}
loadSession();

$('saveProductBtn').onclick = () => {
  localStorage.setItem('lh_product_name', $('productName').value.trim());
  localStorage.setItem('lh_product_price', $('productPrice').value.trim());
  localStorage.setItem('lh_product_notes', $('productNotes').value.trim());
  $('lowerProduct').textContent = $('productName').value.trim() || 'LIVEHOST AI';
  toast('Đã lưu thông tin phiên live trên trình duyệt này.');
};

$('cameraBtn').onclick = async () => {
  if(stream){
    stream.getVideoTracks().forEach(t => t.stop());
    stream = null;
    $('cam').style.display = 'none';
    $('cameraBtn').textContent = 'Bật camera';
    return;
  }
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    $('cam').srcObject = stream;
    $('cam').style.display = 'block';
    $('avatarImg').style.display = 'none';
    $('emptyState').style.display = 'none';
    avatarMode = false;
    $('cameraBtn').textContent = 'Tắt camera';
  }catch(e){
    toast('Không mở được camera. Hãy cho phép quyền camera.');
  }
};

$('micBtn').onclick = async () => {
  if(micEnabled){
    micEnabled = false;
    $('micBtn').textContent = 'Bật mic';
    return;
  }
  try{
    const s = await navigator.mediaDevices.getUserMedia({audio:true});
    s.getTracks().forEach(t => t.stop());
    micEnabled = true;
    $('micBtn').textContent = 'Mic ✓';
  }catch(e){
    toast('Không mở được microphone.');
  }
};

$('avatarInput').onchange = async (e) => {
  const f = e.target.files[0];
  if(!f) return;
  $('avatarImg').src = URL.createObjectURL(f);
  $('avatarImg').style.display = 'block';
  $('cam').style.display = 'none';
  $('emptyState').style.display = 'none';
  avatarMode = true;
  const fd = new FormData();
  fd.append('file', f);
  fetch('/api/avatar', {method:'POST', body:fd}).catch(()=>{});
};

$('avatarModeBtn').onclick = () => {
  if(!$('avatarImg').src){
    toast('Tải một ảnh avatar trước nhé.');
    return;
  }
  avatarMode = !avatarMode;
  $('avatarImg').style.display = avatarMode ? 'block' : 'none';
  $('cam').style.display = !avatarMode && stream ? 'block' : 'none';
};

function loadVoices(){
  const voices = speechSynthesis.getVoices();
  $('voiceSelect').innerHTML = '';
  voices.forEach((v,i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${v.name} — ${v.lang}`;
    if(v.lang.toLowerCase().startsWith('vi')) o.selected = true;
    $('voiceSelect').appendChild(o);
  });
}
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(text){
  if(!text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  u.voice = voices[+$('voiceSelect').value] || null;
  u.lang = u.voice?.lang || 'vi-VN';
  u.rate = 1.02;
  speechSynthesis.speak(u);
}

$('speakBtn').onclick = () => speak($('ttsText').value);
$('stopSpeakBtn').onclick = () => speechSynthesis.cancel();

function addBubble(text, kind='viewer', meta=''){
  const wrap = document.createElement('div');
  wrap.className = 'bubble ' + kind;
  const head = document.createElement('div');
  head.className = 'bubble-head';
  head.textContent = meta || (kind === 'ai' ? 'AI suggestion' : 'Viewer');
  const body = document.createElement('div');
  body.textContent = text;
  wrap.append(head, body);
  $('commentFeed').appendChild(wrap);
  $('commentFeed').scrollTop = $('commentFeed').scrollHeight;
  return wrap;
}

async function requestReply(comment, viewer=''){
  const payload = {
    comment,
    viewer,
    product_name: $('productName').value.trim(),
    product_price: $('productPrice').value.trim(),
    product_notes: $('productNotes').value.trim()
  };
  const r = await fetch('/api/ai/reply', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  if(!r.ok) throw new Error('AI reply request failed');
  return r.json();
}

function addApproval(reply, source){
  const wrap = addBubble(reply, 'ai', `AI suggestion · ${source}`);
  const actions = document.createElement('div');
  actions.className = 'bubble-actions';

  const approve = document.createElement('button');
  approve.className = 'primary small';
  approve.textContent = 'Duyệt & đọc';
  approve.onclick = () => {
    $('ttsText').value = reply;
    speak(reply);
    actions.remove();
  };

  const copy = document.createElement('button');
  copy.className = 'small';
  copy.textContent = 'Chép vào TTS';
  copy.onclick = () => {
    $('ttsText').value = reply;
    actions.remove();
  };

  const skip = document.createElement('button');
  skip.className = 'small';
  skip.textContent = 'Bỏ qua';
  skip.onclick = () => wrap.remove();

  actions.append(approve, copy, skip);
  wrap.appendChild(actions);

  if($('autoApprove').checked){
    setTimeout(() => approve.click(), 250);
  }
}

$('sendCommentBtn').onclick = async () => {
  const v = $('commentInput').value.trim();
  if(!v) return;
  const viewer = $('viewerInput').value.trim();
  addBubble(v, 'viewer', viewer || 'Viewer');
  $('commentInput').value = '';
  ws?.readyState === 1 && ws.send(JSON.stringify({type:'comment', text:v, viewer}));
  try{
    const d = await requestReply(v, viewer);
    addApproval(d.reply, d.source || 'unknown');
  }catch(e){
    addApproval('Mình chưa tạo được câu trả lời lúc này. Hãy kiểm tra kết nối AI hoặc dùng TTS thủ công nhé.', 'error');
  }
};
$('commentInput').addEventListener('keydown', e => { if(e.key === 'Enter') $('sendCommentBtn').click(); });

$('connectGpuBtn').onclick = async () => {
  const r = await fetch('/api/gpu-config');
  const d = await r.json();
  if(!d.server_url) toast('Chưa gắn GPU server. Web/controller đang chạy bình thường; avatar engine sẽ cắm qua AVATAR_ENGINE_URL.');
  else toast('GPU adapter đã có URL: ' + d.server_url);
};

$('tiktokStatusBtn').onclick = async () => {
  const r = await fetch('/api/tiktok/status');
  const d = await r.json();
  toast(d.message);
};

function obsUrl(){
  return location.origin + '/?obs=1';
}
$('obsBtn').onclick = () => window.open(obsUrl(), '_blank');
$('copyObsBtn').onclick = async () => {
  try{
    await navigator.clipboard.writeText(obsUrl());
    toast('Đã sao chép URL OBS.');
  }catch(e){
    prompt('Sao chép URL này:', obsUrl());
  }
};

if(new URLSearchParams(location.search).get('obs') === '1'){
  document.body.classList.add('obs-mode');
}
