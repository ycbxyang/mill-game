'use strict';

const ROWS=6,COLS=7,SIZE=ROWS*COLS,ORDER=[3,2,4,1,5,0,6];
const WIN=1000000,INF=2000000;
const WINDOWS=[];
for(let r=0;r<ROWS;r++)for(let c=0;c<=COLS-4;c++)WINDOWS.push([0,1,2,3].map(i=>r*COLS+c+i));
for(let c=0;c<COLS;c++)for(let r=0;r<=ROWS-4;r++)WINDOWS.push([0,1,2,3].map(i=>(r+i)*COLS+c));
for(let r=0;r<=ROWS-4;r++)for(let c=0;c<=COLS-4;c++)WINDOWS.push([0,1,2,3].map(i=>(r+i)*COLS+c+i));
for(let r=0;r<=ROWS-4;r++)for(let c=3;c<COLS;c++)WINDOWS.push([0,1,2,3].map(i=>(r+i)*COLS+c-i));

let deadline=0,nodes=0,table=null;

function rowFor(board,col){for(let row=ROWS-1;row>=0;row--)if(board[row*COLS+col]===-1)return row;return-1}
function validColumns(board){return ORDER.filter(col=>rowFor(board,col)>=0)}
function play(board,col,player){const next=[...board],row=rowFor(next,col);if(row<0)return null;next[row*COLS+col]=player;return next}
function winning(board,player){
  for(const line of WINDOWS)if(line.every(index=>board[index]===player))return true;
  return false;
}
function put(board,col,player){
  const row=rowFor(board,col);if(row<0)return-1;
  const index=row*COLS+col;board[index]=player;return index;
}
function winsAfter(board,col,player){
  const index=put(board,col,player);if(index<0)return false;
  const result=winningAt(board,index,player);board[index]=-1;return result;
}
function winningAt(board,index,player){
  const row=Math.floor(index/COLS),col=index%COLS;
  for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){
    let count=1;
    for(const sign of[-1,1])for(let step=1;step<4;step++){
      const r=row+dr*step*sign,c=col+dc*step*sign;
      if(r<0||r>=ROWS||c<0||c>=COLS||board[r*COLS+c]!==player)break;
      count++;
    }
    if(count>=4)return true;
  }
  return false;
}
function immediateWins(board,player,columns=validColumns(board)){
  return columns.filter(col=>winsAfter(board,col,player));
}
function positionKey(board,player){return board.map(value=>value+1).join('')+'|'+player}
function evaluate(board,player){
  const opponent=1-player,weights=[0,2,14,90,WIN],oppWeights=[0,2,16,105,WIN];
  let score=0;
  for(let row=0;row<ROWS;row++){
    const value=board[row*COLS+3];
    if(value===player)score+=8;else if(value===opponent)score-=8;
  }
  for(const line of WINDOWS){
    let own=0,opp=0,empty=-1;
    for(const index of line){
      if(board[index]===player)own++;
      else if(board[index]===opponent)opp++;
      else empty=index;
    }
    if(own&&opp)continue;
    if(own){score+=weights[own];if(own===3&&rowFor(board,empty%COLS)===Math.floor(empty/COLS))score+=360}
    else if(opp){score-=oppWeights[opp];if(opp===3&&rowFor(board,empty%COLS)===Math.floor(empty/COLS))score-=420}
  }
  return score;
}
function orderedMoves(board,player,columns,preferred){
  const opponent=1-player;
  return columns.map(col=>{
    const index=put(board,col,player);
    let score=14-Math.abs(3-col)*3;
    if(col===preferred)score+=10000;
    const threats=immediateWins(board,player);
    if(threats.length>=2)score+=1200;
    score-=immediateWins(board,opponent).length*900;
    board[index]=-1;
    return{col,score};
  }).sort((a,b)=>b.score-a.score).map(item=>item.col);
}
function negamax(board,depth,alpha,beta,player,ply){
  if((++nodes&511)===0&&performance.now()>deadline)throw new Error('TIME');
  const columns=validColumns(board);if(!columns.length)return 0;
  const wins=immediateWins(board,player,columns);
  if(wins.length)return WIN-ply;
  const opponent=1-player,blocks=immediateWins(board,opponent,columns);
  if(blocks.length>=2)return-WIN+ply+2;
  if(depth<=0&&!blocks.length)return evaluate(board,player);

  const key=positionKey(board,player),originalAlpha=alpha,originalBeta=beta,hit=table.get(key);
  if(hit&&hit.depth>=depth){
    if(hit.flag===0)return hit.value;
    if(hit.flag===1)alpha=Math.max(alpha,hit.value);
    else beta=Math.min(beta,hit.value);
    if(alpha>=beta)return hit.value;
  }
  const candidates=blocks.length===1?blocks:columns;
  const moves=orderedMoves(board,player,candidates,hit?.best);
  let best=-INF,bestMove=moves[0];
  for(const col of moves){
    const index=put(board,col,player);
    let value;
    try{value=-negamax(board,depth-1,-beta,-alpha,opponent,ply+1)}
    finally{board[index]=-1}
    if(value>best){best=value;bestMove=col}
    alpha=Math.max(alpha,value);
    if(alpha>=beta)break;
  }
  const flag=best<=originalAlpha?2:best>=originalBeta?1:0;
  table.set(key,{depth,value:best,flag,best:bestMove});
  return best;
}
function choose(board,ai,level){
  const columns=validColumns(board);if(!columns.length)return null;
  const wins=immediateWins(board,ai,columns);if(wins.length)return wins[0];
  const blocks=immediateWins(board,1-ai,columns);if(blocks.length===1)return blocks[0];
  if(level==='easy')return columns[Math.floor(Math.random()*columns.length)];

  const budget=level==='hard'?1250:350,maxDepth=level==='hard'?16:7;
  deadline=performance.now()+budget;nodes=0;table=new Map();
  let best=columns[0],bestScore=-INF;
  for(let depth=1;depth<=maxDepth;depth++){
    try{
      const candidates=blocks.length?blocks:columns;
      const moves=orderedMoves(board,ai,candidates,best);
      let roundBest=best,roundScore=-INF,alpha=-INF;
      for(const col of moves){
        const index=put(board,col,ai);
        let value;
        try{value=-negamax(board,depth-1,-INF,-alpha,1-ai,1)}
        finally{board[index]=-1}
        if(value>roundScore){roundScore=value;roundBest=col}
        alpha=Math.max(alpha,value);
      }
      best=roundBest;bestScore=roundScore;
      if(Math.abs(bestScore)>WIN-100)break;
    }catch(error){if(error.message!=='TIME')throw error;break}
  }
  return best;
}
self.onmessage=event=>{
  const{id,board,turn,level}=event.data;
  self.postMessage({id,col:choose(board,turn,level)});
};
