const POSITIONS=[
  [9.17,9.17],[50,9.17],[90.83,9.17],[23.33,23.33],[50,23.33],[76.67,23.33],
  [37.5,37.5],[50,37.5],[62.5,37.5],[9.17,50],[23.33,50],[37.5,50],
  [62.5,50],[76.67,50],[90.83,50],[37.5,62.5],[50,62.5],[62.5,62.5],
  [23.33,76.67],[50,76.67],[76.67,76.67],[9.17,90.83],[50,90.83],[90.83,90.83]
];
const ADJ=[[1,9],[0,2,4],[1,14],[4,10],[1,3,5,7],[4,13],[7,11],[4,6,8],[7,12],[0,10,21],[3,9,11,18],[6,10,15],[8,13,17],[5,12,14,20],[2,13,23],[11,16],[15,17,19],[12,16],[10,19],[16,18,20,22],[13,19],[9,22],[19,21,23],[14,22]];
const MILLS=[[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
const names=['象牙白','曜石黑'];
let state;
const boardEl=document.querySelector('#board');

function fresh(){return{board:Array(24).fill(null),hand:[9,9],turn:0,selected:null,removing:false,winner:null,last:null,history:[]}}
function save(){state.history.push({board:[...state.board],hand:[...state.hand],turn:state.turn,selected:state.selected,removing:state.removing,last:state.last})}
function init(){state=fresh();render()}
function inMill(i,p,board=state.board){return MILLS.some(m=>m.includes(i)&&m.every(x=>board[x]===p))}
function madeMill(i,p,before){return inMill(i,p)&&!MILLS.some(m=>m.includes(i)&&m.every(x=>state.board[x]===p)&&m.every(x=>before[x]===p))}
function pieces(p){return state.board.reduce((a,x,i)=>(x===p&&a.push(i),a),[])}
function legalTargets(from,p){const empty=state.board.map((x,i)=>x===null?i:null).filter(x=>x!==null);return pieces(p).length===3?empty:ADJ[from].filter(i=>state.board[i]===null)}
function removable(p){const all=pieces(p);const outside=all.filter(i=>!inMill(i,p));return outside.length?outside:all}
function canMove(p){return pieces(p).some(i=>legalTargets(i,p).length)}
function phase(){return state.hand[0]+state.hand[1]>0?'布子阶段':pieces(state.turn).length===3?'飞行阶段':'走子阶段'}

function clickPoint(i){
  if(state.winner!==null)return;
  if(state.removing){if(removable(1-state.turn).includes(i)){save();state.board[i]=null;state.removing=false;state.turn=1-state.turn;state.selected=null;state.last=null;checkWin();render()}return}
  if(state.hand[state.turn]>0){
    if(state.board[i]!==null)return;save();const before=[...state.board];state.board[i]=state.turn;state.hand[state.turn]--;state.last=i;
    if(madeMill(i,state.turn,before))state.removing=true;else state.turn=1-state.turn;render();return;
  }
  if(state.selected===null){if(state.board[i]===state.turn){state.selected=i;render()}return}
  if(state.board[i]===state.turn){state.selected=i;render();return}
  if(!legalTargets(state.selected,state.turn).includes(i))return;
  save();const before=[...state.board];state.board[i]=state.turn;state.board[state.selected]=null;state.selected=null;state.last=i;
  if(madeMill(i,state.turn,before))state.removing=true;else{state.turn=1-state.turn;checkWin()}render();
}
function checkWin(){if(state.hand[0]+state.hand[1]>0)return;const loser=state.turn;if(pieces(loser).length<3)win(1-loser,'对手只剩下两枚棋子');else if(!canMove(loser))win(1-loser,'对手已无路可走')}
function win(p,reason){state.winner=p;render();document.querySelector('#winnerTitle').textContent=`${names[p]}获胜`;document.querySelector('#winnerReason').textContent=reason;document.querySelector('#winnerPiece').className='winner-piece '+(p?'black':'');document.querySelector('#winDialog').showModal()}
function render(){
  boardEl.querySelectorAll('.point').forEach(x=>x.remove());const targets=state.selected===null?[]:legalTargets(state.selected,state.turn);const removes=state.removing?removable(1-state.turn):[];
  POSITIONS.forEach(([x,y],i)=>{const b=document.createElement('button');b.className='point';b.style.left=x+'%';b.style.top=y+'%';b.setAttribute('aria-label',`交点 ${i+1}`);if(targets.includes(i)||(state.hand[state.turn]>0&&state.board[i]===null&&!state.removing))b.classList.add('valid');if(i===state.selected)b.classList.add('selected');if(i===state.last)b.classList.add('last-move');if(removes.includes(i))b.classList.add('removable');if(state.board[i]!==null){const p=document.createElement('span');p.className='piece '+(state.board[i]?'black':'white');b.appendChild(p)}b.onclick=()=>clickPoint(i);boardEl.appendChild(b)});
  const counts=[pieces(0).length,pieces(1).length];
  document.querySelector('#whiteBoard').textContent=counts[0];document.querySelector('#blackBoard').textContent=counts[1];document.querySelector('#whiteHand').textContent=state.hand[0];document.querySelector('#blackHand').textContent=state.hand[1];
  document.querySelector('#phaseLabel').textContent=phase();document.querySelector('#playerCard0').classList.toggle('active',state.turn===0);document.querySelector('#playerCard1').classList.toggle('active',state.turn===1);
  let msg=state.removing?`${names[state.turn]}已连成磨坊，请移除一枚对方棋子`:state.hand[state.turn]>0?`${names[state.turn]}回合，请选择一个交点落子`:state.selected!==null?`已选中棋子，请选择${counts[state.turn]===3?'任意空位':'相邻空位'}`:`${names[state.turn]}回合，请选择一枚棋子`;
  document.querySelector('#statusText').textContent=msg;document.querySelector('#undoButton').disabled=!state.history.length;
  [['#whiteCaptured',9-state.hand[1]-counts[1]],['#blackCaptured',9-state.hand[0]-counts[0]]].forEach(([sel,n])=>document.querySelector(sel).innerHTML='<i></i>'.repeat(Math.max(0,n)));
}
document.querySelector('#undoButton').onclick=()=>{if(!state.history.length)return;const h=state.history.pop();const history=state.history;state={...h,winner:null,history};render()};
document.querySelector('#restartButton').onclick=init;document.querySelector('#playAgain').onclick=()=>{document.querySelector('#winDialog').close();init()};
const rules=document.querySelector('#rulesDialog');document.querySelector('#rulesButton').onclick=()=>rules.showModal();document.querySelector('#closeRules').onclick=()=>rules.close();document.querySelector('#gotIt').onclick=()=>rules.close();
init();

// --- 对战模式、人机玩家与 WebRTC 在线同步 ---
let gameMode='local',humanPlayer=0,aiLevel='medium',aiBusy=false,aiTimer=null;
let onlineSession=null,onlinePlayer=null;
const rawClickPoint=clickPoint,rawInit=init,rawRender=render;

function locked(){
  if(gameMode==='ai')return state.turn!==humanPlayer;
  if(gameMode==='online')return onlinePlayer===null||state.turn!==onlinePlayer||!onlineSession;
  return false;
}
clickPoint=function(i){
  if(locked()&&!aiBusy)return;
  const before=JSON.stringify([state.board,state.hand,state.turn,state.selected,state.removing]);
  rawClickPoint(i);
  const changed=before!==JSON.stringify([state.board,state.hand,state.turn,state.selected,state.removing]);
  if(changed&&gameMode==='online')sendGame();
  if(changed){render();queueAI()}
};
render=function(){
  rawRender();
  const waiting=locked()&&!state.winner;
  if(waiting)document.querySelector('#statusText').textContent=gameMode==='ai'?'电脑正在思考…':onlinePlayer===null?'等待建立在线连接…':'等待对手行动…';
  document.querySelector('#undoButton').disabled=!state.history.length||gameMode==='online'||(gameMode==='ai'&&state.turn!==humanPlayer);
};
init=function(){rawInit();if(gameMode==='online')sendGame();queueAI()};

let aiWorker=null,aiRequest=0;
function queueAI(){
  clearTimeout(aiTimer);if(gameMode!=='ai'||state.winner!==null||state.turn===humanPlayer)return;
  aiTimer=setTimeout(aiMove,250);
}
function aiMove(){
  if(gameMode!=='ai'||state.turn===humanPlayer||state.winner!==null)return;aiBusy=true;render();
  if(!aiWorker){aiWorker=new Worker('ai-worker.js');aiWorker.onmessage=e=>{const {id,move}=e.data;if(id!==aiRequest)return;if(!move||gameMode!=='ai'||state.turn===humanPlayer){aiBusy=false;render();return}if(move.from!==null)rawClickPoint(move.from);rawClickPoint(move.to);if(move.remove!==null&&state.removing)rawClickPoint(move.remove);aiBusy=false;render();queueAI()};aiWorker.onerror=()=>{aiBusy=false;document.querySelector('#statusText').textContent='AI 引擎加载失败，请刷新页面重试'}}
  aiWorker.postMessage({id:++aiRequest,state:{board:[...state.board],hand:[...state.hand],turn:state.turn},level:aiLevel});
}

const modeDialog=document.querySelector('#modeDialog'),onlineDialog=document.querySelector('#onlineDialog');
document.querySelector('#modeButton').onclick=()=>modeDialog.showModal();
document.querySelector('[data-close="modeDialog"]').onclick=()=>modeDialog.close();
document.querySelectorAll('.mode-option').forEach(btn=>btn.onclick=()=>{
  const mode=btn.dataset.mode;
  if(mode==='local'){leaveOnline();gameMode='local';document.querySelector('#modeName').textContent='本地双人';modeDialog.close();init()}
  if(mode==='ai')document.querySelector('#aiSettings').hidden=false;
  if(mode==='online'){modeDialog.close();resetOnlineUI();onlineDialog.showModal()}
});
document.querySelector('#startAI').onclick=()=>{leaveOnline();gameMode='ai';humanPlayer=Number(document.querySelector('#humanColor').value);aiLevel=document.querySelector('#aiLevel').value;document.querySelector('#modeName').textContent='人机对战';modeDialog.close();init()};

// Firebase 房间码在线模式
function resetOnlineUI(){
  document.querySelector('#onlineStart').hidden=false;document.querySelector('#onlineFlow').hidden=true;
  document.querySelector('#roomCodeCard').hidden=true;document.querySelector('#roomCodeInputWrap').hidden=true;document.querySelector('#connectCode').hidden=true;
}
function leaveOnline(){if(onlineSession)onlineSession.close();onlineSession=null;onlinePlayer=null}
function sendGame(){if(onlineSession)onlineSession.send({board:state.board,hand:state.hand,turn:state.turn,selected:state.selected,removing:state.removing,winner:state.winner,last:state.last})}
function showShortFlow(status){document.querySelector('#onlineStart').hidden=true;document.querySelector('#onlineFlow').hidden=false;document.querySelector('#connectionStatus').textContent=status}
function firebaseOnline(){return new Promise((resolve,reject)=>{if(window.FirebaseOnline)return resolve(window.FirebaseOnline);const timer=setTimeout(()=>reject(Object.assign(new Error('CONFIG_MISSING'),{code:'CONFIG_MISSING'})),8000);window.addEventListener('firebase-online-ready',()=>{clearTimeout(timer);resolve(window.FirebaseOnline)},{once:true})})}
function onlineError(error){const messages={CONFIG_MISSING:'Firebase 尚未配置，请先填写 firebase-config.js。',ROOM_EXISTS:'房间码冲突，请重新创建。',ROOM_NOT_FOUND:'找不到该房间，请核对房间码。',ROOM_FULL:'房间已经有两位玩家。','auth/operation-not-allowed':'请在 Firebase 控制台启用匿名登录。','PERMISSION_DENIED':'数据库拒绝访问，请检查 Firebase 安全规则。'};document.querySelector('#connectionStatus').textContent=messages[error.code]||messages[error.message]||`连接失败：${error.message}`}
function receiveOnline(remote){state={...remote,history:[]};render();if(state.winner!==null&&!document.querySelector('#winDialog').open)win(state.winner,'在线对局已结束')}
document.querySelector('#createRoom').onclick=async()=>{
  leaveOnline();onlinePlayer=0;const code=String(Math.floor(100000+Math.random()*900000));showShortFlow('正在创建云端房间…');document.querySelector('#roomCodeCard').hidden=false;document.querySelector('#roomCodeInputWrap').hidden=true;document.querySelector('#connectCode').hidden=true;
  try{const api=await firebaseOnline();onlineSession=await api.create(code,fresh(),receiveOnline,()=>{gameMode='online';document.querySelector('#modeName').textContent='远程在线';document.querySelector('#connectionStatus').textContent='好友已加入，对局开始！';setTimeout(()=>onlineDialog.close(),600);state=fresh();render();sendGame()});document.querySelector('#roomCodeValue').textContent=code;document.querySelector('#connectionStatus').textContent='房间已创建，等待好友加入…'}catch(e){onlineSession=null;onlineError(e)}
};
document.querySelector('#joinRoom').onclick=()=>{showShortFlow('请输入创建者提供的 6 位房间码。');document.querySelector('#roomCodeCard').hidden=true;document.querySelector('#roomCodeInputWrap').hidden=false;document.querySelector('#connectCode').hidden=false;document.querySelector('#roomCodeInput').value='';setTimeout(()=>document.querySelector('#roomCodeInput').focus(),100)};
document.querySelector('#roomCodeInput').oninput=e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,6);
document.querySelector('#connectCode').onclick=async()=>{
  const code=document.querySelector('#roomCodeInput').value;if(code.length!==6){document.querySelector('#connectionStatus').textContent='请输入完整的 6 位房间码。';return}
  leaveOnline();onlinePlayer=1;document.querySelector('#connectionStatus').textContent='正在加入云端房间…';
  try{const api=await firebaseOnline();onlineSession=await api.join(code,receiveOnline);gameMode='online';document.querySelector('#modeName').textContent='远程在线';document.querySelector('#connectionStatus').textContent='连接成功，对局开始！';setTimeout(()=>onlineDialog.close(),600);render()}catch(e){onlineSession=null;onlineError(e)}
};
document.querySelector('#closeOnline').onclick=()=>onlineDialog.close();
