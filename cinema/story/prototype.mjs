import { L } from './scenes.mjs';
// Exactly three scene nodes: opening -> choice -> alternative finale from state.route.
export const prototypeScenes = [
 {id:'proto_start', image:'city_dawn',camera:'push',mood:'drone', duration:14, overlay:'ring',
  eyebrow:L('ПРОТОТИП / 01','PROTOTYPE / 01','原型 / 01'),
  title:L('АРХИВ ПРОСНУЛСЯ','THE ARCHIVE AWOKE','档案馆苏醒了'),
  subtitle:L('Семь систем. Один сигнал. Его услышали вы.','Seven systems. One signal. You heard it.','七个系统，一个信号。而你听到了它。'),
  voice:L('Некоторые истории не заканчиваются, когда их автор уходит.','Some stories outlive their authors.','有些故事会比作者存在得更久。'),
  choices:[{id:'next',label:L('Следовать за сигналом','Follow the signal','跟随信号'),next:'proto_choice'}],hotspots:[]},
 {id:'proto_choice', image:'gateway', camera:'still',mood:'pulse', duration:20,overlay:'ring',
  eyebrow:L('ПРОТОТИП / 02','PROTOTYPE / 02','原型 / 02'),
  title:L('КЕМ ВЫ СТАНЕТЕ?','WHO WILL YOU BECOME?','你会成为谁？'),
  subtitle:L('Сделать выбор — значит оставить след. Можно создавать или наблюдать.','Every choice leaves a mark. Create, or observe.','每个选择都会留下痕迹。创造，或观察。'),
  voice:L('Правильного ответа нет. Зато есть последствия.','There is no correct answer, only consequences.','没有正确答案，只有结果。'),
  choices:[
    {id:'creator',label:L('Стать создателем','Become a creator','成为创造者'),next:'proto_final',effect:{route:'creator'}},
    {id:'observer',label:L('Остаться наблюдателем','Remain an observer','保持观察者身份'),next:'proto_final',effect:{route:'observer'}}],hotspots:[]},
 {id:'proto_final',image:'outcome',camera:'pull',mood:'warm',duration:18,overlay:'city',
  eyebrow:L('ПРОТОТИП / 03','PROTOTYPE / 03','原型 / 03'),
  title:L('ВАШ ВЫБОР ЗАПИСАН','YOUR CHOICE WAS RECORDED','你的选择已被记录'),
  subtitle:L('История изменилась из-за вашего решения. Это — работающий прототип движка.','Your decision changed the story. This is a functioning engine prototype.','你的决定改变了故事。这是一个可运行的引擎原型。'),
  voice:L('Теперь вы понимаете правило: действие меняет состояние мира.','You now know the rule: actions change the world state.','现在你了解规则：行动会改变世界的状态。'),
  choices:[],hotspots:[]}
];
export const prototypeById=Object.fromEntries(prototypeScenes.map(s=>[s.id,s]));
export const prototypeStart='proto_start';
