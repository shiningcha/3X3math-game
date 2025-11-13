// 3x3mathgame.js (module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  update,
  remove,
  get,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";

// --- Your Firebase config (you provided this) ---
const firebaseConfig = {
  apiKey: "AIzaSyAcAC53GBuchWwGChVEIouqpqUZZVVaKL4",
  authDomain: "x3-math-game.firebaseapp.com",
  databaseURL: "https://x3-math-game-default-rtdb.firebaseio.com",
  projectId: "x3-math-game",
  storageBucket: "x3-math-game.firebasestorage.app",
  messagingSenderId: "1097398631602",
  appId: "1:1097398631602:web:fb85abfa9d8dd29db3ddab",
  measurementId: "G-PQDLZZHKWX"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ======= helpers =======
function show(id) {
  document.querySelectorAll('.container>div').forEach(x=>x.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function makeRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function soloShuffle(a) {
  let arr = a.slice();
  for (let i=arr.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

// ======== STATE ========
let myId = '', myName = '', isHost = false, currentQ = 0, gameKey = '';
let soloNums = [], soloTarget = 0;

// ================= SOLO =================
function soloNewGame() {
  soloNums = soloShuffle([1,2,3,4,5,6,7,8,9]);
  let html = '';
  for(let i=0;i<9;i++) html += `<div class="cell">${soloNums[i]}</div>`;
  document.getElementById('solo-grid').innerHTML = html;

  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  const line = lines[Math.floor(Math.random()*lines.length)];
  const vals = line.map(i=>soloNums[i]);
  let target = vals[0]+vals[1]+vals[2];

  let expr, value;
  const ops = ['+','-','*','/'];
  for(let k=0;k<40;k++) {
    let [a,b,c] = vals;
    let op1 = ops[Math.floor(Math.random()*4)];
    let op2 = ops[Math.floor(Math.random()*4)];
    expr = `${a}${op1}${b}${op2}${c}`;
    try{
      value = Math.round(eval(expr) * 1000)/1000;
      if(Number.isFinite(value) && value%1===0 && value>=1 && value<=36) {
        target = value;
        break;
      }
    }catch{}
  }
  soloTarget = target;
  document.getElementById('solo-target').textContent = `목표 숫자: ${target}`;
  document.getElementById('solo-msg').textContent = '';
}

document.getElementById('btn-solo').onclick = () => {
  show('screen-solo');
  soloNewGame();
};
document.getElementById('solo-restart').onclick = soloNewGame;
document.getElementById('solo-home').onclick = ()=>show('screen-home');

document.getElementById('solo-form').onsubmit = function(e){
  e.preventDefault();
  const expr = document.getElementById('solo-input').value.trim();
  const matches = expr.match(/\d+/g);
  if(!matches || matches.length!==3) {
    document.getElementById('solo-msg').textContent = '반드시 숫자 3개만 사용하세요!';
    return;
  }
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  let nums = soloNums.slice();
  let found = false;
  const usedSet = new Set(matches.map(Number));
  for(const line of lines){
    const lineNums = line.map(i=>nums[i]);
    const lineSet = new Set(lineNums);
    if (usedSet.size === 3 &&
        lineSet.size === 3 &&
        [...usedSet].every(v => lineSet.has(v))) {
      found = true;
      break;
    }
  }
  if(!found){
    document.getElementById('solo-msg').textContent = '세 숫자가 한 줄에 있어야 합니다!';
    return;
  }
  try{
    let val = eval(expr);
    if(Math.round(val*1000)/1000 == soloTarget){
      document.getElementById('solo-msg').textContent = '정답!';
    }else{
      document.getElementById('solo-msg').textContent = '틀렸어요!';
    }
  }catch{
    document.getElementById('solo-msg').textContent = '올바른 수식이 아닙니다!';
  }
};

// ================= MULTI - UI nav =================
document.getElementById('btn-multi').onclick = () => show('screen-multi-choice');

document.getElementById('multi-choice-home').onclick = ()=>show('screen-home');
document.getElementById('multi-nick-home').onclick = ()=>show('screen-multi-choice');
document.getElementById('multi-lobby-home').onclick = async ()=>{
  if (myId && gameKey) {
    await remove(ref(db,`games/${gameKey}/players/${myId}`));
  }
  show('screen-multi-choice');
};
document.getElementById('multi-game-home').onclick = async ()=>{
  if (myId && gameKey) {
    await remove(ref(db,`games/${gameKey}/players/${myId}`));
  }
  show('screen-multi-choice');
};
document.getElementById('multi-result-home').onclick = async ()=>{
  if (myId && gameKey) {
    await remove(ref(db,`games/${gameKey}/players/${myId}`));
  }
  show('screen-multi-choice');
};

// ===== room create / join =====
document.getElementById('btn-create-room').onclick = async () => {
  let roomId = makeRoomId();
  // avoid collision
  while((await get(ref(db,`games/${roomId}`))).exists()) {
    roomId = makeRoomId();
  }
  gameKey = roomId;
  await set(ref(db,`games/${roomId}/meta`), {created: Date.now()});
  document.getElementById('room-code').textContent = roomId;

  // start database listeners for this room
  startPlayersListener();
  startStateListener();

  show('screen-multi-nick');
};

document.getElementById('btn-join-room').onclick = async () => {
  const input = prompt("방 코드 입력 (예: K94F)");
  if (!input) return;
  const roomId = input.toUpperCase().trim();
  const snap = await get(ref(db,`games/${roomId}`));
  if (snap.exists()) {
    gameKey = roomId;
    document.getElementById('room-code').textContent = roomId;

    // start listeners
    startPlayersListener();
    startStateListener();

    show('screen-multi-nick');
  } else {
    alert("해당 방이 존재하지 않습니다.");
  }
};

// ===== nick enter =====
document.getElementById('multi-nick-btn').onclick = async () => {
  const nick = document.getElementById('multi-nick').value.trim();
  if(!nick) return alert("닉네임을 입력하세요!");
  myName = nick;
  myId = 'p'+Math.random().toString(36).substring(2,10);
  const playerRef = ref(db,`games/${gameKey}/players/${myId}`);
  await set(playerRef, {
    name: myName,
    score: 0,
    joined: Date.now(),
    online: true
  });
  // remove on disconnect
  onDisconnect(playerRef).remove();

  // check state and route
  const state = (await get(ref(db,`games/${gameKey}/state`))).val();
  if(state && state.started && state.current < 10) {
    show('screen-multi-game');
    multiRenderQuestion();
  } else if(state && state.started && state.current >= 10) {
    multiShowResult();
  } else {
    show('screen-multi-lobby');
  }
  document.getElementById('multi-nick').value = '';
};

// ===== players listener & host logic =====
function startPlayersListener() {
  if (!gameKey) return;
  onValue(ref(db, `games/${gameKey}/players`), snap => {
    if (!snap.exists()) {
      // if room now empty, delete room and go to multi choice
      remove(ref(db, `games/${gameKey}`)).catch(()=>{});
      show('screen-multi-choice');
      return;
    }
    let html = '';
    let playerArr = [];
    snap.forEach(child=>{
      const v = child.val();
      playerArr.push({id: child.key, ...v});
    });

    // sort by joined time so host = earliest joiner
    playerArr.sort((a,b)=> (a.joined||0) - (b.joined||0));

    playerArr.forEach(p=>{
      html += `<div>${p.name} <span style="color:#1976d2;">${p.score||0}점</span></div>`;
    });
    document.getElementById('multi-players').innerHTML = html;

    if (playerArr.length>0 && playerArr[0].id === myId) {
      isHost = true;
      document.getElementById('multi-start-btn').style.display = '';
    } else {
      isHost = false;
      document.getElementById('multi-start-btn').style.display = 'none';
    }
  });
}

// ===== start game (host) =====
document.getElementById('multi-start-btn').onclick = async () => {
  if(!isHost) return;
  const stateSnap = await get(ref(db,`games/${gameKey}/state`));
  const stateVal = stateSnap.val();
  if(stateVal && stateVal.started) return;

  const questions = [];
  for(let i=0;i<10;i++) {
    const nums = soloShuffle([1,2,3,4,5,6,7,8,9]);
    // build grid 3x3
    let grid = [];
    for(let j=0;j<9;j+=3) grid.push(nums.slice(j,j+3));
    let q = genQuestion(nums);
    questions.push({
      grid, target:q.target, answer:q.answer, used:false
    });
  }
  await set(ref(db,`games/${gameKey}/state`), {
    started:true, current:0, winner:'', answered:false
  });
  await set(ref(db,`games/${gameKey}/questions`), questions);

  // reset all players' scores to 0
  const playersSnap = await get(ref(db,`games/${gameKey}/players`));
  playersSnap.forEach(child=>{
    update(ref(db,`games/${gameKey}/players/${child.key}`), {score:0});
  });
};

// ===== genQuestion helper =====
function genQuestion(nums) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  const line = lines[Math.floor(Math.random()*lines.length)];
  const vals = line.map(i=>nums[i]);
  let target = vals[0]+vals[1]+vals[2];
  let expr = `${vals[0]}+${vals[1]}+${vals[2]}`;
  let value;
  const ops = ['+','-','*','/'];
  for(let k=0;k<40;k++) {
    let [a,b,c] = vals;
    let op1 = ops[Math.floor(Math.random()*4)];
    let op2 = ops[Math.floor(Math.random()*4)];
    const attempt = `${a}${op1}${b}${op2}${c}`;
    try{
      value = Math.round(eval(attempt) * 1000)/1000;
      if(Number.isFinite(value) && value%1===0 && value>=1 && value<=36) {
        target = value;
        expr = attempt;
        break;
      }
    }catch{}
  }
  return {target, answer: expr};
}

// ===== state listener =====
function startStateListener() {
  if (!gameKey) return;
  onValue(ref(db, `games/${gameKey}/state`), snap => {
    const state = snap.val();
    if(!state || !state.started) return;
    currentQ = state.current || 0;
    if (currentQ >= 10) {
      multiShowResult();
      return;
    }
    show('screen-multi-game');
    multiRenderQuestion();

    if (state.answered && state.winner) {
      document.getElementById('multi-msg').textContent = `${state.winner}님이 정답을 맞췄어요!`;
      document.getElementById('multi-answer-input').disabled = true;
    } else {
      document.getElementById('multi-answer-input').disabled = false;
      document.getElementById('multi-msg').textContent = '';
    }
  });
}

// ===== render question & scoreboard =====
function multiRenderQuestion() {
  get(ref(db,`games/${gameKey}/questions/${currentQ}`)).then(snap=>{
    const q = snap.val();
    if(!q) return;
    document.getElementById('multi-qnum').textContent = currentQ+1;
    document.getElementById('multi-target-number').textContent = `목표 숫자: ${q.target}`;
    let html = '';
    q.grid.forEach(row=>{
      row.forEach(cell=>{
        html += `<div class="cell">${cell}</div>`;
      });
    });
    document.getElementById('multi-grid').innerHTML = html;
    document.getElementById('multi-answer-input').value = '';
    document.getElementById('multi-msg').textContent = '';
    document.getElementById('multi-answer-input').disabled = false;
  }).catch(()=>{});
  multiRenderScore();
}

function multiRenderScore() {
  get(ref(db,`games/${gameKey}/players`)).then(snap=>{
    if(!snap.exists()) return;
    let list = [];
    snap.forEach(child=>{
      const v = child.val();
      list.push(v);
    });
    list.sort((a,b)=> (b.score||0) - (a.score||0));
    let html = '<div>순위</div>';
    list.forEach((p,i)=>{
      html += `<div>${i+1}위 ${p.name} - ${p.score||0}점</div>`;
    });
    document.getElementById('multi-scoreboard').innerHTML = html;
  }).catch(()=>{});
}

// ===== answer submit =====
document.getElementById('multi-answer-form').onsubmit = async (e) => {
  e.preventDefault();
  const expr = document.getElementById('multi-answer-input').value.trim();
  document.getElementById('multi-answer-input').value = '';
  if(!gameKey) return;
  const st = (await get(ref(db,`games/${gameKey}/state`))).val();
  if(st && st.answered) return;

  const q = (await get(ref(db,`games/${gameKey}/questions/${currentQ}`))).val();
  if(!q) return;
  const matches = expr.match(/\d+/g);
  if(!matches || matches.length!==3) {
    document.getElementById('multi-msg').textContent = '숫자 3개를 사용해야 합니다!';
    return;
  }
  let nums = [];
  q.grid.forEach(row=>nums.push(...row));
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  let found = false;
  const usedSet = new Set(matches.map(Number));
  for(const line of lines){
    const lineNums = line.map(i=>nums[i]);
    const lineSet = new Set(lineNums);
    if (usedSet.size === 3 &&
        lineSet.size === 3 &&
        [...usedSet].every(v => lineSet.has(v))) {
      found = true;
      break;
    }
  }
  if(!found){
    document.getElementById('multi-msg').textContent = '세 숫자가 한 줄에 있어야 합니다!';
    return;
  }
  try{
    let val = eval(expr);
    if(Math.round(val*1000)/1000 == q.target){
      document.getElementById('multi-msg').textContent = '정답!';
      // increase my score
      const playerSnap = await get(ref(db,`games/${gameKey}/players/${myId}`));
      const myScore = (playerSnap.exists() ? (playerSnap.val().score||0) : 0) + 1;
      await update(ref(db,`games/${gameKey}/players/${myId}`),{score:myScore});
      await update(ref(db,`games/${gameKey}/state`),{
        winner:myName, answered:true
      });
      document.getElementById('multi-answer-input').disabled = true;

      // move to next question after short delay
      setTimeout(async ()=>{
        // move to next question index
        const st2 = (await get(ref(db,`games/${gameKey}/state`))).val();
        const nextIndex = (st2 && typeof st2.current === 'number') ? st2.current+1 : currentQ+1;
        await update(ref(db,`games/${gameKey}/state`),{
          current: nextIndex,
          winner:'', answered:false
        });
        document.getElementById('multi-answer-input').disabled = false;
        document.getElementById('multi-msg').textContent = '';
      }, 1400);
    } else {
      document.getElementById('multi-msg').textContent = '틀렸어요!';
    }
  }catch{
    document.getElementById('multi-msg').textContent = '올바른 수식이 아닙니다!';
  }
};

// ===== show result =====
function multiShowResult() {
  show('screen-multi-result');
  get(ref(db,`games/${gameKey}/players`)).then(snap=>{
    if(!snap.exists()) return;
    let list = [];
    snap.forEach(child=>{
      const v = child.val();
      list.push(v);
    });
    list.sort((a,b)=> (b.score||0) - (a.score||0));
    let html = '<div>최종 랭킹</div>';
    list.forEach((p,i)=>{
      html += `<div>${i+1}위 ${p.name} - ${p.score||0}점</div>`;
    });
    document.getElementById('multi-final-score').innerHTML = html;
  }).catch(()=>{});
}

document.getElementById('multi-restart-btn').onclick = ()=>location.reload();
document.getElementById('username-display').textContent = 'By Hyunsoo';
