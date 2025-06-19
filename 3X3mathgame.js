import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, remove, get } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";

// ===== 화면 전환 =====
function show(id) {
  document.querySelectorAll('.container>div').forEach(x=>x.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== 방코드 생성 =====
function makeRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyAcAC53GBuchWwGChVEIouqpqUZZVVaKL4",
  authDomain: "x3-math-game.firebaseapp.com",
  projectId: "x3-math-game",
  storageBucket: "x3-math-game.appspot.com",
  messagingSenderId: "1097398631602",
  appId: "1:1097398631602:web:fb85abfa9d8dd29db3ddab",
  measurementId: "G-PQDLZZHKWX"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ===== 전역 =====
let myId = '', myName = '', isHost = false, currentQ = 0, gameKey = '';

// ===== 홈 화면 =====
document.getElementById('btn-create-room').onclick = async () => {
  let roomId = makeRoomId();
  while((await get(ref(db,`games/${roomId}`))).exists())
    roomId = makeRoomId();
  gameKey = roomId;
  await set(ref(db,`games/${roomId}/meta`), {created: Date.now()});
  document.getElementById('room-code').textContent = roomId;
  show('screen-multi-nick');
};

document.getElementById('btn-join-room').onclick = async () => {
  const input = prompt("방 코드 입력 (예: K94F)").toUpperCase();
  if (!input) return;
  const roomId = input.trim();
  const snap = await get(ref(db,`games/${roomId}`));
  if (snap.exists()) {
    gameKey = roomId;
    document.getElementById('room-code').textContent = roomId;
    show('screen-multi-nick');
  } else {
    alert("해당 방이 존재하지 않습니다.");
  }
};

document.getElementById('multi-clear-btn').onclick = async () => {
  if (confirm('정말 모든 방을 초기화할까요?')) {
    await remove(ref(db,`games`));
    alert('초기화 완료!');
    show('screen-home');
  }
};

// ===== 닉네임 입력/입장 =====
document.getElementById('multi-nick-btn').onclick = async () => {
  const nick = document.getElementById('multi-nick').value.trim();
  if(!nick) return alert("닉네임을 입력하세요!");
  myName = nick;
  myId = 'p'+Math.random().toString(36).substring(2,10);
  await set(ref(db,`games/${gameKey}/players/${myId}`), {
    name: myName,
    score: 0,
    joined: Date.now(),
    online: true
  });
  // onDisconnect로 자동삭제 예약!
  ref(db,`games/${gameKey}/players/${myId}`).onDisconnect().remove();

  // 게임상태에 따라 진입화면 다르게
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

document.querySelectorAll('#multi-home').forEach(btn=>{
  btn.onclick = ()=>{
    if (myId && gameKey)
      remove(ref(db,`games/${gameKey}/players/${myId}`)); // 즉시 삭제
    show('screen-home');
  };
});

// ===== 대기실 참가자 =====
onValue(ref(db,()=>gameKey?`games/${gameKey}/players`:null), snap=>{
  if (!gameKey) return;
  let html = '';
  let playerArr = [];
  snap.forEach(child=>{
    const v = child.val();
    playerArr.push({id:child.key, ...v});
    html += `<div>${v.name} <span style="color:#1976d2;">${v.score}점</span></div>`;
  });
  document.getElementById('multi-players').innerHTML = html;
  if(playerArr.length>0 && playerArr[0].id===myId) {
    isHost = true;
    document.getElementById('multi-start-btn').style.display = '';
  } else {
    isHost = false;
    document.getElementById('multi-start-btn').style.display = 'none';
  }
  // 자동 방 삭제: players가 0명이면 방 전체 삭제
  if (!snap.exists() || snap.size === 0) {
    remove(ref(db,`games/${gameKey}`));
    show('screen-home');
  }
});

// ===== 게임시작 =====
document.getElementById('multi-start-btn').onclick = async () => {
  const state = (await get(ref(db,`games/${gameKey}/state`))).val();
  if(state && state.started) return;
  const questions = [];
  for(let i=0;i<10;i++) {
    const nums = soloShuffle([1,2,3,4,5,6,7,8,9]);
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
  get(ref(db,`games/${gameKey}/players`)).then(snap=>{
    snap.forEach(child=>{
      update(ref(db,`games/${gameKey}/players/${child.key}`), {score:0});
    });
  });
};
function soloShuffle(a) {
  let arr = a.slice();
  for (let i=arr.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}
function genQuestion(nums) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]
  ];
  const line = lines[Math.floor(Math.random()*lines.length)];
  const vals = line.map(i=>nums[i]);
  let target = vals[0]+vals[1]+vals[2];
  let expr, value;
  let ops = ['+','-','*','/'];
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
  return {target, answer:expr};
}

// ===== 게임진행 감시 =====
onValue(ref(db,()=>gameKey?`games/${gameKey}/state`:null), snap=>{
  if(!gameKey) return;
  const state = snap.val();
  if(!state || !state.started) return;
  currentQ = state.current;
  if(currentQ>=10) {
    multiShowResult();
    return;
  }
  show('screen-multi-game');
  multiRenderQuestion();

  if(state.answered && state.winner){
    document.getElementById('multi-msg').textContent = `${state.winner}님이 정답을 맞췄어요!`;
    document.getElementById('multi-answer-input').disabled = true;
  } else {
    document.getElementById('multi-answer-input').disabled = false;
    document.getElementById('multi-msg').textContent = '';
  }
});

// ===== 문제 표시 =====
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
  });
  multiRenderScore();
}
// ===== 점수판 =====
function multiRenderScore() {
  get(ref(db,`games/${gameKey}/players`)).then(snap=>{
    let list = [];
    snap.forEach(child=>{
      list.push(child.val());
    });
    list.sort((a,b)=>b.score-a.score);
    let html = '<div>순위</div>';
    list.forEach((p,i)=>{
      html += `<div>${i+1}위 ${p.name} - ${p.score}점</div>`;
    });
    document.getElementById('multi-scoreboard').innerHTML = html;
  });
}

// ===== 정답 입력 =====
document.getElementById('multi-answer-form').onsubmit = async (e) => {
  e.preventDefault();
  const expr = document.getElementById('multi-answer-input').value.trim();
  document.getElementById('multi-answer-input').value = '';
  const st = (await get(ref(db,`games/${gameKey}/state`))).val();
  if(st.answered) return;

  const q = (await get(ref(db,`games/${gameKey}/questions/${currentQ}`))).val();
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
      let myScore = 1;
      get(ref(db,`games/${gameKey}/players/${myId}`)).then(snap=>{
        myScore = (snap.val().score||0)+1;
        update(ref(db,`games/${gameKey}/players/${myId}`),{score:myScore});
      });
      await update(ref(db,`games/${gameKey}/state`),{
        winner:myName, answered:true
      });
      document.getElementById('multi-answer-input').disabled = true;
      setTimeout(()=>{
        update(ref(db,`games/${gameKey}/state`),{
          current:currentQ+1, winner:'', answered:false
        });
        document.getElementById('multi-answer-input').disabled = false;
        document.getElementById('multi-msg').textContent = '';
      }, 1500);
    } else {
      document.getElementById('multi-msg').textContent = '틀렸어요!';
    }
  }catch{
    document.getElementById('multi-msg').textContent = '올바른 수식이 아닙니다!';
  }
};
// ===== 결과 =====
function multiShowResult() {
  show('screen-multi-result');
  get(ref(db,`games/${gameKey}/players`)).then(snap=>{
    let list = [];
    snap.forEach(child=>{
      list.push(child.val());
    });
    list.sort((a,b)=>b.score-a.score);
    let html = '<div>최종 랭킹</div>';
    list.forEach((p,i)=>{
      html += `<div>${i+1}위 ${p.name} - ${p.score}점</div>`;
    });
    document.getElementById('multi-final-score').innerHTML = html;
  });
}
document.getElementById('multi-restart-btn').onclick = ()=>location.reload();
