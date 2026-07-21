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
function clone(){return JSON.parse(JSON.stringify(state))}
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
let peer=null,channel=null,onlinePlayer=null;
const rawClickPoint=clickPoint,rawInit=init,rawRender=render;

function locked(){
  if(gameMode==='ai')return state.turn!==humanPlayer;
  if(gameMode==='online')return onlinePlayer===null||state.turn!==onlinePlayer||!channel||channel.readyState!=='open';
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

function scoreDestination(from,to,p){
  const b=[...state.board];if(from!==null)b[from]=null;b[to]=p;
  let score=Math.random()*2;
  if(MILLS.some(m=>m.includes(to)&&m.every(x=>b[x]===p)))score+=100;
  for(const m of MILLS.filter(m=>m.includes(to))){const own=m.filter(x=>b[x]===p).length,empty=m.filter(x=>b[x]===null).length;if(own===2&&empty===1)score+=14}
  const opp=1-p;for(const m of MILLS.filter(m=>m.includes(to))){const ob=[...state.board];if(from!==null)ob[from]=null;if(ob[to]===null)ob[to]=opp;if(m.every(x=>ob[x]===opp))score+=aiLevel==='easy'?4:40}
  if([4,7,10,11,12,13,16,19].includes(to))score+=3;
  return score;
}
function chooseBest(items,scorer){
  if(aiLevel==='easy')return items[Math.floor(Math.random()*items.length)];
  const ranked=items.map(x=>[x,scorer(x)]).sort((a,b)=>b[1]-a[1]);
  if(aiLevel==='medium'&&ranked.length>2&&Math.random()<.25)return ranked[Math.floor(Math.random()*Math.min(3,ranked.length))][0];
  return ranked[0][0];
}
function queueAI(){
  clearTimeout(aiTimer);if(gameMode!=='ai'||state.winner!==null||state.turn===humanPlayer)return;
  aiTimer=setTimeout(aiMove,aiLevel==='easy'?350:650);
}
function aiMove(){
  if(gameMode!=='ai'||state.turn===humanPlayer||state.winner!==null)return;aiBusy=true;const p=state.turn;
  if(state.removing){const list=removable(1-p);const target=chooseBest(list,i=>{let s=inMill(i,1-p)?1:10;for(const m of MILLS.filter(m=>m.includes(i)))if(m.filter(x=>state.board[x]===1-p).length===2)s+=8;return s});rawClickPoint(target)}
  else if(state.hand[p]>0){const empty=state.board.map((x,i)=>x===null?i:null).filter(x=>x!==null);rawClickPoint(chooseBest(empty,i=>scoreDestination(null,i,p)))}
  else{const moves=[];pieces(p).forEach(from=>legalTargets(from,p).forEach(to=>moves.push({from,to})));if(moves.length){const m=chooseBest(moves,x=>scoreDestination(x.from,x.to,p));rawClickPoint(m.from);rawClickPoint(m.to)}}
  aiBusy=false;render();queueAI();
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

function resetOnlineUI(){document.querySelector('#onlineStart').hidden=false;document.querySelector('#onlineFlow').hidden=true;document.querySelector('#signalInput').value='';document.querySelector('#signalOutput').value=''}
function leaveOnline(){if(channel)channel.close();if(peer)peer.close();channel=null;peer=null;onlinePlayer=null}
function makePeer(){leaveOnline();peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]});peer.onconnectionstatechange=()=>{const s=peer.connectionState;document.querySelector('#connectionStatus').textContent=s==='connected'?'连接成功，对局开始！':s==='failed'?'连接失败，请重新创建邀请。':`连接状态：${s}`};return peer}
function setupChannel(ch){channel=ch;channel.onopen=()=>{document.querySelector('#connectionStatus').textContent='连接成功，对局开始！';gameMode='online';document.querySelector('#modeName').textContent='远程在线';onlineDialog.close();if(onlinePlayer===0){state=fresh();render();sendGame()}else render()};channel.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.type==='game'){state={...msg.state,history:[]};render();if(state.winner!==null&&!document.querySelector('#winDialog').open)win(state.winner,'在线对局已结束')}};channel.onclose=()=>{if(gameMode==='online'){document.querySelector('#statusText').textContent='对手已断开连接';render()}}}
function sendGame(){if(channel&&channel.readyState==='open')channel.send(JSON.stringify({type:'game',state:{board:state.board,hand:state.hand,turn:state.turn,selected:state.selected,removing:state.removing,winner:state.winner,last:state.last}}))}
function waitIce(pc){return new Promise(resolve=>{if(pc.iceGatheringState==='complete')return resolve();const done=()=>{if(pc.iceGatheringState==='complete'){pc.removeEventListener('icegatheringstatechange',done);resolve()}};pc.addEventListener('icegatheringstatechange',done);setTimeout(resolve,5000)})}
function showFlow(status,input,output){document.querySelector('#onlineStart').hidden=true;document.querySelector('#onlineFlow').hidden=false;document.querySelector('#connectionStatus').textContent=status;document.querySelector('#signalInputWrap').hidden=!input;document.querySelector('#signalOutputWrap').hidden=!output;document.querySelector('#applySignal').hidden=!input;document.querySelector('#copySignal').hidden=!output}
document.querySelector('#createRoom').onclick=async()=>{try{const pc=makePeer();onlinePlayer=0;setupChannel(pc.createDataChannel('morris'));showFlow('正在生成邀请文本…',false,false);await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);document.querySelector('#signalOutput').value=btoa(JSON.stringify(pc.localDescription));showFlow('把邀请文本发给好友，然后粘贴好友的回复。',true,true);document.querySelector('#signalInputLabel').textContent='粘贴好友发回的回复文本';document.querySelector('#applySignal').textContent='连接对局'}catch(e){document.querySelector('#connectionStatus').textContent='创建失败：'+e.message}};
document.querySelector('#joinRoom').onclick=()=>{onlinePlayer=1;showFlow('粘贴创建者发来的邀请文本。',true,false);document.querySelector('#signalInputLabel').textContent='粘贴好友发来的邀请文本';document.querySelector('#applySignal').textContent='生成回复'};
document.querySelector('#applySignal').onclick=async()=>{try{const desc=JSON.parse(atob(document.querySelector('#signalInput').value.trim()));if(onlinePlayer===1){const pc=makePeer();onlinePlayer=1;pc.ondatachannel=e=>setupChannel(e.channel);await pc.setRemoteDescription(desc);await pc.setLocalDescription(await pc.createAnswer());await waitIce(pc);document.querySelector('#signalOutput').value=btoa(JSON.stringify(pc.localDescription));showFlow('把回复文本发回给创建者，等待连接。',false,true)}else{await peer.setRemoteDescription(desc);document.querySelector('#connectionStatus').textContent='正在连接好友…';document.querySelector('#signalInputWrap').hidden=true;document.querySelector('#applySignal').hidden=true}}catch(e){document.querySelector('#connectionStatus').textContent='文本无效，请确认复制完整。'}};
document.querySelector('#copySignal').onclick=async()=>{await navigator.clipboard.writeText(document.querySelector('#signalOutput').value);document.querySelector('#copySignal').textContent='已复制 ✓'};
document.querySelector('#closeOnline').onclick=()=>onlineDialog.close();
