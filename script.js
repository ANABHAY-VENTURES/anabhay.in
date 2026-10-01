const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
let w, h, dpr, particles = [];
const mouse = {x:-9999,y:-9999,tx:-9999,ty:-9999};

function resize(){
  dpr = Math.min(devicePixelRatio || 1, 2);
  w = innerWidth; h = innerHeight;
  canvas.width = w*dpr; canvas.height = h*dpr;
  canvas.style.width=w+'px'; canvas.style.height=h+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  particles = Array.from({length: Math.min(105, Math.floor(w/12))}, () => ({
    x:Math.random()*w, y:Math.random()*h,
    vx:(Math.random()-.5)*.18, vy:(Math.random()-.5)*.18,
    r:Math.random()*1.2+.25, a:Math.random()*.45+.08
  }));
}
addEventListener('resize',resize);
addEventListener('pointermove',e=>{mouse.tx=e.clientX;mouse.ty=e.clientY});

function draw(){
  mouse.x += (mouse.tx-mouse.x)*.06; mouse.y += (mouse.ty-mouse.y)*.06;
  ctx.clearRect(0,0,w,h);
  for(const p of particles){
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0)p.x=w;if(p.x>w)p.x=0;if(p.y<0)p.y=h;if(p.y>h)p.y=0;
    const dx=p.x-mouse.x, dy=p.y-mouse.y, dist=Math.hypot(dx,dy);
    if(dist<150){p.x += dx/dist*.18; p.y += dy/dist*.18}
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=`rgba(197,138,74,${p.a*(dist<180?1.8:.65)})`; ctx.fill();
  }
  requestAnimationFrame(draw);
}
resize(); draw();

const glow=document.querySelector('.cursor-glow');
addEventListener('pointermove',e=>{
  glow.style.left=e.clientX+'px'; glow.style.top=e.clientY+'px';
});

const target = new Date('2027-01-01T00:00:00+05:30');
const countdown = document.getElementById('countdown');
function tick(){
  const ms=target-Date.now();
  if(ms<=0){countdown.textContent='WE ARE LIVE';return}
  const days=Math.floor(ms/86400000);
  const hrs=Math.floor(ms/3600000)%24;
  const min=Math.floor(ms/60000)%60;
  const sec=Math.floor(ms/1000)%60;
  countdown.textContent=`${days}D  ${String(hrs).padStart(2,'0')}H  ${String(min).padStart(2,'0')}M  ${String(sec).padStart(2,'0')}S`;
}
tick();setInterval(tick,1000);
