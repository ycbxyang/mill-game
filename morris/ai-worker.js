'use strict';
const ADJ=[[1,9],[0,2,4],[1,14],[4,10],[1,3,5,7],[4,13],[7,11],[4,6,8],[7,12],[0,10,21],[3,9,11,18],[6,10,15],[8,13,17],[5,12,14,20],[2,13,23],[11,16],[15,17,19],[12,16],[10,19],[16,18,20,22],[13,19],[9,22],[19,21,23],[14,22]];
const MILLS=[[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
const MILL_OF=Array.from({length:24},(_,i)=>MILLS.filter(m=>m.includes(i)));
const DEGREE=ADJ.map(x=>x.length),WIN=1000000,INF=2000000;
let deadline,nodes,tt,killers,history,age=0;
const count=(b,p)=>b.reduce((n,x)=>n+(x===p),0);
const emptyPoints=b=>b.map((x,i)=>x<0?i:-1).filter(i=>i>=0);
const millAt=(b,i,p)=>MILL_OF[i].some(m=>m.every(x=>b[x]===p));
const millCount=(b,p)=>MILLS.reduce((n,m)=>n+(m.every(i=>b[i]===p)),0);
function removable(b,p){const all=b.map((x,i)=>x===p?i:-1).filter(i=>i>=0),outside=all.filter(i=>!millAt(b,i,p));return outside.length?outside:all}
function generate(s,p=s.turn){
  const out=[],placing=s.hand[p]>0,froms=placing?[-1]:s.board.map((x,i)=>x===p?i:-1).filter(i=>i>=0),fly=!placing&&count(s.board,p)===3,empties=emptyPoints(s.board);
  for(const from of froms){const tos=placing||fly?empties:ADJ[from].filter(i=>s.board[i]<0);for(const to of tos){const b=[...s.board];if(from>=0)b[from]=-1;b[to]=p;const base={from:from<0?null:from,to,remove:null,mill:millAt(b,to,p)};if(base.mill){for(const r of removable(b,1-p))out.push({...base,remove:r})}else out.push(base)}}return out;
}
function apply(s,m){const p=s.turn,b=[...s.board],hand=[...s.hand];if(m.from===null)hand[p]--;else b[m.from]=-1;b[m.to]=p;if(m.remove!==null)b[m.remove]=-1;return{board:b,hand,turn:1-p,noCapture:m.remove!==null?0:(s.noCapture||0)+1}}
function stateKey(s){return s.board.map(x=>x+1).join('')+s.hand[0].toString(10)+s.hand[1].toString(10)+s.turn}
function terminal(s,ply){if(s.hand[0]+s.hand[1]>0)return null;const n=count(s.board,s.turn);if(n<3||generate(s).length===0)return-WIN+ply;return null}
function features(s,p){
  const b=s.board,opp=1-p,placing=s.hand[0]+s.hand[1]>0;
  let open=0,double=0,blocked=0,anchor=0;
  for(let i=0;i<24;i++)if(b[i]===p){anchor+=DEGREE[i];if(!placing&&count(b,p)>3&&ADJ[i].every(j=>b[j]>=0))blocked++}
  for(let i=0;i<24;i++)if(b[i]<0){const ways=MILL_OF[i].filter(m=>m.filter(j=>b[j]===p).length===2&&m.filter(j=>b[j]<0).length===1).length;open+=ways;if(ways>1)double+=ways-1}
  const mobility=placing?emptyPoints(b).length:(count(b,p)===3?emptyPoints(b).length*3:b.reduce((n,x,i)=>n+(x===p?ADJ[i].filter(j=>b[j]<0).length:0),0));
  let protectedPieces=0;for(let i=0;i<24;i++)if(b[i]===p&&millAt(b,i,p))protectedPieces++;
  const men=count(b,p);return{men,hand:s.hand[p],total:men+s.hand[p],mills:millCount(b,p),open,double,blocked,mobility,anchor,protectedPieces,opp};
}
function evaluate(s){
  const p=s.turn,a=features(s,p),b=features(s,1-p),placing=s.hand[0]+s.hand[1]>0,flying=a.men===3||b.men===3;
  const W=placing?{men:0,hand:0,total:190,mills:38,open:36,double:100,blocked:4,mobility:1,anchor:5,protectedPieces:5}:{men:flying?280:210,hand:0,total:0,mills:58,open:34,double:110,blocked:42,mobility:flying?4:12,anchor:3,protectedPieces:8};
  let v=0;for(const k of Object.keys(W))v+=(a[k]-b[k])*W[k];
  // A side with very little freedom is often one tempo away from losing.
  if(!placing&&a.men>3&&a.mobility<=2)v-=180;if(!placing&&b.men>3&&b.mobility<=2)v+=180;
  return v;
}
function moveId(m){return`${m.from===null?'p':m.from}-${m.to}-${m.remove===null?'x':m.remove}`}
function tacticalRank(s,m,p,ttMove,ply){
  const id=moveId(m);let score=id===ttMove?1000000:0;if(m.remove!==null)score+=200000+(DEGREE[m.remove]||0)*5000;if(m.mill)score+=120000;
  const b=[...s.board];if(m.from!==null)b[m.from]=-1;b[m.to]=p;if(m.remove!==null)b[m.remove]=-1;
  let threats=0;for(const line of MILL_OF[m.to])if(line.filter(i=>b[i]===p).length===2&&line.filter(i=>b[i]<0).length===1)threats++;score+=threats*16000+DEGREE[m.to]*900;
  if(killers[ply]?.includes(id))score+=80000;score+=(history.get(id)||0);return score;
}
function ordered(s,list,ttMove,ply){const p=s.turn;return list.sort((a,b)=>tacticalRank(s,b,p,ttMove,ply)-tacticalRank(s,a,p,ttMove,ply))}
function quiet(s,alpha,beta,ply,path){
  if(performance.now()>deadline)throw new Error('TIME');
  const stand=evaluate(s);if(stand>=beta)return beta;if(stand>alpha)alpha=stand;if(ply>=3)return alpha;
  const forcing=generate(s).filter(m=>m.remove!==null);for(const m of ordered(s,forcing,null,ply)){const k=stateKey(apply(s,m));if(path.has(k))continue;path.add(k);const score=-quiet(apply(s,m),-beta,-alpha,ply+1,path);path.delete(k);if(score>=beta)return beta;if(score>alpha)alpha=score}return alpha;
}
function negamax(s,depth,alpha,beta,ply,path,extensionBudget){
  if((++nodes&255)===0&&performance.now()>deadline)throw new Error('TIME');const end=terminal(s,ply);if(end!==null)return end;
  const sk=stateKey(s);if(path.has(sk))return 0;if(depth<=0)return quiet(s,alpha,beta,0,path);
  const alpha0=alpha,tk=sk+'|'+depth,hit=tt.get(tk);if(hit){if(hit.flag==='EXACT')return hit.score;if(hit.flag==='LOWER')alpha=Math.max(alpha,hit.score);else beta=Math.min(beta,hit.score);if(alpha>=beta)return hit.score}
  const list=ordered(s,generate(s),hit?.move,ply);if(!list.length)return-WIN+ply;let best=-INF,bestMove=null;path.add(sk);
  for(const m of list){const child=apply(s,m),extend=m.remove!==null&&extensionBudget>0?1:0;const score=-negamax(child,depth-1+extend,-beta,-alpha,ply+1,path,extensionBudget-extend);if(score>best){best=score;bestMove=moveId(m)}if(score>alpha)alpha=score;if(alpha>=beta){if(m.remove===null){const id=moveId(m);killers[ply]=(killers[ply]||[]).filter(x=>x!==id);killers[ply].unshift(id);killers[ply]=killers[ply].slice(0,2);history.set(id,(history.get(id)||0)+depth*depth)}break}}
  path.delete(sk);const flag=best<=alpha0?'UPPER':best>=beta?'LOWER':'EXACT';tt.set(tk,{score:best,flag,move:bestMove,age});return best;
}
function rootSearch(s,depth){
  const rootKey=stateKey(s),prior=tt.get(rootKey+'|'+depth);let candidates=generate(s);
  const captures=candidates.filter(m=>m.remove!==null);if(captures.length)candidates=captures;
  else{const opponentThreat=generate({...s,turn:1-s.turn}).some(m=>m.remove!==null);if(opponentThreat){const safe=candidates.filter(m=>!generate(apply(s,m)).some(reply=>reply.remove!==null));if(safe.length)candidates=safe}}
  const list=ordered(s,candidates,prior?.move,0),result=[];let alpha=-INF;
  for(const m of list){if(performance.now()>deadline)throw new Error('TIME');const child=apply(s,m),path=new Set([rootKey]);const score=-negamax(child,depth-1,-INF,-alpha,1,path,2);result.push({m,score});if(score>alpha)alpha=score}
  result.sort((a,b)=>b.score-a.score);return result;
}
self.onmessage=e=>{
  const {state,level,id}=e.data,s={board:state.board.map(x=>x===null?-1:x),hand:[...state.hand],turn:state.turn,noCapture:0};
  const cfg={easy:{depth:3,time:150},medium:{depth:6,time:400},hard:{depth:12,time:1000}}[level]||{depth:6,time:400};deadline=performance.now()+(e.data.time||cfg.time);nodes=0;tt=new Map();killers=[];history=new Map();age++;let result=[],completed=0;
  for(let d=1;d<=cfg.depth;d++){try{const r=rootSearch(s,d);if(r.length){result=r;completed=d;if(Math.abs(r[0].score)>WIN-100)break}}catch(err){if(err.message!=='TIME')throw err;break}}
  if(!result.length)return self.postMessage({id,move:null,nodes,depth:completed});let choice=result[0];if(level==='easy'){const pool=result.filter(x=>x.score>=result[0].score-80).slice(0,5);choice=pool[Math.floor(Math.random()*pool.length)]}
  self.postMessage({id,move:choice.m,nodes,depth:completed,score:choice.score});
};
