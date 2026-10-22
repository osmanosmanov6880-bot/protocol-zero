import {createState,restoreState,getScene,advance,back,jump,discover,exportGenome,tr,catalog,DEFAULT_GENOME} from '../story/engine.mjs';
import {geneCopy} from '../story/scenes.mjs';
import {SITE} from '../story/site-config.mjs';
import {Soundscape} from './audio.mjs';
import {ParticleField} from './particles.mjs';
import {RealityBridge} from './reality.mjs';

const mode = new URLSearchParams(window.location.search).get('mode')==='prototype' ? 'prototype':'full';
const STORE = `protocol-zero-cinema-1-${mode}`;
const PREFS = 'protocol-zero-cinema-prefs-1';
const qs=id=>document.getElementById(id);
const app=qs('app'),art=qs('art'),mobile=qs('mobile-art'),visual=qs('screen-visual'),sceneOverlay=qs('scene-overlay');
const audio=new Soundscape(),particles=new ParticleField(qs('dust'));
const reality=new RealityBridge({language:()=>prefs.lang,notify:toast});
const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)');
let state=restoreState(read(STORE),mode),frameToken=0,toastTimer=0,retryFn=null;
let prefs={lang:'ru',quality:'auto',motion:false,contrast:false,subtitles:true,volume:35};
try{prefs={...prefs,...JSON.parse(read(PREFS)||'{}')};}catch{}
const locale={
 ru:{series:'НАСЛЕДНИКИ СИГНАЛА · ИНТЕРАКТИВНОЕ КИНО',screen:'ЭКРАН',sound:'ЗВУК',subtitles:'ТИТРЫ',settings:'РЕЖИМ',archive:'АРХИВ',back:'НАЗАД',skip:'ПРОПУСТИТЬ ВСТУПЛЕНИЕ',
  trace:'ВАШ СЛЕД',none:'Пока не определён',fiction:'ХУДОЖЕСТВЕННЫЙ ВЫМЫСЕЛ · ЛОКАЛЬНАЯ СИМУЛЯЦИЯ',footer:'ЭКСПЕРИМЕНТ 07 / ОДНА МУТАЦИЯ',continue:'ПРОДОЛЖИТЬ',restart:'Начать заново',restartAsk:'Начать заново? Прогресс и открытые фрагменты будут очищены.',
  archiveHead:'Архив сцен',archiveIntro:'Повторно открыть можно только уже посещённые сцены. Неоткрытые не раскрывают сюжет.',fragments:'фрагментов найдено',locked:'НЕ ОТКРЫТО',settingsHead:'Режим просмотра',lang:'Язык',quality:'Качество изображения и движения',motion:'Уменьшить движение камеры',contrast:'Повышенная контрастность',volume:'Громкость звука',apply:'Применить',privacy:'Прогресс остаётся только в браузере. Звук запускается исключительно по вашему выбору.',
  noteDone:'Вернуться к истории',errorAsset:'Кадр не загрузился. Текст и выборы остаются доступными.',retry:'Повторить',found:'Найден фрагмент архива',recorded:'Ваше действие изменило состояние истории.',
  geneLabel:'ВЫБРАННЫЙ ГЕН',inherit:'Сохраняются шесть остальных компонентов. Факты о продукте не меняются.',route:'ВЫБРАННЫЙ ПУТЬ',worlds:'Сначала увидеть семь систем',archiveRoute:'Сначала изучить архив',creator:'Путь создателя',observer:'Путь наблюдателя',
  parent:'ПРЕДОК',child:'ПОТОМОК',changed:'ИЗМЕНЁН ТОЛЬКО',endCopy:'Скопировать геном',endDownload:'Скачать бриф JSON',endProduct:'Открыть реальную платформу ↗',endRestart:'Перезапустить фильм',endReview:'Открыть архив',copied:'Бриф скопирован в буфер обмена',copyFail:'Не удалось скопировать. Используйте «Скачать бриф».',external:'Внешняя платформа открывается отдельно и должна быть запущена.',
  mutationHead:'Создать единственную мутацию',mutationSub:'Меняйте только форму сообщения. Продуктовые факты и аудитория заблокированы.',old:'ИСХОДНАЯ ВЕРСИЯ',new:'ВАША ВЕРСИЯ',useIdea:'Вариант Эдды',mutationSave:'Применить мутацию',cancel:'Отмена',errorMutation:'От 3 до 140 символов. Недопустимы HTML и управляющие символы.',claimWarning:'Удалите неподтверждённые численные обещания или гарантии.',noChange:'Новая формулировка должна отличаться от исходной.',review:'Сцена пройдена. Выберите действие для продолжения.',
  prototypeFinished:'ПРОТОТИП: ДЕЙСТВИЕ ИЗМЕНИЛО ФИНАЛ',qualityAuto:'Автоматически',qualityCinema:'CINEMATIC · Полный',qualityBalanced:'BALANCED · Умеренный',qualityLite:'LITE · Экономный'},
 en:{series:'HEIRS OF THE SIGNAL · INTERACTIVE CINEMA',screen:'SCREEN',sound:'SOUND',subtitles:'CAPTIONS',settings:'DISPLAY',archive:'ARCHIVE',back:'BACK',skip:'SKIP INTRO',trace:'YOUR TRACE',none:'Not yet defined',fiction:'FICTION · LOCAL SIMULATION',footer:'EXPERIMENT 07 / ONE MUTATION',continue:'CONTINUE',restart:'Restart',restartAsk:'Restart? Your progress and discoveries will be cleared.',archiveHead:'Scene archive',archiveIntro:'Only visited scenes are available. Locked scenes reveal no spoilers.',fragments:'fragments discovered',locked:'LOCKED',settingsHead:'Viewing mode',lang:'Language',quality:'Image and motion quality',motion:'Reduce camera motion',contrast:'High contrast',volume:'Audio volume',apply:'Apply',privacy:'Progress is stored in this browser only. Sound requires your explicit action.',noteDone:'Back to story',errorAsset:'Frame failed to load. Story text and choices remain available.',retry:'Retry',found:'Archive fragment discovered',recorded:'Your action changed this story.',geneLabel:'CHANGED GENE',inherit:'Six other components remain unchanged. No product facts were edited.',route:'YOUR ROUTE',worlds:'Explored seven systems first',archiveRoute:'Investigated the archive first',creator:'Creator route',observer:'Observer route',parent:'PARENT',child:'DESCENDANT',changed:'ONLY FIELD CHANGED',endCopy:'Copy genome',endDownload:'Download JSON brief',endProduct:'Open actual platform ↗',endRestart:'Restart story',endReview:'Open archive',copied:'Brief copied',copyFail:'Copy failed. Download the JSON brief instead.',external:'The external platform runs separately and must be available.',mutationHead:'Make your one mutation',mutationSub:'Change expression, not product facts or the target audience.',old:'ORIGINAL',new:'YOUR VERSION',useIdea:'Edda’s suggestion',mutationSave:'Confirm mutation',cancel:'Cancel',errorMutation:'3–140 characters; no markup or control characters.',claimWarning:'Remove unsupported numerical promises or guarantees.',noChange:'New version must differ from the original.',review:'Scene completed. Choose what happens next.',prototypeFinished:'PROTOTYPE: YOUR CHOICE CHANGED THE ENDING',qualityAuto:'Automatic',qualityCinema:'CINEMATIC · Full',qualityBalanced:'BALANCED · Moderate',qualityLite:'LITE · Efficient'},
 zh:{series:'信号的继承者 · 互动电影',screen:'全屏',sound:'声音',subtitles:'字幕',settings:'模式',archive:'档案',back:'返回',skip:'跳过序章',trace:'你的痕迹',none:'尚未确定',fiction:'虚构故事 · 本地模拟',footer:'实验 07 / 一次修改',continue:'继续',restart:'重新开始',restartAsk:'重新开始？进度和发现的线索将被清除。',archiveHead:'场景档案',archiveIntro:'只能重新进入已经访问的场景。未解锁的场景不会剧透。',fragments:'已发现的片段',locked:'未解锁',settingsHead:'观看模式',lang:'语言',quality:'画质和动态效果',motion:'减少镜头运动',contrast:'高对比度',volume:'音量',apply:'应用',privacy:'进度仅保存在本机浏览器中。声音需要你主动开启。',noteDone:'返回故事',errorAsset:'画面加载失败。文字和选择仍可使用。',retry:'重试',found:'发现档案片段',recorded:'你的选择改变了故事。',geneLabel:'修改的基因',inherit:'其余六项保持不变，产品事实没有更改。',route:'选择的路线',worlds:'先查看七个系统',archiveRoute:'先调查档案',creator:'创造者路线',observer:'观察者路线',parent:'原始版本',child:'后代版本',changed:'唯一改变的部分',endCopy:'复制基因组',endDownload:'下载 JSON 简报',endProduct:'打开实际平台 ↗',endRestart:'重新开始',endReview:'打开档案',copied:'已复制简报',copyFail:'复制失败，请下载 JSON 文件。',external:'外部平台需要另行运行。',mutationHead:'进行唯一一次修改',mutationSub:'只改变表达方式，不得修改产品事实或受众。',old:'原始内容',new:'你的版本',useIdea:'艾达的建议',mutationSave:'确认修改',cancel:'取消',errorMutation:'请输入 3–140 个字符，不能包含 HTML。',claimWarning:'请删除未经证实的数字承诺或保证。',noChange:'新版本必须与原版不同。',review:'场景已完成，请选择下一步。',prototypeFinished:'原型：你的选择改变了结局',qualityAuto:'自动',qualityCinema:'电影 · 完整',qualityBalanced:'均衡 · 适度',qualityLite:'轻量 · 省电'}
};
const t=key=>locale[prefs.lang]?.[key]??locale.ru[key]??key;
function read(key){try{return localStorage.getItem(key);}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
function remove(key){try{localStorage.removeItem(key);}catch{}}
function persist(){write(STORE,JSON.stringify(state));}
function toast(message){const node=qs('toast');node.textContent=message;node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.hidden=true;},3800);}
function text(id,value){qs(id).textContent=value;}
function button(label,className,action){const el=document.createElement('button');el.type='button';el.className=className;el.textContent=label;el.addEventListener('click',action);return el;}
function effectiveQuality(){if(prefs.motion||prefersReduced.matches)return 'lite';if(prefs.quality!=='auto')return ['cinematic','balanced','lite'].includes(prefs.quality)?prefs.quality:'balanced';
 const cores=navigator.hardwareConcurrency??4,mobile=window.innerWidth<700;
 return mobile||cores<4?'lite':cores<8?'balanced':'cinematic';}
function syncQuality(){const q=effectiveQuality();app.classList.remove('quality-cinematic','quality-balanced','quality-lite');app.classList.add(`quality-${q}`);
 app.classList.toggle('motion-reduced',Boolean(prefs.motion)||prefersReduced.matches);app.classList.toggle('contrast-high',Boolean(prefs.contrast));particles.setQuality(q);}
function syncLanguage(){document.documentElement.lang=prefs.lang;const mapping={
  'series-label':'series',fullscreenText:'screen',soundText:'sound',subtitleText:'subtitles',settingsText:'settings',archiveText:'archive',backText:'back',skipText:'skip',telemTitle:'trace',footerLeft:'footer','fiction-disclosure':'fiction',settingsHeading:'settingsHead',langLabel:'lang',qualityLabel:'quality',motionLabel:'motion',contrastLabel:'contrast',volumeLabel:'volume',restartBtn:'restart',saveSettingsBtn:'apply',privacyNote:'privacy',archiveHeading:'archiveHead',archiveIntro:'archiveIntro',resetFromArchive:'restart',confirmNote:'noteDone',retryAsset:'retry',loadText:'errorAsset'};
 for(const [id,key] of Object.entries(mapping))text(id,t(key));
 for(const [value,key] of Object.entries({auto:'qualityAuto',cinematic:'qualityCinema',balanced:'qualityBalanced',lite:'qualityLite'})){const o=qs('qualitySelect').querySelector(`[value="${value}"]`);if(o)o.textContent=t(key);}
 qs('soundBtn').setAttribute('aria-label',prefs.lang==='ru'?'Включить или выключить звук':prefs.lang==='en'?'Toggle sound':'打开或关闭声音');
 qs('settingsBtn').setAttribute('aria-label',t('settings'));qs('archiveBtn').setAttribute('aria-label',t('archive'));qs('subtitlesBtn').setAttribute('aria-label',t('subtitles'));
}
function imageUrl(scene,device){return `assets/keyframes/${scene.image}-${device}.webp`;}
const descriptions={city_dawn:{ru:'Панорама города будущего, высотные здания и гигантское кольцо в утреннем тумане',en:'Future skyline, immense ring and mist at dawn',zh:'晨雾中未来城市的高塔与巨大圆环'},gateway:{ru:'Гигантский светящийся портал над городом',en:'Monumental illuminated gateway above the city',zh:'城市上空的巨大发光传送门'},archive:{ru:'Бесконечный архив со стеллажами и светящейся сферой',en:'An endless archive with shelves and luminous sphere',zh:'拥有巨大书架和发光球体的无尽档案馆'},vault:{ru:'Тёмный зал хранилища и голографическая планета',en:'Dark vault with a holographic planet',zh:'黑暗库房里的全息行星'},memory:{ru:'Тёмный зал с голографической памятью',en:'Dark memory hall and holograms',zh:'黑暗记忆大厅与全息影像'},edda:{ru:'Крупный план лица хранительницы Эдды в холодном свете',en:'Close-up of curator Edda in cold side light',zh:'冷光中的档案管理员艾达特写'},genome:{ru:'Лаборатория и сияющая спираль рекламного генома',en:'Laboratory and a luminous genome helix',zh:'实验室里发光的基因螺旋'},lab:{ru:'Экран рекламной лаборатории с голограммой',en:'Advertising laboratory with a hologram',zh:'带有全息图的广告实验室'},outcome:{ru:'Рассвет над мегаполисом, наблюдатель у панорамного окна',en:'Sunrise over a megacity, observer near a panoramic window',zh:'日出时的大都市与窗前的观察者'}};
let pendingLoads=new Set();
function showArt(scene){const targetDesktop=imageUrl(scene,'desktop'),targetMobile=imageUrl(scene,'mobile');const currentDesktop=art.getAttribute('src');
 frameToken++;const token=frameToken;
 qs('loadStatus').hidden=true;
 if(currentDesktop!==targetDesktop&&!prefs.motion&&!prefersReduced.matches){
  const ghost=document.createElement('img');ghost.alt='';ghost.className='frame-ghost';ghost.src=art.currentSrc||art.src;
  qs('screen-scene').append(ghost);ghost.addEventListener('animationend',()=>ghost.remove(),{once:true});setTimeout(()=>ghost.remove(),950);
 }
 art.alt=tr(descriptions[scene.image],prefs.lang);
 mobile.srcset=targetMobile;art.src=targetDesktop;
 art.onerror=()=>{if(token!==frameToken)return;qs('loadStatus').hidden=false;retryFn=()=>{art.src=targetDesktop+`?retry=${Date.now()}`;mobile.srcset=targetMobile+`?retry=${Date.now()}`;};};
 art.onload=()=>{if(token===frameToken)qs('loadStatus').hidden=true;};
 app.dataset.camera=scene.camera;sceneOverlay.className=`scene-overlay overlay-${scene.overlay||'none'}`;
 prefetch(scene);
}
function prefetch(scene){const device=window.innerWidth<=700?'mobile':'desktop';for(const next of scene.choices.slice(0,2)){
 const s=getScene(mode,next.next);if(!s)continue;
 const url=imageUrl(s,device);if(pendingLoads.has(url))continue;
 pendingLoads.add(url);const image=new Image();image.decoding='async';image.src=url;
 }}
function renderChoice(option,number){const b=button('', 'choice',()=>selectChoice(option));
 const num=document.createElement('span');num.className='choice-num';num.textContent=String(number).padStart(2,'0');
 const title=document.createElement('span');title.className='choice-main';title.textContent=tr(option.label,prefs.lang);
 const arrow=document.createElement('span');arrow.className='choice-icon';arrow.textContent='↗';arrow.setAttribute('aria-hidden','true');b.append(num,title,arrow);return b;
}
function selectChoice(choice){
 if(choice.effect?.gene){openMutation(choice);return;}
 try{const next=advance(state,choice.id,null,prefs.lang);state=next;persist();audio.cue();render();}catch(err){toast(err.message);}
}
function showHotspots(scene){const host=qs('hotspots');host.replaceChildren();for(const h of scene.hotspots||[]){
 const b=button('✧','hotspot',()=>{
  try{state=discover(state,h.id);persist();audio.cue('discover');showNote(tr(h.label,prefs.lang),tr(h.note,prefs.lang));renderTelemetry();}catch{toast(t('errorAsset'));}
 });b.style.left=`${h.x}%`;b.style.top=`${h.y}%`;b.setAttribute('aria-label',`${t('found')}: ${tr(h.label,prefs.lang)}`);
 const title=document.createElement('span');title.className='hotspot-name';title.textContent=tr(h.label,prefs.lang);b.append(title);host.append(b);
 }}
function showNote(head,body){text('noteHeading',head);text('noteBody',body);qs('noteDialog').showModal();}
function renderTelemetry(){
 const changed=state.mutation?.gene;
 text('telem-value', changed|| (state.route ? (state.route==='worlds'?t('worlds'):state.route==='archive'?t('archiveRoute'):state.route==='creator'?t('creator'):t('observer')) :'—'));
 text('telem-subtext',changed?t('inherit'):state.route?t('recorded'):t('none'));
 text('fragmentCount',`${state.found.length} ${t('fragments')}`);
}
function showStoryEffect(scene){const target=qs('story-effect');target.replaceChildren();target.hidden=true;
 if(scene.id==='echo'||scene.id==='conflict'||scene.id==='open'||scene.id==='seal'){
  const details=state.mutation;
  if(details){
   const top=document.createElement('div');top.className='mutation-tag';top.textContent=`${t('changed')}: ${details.gene}`;
   const before=document.createElement('p');before.textContent=`${t('parent')}: «${details.from}»`;
   const after=document.createElement('p');after.textContent=`${t('child')}: «${details.to}»`;
   target.append(top,before,after);target.hidden=false;
  }
 }
 if(scene.id==='proto_final'){
  const note=document.createElement('div');note.textContent=`${t('prototypeFinished')} · ${state.route==='creator'?t('creator'):t('observer')}`;target.append(note);target.hidden=false;
 }
}
function renderEnding(scene){const area=qs('ending-actions');area.replaceChildren();area.hidden=!['open','seal','proto_final'].includes(scene.id);if(area.hidden)return;
 const realityButton=reality.endButton(state);if(realityButton)area.append(realityButton);
 area.append(button(t('endCopy'),'end-primary',copyBrief),button(t('endDownload'),'end-secondary',downloadBrief));
 const productTarget=/^\/cinema(?:\/|$)/.test(location.pathname)?'/':SITE.productUrl;
 const available=productTarget&&(/^(https?:\/\/|\/$)/.test(productTarget));
 if(available)area.append(button(t('endProduct'),'end-secondary',()=>{
  toast(t('external'));window.open(productTarget,'_blank','noopener,noreferrer');
 }));
 area.append(button(t('endRestart'),'end-secondary',restart),button(t('endReview'),'end-secondary',()=>openArchive()));
}
function asBriefText(){const brief=exportGenome(state);return `${brief.title}\n${Object.entries(brief.genome).map(([k,v])=>`${k}: ${v}`).join('\n')}\n\n${brief.disclaimer}`;}
async function copyBrief(){try{await navigator.clipboard.writeText(asBriefText());toast(t('copied'));}catch{toast(t('copyFail'));}}
function downloadBrief(){const str=JSON.stringify(exportGenome(state),null,2);const blob=new Blob([str],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=`protocol-zero-${state.mutation?.gene?.toLowerCase()||'story'}-brief.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function render(){
 const scene=getScene(mode,state.current);if(!scene){state=createState(mode);persist();return render();}
 syncLanguage();showArt(scene);audio.setMood(scene.mood);
 text('eyebrow',tr(scene.eyebrow,prefs.lang));text('scene-title',tr(scene.title,prefs.lang));text('scene-subtitle',tr(scene.subtitle,prefs.lang));text('scene-voice',tr(scene.voice,prefs.lang));
 qs('scene-voice').classList.toggle('is-hidden',!prefs.subtitles);
 const list=qs('choices');list.replaceChildren();scene.choices.forEach((choice,i)=>list.append(renderChoice(choice,i+1)));
 renderEnding(scene);showStoryEffect(scene);showHotspots(scene);renderTelemetry();
 const index=catalog(mode).scenes.findIndex(s=>s.id===scene.id)+1,total=catalog(mode).scenes.length;
 text('sequence-number',String(index).padStart(2,'0'));text('timeline-label',`${String(index).padStart(2,'0')} / ${total}`);
 qs('progress-fill').style.width=`${Math.round(state.visited.length/total*100)}%`;
 text('time-tag',mode==='prototype'?'~ 2 MIN':'~ 6 MIN');
 text('signalStatus',scene.choices.length?'SIGNAL ACTIVE':'SIGNAL RECORDED');
 qs('backBtn').disabled=!state.history.length;
 qs('skipBtn').hidden=!(state.current==='signal'||state.current==='balcony'||state.current==='proto_start');
 document.title=`${tr(scene.title,prefs.lang)} — PROTOCOL ZERO`;
 requestAnimationFrame(()=>qs('scene-title').focus({preventScroll:true}));
}
function openArchive(){const host=qs('archiveList');host.replaceChildren();for(const s of catalog(mode).scenes){
 const visited=state.visited.includes(s.id);const b=button('', 'archive-entry',()=>{
  try{state=jump(state,s.id);persist();qs('archiveDialog').close();audio.cue('back');render();}catch(err){toast(err.message);}
 });b.disabled=!visited;
 const n=document.createElement('small');n.textContent=`${String(catalog(mode).scenes.indexOf(s)+1).padStart(2,'0')} · ${visited?'UNLOCKED':t('locked')}`;
 const name=document.createElement('strong');name.textContent=visited?tr(s.title,prefs.lang):t('locked');b.append(n,name);host.append(b);
 }text('fragmentCount',`${state.found.length} ${t('fragments')}`);qs('archiveDialog').showModal();}
function restart(){if(!window.confirm(t('restartAsk')))return;reality.reset();state=createState(mode);persist();for(const d of document.querySelectorAll('dialog'))if(d.open)d.close();audio.cue('back');render();}
function openMutation(choice){
 const gene=choice.effect.gene;qs('mutationDialog').dataset.gene=gene;qs('mutationDialog').dataset.choice=choice.id;
 text('mutationHeading',t('mutationHead'));text('mutationInfo',t('mutationSub'));text('mutationOriginalLabel',`${t('old')} · ${gene}`);text('mutationOriginal',DEFAULT_GENOME[gene]);text('mutationNewLabel',t('new'));
 text('suggestText',t('useIdea'));text('mutationSubmit',t('mutationSave'));text('cancelMutation',t('cancel'));
 qs('mutationInput').value=tr(geneCopy[gene],prefs.lang);text('mutationError','');qs('mutationDialog').showModal();qs('mutationInput').focus();
}
function commitMutation(e){e.preventDefault();const dialog=qs('mutationDialog'),gene=dialog.dataset.gene,chosen=dialog.dataset.choice,value=qs('mutationInput').value.trim();
 if(value===DEFAULT_GENOME[gene]){text('mutationError',t('noChange'));return;}
 if(/(?:\b\d+(?:[,.]\d+)?\s*%|\b\d+\s*(?:час(?:а|ов)?|дн(?:я|ей)?|hours?|days?)\b|гарантир|guarantee|保证)/iu.test(value)){text('mutationError',t('claimWarning'));return;}
 try{state=advance(state,chosen,value,prefs.lang);persist();dialog.close();audio.cue();render();}catch{text('mutationError',t('errorMutation'));}
}
function skipIntro(){let progressed=state;
 try{if(mode==='prototype'&&progressed.current==='proto_start')progressed=advance(progressed,'next');
 else if(mode==='full'){
  if(progressed.current==='signal')progressed=advance(progressed,'enter');
  if(progressed.current==='balcony')progressed=advance(progressed,'go');
 }
 state=progressed;persist();audio.cue();render();
 }catch(err){toast(err.message);}}
function backAction(){if(!state.history.length)return;state=back(state);persist();audio.cue('back');render();}
function hookSettings(){
 const d=qs('settingsDialog');qs('settingsBtn').addEventListener('click',()=>{qs('langSelect').value=prefs.lang;qs('qualitySelect').value=prefs.quality;
  qs('motionToggle').checked=prefs.motion;qs('contrastToggle').checked=prefs.contrast;qs('volumeInput').value=prefs.volume;d.showModal();});
 qs('closeSettings').addEventListener('click',()=>d.close());
 qs('saveSettingsBtn').addEventListener('click',()=>{
  prefs.lang=['ru','en','zh'].includes(qs('langSelect').value)?qs('langSelect').value:'ru';prefs.quality=qs('qualitySelect').value;
  prefs.motion=qs('motionToggle').checked;prefs.contrast=qs('contrastToggle').checked;prefs.volume=Number(qs('volumeInput').value);
  audio.setVolume(prefs.volume);syncQuality();write(PREFS,JSON.stringify(prefs));d.close();render();});
 qs('soundBtn').addEventListener('click',async()=>{await audio.setEnabled(!audio.enabled);audio.setVolume(prefs.volume);audio.setMood(getScene(mode,state.current).mood);syncSound();if(audio.enabled)audio.cue();});
 qs('subtitlesBtn').addEventListener('click',()=>{prefs.subtitles=!prefs.subtitles;write(PREFS,JSON.stringify(prefs));qs('scene-voice').classList.toggle('is-hidden',!prefs.subtitles);qs('subtitlesBtn').setAttribute('aria-pressed',String(prefs.subtitles));});
 qs('fullscreenBtn').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this browser');}});
 qs('archiveBtn').addEventListener('click',openArchive);qs('closeArchive').addEventListener('click',()=>qs('archiveDialog').close());
 qs('resetFromArchive').addEventListener('click',restart);qs('restartBtn').addEventListener('click',restart);
 qs('closeNote').addEventListener('click',()=>qs('noteDialog').close());qs('confirmNote').addEventListener('click',()=>qs('noteDialog').close());
 qs('retryAsset').addEventListener('click',()=>{if(retryFn)retryFn();});qs('backBtn').addEventListener('click',backAction);
 qs('skipBtn').addEventListener('click',skipIntro);qs('cancelMutation').addEventListener('click',()=>qs('mutationDialog').close());
 qs('mutationForm').addEventListener('submit',commitMutation);
 qs('suggestBtn').addEventListener('click',()=>{const gene=qs('mutationDialog').dataset.gene;qs('mutationInput').value=tr(geneCopy[gene],prefs.lang);qs('mutationInput').focus();});
 window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowLeft'||e.key==='Backspace'){e.preventDefault();backAction();}
  if(e.key==='ArrowRight'){const one=getScene(mode,state.current)?.choices?.[0];if(one){e.preventDefault();selectChoice(one);}}
 });
 window.addEventListener('resize',()=>syncQuality(),{passive:true});
 prefersReduced.addEventListener?.('change',syncQuality);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)audio.stopTone();else audio.setMood(getScene(mode,state.current).mood);});
 window.addEventListener('pagehide',()=>{audio.destroy();particles.destroy();});
}
function syncSound(){qs('soundBtn').setAttribute('aria-pressed',String(audio.enabled));}

// Boot, no analytics, external fetches or account requirement.
if(!['ru','en','zh'].includes(prefs.lang))prefs.lang='ru';
qs('mutationDialog')?.addEventListener('click',e=>{if(e.target===qs('mutationDialog'))qs('mutationDialog').close();});
hookSettings();syncSound();qs('subtitlesBtn').setAttribute('aria-pressed',String(prefs.subtitles));syncQuality();render();
window.PROTOCOL_ZERO_DEBUG = Object.freeze({getState:()=>structuredClone(state),getMode:()=>mode});
