const fs=require('fs'),vm=require('vm'),path=require('path');
let response=null;
const box={self:{postMessage:value=>response=value},performance,console};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','games','othello','ai-worker.js'),'utf8'),box);
const flipsFor=vm.runInContext('flipsFor',box),legalMoves=vm.runInContext('legalMoves',box),applyMove=vm.runInContext('applyMove',box);
function assert(ok,message){if(!ok)throw new Error(message)}
const initial=()=>{const board=Array(64).fill(-1);board[27]=1;board[28]=0;board[35]=0;board[36]=1;return board};

{
  const board=initial(),moves=legalMoves(board,0).sort((a,b)=>a-b);
  assert(JSON.stringify(moves)==='[19,26,37,44]','Initial legal moves are incorrect');
}
{
  const board=initial(),flips=flipsFor(board,19,0);
  assert(flips.length===1&&flips[0]===27,'A basic vertical flip is incorrect');
  const next=applyMove(board,19,0);
  assert(next[19]===0&&next[27]===0,'Move application did not flip the captured piece');
}
{
  const board=Array(64).fill(-1);board[0]=0;board[1]=1;board[2]=1;
  assert(JSON.stringify(flipsFor(board,3,0))==='[2,1]','Horizontal edge capture is incorrect');
}
{
  const board=initial();
  box.self.onmessage({data:{id:1,board,turn:0,level:'medium'}});
  assert(legalMoves(board,0).includes(response.index),'AI returned an illegal opening move');
}
console.log('Othello rules and AI tests passed.');
