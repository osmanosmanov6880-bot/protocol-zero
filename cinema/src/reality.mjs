/**
 * Cinema -> real campaign publishing. Deliberately separate from the fictional genome.
 * Story choices never transmit data to the server until the viewer confirms this dialog.
 */
const LOCAL_KEY='pz-cinema-reality-1';
const PENDING_KEY='pz-cinema-reality-pending-1';
const WORDS={
  ru:{open:'Сделать реальную мутацию ↗',linked:'Проверить настоящих потомков ↗',heading:'ИЗ ИСТОРИИ — В РЕАЛЬНОСТЬ',lead:'В фильме вы изменили вымышленный геном. Здесь вы можете отдельно изменить один элемент настоящей публичной кампании. Публикация добровольная.',noBackend:'Этот фильм открыт автономно. Чтобы публиковать ветви, откройте его из работающей платформы по адресу /cinema/.',loading:'Получаем открытые кампании…',none:'Пока нет доступных публичных ветвей для выбранного гена. Вы можете завершить фильм без публикации.',select:'Выберите исходную кампанию',label:'ВЫБРАННЫЙ ЭЛЕМЕНТ',before:'ИСХОДНЫЙ ТЕКСТ',after:'НОВЫЙ ТЕКСТ',policy:'Публичная публикация создаёт новую неизменяемую ветвь. Исходный бриф, аудитория и продуктовые факты не изменяются. Имя или email не требуются.',consent:'Понимаю, что мой текст станет публичным, и хочу опубликовать именно эту версию.',submit:'Создать публичного потомка',offline:'Соединение недоступно. Проверьте, работает ли основной сервер.',demo:'Учебная кампания — не реальный рекламодатель',community:'Кампания, предложенная пользователем; эффективность не подтверждена',published:'ПУБЛИЧНАЯ ВЕТВЬ СОЗДАНА',actual:'Это реальная запись в базе, а не часть вымышленного фильма.',visit:'Открыть ветвь',invite:'Передать следующему человеку',refresh:'Обновить последствия',desc:'Потомков после вас',depth:'Глубина поколений',waiting:'Пока никто не продолжил вашу ветвь.',copy:'Скопировать ссылку',copied:'Ссылка скопирована',failure:'Не удалось выполнить действие.',close:'Закрыть',origin:'Исходная история',tone:'Выберите тон',unavailable:'Этот ген заблокирован у предшественника. Выберите другую кампанию.',noneYet:'Нет активной публикации для этого прохождения.',retry:'Повторить загрузку',facts:'Факты кампании (не редактируются)',min:'Для заголовка и CTA требуется 7–110 символов.',return:'Вернитесь в основную платформу, чтобы увидеть всю родословную.',status:'Серверный статус'},
  en:{open:'Publish a real mutation ↗',linked:'Check real descendants ↗',heading:'FROM FICTION INTO REALITY',lead:'In the film you changed a fictional genome. Here you may separately change one component of a real public campaign. Publishing is optional.',noBackend:'This film is offline. To publish, open the film at /cinema/ on the running platform.',loading:'Loading public campaigns…',none:'No eligible public parent is available for this gene. Finish the film without publishing.',select:'Choose a parent campaign',label:'CHOSEN GENE',before:'ORIGINAL COPY',after:'YOUR COPY',policy:'Publishing creates an immutable public branch. Verified facts, audience and brief are unchanged. No name or email required.',consent:'I understand my text becomes public and I want to publish this version.',submit:'Create public descendant',offline:'Cannot reach platform server.',demo:'Fictional teaching campaign',community:'Community campaign; ad performance is unverified',published:'PUBLIC BRANCH CREATED',actual:'This is a real database entry, not the fictional film.',visit:'View branch',invite:'Invite the next person',refresh:'Refresh consequences',desc:'Real descendants',depth:'Generation depth',waiting:'Nobody has continued this branch yet.',copy:'Copy link',copied:'Link copied',failure:'Action failed.',close:'Close',origin:'Story version',tone:'Choose a tone',unavailable:'The previous creator changed this gene. Choose another campaign.',noneYet:'No public mutation for this story.',retry:'Retry',facts:'Campaign facts (read-only)',min:'Headline/CTA must be 7–110 characters.',return:'Open the campaign platform to inspect the full lineage.',status:'Server status'},
  zh:{open:'发布真实修改 ↗',linked:'查看真实后代 ↗',heading:'从故事进入现实',lead:'电影中的基因组是虚构的。你可以选择真实的公开广告，仅修改一个元素。发布完全自愿。',noBackend:'当前电影为离线版。请在运行中的平台打开 /cinema/ 以发布。',loading:'加载公开广告…',none:'没有符合此基因的公开广告。无需发布也可完成电影。',select:'选择源广告',label:'选定基因',before:'原始文本',after:'新文本',policy:'发布将创建不可修改的公开版本。受众及产品事实保持不变。无需姓名或邮箱。',consent:'我理解文字将公开，并确认发布此版本。',submit:'创建公开后代',offline:'无法连接平台服务器。',demo:'虚构教学广告',community:'社区广告，效果未经过验证',published:'公开版本已创建',actual:'这是数据库中的真实记录，不属于虚构电影。',visit:'查看版本',invite:'邀请下一位参与者',refresh:'刷新后代',desc:'真实后代数',depth:'世代深度',waiting:'暂时没有其他人继续此版本。',copy:'复制链接',copied:'已复制',failure:'操作失败',close:'关闭',origin:'故事版本',tone:'选择语气',unavailable:'前一位已修改此项，请选择其他广告。',noneYet:'此次故事尚未公开发布。',retry:'重试',facts:'广告事实（只读）',min:'标题与 CTA 必须为 7–110 个字符。',return:'在主平台查看完整传承。',status:'服务器状态'}
};
const q=id=>document.getElementById(id);
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function btn(label,callback,cls='secondary-button'){const e=node('button',cls,label);e.type='button';e.addEventListener('click',callback);return e;}
function getStored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function setStored(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
function clearStored(key){try{localStorage.removeItem(key);}catch{}}
function identifier(){if(globalThis.crypto?.randomUUID)return crypto.randomUUID();const x=new Uint8Array(24);crypto.getRandomValues(x);return [...x].map(v=>v.toString(16).padStart(2,'0')).join('');}
export const enabledInHost=()=>/^\/cinema(?:\/|$)/.test(location.pathname)&&location.protocol!=='file:';
export class RealityBridge {
  constructor({language,notify}){this.language=language;this.notify=notify;this.host=q('realityBody');this.dialog=q('realityDialog');this.state=null;this.options=[];this.inflight=false;
    q('realityClose').addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('click',e=>{if(e.target===this.dialog)this.dialog.close();});}
  w(key){return (WORDS[this.language()]||WORDS.ru)[key];}
  linked(state){const link=getStored(LOCAL_KEY);return link&&state?.mutation&&link.gene===state.mutation.gene&&link.storyText===state.mutation.to?link:null;}
  reset(){clearStored(LOCAL_KEY);clearStored(PENDING_KEY);}
  endButton(state){if(state.current!=='open')return null;return btn(this.linked(state)?this.w('linked'):this.w('open'),()=>this.open(state),'end-primary');}
  async get(path,options={}){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});let data;
    try{data=await response.json();}catch{throw new Error(this.w('offline'));}
    if(!response.ok)throw new Error(data.error||this.w('failure'));return data;}
  announce(message,error=false){const el=q('realityStatus');el.textContent=message;el.classList.toggle('bridge-error',error);}
  async open(story){this.state=structuredClone(story);if(!this.dialog.open)this.dialog.showModal();this.host.replaceChildren();
    if(!enabledInHost()){this.host.append(node('p','bridge-notice',this.w('noBackend')));return;}
    const linked=this.linked(story);if(linked){await this.showPublished(linked);return;}
    if(!story.mutation){this.host.append(node('p','bridge-notice',this.w('noneYet')));return;}
    this.host.append(node('p','bridge-notice',this.w('loading')));
    try{const data=await this.get('/api/cinema/candidates');this.options=(data.branches||[]).filter(b=>b.changedGene!==story.mutation.gene&&!b.isMine);
      this.renderCandidates();}catch(err){this.host.replaceChildren(node('p','bridge-notice',err.message),btn(this.w('retry'),()=>this.open(this.state)));}}
  renderCandidates(){this.host.replaceChildren();const mutation=this.state.mutation;
    this.host.append(node('p','bridge-lead',this.w('lead')));
    const info=node('p','bridge-gene',`${this.w('label')}: ${mutation.gene}  •  ${this.w('origin')}: «${mutation.to}»`);this.host.append(info);
    if(!this.options.length){this.host.append(node('p','bridge-notice',this.w('none')));return;}
    const form=node('form','bridge-form');form.id='realityForm';
    const label=node('label','control-label',this.w('select'));label.htmlFor='realityParent';form.append(label);
    const chooser=node('select','bridge-select');chooser.id='realityParent';chooser.required=true;
    for(const b of this.options){const o=node('option','',`${b.brand} / ${b.title} · ${b.generation} · ${b.origin==='demo'?'DEMO':'PUBLIC'}`);o.value=b.id;chooser.append(o);}form.append(chooser);
    const source=node('section','bridge-source');source.setAttribute('aria-live','polite');form.append(source);
    const valueLabel=node('label','control-label',this.w('after'));valueLabel.htmlFor='realityValue';form.append(valueLabel);
    let field=null;
    if(mutation.gene==='TONE'){
      field=node('select','bridge-select');const options=['Спокойный','Дерзкий','Ироничный','Тёплый','Деловой'];
      options.forEach(v=>{const o=node('option','',v);o.value=v;field.append(o);});
    }else{
      field=node('textarea','bridge-textarea');field.maxLength=110;field.minLength=7;field.rows=3;field.value=mutation.to.slice(0,110);field.spellcheck=true;
    }
    field.id='realityValue';field.required=true;form.append(field);
    const notice=node('p','bridge-small',this.w('policy'));form.append(notice);
    const checkline=node('label','bridge-consent');const check=node('input');check.type='checkbox';check.required=true;check.id='realityConsent';checkline.append(check,node('span','',this.w('consent')));form.append(checkline);
    const submit=btn(this.w('submit'),()=>{},'primary-button');submit.type='submit';submit.id='realitySubmit';form.append(submit);
    chooser.addEventListener('change',()=>{
      const b=this.options.find(b=>b.id===chooser.value);if(!b)return;
      source.replaceChildren(node('div','bridge-brand',`${b.brand} · ${b.origin==='demo'?this.w('demo'):this.w('community')}`),
        node('div','bridge-current',`${this.w('before')}: «${b[mutation.gene.toLowerCase()]}»`),
        node('p','bridge-small',`${this.w('facts')}: ${b.promise}. ${b.evidence}`));
      if(mutation.gene==='TONE'){
        field.value=['Спокойный','Дерзкий','Ироничный','Тёплый','Деловой'].find(v=>v!==b.tone)||'Деловой';
      }else if(field.value===b[mutation.gene.toLowerCase()]){field.value='';}
    });chooser.dispatchEvent(new Event('change'));
    form.addEventListener('submit',e=>{e.preventDefault();this.publish(chooser.value,field.value,check,submit);});this.host.append(form);
  }
  async publish(parentId,raw,consent,submit){if(this.inflight)return;
    const gene=this.state.mutation?.gene?.toLowerCase();if(!gene)return;
    const value=String(raw).trim();if((gene!=='tone'&&(value.length<7||value.length>110))){this.announce(this.w('min'),true);return;}
    if(!consent.checked){this.announce(this.w('policy'),true);return;}
    const identity={parentId,gene,value};const pending=getStored(PENDING_KEY);let nonce;
    if(pending&&JSON.stringify(pending.identity)===JSON.stringify(identity))nonce=pending.nonce;
    else{nonce=identifier();setStored(PENDING_KEY,{identity,nonce});}
    this.inflight=true;submit.disabled=true;
    try{
      const data=await this.get('/api/cinema/publish',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...identity,nonce,consent:true})});
      const link={branchId:data.branch.id,gene:this.state.mutation.gene,storyText:this.state.mutation.to};
      setStored(LOCAL_KEY,link);clearStored(PENDING_KEY);this.notify?.(this.w('published'));
      await this.showPublished(link);
    }catch(err){this.announce(err.message,true);}finally{this.inflight=false;submit.disabled=false;}
  }
  async showPublished(link){this.host.replaceChildren(node('h3','bridge-success',this.w('published')),node('p','bridge-lead',this.w('actual')));
    const path='/b/'+encodeURIComponent(link.branchId);const url=new URL(path,location.origin).href;
    const actions=node('div','bridge-actions');const visit=node('a','primary-button',this.w('visit'));visit.href=path;visit.target='_blank';visit.rel='noopener';
    actions.append(visit,btn(this.w('copy'),async()=>{try{await navigator.clipboard.writeText(url);this.notify?.(this.w('copied'));}catch{this.announce(url);}}));
    actions.append(btn(this.w('invite'),()=>this.invite(link.branchId)));this.host.append(actions);
    const returnBox=node('section','bridge-consequences');returnBox.id='realityConsequences';this.host.append(returnBox);
    this.host.append(btn(this.w('refresh'),()=>this.refresh(link.branchId)));
    await this.refresh(link.branchId);
  }
  async invite(id){try{
    const data=await this.get(`/api/branches/${encodeURIComponent(id)}/invites`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    const link=new URL(data.path,location.origin).href;const box=node('div','bridge-invitation');box.append(node('p','',this.w('invite')),node('p','bridge-url',link),btn(this.w('copy'),async()=>{try{await navigator.clipboard.writeText(link);this.notify?.(this.w('copied'));}catch{this.announce(link);}}));this.host.append(box);
  }catch(err){this.announce(err.message,true);}}
  async refresh(id){const area=q('realityConsequences');if(!area)return;area.replaceChildren(node('p','bridge-small',this.w('loading')));
    try{const d=await this.get('/api/cinema/consequences/'+encodeURIComponent(id));
      area.replaceChildren(node('p','bridge-num',`${this.w('desc')}: ${d.descendants}`),node('p','bridge-small',`${this.w('depth')}: ${d.maxDepth}`));
      if(!d.descendants)area.append(node('p','bridge-small',this.w('waiting')));
      else{for(const c of d.children.slice(0,6)){
        const row=node('a','bridge-child',`${c.changedGene?.toUpperCase()||'SEED'} • ${c.id} ↗`);row.href='/b/'+encodeURIComponent(c.id);row.target='_blank';row.rel='noopener';area.append(row);
      }}
      area.append(node('p','bridge-small',d.note));
    }catch(err){area.replaceChildren(node('p','bridge-error',err.message));}}
}
