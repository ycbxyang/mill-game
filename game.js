'use strict';

const ROWS=6,COLS=7,SIZE=ROWS*COLS;
const NAMES=['琥珀黄','珊瑚红'];
const GAME_ID='connect-four',RULES_VERSION=1,AI_VERSION='2.0.0-alpha.3';
const $=selector=>document.querySelector(selector);

let state,mode='local',humanPlayer=0,aiLevel='medium';
let aiWorker=null,aiRequest=0,aiThinking=false,aiTimer=null,aiWatchdog=null;
let onlineSession=null,onlinePlayer=null,onlineReady=false,onlineMessage='';

function newGame(){return{board:Array(SIZE).fill(-1),turn:0,winner:null,draw:false,winning:[],last:null,history:[]}}
function snapshot(){return{board:[...state.board],turn:state.turn,winner:state.winner,draw:state.draw,winning:[...state.winning],last:state.last}}
function restore(saved){const history=state.history;state={...saved,board:[...saved.board],winning:[...saved.winning],history}}
function playableRow(board,col){for(let row=ROWS-1;row>=0;row--)if(board[row*COLS+col]===-1)return row;return-1}
function validColumns(board=state.board){return Array.from({length:COLS},(_,col)=>col).filter(col=>playableRow(board,col)>=0)}
function winningLine(board,player){
  const directions=[[0,1],[1,0],[1,1],[1,-1]];
  for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
    for(const[dr,dc]of directions){
      const endRow=row+dr*3,endCol=col+dc*3;
      if(endRow<0||endRow>=ROWS||endCol<0||endCol>=COLS)continue;
      const line=Array.from({length:4},(_,step)=>(row+dr*step)*COLS+col+dc*step);
      if(line.every(index=>board[index]===player))return line;
    }
  }
  return[];
}
function isHumanTurn(){return mode==='local'||mode==='ai'&&state.turn===humanPlayer||mode==='online'&&onlineReady&&state.turn===onlinePlayer}
function startGame(){
  clearTimeout(aiTimer);clearTimeout(aiWatchdog);aiRequest++;
  if(aiWorker&&aiThinking){aiWorker.terminate();aiWorker=null}
  aiThinking=false;state=newGame();hideResult();render();
  if(mode==='online'&&onlineReady)sendOnlineState();else queueAI();
}
function playColumn(col,fromAI=false){
  if(state.winner!==null||state.draw||aiThinking&&!fromAI||!fromAI&&!isHumanTurn())return;
  const row=playableRow(state.board,col);if(row<0)return;
  state.history.push(snapshot());const player=state.turn,index=row*COLS+col;
  state.board[index]=player;state.last=index;state.winning=winningLine(state.board,player);
  if(state.winning.length)state.winner=player;
  else if(!validColumns().length)state.draw=true;
  else state.turn=1-player;
  render();
  if(mode==='online')sendOnlineState();else if(state.winner===null&&!state.draw)queueAI();
  if(state.winner!==null||state.draw)showResult();
}
function undo(){
  if(!state.history.length||aiThinking||mode==='online')return;
  aiRequest++;clearTimeout(aiTimer);restore(state.history.pop());
  if(mode==='ai')while(state.turn!==humanPlayer&&state.history.length)restore(state.history.pop());
  aiThinking=false;render();queueAI();
}
function queueAI(){
  clearTimeout(aiTimer);
  if(mode!=='ai'||state.winner!==null||state.draw||state.turn===humanPlayer)return;
  aiThinking=true;render();aiTimer=setTimeout(requestAI,90);
}
function requestAI(){
  if(!aiWorker){
    aiWorker=new Worker(`ai-worker.js?v=${AI_VERSION}`);
    aiWorker.onmessage=event=>applyAI(event.data);
    aiWorker.onerror=()=>{aiThinking=false;$('#syncWarning').textContent='AI 引擎加载失败，请刷新后重试';render()};
  }
  const id=++aiRequest;aiWorker.postMessage({id,board:[...state.board],turn:state.turn,level:aiLevel});
  const limit={easy:600,medium:1000,hard:1700}[aiLevel];
  clearTimeout(aiWatchdog);aiWatchdog=setTimeout(()=>forceAI(id),limit);
}
function applyAI({id,col}){
  if(id!==aiRequest||mode!=='ai'||state.turn===humanPlayer)return;
  clearTimeout(aiWatchdog);aiThinking=false;
  if(Number.isInteger(col))playColumn(col,true);else render();
}
function forceAI(id){
  if(id!==aiRequest||mode!=='ai'||state.turn===humanPlayer)return;
  if(aiWorker){aiWorker.terminate();aiWorker=null}
  const columns=validColumns(),center=[3,2,4,1,5,0,6].filter(col=>columns.includes(col));
  aiThinking=false;playColumn(center[0],true);
}
function statusMessage(){
  if(mode==='online'&&!onlineReady)return onlineMessage||'正在连接在线房间…';
  if(state.winner!==null)return`${NAMES[state.winner]}已经连成四子`;
  if(state.draw)return'棋盘已满，本局平局';
  if(aiThinking)return'电脑正在计算落点…';
  if(!isHumanTurn())return mode==='online'?'等待对手落子…':'等待电脑落子…';
  return`${NAMES[state.turn]}回合，请选择一列`;
}
function render(){
  const board=$('#board');board.replaceChildren();
  const playable=isHumanTurn()&&!aiThinking&&state.winner===null&&!state.draw;
  for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++){
    const index=row*COLS+col,cell=document.createElement('button');
    cell.className='connect-cell';cell.setAttribute('role','gridcell');
    const landing=playableRow(state.board,col);
    if(playable&&landing===row)cell.classList.add('valid');
    if(index===state.last)cell.classList.add('last');
    if(state.winning.includes(index))cell.classList.add('winning');
    cell.setAttribute('aria-label',state.board[index]===-1?`第 ${col+1} 列${landing===row?'，可落子':''}`:`${NAMES[state.board[index]]}棋子`);
    cell.onclick=()=>playColumn(col);
    if(state.board[index]!==-1){const disc=document.createElement('span');disc.className=`connect-disc player${state.board[index]}`;cell.appendChild(disc)}
    board.appendChild(cell);
  }
  const counts=[state.board.filter(v=>v===0).length,state.board.filter(v=>v===1).length];
  $('#score0').textContent=counts[0];$('#score1').textContent=counts[1];
  $('#playerCard0').classList.toggle('active',state.turn===0&&state.winner===null&&!state.draw);
  $('#playerCard1').classList.toggle('active',state.turn===1&&state.winner===null&&!state.draw);
  $('#phaseLabel').textContent=state.winner!==null||state.draw?'对局结束':'落子阶段';
  $('#statusText').textContent=statusMessage();$('#undoButton').disabled=!state.history.length||aiThinking||mode==='online';
}
function hideResult(){$('#winDialog').hidden=true}
function showResult(){
  const dialog=$('#winDialog'),mark=$('#winnerMark');
  mark.className='winner-mark '+(state.draw?'draw':state.winner===1?'player-one':'');
  $('#winnerTitle').textContent=state.draw?'平局':`${NAMES[state.winner]}获胜`;
  $('#winnerReason').textContent=state.draw?'棋盘已填满，双方都未连成四子。':'率先连接了四枚棋子。';
  dialog.hidden=false;
}

function onlineState(){return{schema:1,board:[...state.board],turn:state.turn,winner:state.winner===null?-1:state.winner,draw:state.draw,winning:state.winning.length?[...state.winning]:[-1],last:state.last===null?-1:state.last}}
function sendOnlineState(){onlineSession?.sendState(onlineState())}
function receiveOnlineState(remote){
  if(!remote||!Array.isArray(remote.board)||remote.board.length!==SIZE)return;
  state={board:Array.from(remote.board,value=>value===0||value===1?value:-1),turn:remote.turn===1?1:0,winner:remote.winner===0||remote.winner===1?remote.winner:null,draw:Boolean(remote.draw),winning:Array.isArray(remote.winning)?remote.winning.filter(index=>index>=0):[],last:Number.isInteger(remote.last)&&remote.last>=0?remote.last:null,history:[]};
  render();if(state.winner!==null||state.draw)showResult();
}
function leaveOnline(){onlineSession?.close();onlineSession=null;onlinePlayer=null;onlineReady=false;onlineMessage=''}
function onlineCallbacks(statusElement){
  return{
    onStatus:message=>{onlineMessage=message;statusElement.textContent=message;if(message.startsWith('同步失败'))$('#syncWarning').textContent=message;render()},
    onReady:player=>{onlinePlayer=player;onlineReady=true;mode='online';onlineMessage='';$('#modeName').textContent='远程联机';if(player===0)startGame();else render();setTimeout(()=>$('#modeDialog').close(),450)},
    onState:receiveOnlineState,
    onClose:()=>{onlineReady=false;onlineMessage='对手已离开房间';$('#syncWarning').textContent=onlineMessage;render()}
  };
}
let onlineLoadPromise=null;
async function onlineAPI(){
  if(window.OnlineMorris)return window.OnlineMorris;
  try{
    if(!onlineLoadPromise)onlineLoadPromise=import('../../online.js?v=2.0.0-alpha.1');
    await onlineLoadPromise;
    if(!window.OnlineMorris)throw new Error('在线模块未就绪');
    return window.OnlineMorris;
  }catch(error){onlineLoadPromise=null;throw new Error('在线模块加载失败，请检查网络后刷新页面')}
}

const modeDialog=$('#modeDialog'),rulesDialog=$('#rulesDialog');
$('#modeButton').onclick=()=>modeDialog.showModal();
$('[data-close="modeDialog"]').onclick=()=>modeDialog.close();
document.querySelectorAll('.mode-option').forEach(button=>button.onclick=()=>{
  document.querySelectorAll('.mode-option').forEach(option=>option.classList.toggle('selected',option===button));
  const selected=button.dataset.mode;
  $('#aiSettings').hidden=selected!=='ai';$('#onlineSettings').hidden=selected!=='online';
  if(selected==='local'){leaveOnline();mode='local';$('#modeName').textContent='本地双人';modeDialog.close();startGame()}
});
$('#startAI').onclick=()=>{leaveOnline();mode='ai';humanPlayer=Number($('#humanColor').value);aiLevel=$('#aiLevel').value;$('#modeName').textContent='人机对战';modeDialog.close();startGame()};
$('#showJoinRoom').onclick=()=>{$('#onlineChoice').hidden=true;$('#roomCard').hidden=true;$('#joinForm').hidden=false;$('#roomInput').focus()};
$('#roomInput').oninput=event=>event.target.value=event.target.value.replace(/\D/g,'').slice(0,6);
$('#createRoom').onclick=async()=>{
  leaveOnline();mode='online';onlinePlayer=0;onlineMessage='正在连接在线服务器…';$('#syncWarning').textContent='';
  $('#onlineChoice').hidden=true;$('#joinForm').hidden=true;$('#roomCard').hidden=false;$('#roomCode').textContent='------';$('#onlineStatus').textContent=onlineMessage;render();
  const code=String(Math.floor(100000+Math.random()*900000));
  try{const api=await onlineAPI();onlineSession=await api.create(code,onlineCallbacks($('#onlineStatus')),{gameId:GAME_ID,rulesVersion:RULES_VERSION});$('#roomCode').textContent=code}
  catch(error){onlineMessage='创建失败：'+error.message;$('#onlineStatus').textContent=onlineMessage;render()}
};
$('#joinRoom').onclick=async()=>{
  const code=$('#roomInput').value;if(code.length!==6){$('#joinStatus').textContent='请输入完整的 6 位房间码';return}
  leaveOnline();mode='online';onlinePlayer=1;onlineMessage='正在连接在线服务器…';$('#joinStatus').textContent=onlineMessage;$('#syncWarning').textContent='';render();
  try{const api=await onlineAPI();onlineSession=await api.join(code,onlineCallbacks($('#joinStatus')),{gameId:GAME_ID,rulesVersion:RULES_VERSION})}
  catch(error){onlineMessage='加入失败：'+error.message;$('#joinStatus').textContent=onlineMessage;render()}
};
$('#undoButton').onclick=undo;$('#restartButton').onclick=startGame;
$('#rulesButton').onclick=()=>rulesDialog.showModal();$('#closeRules').onclick=()=>rulesDialog.close();$('#gotIt').onclick=()=>rulesDialog.close();
$('#playAgain').onclick=startGame;
$('.board-panel').appendChild($('#winDialog'));hideResult();startGame();
