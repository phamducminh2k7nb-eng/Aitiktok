const $ = (id)=>document.getElementById(id);
let stream = null;
let micEnabled = false;
let avatarMode = false;

async function health(){
  try{
    const r = await fetch('/api/health'); const d = await r.json();
    $('serverDot').classList.add('ok'); $('serverText').textContent='Backend online';
    $('serverMode').textContent=d.mode.toUpperCase();
    $('engineMode').textContent=d.mode === 'demo' ? 'Demo local' : d.mode;
    $('gpuUrl').textContent=d.gpu_server_url || 'Chưa cấu hình';
  }catch(e){ $('serverText').textContent='Backend offline'; }
}
health();

const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
let ws;
try{
  ws = new WebSocket(`${wsProto}://${location.host}/ws/control`);
  ws.onopen=()=>{$('wsStatus').textContent='WS: connected';};
  ws.onclose=()=>{$('wsStatus').textContent='WS: disconnected';};
}catch(e){}

$('cameraBtn').onclick = async ()=>{
  if(stream){ stream.getVideoTracks().forEach(t=>t.stop()); stream=null; $('cam').style.display='none'; $('cameraBtn').textContent='Bật camera'; return; }
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    $('cam').srcObject=stream; $('cam').style.display='block'; $('avatarImg').style.display='none'; $('emptyState').style.display='none';
    avatarMode=false; $('cameraBtn').textContent='Tắt camera';
  }catch(e){ alert('Không mở được camera. Hãy cho phép quyền camera và dùng HTTPS/localhost.'); }
};

$('micBtn').onclick = async ()=>{
  if(micEnabled){ micEnabled=false; $('micBtn').textContent='Bật mic'; return; }
  try{ const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); micEnabled=true; $('micBtn').textContent='Mic ✓'; }
  catch(e){ alert('Không mở được microphone.'); }
};

$('avatarInput').onchange = async (e)=>{
  const f=e.target.files[0]; if(!f)return;
  $('avatarImg').src=URL.createObjectURL(f); $('avatarImg').style.display='block'; $('cam').style.display='none'; $('emptyState').style.display='none'; avatarMode=true;
  const fd=new FormData(); fd.append('file',f); fetch('/api/avatar',{method:'POST',body:fd}).catch(()=>{});
};

$('avatarModeBtn').onclick=()=>{
  if(!$('avatarImg').src){ alert('Tải một ảnh avatar trước nhé.'); return; }
  avatarMode=!avatarMode;
  $('avatarImg').style.display=avatarMode?'block':'none';
  $('cam').style.display=!avatarMode && stream?'block':'none';
};

function loadVoices(){
  const voices=speechSynthesis.getVoices(); $('voiceSelect').innerHTML='';
  voices.forEach((v,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${v.name} — ${v.lang}`; if(v.lang.toLowerCase().startsWith('vi')) o.selected=true; $('voiceSelect').appendChild(o); });
}
loadVoices(); speechSynthesis.onvoiceschanged=loadVoices;
$('speakBtn').onclick=()=>{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance($('ttsText').value); const voices=speechSynthesis.getVoices(); u.voice=voices[+$('voiceSelect').value]||null; u.lang=u.voice?.lang||'vi-VN'; u.rate=1.02; speechSynthesis.speak(u); };
$('stopSpeakBtn').onclick=()=>speechSynthesis.cancel();

const rules=[
  [/giá|bao nhiêu/i,'Dạ mình đang kiểm tra giá ưu đãi trên giỏ. Bạn bấm vào sản phẩm đang ghim để xem đúng giá hiện tại nhé.'],
  [/size|cỡ|kích thước/i,'Bạn cho mình chiều cao/cân nặng hoặc kích thước cần dùng, mình gợi ý size phù hợp nhé.'],
  [/ship|giao hàng|bao lâu/i,'Thời gian giao sẽ tùy khu vực. Bạn mở giỏ và nhập địa chỉ để TikTok Shop hiển thị dự kiến chính xác nhất nhé.'],
  [/tốt|ổn|đáng mua/i,'Mình sẽ nói đúng ưu và nhược điểm để bạn tự cân nhắc. Điểm nổi bật nhất của mẫu này là phần mình đang demo trên live.']
];
function aiReply(text){ for(const [r,a] of rules){if(r.test(text))return a;} return 'Mình thấy câu hỏi của bạn rồi. Mình sẽ trả lời ngay trên live và chỉ nói những thông tin mình kiểm tra được nhé.'; }
function addBubble(text,ai=false){ const b=document.createElement('div'); b.className='bubble'+(ai?' ai':''); b.textContent=(ai?'AI: ':'Viewer: ')+text; $('commentFeed').appendChild(b); $('commentFeed').scrollTop=$('commentFeed').scrollHeight; }
$('sendCommentBtn').onclick=()=>{ const v=$('commentInput').value.trim(); if(!v)return; addBubble(v); const rep=aiReply(v); setTimeout(()=>addBubble(rep,true),250); $('commentInput').value=''; ws?.readyState===1 && ws.send(JSON.stringify({type:'comment',text:v})); };
$('commentInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('sendCommentBtn').click();});

$('connectGpuBtn').onclick=async()=>{
  const r=await fetch('/api/gpu-config'); const d=await r.json();
  if(!d.server_url){ alert('Chưa gắn GPU server. Bản demo đang chạy đúng thiết kế: laptop làm frontend, GPU sẽ cắm sau qua biến GPU_SERVER_URL.'); }
  else window.open(d.server_url,'_blank');
};
