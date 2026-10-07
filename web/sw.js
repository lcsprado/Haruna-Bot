const CACHE='alpha-rpg-pwa-20261006-pets-qa-verified-v1';
const SHELL=[
  '/rpg','/styles.css','/app.js','/manifest.webmanifest',
  '/assets/icons/alpha-192.png','/assets/icons/alpha-512.png',
  '/assets/official-art-sheet.jpg',
  '/assets/alpha-fixed-art.webp',
  '/assets/alpha-special-pets.webp',
  '/assets/pets/aguia.webp',
  '/assets/pets/baleia-colossal.webp',
  '/assets/pets/dragao.webp',
  '/assets/pets/fenix-celestial.webp',
  '/assets/pets/gato.webp',
  '/assets/pets/grifo-celestial.webp',
  '/assets/pets/kitsune.webp',
  '/assets/pets/leao.webp',
  '/assets/pets/lobo.webp',
  '/assets/pets/polvo-arcano.webp',
  '/assets/pets/raposa.webp',
  '/assets/pets/serpente-cosmica.webp',
  '/assets/pets/tigre.webp',
  '/assets/pet-portraits/coelho.svg',
  '/assets/pet-portraits/papagaio.svg',
  '/assets/pet-portraits/hamster.svg',
  '/assets/pet-portraits/coruja.svg',
  '/assets/pet-portraits/golfinho_celestial.svg',
  '/assets/pet-portraits/moreia_sombria.svg',
  '/assets/pet-portraits/gaviao.svg',
  '/assets/pet-portraits/guepardo.svg',
  '/assets/pet-portraits/gazela_mistica.svg',
  '/assets/pet-portraits/cervo_mistico.svg',
  '/assets/pet-portraits/cavalo_guerra.svg',
  '/assets/pet-portraits/unicornio.svg',
  '/assets/pet-portraits/colosso_cristal.svg',
  '/assets/pet-portraits/salamandra_infernal.svg',
  '/assets/pet-portraits/rinoceronte_titanico.svg',
  '/assets/pet-portraits/guardiao_obsidiana.svg',
  '/assets/pet-portraits/cerbero_carmesim.svg',
  '/assets/pet-portraits/fenix_gelo.svg',
  '/assets/pet-portraits/fenix_alpha.svg',
  '/assets/pet-portraits/dragao_corrompido.svg',
  '/assets/pet-portraits/imperador_abissal.svg',
  '/assets/pet-portraits/leviata_gelo.svg',
  '/assets/pet-portraits/lobo_abismo.svg',
  '/assets/pet-portraits/urso_runico.svg',
  '/assets/pet-portraits/golem_ancestral.svg',
  '/assets/pet-portraits/corvo_abissal.svg',
  '/assets/pet-portraits/tubarao_abissal.svg',
  '/assets/pet-portraits/tigre_lunar.svg',
  '/assets/pet-portraits/leao_solar.svg',
  '/assets/pet-portraits/fenix_fogo.svg',
  '/assets/pet-portraits/dragao_vulcanico.svg',
  '/assets/pet-portraits/rinoceronte.svg',
  '/assets/pet-portraits/colosso_alpha.svg',
  '/assets/pet-portraits/serpente_cosmica.svg',
  '/assets/pets/tubarao-abissal.webp'
];

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
