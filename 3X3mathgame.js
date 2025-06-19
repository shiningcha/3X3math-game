import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove, get } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-database.js";

// ===== 화면 전환 =====
function show(id) {
  document.querySelectorAll('.container>div').forEach(x=>x.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// ===== HOME =====
document.getElementById('btn-solo').onclick = () => {
  show('screen-solo');
  soloNewGame();
};
document.getElementById('btn-multi').onclick = () => {
  show('screen-multi-nick');
  document.getElementById('multi-nick').value = '';
};
document.getElementById('multi-clear-btn').onclick = async () => {
  if (confirm('정말 순위 및 참가자를 모두 초기화할까요?')) {
    await remove(ref(db,`games/${gameKey}`));
    alert('모든 참가자와 점수가 초기화되었습니다!');
    show('screen-home');
  }
};

// ===== 솔로 모드 =====
let soloNums = [], soloTarget = 0;
function soloShuffle(a) {
  let arr = a.slice();
  for (let i=arr.length-1;i>0;i--) {
    const j = Math.floor(Math.random() * (i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}
function soloNewGame() {
  soloNums = soloShuffle([1,2,3,4,5,6,7,8,9]);
  let html = '';
  for(let i=0;i<9;i++) html += `<div class="cell">${soloNums[i]}</div>`;
  document.getElementById('solo-grid').innerHTML = html;
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],   // 가로
    [0,3,6],[1,4,7],[2,5,8],   // 세로
    [0,4,8],[2,4,6]            // 대각선
  ];
  const line = lines[Math.floor(Math.random()*lines.length)];
  const vals = line.map(i=>soloNums[i]);
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
  soloTarget = target;
  document.getElementById('solo-target').textContent = `목표 숫자: ${target}`;
  document.getElementById('solo-msg').textContent = '';
}
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
  let nums = soloNums.slice(); // 1차원 9칸
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
document.getElementById('solo-restart').onclick = soloNewGame;
document.getElementById('solo-home').onclick = ()=>show('screen-home');

// ===== 멀티 모드 =====
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

let myId = '', myName = '', isHost = false, currentQ = 0, gameKey = 'default';

// 1. 닉네임 입력
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

  // 🔥 게임이 이미 시작된 경우, 바로 게임화면으로 진입!
  const state = (await get(ref(db,`games/${gameKey}/state`))).val();
  if(state && state.started && state.current < 10) {
    show('screen-multi-game');
    multiRenderQuestion();
  } else if(state && state.started && state.current >= 10) {
    multiShowResult();
  } else {
    show('screen-multi-lobby');
  }
};
document.querySelectorAll('#multi-home').forEach(btn=>{
  btn.onclick = ()=>show('screen-home');
});

// 2. 대기실 참가자 모니터링 + 방장
onValue(ref(db,`games/${gameKey}/players`), snap=>{
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
});

// 3. 게임 시작
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

// 4. 게임 진행 감시
onValue(ref(db,`games/${gameKey}/state`), snap=>{
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

// 문제 표시
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
// 점수판
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

// 정답 입력(항상 활성화)
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
  // 🔥 nums는 반드시 1차원 9칸 [0]~[8]
  let nums = [];
  q.grid.forEach(row=>nums.push(...row));
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],   // 가로
    [0,3,6],[1,4,7],[2,5,8],   // 세로
    [0,4,8],[2,4,6]            // 대각선
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
// 결과 표시
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
