import{initializeApp}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import{getAuth,signInAnonymously}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import{getDatabase,ref,onValue,runTransaction,update,remove,onDisconnect,serverTimestamp}from'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';
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
  constructor(roomRef,uid,role,callbacks,unsubscribe){
    this.roomRef=roomRef;this.uid=uid;this.role=role;this.callbacks=callbacks;this.unsubscribe=unsubscribe;this.ready=true;this.closed=false;
  }
  async sendState(state){if(this.ready)await update(this.roomRef,{state,lastWriter:this.uid,updatedAt:serverTimestamp()})}
  close(){if(this.closed)return;this.closed=true;this.ready=false;this.unsubscribe?.();remove(this.roomRef).catch(()=>{})}
}
async function create(code,callbacks){
  callbacks.onStatus?.('正在连接 Firebase…');const current=await user(),roomRef=ref(database,`rooms/${code}`);
  const result=await runTransaction(roomRef,value=>value===null?{hostUid:current.uid,status:'waiting',createdAt:Date.now()}:undefined,{applyLocally:false});
  if(!result.committed)throw coded('ROOM_EXISTS','房间码冲突，请重新创建');
  let session,started=false;
  const unsubscribe=onValue(roomRef,snapshot=>{
    const room=snapshot.val();if(!room){if(started)callbacks.onClose?.();return}
    if(room.guestUid&&!started){started=true;callbacks.onStatus?.('好友已加入，对局开始');callbacks.onReady?.(0)}
    if(room.state&&room.lastWriter!==current.uid)callbacks.onState?.(room.state);
  },error=>callbacks.onStatus?.('同步失败：'+error.message));
  session=new Room(roomRef,current.uid,'host',callbacks,unsubscribe);onDisconnect(roomRef).remove();
  callbacks.onStatus?.('房间已创建，等待好友加入…');return session;
}
async function join(code,callbacks){
  callbacks.onStatus?.('正在查找房间…');const current=await user(),roomRef=ref(database,`rooms/${code}`);
  const result=await runTransaction(roomRef,value=>{
    if(value===null||value.guestUid)return;
    return{...value,guestUid:current.uid,status:'playing'};
  },{applyLocally:false});
  if(!result.committed)throw coded(result.snapshot.exists()?'ROOM_FULL':'ROOM_NOT_FOUND',result.snapshot.exists()?'房间已有两位玩家':'找不到该房间');
  const room=result.snapshot.val();if(room.state)callbacks.onState?.(room.state);
  const unsubscribe=onValue(roomRef,snapshot=>{
    const value=snapshot.val();if(!value){callbacks.onClose?.();return}
    if(value.state&&value.lastWriter!==current.uid)callbacks.onState?.(value.state);
  },error=>callbacks.onStatus?.('同步失败：'+error.message));
  const session=new Room(roomRef,current.uid,'guest',callbacks,unsubscribe);onDisconnect(roomRef).remove();
  callbacks.onStatus?.('连接成功，对局开始');callbacks.onReady?.(1);return session;
}
window.OnlineMorris={create,join,configured};
window.dispatchEvent(new Event('online-morris-ready'));
