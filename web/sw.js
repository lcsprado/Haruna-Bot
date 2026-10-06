const CACHE='alpha-rpg-pwa-20261006-v2';
const SHELL=['/rpg','/styles.css','/app.js','/manifest.webmanifest','/assets/icons/alpha-192.png','/assets/icons/alpha-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('alpha-rpg-pwa-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request);
    if(response&&response.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,response.clone()).catch(()=>{});
    }
    return response;
  }catch(error){
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : null) || Response.error();
  }
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')||url.pathname==='/health') return;

  if(request.mode==='navigate'){
    event.respondWith(networkFirst(request,'/rpg'));
    return;
  }

  if(['/app.js','/styles.css','/manifest.webmanifest','/sw.js'].includes(url.pathname)){
    event.respondWith(networkFirst(request));
    return;
  }

  if(url.pathname.startsWith('/assets/')){
    event.respondWith(
      caches.match(request).then(cached=>{
        const fresh=fetch(request).then(response=>{
          if(response&&response.ok) caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});
          return response;
        }).catch(()=>cached);
        return cached||fresh;
      })
    );
  }
});
