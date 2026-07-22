const ADJ=[[1,9],[0,2,4],[1,14],[4,10],[1,3,5,7],[4,13],[7,11],[4,6,8],[7,12],[0,10,21],[3,9,11,18],[6,10,15],[8,13,17],[5,12,14,20],[2,13,23],[11,16],[15,17,19],[12,16],[10,19],[16,18,20,22],[13,19],[9,22],[19,21,23],[14,22]];
const MILLS=[[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
let deadline=0,nodes=0,table;
const count=(b,p)=>b.reduce((n,x)=>n+(x===p),0);
const millAt=(b,i,p)=>MILLS.some(m=>m.includes(i)&&m.every(x=>b[x]===p));
function removals(b,p){const all=b.map((x,i)=>x===p?i:-1).filter(i=>i>=0),free=all.filter(i=>!millAt(b,i,p));return free.length?free:all}
function moves(s,p){
  const out=[],targets=s.hand[p]>0?[-1]:s.board.map((x,i)=>x===p?i:-1).filter(i=>i>=0),flying=count(s.board,p)===3;
  for(const from of targets){const dest=s.hand[p]>0?s.board.map((x,i)=>x<0?i:-1).filter(i=>i>=0):(flying?s.board.map((x,i)=>x<0?i:-1).filter(i=>i>=0):ADJ[from].filter(i=>s.board[i]<0));
    for(const to of dest){const b=[...s.board];if(from>=0)b[from]=-1;b[to]=p;const base={from:from<0?null:from,to,remove:null};if(millAt(b,to,p)){for(const r of removals(b,1-p))out.push({...base,remove:r})}else out.push(base)}
  }return out;
}
function apply(s,m,p){const b=[...s.board],hand=[...s.hand];if(m.from===null)hand[p]--;else b[m.from]=-1;b[m.to]=p;if(m.remove!==null)b[m.remove]=-1;return{board:b,hand,turn:1-p}}
function millCount(b,p){return MILLS.reduce((n,m)=>n+(m.every(i=>b[i]===p)),0)}
function potential(b,p){return MILLS.reduce((n,m)=>{const own=m.filter(i=>b[i]===p).length,empty=m.filter(i=>b[i]<0).length;return n+(own===2&&empty===1)},0)}
function forks(b,p){return b.reduce((n,x,i)=>{if(x>=0)return n;const lines=MILLS.filter(m=>m.includes(i)&&m.filter(j=>b[j]===p).length===2&&m.filter(j=>b[j]<0).length===1);return n+(lines.length>1)},0)}
function mobility(s,p){if(s.hand[p]>0)return s.board.filter(x=>x<0).length;const n=count(s.board,p);if(n===3)return n*s.board.filter(x=>x<0).length;return s.board.reduce((sum,x,i)=>sum+(x===p?ADJ[i].filter(j=>s.board[j]<0).length:0),0)}
function blocked(s,p){if(s.hand[p]>0||count(s.board,p)===3)return 0;return s.board.reduce((n,x,i)=>n+(x===p&&ADJ[i].every(j=>s.board[j]>=0)),0)}
function terminal(s,root){if(s.hand[0]+s.hand[1]>0)return null;for(const p of [0,1])if(count(s.board,p)<3||moves(s,p).length===0)return p===root?-100000:100000;return null}
function evaluate(s,root){
  const end=terminal(s,root);if(end!==null)return end;const opp=1-root,placing=s.hand[0]+s.hand[1]>0;
  const material=(count(s.board,root)-count(s.board,opp))*120+(s.hand[root]-s.hand[opp])*18;
  const mills=(millCount(s.board,root)-millCount(s.board,opp))*(placing?34:52);
  const threats=(potential(s.board,root)-potential(s.board,opp))*(placing?28:20);
  const doubles=(forks(s.board,root)-forks(s.board,opp))*45;
  const block=(blocked(s,opp)-blocked(s,root))*16;
  const move=(mobility(s,root)-mobility(s,opp))*(placing?1:3);
  return material+mills+threats+doubles+block+move;
}
function key(s,depth){return s.board.map(x=>x+1).join('')+'|'+s.hand.join(',')+'|'+s.turn+'|'+depth}
function order(s,list,p){return list.sort((a,b)=>rank(s,b,p)-rank(s,a,p))}
function rank(s,m,p){let v=m.remove!==null?500:0;const next=apply(s,m,p);if(millAt(next.board,m.to,p))v+=300;v+=potential(next.board,p)*12+mobility(next,p);return v}
function search(s,depth,alpha,beta,root){
  if((++nodes&1023)===0&&performance.now()>deadline)throw new Error('TIME');const end=terminal(s,root);if(depth===0||end!==null)return end??evaluate(s,root);
  const k=key(s,depth),cached=table.get(k);if(cached!==undefined)return cached;const p=s.turn,list=order(s,moves(s,p),p);if(!list.length)return evaluate(s,root);
  let best=p===root?-Infinity:Infinity;
  for(const m of list){const value=search(apply(s,m,p),depth-1,alpha,beta,root);if(p===root){best=Math.max(best,value);alpha=Math.max(alpha,best)}else{best=Math.min(best,value);beta=Math.min(beta,best)}if(beta<=alpha)break}
  table.set(k,best);return best;
}
function rootSearch(s,depth,root){const list=order(s,moves(s,root),root),scored=[];let alpha=-Infinity;for(const m of list){const value=search(apply(s,m,root),depth-1,alpha,Infinity,root);scored.push({m,value});alpha=Math.max(alpha,value)}return scored.sort((a,b)=>b.value-a.value)}
self.onmessage=e=>{
  const {state,level}=e.data,s={board:state.board.map(x=>x===null?-1:x),hand:state.hand,turn:state.turn},root=state.turn;
  const settings={easy:{depth:2,time:250},medium:{depth:4,time:900},hard:{depth:6,time:2200}}[level]||{depth:4,time:900};deadline=performance.now()+settings.time;nodes=0;let result=[];
  for(let d=1;d<=settings.depth;d++){table=new Map();try{const next=rootSearch(s,d,root);if(next.length)result=next}catch(err){break}}
  if(!result.length)return self.postMessage({move:null,nodes});let choice=result[0];if(level==='easy'){const pool=result.filter(x=>x.value>=result[0].value-45).slice(0,4);choice=pool[Math.floor(Math.random()*pool.length)]}
  self.postMessage({move:choice.m,nodes});
};
