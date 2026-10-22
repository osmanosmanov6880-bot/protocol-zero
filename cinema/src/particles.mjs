/** Budgeted, visibility-aware atmospheric dust; decorative canvas only. */
export class ParticleField {
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});this.nodes=[];this.frame=0;this.running=false;this.last=0;this.quality='lite';
   this.resize=()=>this.fit();window.addEventListener('resize',this.resize,{passive:true});
   this.visibility=()=>{if(document.hidden)this.stop();else if(this.quality!=='lite')this.start();};
   document.addEventListener('visibilitychange',this.visibility);this.fit();}
 fit(){const box=this.canvas.getBoundingClientRect();this.w=Math.max(1,box.width);this.h=Math.max(1,box.height);this.dpr=Math.min(window.devicePixelRatio||1,1.5);this.canvas.width=Math.ceil(this.w*this.dpr);this.canvas.height=Math.ceil(this.h*this.dpr);this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.seed();}
 seed(){const count=this.quality==='cinematic'?55:this.quality==='balanced'?22:0;
 this.nodes=Array.from({length:count},(_,i)=>({x:(i*127.7%100)/100*this.w,y:(i*71.3%100)/100*this.h,r:.4+(i%5)*.23,s:.1+(i%7)*.07,opacity:.06+(i%4)*.05}));}
 setQuality(next){this.quality=next;this.seed();if(next==='lite'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)this.stop();else this.start();}
 start(){if(this.running||document.hidden||!this.nodes.length)return;this.running=true;this.frame=requestAnimationFrame(t=>this.paint(t));}
 stop(){this.running=false;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.ctx.clearRect(0,0,this.w,this.h);}
 paint(now){if(!this.running)return;if(now-this.last>=42){this.last=now;this.ctx.clearRect(0,0,this.w,this.h);this.ctx.fillStyle='#fff4df';for(const n of this.nodes){n.y-=n.s;if(n.y<0){n.y=this.h;n.x=(n.x+41)%this.w;}this.ctx.globalAlpha=n.opacity;this.ctx.beginPath();this.ctx.arc(n.x,n.y,n.r,0,Math.PI*2);this.ctx.fill();}this.ctx.globalAlpha=1;}this.frame=requestAnimationFrame(t=>this.paint(t));}
 destroy(){this.stop();window.removeEventListener('resize',this.resize);document.removeEventListener('visibilitychange',this.visibility);}
}
