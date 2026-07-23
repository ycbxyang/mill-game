const POSITIONS=[
  [9.17,9.17],[50,9.17],[90.83,9.17],[23.33,23.33],[50,23.33],[76.67,23.33],
  [37.5,37.5],[50,37.5],[62.5,37.5],[9.17,50],[23.33,50],[37.5,50],
  [62.5,50],[76.67,50],[90.83,50],[37.5,62.5],[50,62.5],[62.5,62.5],
  [23.33,76.67],[50,76.67],[76.67,76.67],[9.17,90.83],[50,90.83],[90.83,90.83]
];
const ADJ=[[1,9],[0,2,4],[1,14],[4,10],[1,3,5,7],[4,13],[7,11],[4,6,8],[7,12],[0,10,21],[3,9,11,18],[6,10,15],[8,13,17],[5,12,14,20],[2,13,23],[11,16],[15,17,19],[12,16],[10,19],[16,18,20,22],[13,19],[9,22],[19,21,23],[14,22]];
const MILLS=[[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
const NAMES=['象牙白','曜石黑'];
const $=selector=>document.querySelector(selector);

let state,mode='local',humanPlayer=0,aiLevel='medium';
let aiWorker=null,aiRequest=0,aiThinking=false,aiTimer=null;

function newGame(){return{board:Array(24).fill(null),hand:[9,9],turn:0,selected:null,removing:false,winner:null,last:null,history:[]}}
function snapshot(){return{board:[...state.board],hand:[...state.hand],turn:state.turn,selected:null,removing:false,winner:null,last:state.last}}
function restore(saved){const history=state.history;state={...saved,board:[...saved.board],hand:[...saved.hand],history}}
function pieces(player,board=state.board){return board.reduce((list,value,index)=>(value===player&&list.push(index),list),[])}
function inMill(index,player,board=state.board){return MILLS.some(mill=>mill.includes(index)&&mill.every(point=>board[point]===player))}
function legalTargets(from,player){const empty=state.board.map((value,index)=>value===null?index:null).filter(index=>index!==null);return pieces(player).length===3?empty:ADJ[from].filter(index=>state.board[index]===null)}
function removablePieces(player){const all=pieces(player),outside=all.filter(index=>!inMill(index,player));return outside.length?outside:all}
function canMove(player){return pieces(player).some(index=>legalTargets(index,player).length>0)}
function isHumanTurn(){return mode==='local'||state.turn===humanPlayer}

function startGame(){
  clearTimeout(aiTimer);aiRequest++;if(aiWorker&&aiThinking){aiWorker.terminate();aiWorker=null}aiThinking=false;state=newGame();render();queueAI();
}
function saveTurn(){state.history.push(snapshot())}
function finishTurn(){
  state.selected=null;state.removing=false;state.turn=1-state.turn;checkWinner();render();queueAI();
}
function checkWinner(){
  if(state.hand[0]+state.hand[1]>0)return;const player=state.turn;
  if(pieces(player).length<3)return declareWinner(1-player,'对手只剩下两枚棋子');
  if(!canMove(player))declareWinner(1-player,'对手已无路可走');
}
function declareWinner(player,reason){
  state.winner=player;render();$('#winnerTitle').textContent=`${NAMES[player]}获胜`;$('#winnerReason').textContent=reason;$('#winnerPiece').className='winner-piece '+(player?'black':'');$('#winDialog').showModal();
}
function handlePoint(index){
  if(state.winner!==null||aiThinking||!isHumanTurn())return;
  const player=state.turn;
  if(state.removing){if(removablePieces(1-player).includes(index)){state.board[index]=null;state.last=null;finishTurn()}return}
  if(state.hand[player]>0){
    if(state.board[index]!==null)return;saveTurn();state.board[index]=player;state.hand[player]--;state.last=index;
    if(inMill(index,player)){state.removing=true;render()}else finishTurn();return;
  }
  if(state.selected===null){if(state.board[index]===player){state.selected=index;render()}return}
  if(state.board[index]===player){state.selected=index;render();return}
  if(!legalTargets(state.selected,player).includes(index))return;
  saveTurn();state.board[index]=player;state.board[state.selected]=null;state.selected=null;state.last=index;
  if(inMill(index,player)){state.removing=true;render()}else finishTurn();
}
function undo(){
  if(!state.history.length||aiThinking)return;aiRequest++;clearTimeout(aiTimer);
  restore(state.history.pop());
  if(mode==='ai')while(state.turn!==humanPlayer&&state.history.length)restore(state.history.pop());
  aiThinking=false;render();queueAI();
}

function queueAI(){
  clearTimeout(aiTimer);if(mode!=='ai'||state.winner!==null||state.turn===humanPlayer)return;
  aiThinking=true;render();aiTimer=setTimeout(requestAIMove,220);
}
function requestAIMove(){
  if(!aiWorker){
    aiWorker=new Worker('ai-worker.js');
    aiWorker.onmessage=event=>applyAIMove(event.data);
    aiWorker.onerror=()=>{aiThinking=false;$('#statusText').textContent='AI 引擎加载失败，请刷新页面重试'};
  }
  const id=++aiRequest;aiWorker.postMessage({id,state:{board:[...state.board],hand:[...state.hand],turn:state.turn},level:aiLevel});
}
function applyAIMove({id,move}){
  if(id!==aiRequest||mode!=='ai'||state.turn===humanPlayer)return;
  if(!move){aiThinking=false;render();return}
  const player=state.turn;saveTurn();
  if(move.from===null)state.hand[player]--;else state.board[move.from]=null;
  state.board[move.to]=player;if(move.remove!==null)state.board[move.remove]=null;state.last=move.to;aiThinking=false;finishTurn();
}

function phaseLabel(){if(state.hand[0]+state.hand[1]>0)return'布子阶段';return pieces(state.turn).length===3?'飞行阶段':'走子阶段'}
function statusMessage(counts){
  if(aiThinking)return'电脑正在思考…';if(!isHumanTurn())return'等待电脑行动…';
  if(state.removing)return`${NAMES[state.turn]}已连成磨坊，请移除一枚对方棋子`;
  if(state.hand[state.turn]>0)return`${NAMES[state.turn]}回合，请选择一个交点落子`;
  if(state.selected!==null)return`已选中棋子，请选择${counts[state.turn]===3?'任意空位':'相邻空位'}`;
  return`${NAMES[state.turn]}回合，请选择一枚棋子`;
}
function render(){
  const board=$('#board');board.querySelectorAll('.point').forEach(point=>point.remove());
  const targets=state.selected===null?[]:legalTargets(state.selected,state.turn),removes=state.removing?removablePieces(1-state.turn):[];
  POSITIONS.forEach(([x,y],index)=>{
    const point=document.createElement('button');point.className='point';point.style.left=x+'%';point.style.top=y+'%';point.setAttribute('aria-label',`交点 ${index+1}`);
    if(!aiThinking&&isHumanTurn()&&(targets.includes(index)||(state.hand[state.turn]>0&&state.board[index]===null&&!state.removing)))point.classList.add('valid');
    if(index===state.selected)point.classList.add('selected');if(index===state.last)point.classList.add('last-move');if(removes.includes(index)&&isHumanTurn())point.classList.add('removable');
    if(state.board[index]!==null){const piece=document.createElement('span');piece.className='piece '+(state.board[index]?'black':'white');point.appendChild(piece)}
    point.onclick=()=>handlePoint(index);board.appendChild(point);
  });
  const counts=[pieces(0).length,pieces(1).length];
  $('#whiteBoard').textContent=counts[0];$('#blackBoard').textContent=counts[1];$('#whiteHand').textContent=state.hand[0];$('#blackHand').textContent=state.hand[1];$('#phaseLabel').textContent=phaseLabel();$('#statusText').textContent=statusMessage(counts);
  $('#playerCard0').classList.toggle('active',state.turn===0);$('#playerCard1').classList.toggle('active',state.turn===1);$('#undoButton').disabled=!state.history.length||aiThinking;
  [['#whiteCaptured',9-state.hand[1]-counts[1]],['#blackCaptured',9-state.hand[0]-counts[0]]].forEach(([selector,total])=>$(selector).innerHTML='<i></i>'.repeat(Math.max(0,total)));
}

const modeDialog=$('#modeDialog'),rulesDialog=$('#rulesDialog');
$('#modeButton').onclick=()=>modeDialog.showModal();$('[data-close="modeDialog"]').onclick=()=>modeDialog.close();
document.querySelectorAll('.mode-option').forEach(button=>button.onclick=()=>{
  if(button.dataset.mode==='local'){mode='local';$('#modeName').textContent='本地双人';$('#aiSettings').hidden=true;modeDialog.close();startGame()}
  else $('#aiSettings').hidden=false;
});
$('#startAI').onclick=()=>{mode='ai';humanPlayer=Number($('#humanColor').value);aiLevel=$('#aiLevel').value;$('#modeName').textContent='人机对战';modeDialog.close();startGame()};
$('#undoButton').onclick=undo;$('#restartButton').onclick=startGame;$('#playAgain').onclick=()=>{$('#winDialog').close();startGame()};
$('#rulesButton').onclick=()=>rulesDialog.showModal();$('#closeRules').onclick=()=>rulesDialog.close();$('#gotIt').onclick=()=>rulesDialog.close();
startGame();
