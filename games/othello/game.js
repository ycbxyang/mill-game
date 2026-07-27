'use strict';

const SIDE=8,SIZE=64,DIRECTIONS=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const NAMES=['曜石黑','象牙白'];
const GAME_ID='othello',RULES_VERSION=1,AI_VERSION='2.0.0-alpha.1';
const $=selector=>document.querySelector(selector);

let state,mode='local',humanPlayer=0,aiLevel='medium';
let aiWorker=null,aiRequest=0,aiThinking=false,aiTimer=null,aiWatchdog=null;
let onlineSession=null,onlinePlayer=null,onlineReady=false,onlineMessage='';

function newGame(){
  const board=Array(SIZE).fill(-1);board[27]=1;board[28]=0;board[35]=0;board[36]=1;
  return{board,turn:0,winner:null,draw:false,last:null,flipped:[],passMessage:'',history:[]};
}
function snapshot(){return{board:[...state.board],turn:state.turn,winner:state.winner,draw:state.draw,last:state.last,flipped:[...state.flipped],passMessage:state.passMessage}}
function restore(saved){const history=state.history;state={...saved,board:[...saved.board],flipped:[...saved.flipped],history}}
function flipsFor(board,index,player){
  if(index<0||index>=SIZE||board[index]!==-1)return[];
  const row=Math.floor(index/SIDE),col=index%SIDE,result=[];
  for(const[dr,dc]of DIRECTIONS){
    let r=row+dr,c=col+dc;const line=[];
    while(r>=0&&r<SIDE&&c>=0&&c<SIDE&&board[r*SIDE+c]===1-player){line.push(r*SIDE+c);r+=dr;c+=dc}
    if(line.length&&r>=0&&r<SIDE&&c>=0&&c<SIDE&&board[r*SIDE+c]===player)result.push(...line);
  }
  return result;
}
function legalMoves(board=state.board,player=state.turn){const moves=[];for(let i=0;i<SIZE;i++)if(flipsFor(board,i,player).length)moves.push(i);return moves}
function counts(board=state.board){return[board.filter(v=>v===0).length,board.filter(v=>v===1).length]}
function isHumanTurn(){return mode==='local'||mode==='ai'&&state.turn===humanPlayer||mode==='online'&&onlineReady&&state.turn===onlinePlayer}
function startGame(){
  clearTimeout(aiTimer);clearTimeout(aiWatchdog);aiRequest++;
  if(aiWorker&&aiThinking){aiWorker.terminate();aiWorker=null}
  aiThinking=false;state=newGame();hideResult();render();
  if(mode==='online'&&onlineReady)sendOnlineState();else queueAI();
}
function finishAfterMove(player){
  const opponent=1-player,opponentMoves=legalMoves(state.board,opponent);
  if(opponentMoves.length){state.turn=opponent;state.passMessage='';return}
  const ownMoves=legalMoves(state.board,player);
  if(ownMoves.length){state.turn=player;state.passMessage=`${NAMES[opponent]}无棋可下，${NAMES[player]}继续落子`;return}
  const total=counts();state.passMessage='';
  if(total[0]===total[1])state.draw=true;else state.winner=total[0]>total[1]?0:1;
}
function playCell(index,fromAI=false){
  if(state.winner!==null||state.draw||aiThinking&&!fromAI||!fromAI&&!isHumanTurn())return;
  const player=state.turn,flips=flipsFor(state.board,index,player);if(!flips.length)return;
  state.history.push(snapshot());state.board[index]=player;for(const point of flips)state.board[point]=player;
  state.last=index;state.flipped=flips;finishAfterMove(player);render();
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
  const limit={easy:600,medium:1100,hard:1800}[aiLevel];
  clearTimeout(aiWatchdog);aiWatchdog=setTimeout(()=>forceAI(id),limit);
}
function applyAI({id,index}){
  if(id!==aiRequest||mode!=='ai'||state.turn===humanPlayer)return;
  clearTimeout(aiWatchdog);aiThinking=false;
  if(Number.isInteger(index))playCell(index,true);else render();
}
function forceAI(id){
  if(id!==aiRequest||mode!=='ai'||state.turn===humanPlayer)return;
  if(aiWorker){aiWorker.terminate();aiWorker=null}
  const moves=legalMoves(),corners=[0,7,56,63].filter(index=>moves.includes(index));
  aiThinking=false;playCell(corners[0]??moves[0],true);
}
function statusMessage(){
  if(mode==='online'&&!onlineReady)return onlineMessage||'正在连接在线房间…';
  if(state.winner!==null)return`${NAMES[state.winner]}拥有更多棋子`;
  if(state.draw)return'双方棋子数量相同，本局平局';
  if(aiThinking)return'电脑正在评估棋盘…';
  if(state.passMessage)return state.passMessage;
  if(!isHumanTurn())return mode==='online'?'等待对手落子…':'等待电脑落子…';
  return`${NAMES[state.turn]}回合，请选择标记位置`;
}
function render(){
  const board=$('#board');board.replaceChildren();
  const moves=new Set(legalMoves()),playable=isHumanTurn()&&!aiThinking&&state.winner===null&&!state.draw;
  for(let index=0;index<SIZE;index++){
    const cell=document.createElement('button');cell.className='othello-cell';cell.setAttribute('role','gridcell');
    if(playable&&moves.has(index))cell.classList.add('valid');
    if(index===state.last)cell.classList.add('last');
    if(state.flipped.includes(index))cell.classList.add('flipped');
    cell.setAttribute('aria-label',state.board[index]===-1?`${Math.floor(index/SIDE)+1} 行 ${index%SIDE+1} 列${moves.has(index)?'，合法位置':''}`:`${NAMES[state.board[index]]}棋子`);
    cell.onclick=()=>playCell(index);
    if(state.board[index]!==-1){const disc=document.createElement('span');disc.className=`othello-disc player${state.board[index]}`;cell.appendChild(disc)}
    board.appendChild(cell);
  }
  const total=counts();$('#score0').textContent=total[0];$('#score1').textContent=total[1];
  $('#playerCard0').classList.toggle('active',state.turn===0&&state.winner===null&&!state.draw);
  $('#playerCard1').classList.toggle('active',state.turn===1&&state.winner===null&&!state.draw);
  $('#phaseLabel').textContent=state.winner!==null||state.draw?'对局结束':'占领阶段';
  $('#statusText').textContent=statusMessage();$('#undoButton').disabled=!state.history.length||aiThinking||mode==='online';
}
function hideResult(){$('#winDialog').hidden=true}
function showResult(){
  const total=counts(),dialog=$('#winDialog'),mark=$('#winnerMark');
  mark.className='winner-mark '+(state.draw?'draw':state.winner===1?'player-one':'');
  $('#winnerTitle').textContent=state.draw?'平局':`${NAMES[state.winner]}获胜`;
  $('#winnerReason').textContent=`终局比分 ${total[0]} : ${total[1]}`;
  dialog.hidden=false;
}

function onlineState(){return{schema:1,board:[...state.board],turn:state.turn,winner:state.winner===null?-1:state.winner,draw:state.draw,last:state.last===null?-1:state.last,flipped:state.flipped.length?[...state.flipped]:[-1],passMessage:state.passMessage||''}}
function sendOnlineState(){onlineSession?.sendState(onlineState())}
function receiveOnlineState(remote){
  if(!remote||!Array.isArray(remote.board)||remote.board.length!==SIZE)return;
  state={board:Array.from(remote.board,value=>value===0||value===1?value:-1),turn:remote.turn===1?1:0,winner:remote.winner===0||remote.winner===1?remote.winner:null,draw:Boolean(remote.draw),last:Number.isInteger(remote.last)&&remote.last>=0?remote.last:null,flipped:Array.isArray(remote.flipped)?remote.flipped.filter(index=>index>=0):[],passMessage:remote.passMessage||'',history:[]};
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
