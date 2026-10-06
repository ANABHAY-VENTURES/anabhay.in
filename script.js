// Homepage-only particle field. Motion and work pause when appropriate.
(() => {
  const canvas = document.getElementById('field');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(pointer: fine)');
  const glow = document.querySelector('.cursor-glow');
  let w, h, particles = [], frame = 0;
  const mouse = {x:-9999,y:-9999,tx:-9999,ty:-9999};
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w*dpr; canvas.height = h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    particles = Array.from({length: Math.min(105, Math.floor(w/12))}, () => ({
      x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.18,vy:(Math.random()-.5)*.18,r:Math.random()*1.2+.25,a:Math.random()*.45+.08
    }));
  }
  function draw() {
    mouse.x+=(mouse.tx-mouse.x)*.06; mouse.y+=(mouse.ty-mouse.y)*.06;
    ctx.clearRect(0,0,w,h);
    for (const p of particles) {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=w;if(p.x>w)p.x=0;if(p.y<0)p.y=h;if(p.y>h)p.y=0;
      const dx=p.x-mouse.x,dy=p.y-mouse.y,dist=Math.hypot(dx,dy);
      if(dist>0&&dist<150){p.x+=dx/dist*.18;p.y+=dy/dist*.18;}
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(197,138,74,${p.a*(dist<180?1.8:.65)})`;ctx.fill();
    }
    frame=requestAnimationFrame(draw);
  }
  function sync() {
    cancelAnimationFrame(frame);
    if (!reduced.matches && !document.hidden) { resize(); draw(); }
    else ctx.clearRect(0,0,w||0,h||0);
  }
  addEventListener('resize',()=>{if(!reduced.matches&&!document.hidden)resize();});
  addEventListener('pointermove',e=>{
    if(reduced.matches||!finePointer.matches)return;
    mouse.tx=e.clientX;mouse.ty=e.clientY;
    if(glow){glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';}
  },{passive:true});
  reduced.addEventListener('change',sync);
  document.addEventListener('visibilitychange',sync);
  sync();
})();
