// Página de pareamento protegida por senha. QR nunca é exposto no HTML inicial.
export const qrPageHtml=String.raw`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Alpha Bot · Vincular WhatsApp</title>
<style>
:root{color-scheme:dark;font:16px system-ui,-apple-system,sans-serif;background:#101626;color:#f3f6fc}
*{box-sizing:border-box}
body{min-height:100vh;margin:0;display:grid;place-items:center;padding:18px}
main{width:min(100%,440px);border:1px solid #364259;border-radius:18px;padding:26px;background:#182238;text-align:center}
h1{font-size:23px;margin:0 0 8px}
p{line-height:1.55;color:#c1cbe1}
label{display:block;text-align:left;margin-top:20px;font-weight:650}
input{width:100%;font:inherit;padding:13px;background:#0c1527;border:1px solid #53627a;color:white;border-radius:9px;margin:9px 0}
button{font:inherit;font-weight:700;width:100%;border:none;border-radius:9px;padding:12px;background:#87d5ff;color:#092133;cursor:pointer}
#qr{max-width:100%;width:300px;background:white;border-radius:10px;padding:10px}
[hidden]{display:none!important}
small{display:block;color:#aab9d3;margin-top:16px;line-height:1.5}
#status{margin:15px 0;font-weight:600}
</style>
</head>
<body>
<main>
<h1>🤖 Alpha Bot · WhatsApp</h1>
<p>Use um computador ou segundo aparelho para mostrar este QR Code. No celular do número terminado em <strong>3631</strong>, abra WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>
<form id="auth">
<label for="password">Senha temporária de pareamento</label>
<input id="password" type="password" autocomplete="off" required maxlength="128" placeholder="Digite a senha">
<button type="submit">Ver QR Code</button>
</form>
<section id="panel" hidden aria-live="polite">
<p id="status">Buscando QR Code...</p>
<img id="qr" alt="QR Code do WhatsApp para vincular o Alpha Bot" hidden>
<small>O QR muda automaticamente. Não compartilhe esta página, a senha ou o QR com outras pessoas. Depois da conexão, o QR deixa de ser mostrado.</small>
</section>
</main>
<script>
(function(){
'use strict';
var secret='',timer=null;
var form=document.getElementById('auth');
var panel=document.getElementById('panel');
var status=document.getElementById('status');
var qr=document.getElementById('qr');
form.addEventListener('submit',function(e){
 e.preventDefault();secret=document.getElementById('password').value.trim();
 document.getElementById('password').value='';
 form.hidden=true;panel.hidden=false;poll();
});
async function poll(){
 if(document.hidden){timer=setTimeout(poll,3500);return}
 try{
  var res=await fetch('/api/link-qr',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({secret:secret}),cache:'no-store'});
  if(res.status===401){status.textContent='Senha incorreta. Tente novamente.';qr.hidden=true;form.hidden=false;panel.hidden=true;secret='';return}
  if(!res.ok)throw Error('Falha temporária');
  var data=await res.json();
  if(data.connected){status.textContent='✅ WhatsApp conectado!';qr.hidden=true;return}
  if(data.image){qr.src=data.image;qr.hidden=false;status.textContent='Escaneie agora com o WhatsApp do número 3631.'}
  else{qr.hidden=true;status.textContent='Aguardando novo QR Code. Esta tela atualiza automaticamente.'}
 }catch(_err){status.textContent='Aguardando resposta do servidor...'}
 timer=setTimeout(poll,3500)
}
document.addEventListener('visibilitychange',function(){if(!document.hidden&&secret){clearTimeout(timer);poll()}})
})()
</script>
</body></html>`;