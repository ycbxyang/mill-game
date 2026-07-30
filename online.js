import{initializeApp}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import{getAuth,signInAnonymously}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import{getDatabase,ref,child,get,onValue,onDisconnect,runTransaction,update,remove}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
import{firebaseConfig}from'./firebase-config.js';

let app,auth,database,userPromise;
const configured=()=>Boolean(firebaseConfig.apiKey&&firebaseConfig.authDomain&&firebaseConfig.databaseURL&&firebaseConfig.projectId&&firebaseConfig.appId);
const coded=(code,message=code)=>Object.assign(new Error(message),{code});
async function user(){
  if(!configured())throw coded('CONFIG_MISSING','Firebase 尚未配置');
  if(!app){app=initializeApp(firebaseConfig);auth=getAuth(app);database=getDatabase(app)}
  if(!userPromise)userPromise=signInAnonymously(auth).then(result=>result.user).catch(error=>{userPromise=null;throw error});
  return userPromise;
}

class Room{
  constructor(roomRef,uid,role,callbacks){
    this.roomRef=roomRef;this.uid=uid;this.role=role;this.callbacks=callbacks;
    this.unsubscribe=null;this.disconnect=null;this.revision=0;this.ready=true;this.closed=false;
    this.handledRestart=new Set();
  }
  async armDisconnect(){this.disconnect=onDisconnect(this.roomRef);await this.disconnect.remove()}
  observe(room){
    this.revision=Number.isInteger(room.revision)?room.revision:0;
    if(room.state&&room.lastWriter!==this.uid)this.callbacks.onState?.(room.state,{revision:this.revision});
    const restart=room.restart;
    if(!restart?.id)return;
    const marker=`${restart.id}:${restart.status}`;
    if(this.handledRestart.has(marker))return;
    if(restart.requestedBy!==this.uid&&restart.status==='pending'){
      this.handledRestart.add(marker);
      this.callbacks.onRestartRequest?.({
        accept:()=>this.respondRestart(restart.id,true),
        reject:()=>this.respondRestart(restart.id,false)
      });
    }else if(restart.requestedBy===this.uid&&restart.status==='accepted'){
      this.handledRestart.add(marker);this.callbacks.onRestartAccepted?.();
    }else if(restart.requestedBy===this.uid&&restart.status==='rejected'){
      this.handledRestart.add(marker);this.callbacks.onRestartRejected?.();
    }
  }
  async sendState(state){
    if(!this.ready)return false;
    const expected=this.revision;
    try{
      const result=await runTransaction(this.roomRef,room=>{
        if(!room||(Number.isInteger(room.revision)?room.revision:0)!==expected)return;
        return{...room,state,lastWriter:this.uid,revision:expected+1,updatedAt:Date.now()};
      },{applyLocally:false});
      const room=result.snapshot.val();
      if(result.committed){this.revision=expected+1;return true}
      if(room){
        this.revision=Number.isInteger(room.revision)?room.revision:0;
        if(room.state)this.callbacks.onState?.(room.state,{revision:this.revision});
      }
      this.callbacks.onStatus?.('状态已在另一台设备更新，已恢复服务器上的最新棋局');
      return false;
    }catch(error){
      this.callbacks.onStatus?.('同步失败：'+error.message);
      return false;
    }
  }
  async requestRestart(){
    if(!this.ready)return false;
    const request={
      id:`${this.uid}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      requestedBy:this.uid,status:'pending',createdAt:Date.now()
    };
    try{
      await update(this.roomRef,{restart:request,updatedAt:Date.now()});
      return true;
    }catch(error){
      this.callbacks.onStatus?.('重开请求失败：'+error.message);
      return false;
    }
  }
  async respondRestart(id,accepted){
    const restartRef=child(this.roomRef,'restart');
    try{
      await runTransaction(
        restartRef,
        value=>value?.id===id&&value.status==='pending'
          ?{...value,status:accepted?'accepted':'rejected',respondedAt:Date.now()}
          :undefined,
        {applyLocally:false}
      );
    }catch(error){
      this.callbacks.onStatus?.('重开回应失败：'+error.message);
    }
  }
  async close(){
    if(this.closed)return;
    this.closed=true;this.ready=false;this.unsubscribe?.();
    try{await this.disconnect?.cancel()}catch{}
    try{await remove(this.roomRef)}catch{}
  }
}

function watch(session,callbacks,{host=false}={}){
  let started=!host;
  session.unsubscribe=onValue(session.roomRef,snapshot=>{
    const room=snapshot.val();
    if(!room){if(started)callbacks.onClose?.();return}
    if(host&&room.guestUid&&!started){
      started=true;
      callbacks.onStatus?.('好友已加入，对局开始');
      callbacks.onReady?.(0);
    }
    session.observe(room);
  },error=>callbacks.onStatus?.('同步失败：'+error.message));
}

async function create(code,callbacks,options={}){
  callbacks.onStatus?.('正在连接 Firebase…');
  const current=await user(),roomRef=ref(database,`rooms/${code}`);
  const result=await runTransaction(roomRef,value=>value===null?{
    hostUid:current.uid,gameId:options.gameId||'morris',rulesVersion:options.rulesVersion||1,
    status:'waiting',revision:0,createdAt:Date.now(),updatedAt:Date.now()
  }:undefined,{applyLocally:false});
  if(!result.committed)throw coded('ROOM_EXISTS','房间码冲突，请重新创建');
  const session=new Room(roomRef,current.uid,'host',callbacks);
  await session.armDisconnect();
  watch(session,callbacks,{host:true});
  callbacks.onStatus?.('房间已创建，等待好友加入…');
  return session;
}

async function join(code,callbacks,options={}){
  callbacks.onStatus?.('正在查找房间…');
  const current=await user(),roomRef=ref(database,`rooms/${code}`);
  let roomSnapshot;
  for(let attempt=0;attempt<6;attempt++){
    roomSnapshot=await get(roomRef);
    if(roomSnapshot.exists())break;
    callbacks.onStatus?.('房间正在建立，自动重试…');
    await new Promise(resolve=>setTimeout(resolve,600));
  }
  if(!roomSnapshot?.exists())throw coded('ROOM_NOT_FOUND','找不到该房间');
  const room=roomSnapshot.val();
  if(options.gameId&&room.gameId&&room.gameId!==options.gameId)throw coded('GAME_MISMATCH','该房间属于另一款游戏');
  if(options.rulesVersion&&room.rulesVersion&&room.rulesVersion!==options.rulesVersion)throw coded('VERSION_MISMATCH','双方游戏版本不一致，请刷新网页');
  if(room.guestUid)throw coded('ROOM_FULL','房间已有两位玩家');
  const guestRef=child(roomRef,'guestUid');
  const result=await runTransaction(guestRef,value=>value===null?current.uid:undefined,{applyLocally:false});
  if(!result.committed)throw coded('ROOM_FULL','房间已有两位玩家');
  await update(roomRef,{status:'playing',updatedAt:Date.now()});
  const session=new Room(roomRef,current.uid,'guest',callbacks);
  session.revision=Number.isInteger(room.revision)?room.revision:0;
  await session.armDisconnect();
  watch(session,callbacks);
  callbacks.onStatus?.('连接成功，对局开始');
  callbacks.onReady?.(1);
  return session;
}

window.OnlineMorris={create,join,configured};
window.dispatchEvent(new Event('online-morris-ready'));
