'use strict';

const ROWS=6,COLS=7,SIZE=ROWS*COLS,ORDER=[3,2,4,1,5,0,6];
let deadline=0,nodes=0,table;

function rowFor(board,col){for(let row=ROWS-1;row>=0;row--)if(board[row*COLS+col]===-1)return row;return-1}
function validColumns(board){return ORDER.filter(col=>rowFor(board,col)>=0)}
function play(board,col,player){const next=[...board],row=rowFor(next,col);if(row<0)return null;next[row*COLS+col]=player;return next}
function winning(board,player){
  const directions=[[0,1],[1,0],[1,1],[1,-1]];
  for(let row=0;row<ROWS;row++)for(let col=0;col<COLS;col++)for(const[dr,dc]of directions){
    const endRow=row+dr*3,endCol=col+dc*3;if(endRow<0||endRow>=ROWS||endCol<0||endCol>=COLS)continue;
    let ok=true;for(let step=0;step<4;step++)if(board[(row+dr*step)*COLS+col+dc*step]!==player){ok=false;break}
    if(ok)return true;
  }
  return false;
}
function windowScore(values,ai){
  const own=values.filter(v=>v===ai).length,opp=values.filter(v=>v===1-ai).length,empty=4-own-opp;
  if(own&&opp)return 0;
  if(own===4)return 100000;if(opp===4)return-100000;
  if(own===3&&empty===1)return180;if(opp===3&&empty===1)return-220;
  if(own===2&&empty===2)return22;if(opp===2&&empty===2)return-28;
  return own*2-opp*2;
}
function evaluate(board,ai){
  let score=0;
  for(let row=0;row<ROWS;row++)if(board[row*COLS+3]===ai)score+=7;else if(board[row*COLS+3]===1-ai)score-=7;
  const lines=[];
  for(let row=0;row<ROWS;row++)for(let col=0;col<=COLS-4;col++)lines.push([0,1,2,3].map(i=>board[row*COLS+col+i]));
  for(let col=0;col<COLS;col++)for(let row=0;row<=ROWS-4;row++)lines.push([0,1,2,3].map(i=>board[(row+i)*COLS+col]));
  for(let row=0;row<=ROWS-4;row++)for(let col=0;col<=COLS-4;col++)lines.push([0,1,2,3].map(i=>board[(row+i)*COLS+col+i]));
  for(let row=0;row<=ROWS-4;row++)for(let col=3;col<COLS;col++)lines.push([0,1,2,3].map(i=>board[(row+i)*COLS+col-i]));
  for(const line of lines)score+=windowScore(line,ai);
  return score;
}
function search(board,depth,alpha,beta,turn,ai){
  if((++nodes&1023)===0&&performance.now()>deadline)throw new Error('TIME');
  if(winning(board,ai))return 1000000+depth;
  if(winning(board,1-ai))return-1000000-depth;
  const columns=validColumns(board);if(!columns.length)return 0;if(depth===0)return evaluate(board,ai);
  const key=board.join(',')+'|'+turn+'|'+depth,hit=table.get(key);if(hit!==undefined)return hit;
  let best=turn===ai?-Infinity:Infinity;
  for(const col of columns){
    const child=play(board,col,turn),value=search(child,depth-1,alpha,beta,1-turn,ai);
    if(turn===ai){best=Math.max(best,value);alpha=Math.max(alpha,best)}else{best=Math.min(best,value);beta=Math.min(beta,best)}
    if(alpha>=beta)break;
  }
  table.set(key,best);return best;
}
function choose(board,ai,level){
  const columns=validColumns(board);if(!columns.length)return null;
  for(const col of columns)if(winning(play(board,col,ai),ai))return col;
  const blocks=columns.filter(col=>winning(play(board,col,1-ai),1-ai));if(blocks.length)return blocks[0];
  if(level==='easy')return columns[Math.floor(Math.random()*columns.length)];
  const budget=level==='hard'?1150:520,maxDepth=level==='hard'?10:5;
  deadline=performance.now()+budget;let best=columns[0],bestScore=-Infinity;table=new Map();nodes=0;
  for(let depth=2;depth<=maxDepth;depth++){
    try{
      let roundBest=best,roundScore=-Infinity;
      for(const col of columns){
        const score=search(play(board,col,ai),depth-1,-Infinity,Infinity,1-ai,ai);
        if(score>roundScore){roundScore=score;roundBest=col}
      }
      best=roundBest;bestScore=roundScore;
      if(Math.abs(bestScore)>900000)break;
    }catch(error){if(error.message!=='TIME')throw error;break}
  }
  return best;
}
self.onmessage=event=>{
  const{id,board,turn,level}=event.data;
  self.postMessage({id,col:choose(board,turn,level)});
};
