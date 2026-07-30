'use strict';

const SIDE=8,SIZE=64,DIRECTIONS=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const WEIGHTS=[
  120,-25,20,5,5,20,-25,120,
  -25,-45,-5,-5,-5,-5,-45,-25,
  20,-5,15,3,3,15,-5,20,
  5,-5,3,3,3,3,-5,5,
  5,-5,3,3,3,3,-5,5,
  20,-5,15,3,3,15,-5,20,
  -25,-45,-5,-5,-5,-5,-45,-25,
  120,-25,20,5,5,20,-25,120
];
let deadline=0,nodes=0,table;

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
function legalMoves(board,player){const moves=[];for(let index=0;index<SIZE;index++)if(flipsFor(board,index,player).length)moves.push(index);return moves}
function applyMove(board,index,player){
  const next=[...board],flips=flipsFor(next,index,player);if(!flips.length)return null;
  next[index]=player;for(const point of flips)next[point]=player;return next;
}
function terminalScore(board,ai){
  const own=board.filter(v=>v===ai).length,opp=board.filter(v=>v===1-ai).length;
  return own===opp?0:(own>opp?1000000:-1000000)+(own-opp)*100;
}
function evaluate(board,ai){
  let positional=0,own=0,opp=0;
  for(let i=0;i<SIZE;i++){
    if(board[i]===ai){positional+=WEIGHTS[i];own++}
    else if(board[i]===1-ai){positional-=WEIGHTS[i];opp++}
  }
  const mobility=legalMoves(board,ai).length-legalMoves(board,1-ai).length;
  const occupied=own+opp,pieceWeight=occupied>50?8:occupied>42?3:.3;
  return positional*2+mobility*11+(own-opp)*pieceWeight;
}
function orderedMoves(board,player){return legalMoves(board,player).sort((a,b)=>WEIGHTS[b]-WEIGHTS[a])}
function search(board,depth,alpha,beta,turn,ai,passed=false){
  if((++nodes&511)===0&&performance.now()>deadline)throw new Error('TIME');
  const moves=orderedMoves(board,turn);
  if(!moves.length){
    const other=orderedMoves(board,1-turn);
    if(!other.length)return terminalScore(board,ai);
    if(passed)return terminalScore(board,ai);
    return search(board,depth,alpha,beta,1-turn,ai,true);
  }
  if(depth===0)return evaluate(board,ai);
  const key=board.join(',')+'|'+turn+'|'+depth,hit=table.get(key);
  if(hit){
    if(hit.flag==='exact')return hit.value;
    if(hit.flag==='lower')alpha=Math.max(alpha,hit.value);else beta=Math.min(beta,hit.value);
    if(alpha>=beta)return hit.value;
  }
  const alphaStart=alpha,betaStart=beta;
  let best=turn===ai?-Infinity:Infinity;
  for(const move of moves){
    const value=search(applyMove(board,move,turn),depth-1,alpha,beta,1-turn,ai,false);
    if(turn===ai){best=Math.max(best,value);alpha=Math.max(alpha,best)}else{best=Math.min(best,value);beta=Math.min(beta,best)}
    if(alpha>=beta)break;
  }
  const flag=best<=alphaStart?'upper':best>=betaStart?'lower':'exact';
  table.set(key,{value:best,flag});return best;
}
function choose(board,ai,level){
  const moves=orderedMoves(board,ai);if(!moves.length)return null;
  if(level==='easy'){
    const safe=moves.filter(index=>![-45,-25].includes(WEIGHTS[index]));
    const pool=safe.length?safe:moves;return pool[Math.floor(Math.random()*pool.length)];
  }
  const budget=level==='hard'?1200:560,maxDepth=level==='hard'?7:4;
  deadline=performance.now()+budget;table=new Map();nodes=0;let best=moves[0];
  for(let depth=2;depth<=maxDepth;depth++){
    try{
      let roundBest=best,roundScore=-Infinity;
      for(const move of moves){
        const value=search(applyMove(board,move,ai),depth-1,-Infinity,Infinity,1-ai,ai,false);
        if(value>roundScore){roundScore=value;roundBest=move}
      }
      best=roundBest;if(Math.abs(roundScore)>900000)break;
    }catch(error){if(error.message!=='TIME')throw error;break}
  }
  return best;
}
self.onmessage=event=>{
  const{id,board,turn,level}=event.data;
  self.postMessage({id,index:choose(board,turn,level)});
};
