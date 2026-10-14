// Painel somente leitura: não dispara comandos, reinícios ou ações no banco.
export const healthPageHtml=String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#0b1220">
  <meta name="robots" content="noindex, nofollow">
  <title>Alpha Bot • Acordar e verificar</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1220;color:#edf2ff}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at top,#172544 0%,#0b1220 70%)}
    main{width:min(100%,470px);border:1px solid #293955;background:#101b2eea;border-radius:22px;padding:30px;box-shadow:0 20px 70px #0005;text-align:center}
    .mark{font-size:38px;margin-bottom:10px}
    h1{font-size:25px;letter-spacing:-.5px;margin:0 0 6px}
    .subtitle{color:#a9bad4;margin:0 0 27px;font-size:14px}
    .status{border:1px solid #415477;background:#192940;border-radius:15px;padding:19px 14px;margin-bottom:17px}
    .status.ready{background:#11362d;border-color:#286c52}
    .status.wait{background:#352814;border-color:#725926}
    .status.offline{background:#3b2128;border-color:#864755}
    .symbol{display:inline-block;font-size:29px;margin-bottom:7px}
    .status:not(.ready) .symbol{animation:pulse 1.5s ease-in-out infinite}
    @keyframes pulse{50%{opacity:.45;transform:scale(.93)}}
    #state{display:block;font-size:21px;font-weight:750;margin-bottom:9px}
    #detail{display:block;color:#c5d1e1;font-size:14px;line-height:1.55}
    .facts{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #2b3951;padding-top:14px;margin-top:19px;font-size:13px;color:#b3c1d7}
    .facts strong{color:#eff5ff;font-variant-numeric:tabular-nums}
    button{width:100%;font:inherit;font-weight:700;border:0;border-radius:13px;padding:13px 16px;margin-top:20px;cursor:pointer;color:#071a27;background:#7bd4f6}
    button:disabled{opacity:.65;cursor:wait}
    .foot{color:#9cadc4;font-size:12px;line-height:1.65;margin:18px 0 0}
    a{color:#93dfff}
    @media (max-width:390px){main{padding:21px 16px}h1{font-size:23px}.facts{flex-wrap:wrap}}
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">🤖</div>
    <h1>Alpha Bot</h1>
    <p class="subtitle">Painel de inicialização e conexão do WhatsApp</p>
    <section id="panel" class="status wait" role="status" aria-live="polite">
      <span id="symbol" class="symbol" aria-hidden="true">⏳</span>
      <span id="state">Acordando o bot...</span>
      <span id="detail">Consultando o servidor. Isso pode levar alguns segundos.</span>
    </section>
    <div class="facts">
      <span>Servidor: <strong id="server">Verificando...</strong></span>
      <span>Atualizado: <strong id="checked">--:--:--</strong></span>
    </div>
    <button id="retry" type="button">↻ Verificar novamente</button>
    <p class="foot">Verificação rápida ao iniciar e a cada minuto após conectar.<br>
      Se o Render estiver hibernando, pode demorar até 1 minuto para iniciar.<br>
      Não é necessário escanear um QR Code quando o WhatsApp já está conectado.</p>
  </main>
  <script>
    (function(){
      'use strict';
      var panel=document.getElementById('panel');
      var symbol=document.getElementById('symbol');
      var state=document.getElementById('state');
      var detail=document.getElementById('detail');
      var server=document.getElementById('server');
      var checked=document.getElementById('checked');
      var retry=document.getElementById('retry');
      var busy=false;
      var pollTimer;
      var connected=false;
      function show(kind,emoji,title,description,serverState){
        panel.className='status '+kind;
        symbol.textContent=emoji;
        state.textContent=title;
        detail.textContent=description;
        server.textContent=serverState;
      }
      function update(data){
        connected=data.ok===true&&data.whatsapp==='open';
        var uptime=Number(data.uptimeSeconds||0);
        var seconds=uptime<60?uptime+' segundo(s)':Math.floor(uptime/60)+' minuto(s)';
        if(data.ok===true&&data.whatsapp==='open'){
          show('ready','✅','Bot acordado e conectado!',
            'WhatsApp online. Pode usar os comandos normalmente. Tempo ativo: '+seconds+'.','Online');
          return;
        }
        if(data.whatsapp==='starting'||data.whatsapp==='connecting'||data.whatsapp==='reconnecting'){
          show('wait','⚙️','Inicializando o bot...',
            'Servidor acordado. Aguardando a conexão com o WhatsApp.','Inicializando');
          return;
        }
        show('offline','🔄','Aguardando o WhatsApp...',
          'Servidor ligado, mas o WhatsApp ainda não confirmou a conexão. Tentando novamente.','Ligado');
      }
      async function check(){
        if(busy||document.hidden)return;
        busy=true;retry.disabled=true;
        var controller=new AbortController();
        var timeout=setTimeout(function(){controller.abort()},9000);
        try{
          var response=await fetch('/health?format=json',{cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}});
          var contentType=response.headers.get('content-type')||'';
          if(contentType.indexOf('application/json')<0)throw Error('Resposta não disponível');
          var data=await response.json();
          update(data);
        }catch(_err){
          connected=false;
          show('wait','⏳','Acordando o servidor...',
            'O Render está demorando a responder. Aguarde e a página tentará novamente.','Aguardando');
        }finally{
          clearTimeout(timeout);
          checked.textContent=new Date().toLocaleTimeString('pt-BR');
          busy=false;retry.disabled=false;
          clearTimeout(pollTimer);
          pollTimer=setTimeout(check,connected?60000:6000);
        }
      }
      retry.addEventListener('click',check);
      document.addEventListener('visibilitychange',function(){
        clearTimeout(pollTimer);
        if(!document.hidden)check();
      });
      check();
    })();
  </script>
</body>
</html>`;
