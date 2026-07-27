const fs=require('fs'),vm=require('vm'),path=require('path');
let response=null;const sandbox={self:{postMessage:value=>response=value},performance,console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','games','morris','ai-worker.js'),'utf8'),sandbox);
const generate=vm.runInContext('generate',sandbox),apply=vm.runInContext('apply',sandbox),millAt=vm.runInContext('millAt',sandbox);
const blank=()=>({board:Array(24).fill(-1),hand:[9,9],turn:0,noCapture:0});
function choose(state,level='hard',time=250){response=null;sandbox.self.onmessage({data:{state:{board:state.board,hand:state.hand,turn:state.turn},level,time}});if(!response?.move)throw new Error('AI did not return a move');return response}
function assert(ok,message){if(!ok)throw new Error(message)}

// Tactical: finish a mill and choose a legal capture outside a protected mill.
{
  const s=blank();s.board[0]=0;s.board[1]=0;s.board[3]=1;s.board[4]=1;s.board[5]=1;s.board[9]=1;s.hand=[7,5];
  const {move}=choose(s);assert(move.to===2,'AI missed an immediate mill');assert(move.remove===9,'AI illegally captured from a mill');
}
// Tactical: opponent threatens a mill; blocking is mandatory when no stronger capture exists.
{
  const s=blank();s.board[0]=1;s.board[1]=1;s.board[4]=0;s.board[10]=0;s.hand=[7,7];
  const {move}=choose(s,'hard',500);assert(move.to===2,'AI failed to block an immediate mill threat');
}
// Rule generation: three pieces may fly to every empty point.
{
  const s={board:Array(24).fill(-1),hand:[0,0],turn:0,noCapture:0};s.board[0]=s.board[4]=s.board[8]=0;s.board[2]=s.board[14]=s.board[23]=1;
  assert(generate(s).length===54,'Flying move count is incorrect');
}
console.log('Tactical and rule tests passed.');
