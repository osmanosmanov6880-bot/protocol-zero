/** Tiny opt-in original synthesis: no copyrighted audio, no autoplay, no network calls. */
export class Soundscape {
  constructor() {this.ctx=null;this.ambience=null;this.gain=null;this.enabled=false;this.volume=.35;}
  async setEnabled(enabled){
    this.enabled=Boolean(enabled);
    if(!this.enabled){this.stopTone();return;}
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){this.enabled=false;return;}
    try{this.ctx??=new AC();await this.ctx.resume();this.setMood('drone');}catch{this.enabled=false;}
  }
  setVolume(percent){this.volume=Math.min(1,Math.max(0,Number(percent)/100));if(this.gain)this.gain.gain.setTargetAtTime(this.volume*.035,this.ctx.currentTime,.07);}
  stopTone(){
    if(this.gain&&this.ctx){this.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.06);}
    if(this.ambience){const previous=this.ambience;this.ambience=null;setTimeout(()=>{try{previous.stop();}catch{}previous.disconnect();},350);}
    this.gain=null;
  }
  setMood(mood){
    if(!this.enabled||!this.ctx)return;
    this.stopTone();if(mood==='silence')return;
    const base={drone:55,wind:82,pulse:73,warm:110}[mood]??55;
    const oscill=this.ctx.createOscillator(),gain=this.ctx.createGain();
    oscill.type=mood==='warm'?'sine':'triangle';oscill.frequency.value=base;
    gain.gain.value=0;oscill.connect(gain);gain.connect(this.ctx.destination);
    oscill.start();gain.gain.setTargetAtTime(this.volume*.035,this.ctx.currentTime,.9);
    this.ambience=oscill;this.gain=gain;
  }
  cue(type='select'){
    if(!this.enabled||!this.ctx)return;
    try{
      const oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain();
      const t=this.ctx.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(type==='discover'?660:type==='back'?240:430,t);
      oscillator.frequency.exponentialRampToValueAtTime(type==='discover'?850:type==='back'?180:580,t+.15);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(this.volume*.06+.0001,t+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,t+.23);
      oscillator.connect(gain);gain.connect(this.ctx.destination);oscillator.start(t);oscillator.stop(t+.26);
    }catch{}
  }
  destroy(){this.enabled=false;this.stopTone();if(this.ctx){this.ctx.close().catch(()=>{});this.ctx=null;}}
}
