const fs=require('fs'),vm=require('vm'),path=require('path');
let response=null;
const box={self:{postMessage:value=>response=value},performance,console};
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','games','connect-four','ai-worker.js'),'utf8'),box);
const winning=vm.runInContext('winning',box),rowFor=vm.runInContext('rowFor',box);
const empty=()=>Array(42).fill(-1);
function assert(ok,message){if(!ok)throw new Error(message)}

{
  const board=empty();[35,36,37,38].forEach(i=>board[i]=0);
  assert(winning(board,0),'Horizontal win was not detected');
}
{
  const board=empty();[14,21,28,35].forEach(i=>board[i]=1);
  assert(winning(board,1),'Vertical win was not detected');
}
{
  const board=empty();[35,29,23,17].forEach(i=>board[i]=0);
  assert(winning(board,0),'Diagonal win was not detected');
}
{
  const board=empty();for(let row=0;row<6;row++)board[row*7+2]=row%2;
  assert(rowFor(board,2)===-1,'Full column accepted another piece');
}
{
  const board=empty();board[35]=board[36]=board[37]=0;
  box.self.onmessage({data:{id:1,board,turn:0,level:'hard'}});
  assert(response.col===3,'AI missed an immediate winning move');
}
{
  const board=empty();board[35]=board[36]=board[37]=1;
  box.self.onmessage({data:{id:2,board,turn:0,level:'hard'}});
  assert(response.col===3,'AI failed to block an immediate loss');
}
{
  const board=empty(),before=[...board];
  box.self.onmessage({data:{id:3,board,turn:0,level:'hard'}});
  assert(response.col===3,'Hard AI did not prefer the center opening');
  assert(board.every((value,index)=>value===before[index]),'AI search corrupted the input board after timeout');
}
console.log('Connect Four rules and AI tests passed.');
