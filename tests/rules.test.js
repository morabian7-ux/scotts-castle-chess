// 규칙 테스트: 실행 방법  →  node tests/rules.test.js
// index.html 안의 규칙 코드(RULES:START ~ RULES:END)만 읽어서 검사해요. 화면 코드와 분리되어 있어요.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ===RULES:START=== \*\/([\s\S]*?)\/\* ===RULES:END=== \*\//);
if (!m) throw new Error('index.html에서 규칙 코드를 찾을 수 없어요');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.Rules = Rules;', ctx);
const R = ctx.Rules;

const results = [];
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; results.push('✅ ' + name); }
  catch (e) { fail++; results.push('❌ ' + name + '\n     → ' + e.message); }
}

// 보드 이름(예: 'e2')으로 수를 두는 도우미. 불법 수면 에러.
function play(s, from, to) {
  const ms = R.legalMoves(s, R.toIndex(from)).filter((x) => x.to === R.toIndex(to));
  if (!ms.length) throw new Error(`${from}→${to} 는 불법 수예요`);
  return R.applyMove(s, ms[0]);
}
function playAll(s, list) {
  let cur = s;
  for (const [a, b] of list) cur = play(cur, a, b);
  return cur;
}
// 빈 판에 기물 놓기: [이름, 종류, 색]
function setup(list, turn) {
  const s = R.emptyState();
  for (const [at, t, c] of list) s.board[R.toIndex(at)] = { t, c };
  s.turn = turn || 'w';
  return s;
}
const at = (s, name) => s.board[R.toIndex(name)];

// ---------- 기본 규칙 ----------
test('시작 위치에서 흰색이 둘 수 있는 수는 20개', () => {
  assert.strictEqual(R.allLegalMoves(R.startState(), 'w').length, 20);
});

test('스콜라 메이트(4수 만에 끝): 체크메이트가 되고 검은색 차례', () => {
  const s = playAll(R.startState(), [
    ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']
  ]);
  assert.strictEqual(R.status(s), 'checkmate');
  assert.strictEqual(s.turn, 'b');
});

test('바보 메이트(2수): 흰색이 체크메이트 당함', () => {
  const s = playAll(R.startState(), [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]);
  assert.strictEqual(R.status(s), 'checkmate');
  assert.strictEqual(s.turn, 'w');
});

test('스테일메이트: 체크는 아닌데 둘 수가 없으면 비김', () => {
  // 검은 왕 a8, 흰 퀸 b6, 흰 왕 c6 → 검은색이 둘 곳이 없음
  const s = setup([['a8', 'k', 'b'], ['b6', 'q', 'w'], ['c6', 'k', 'w']], 'b');
  assert.strictEqual(R.inCheck(s, 'b'), false);
  assert.strictEqual(R.status(s), 'stalemate');
});

test('체크 상태: 왕을 지키지 않는 수는 둘 수 없고, 이유가 왕 때문이라고 알려 줌', () => {
  // 검은 룩이 e8에서 흰 왕 e1을 체크. 흰 룩 a1을 a2로 옮기면 안 됨
  const s = setup([['e1', 'k', 'w'], ['a1', 'r', 'w'], ['e8', 'r', 'b'], ['a8', 'k', 'b']]);
  assert.strictEqual(R.inCheck(s, 'w'), true);
  assert.strictEqual(R.legalMoves(s, R.toIndex('a1')).length, 0);
  assert.ok(R.explainIllegal(s, R.toIndex('a1'), R.toIndex('a2')).includes('왕'));
});

test('핀(묶인 기물): 왕 뒤에 숨은 기물은 왕을 지키는 방향으로만 가능하지 않으면 못 움직임', () => {
  // 흰 나이트 e2가 검은 룩 e8과 흰 왕 e1 사이에 있음 → 나이트는 못 움직임
  const s = setup([['e1', 'k', 'w'], ['e2', 'n', 'w'], ['e8', 'r', 'b'], ['a8', 'k', 'b']]);
  assert.strictEqual(R.legalMoves(s, R.toIndex('e2')).length, 0);
});

test('상대 차례 기물은 움직일 수 없고, 이유를 알려 줌', () => {
  const s = R.startState();
  assert.ok(R.explainIllegal(s, R.toIndex('e7'), R.toIndex('e5')).includes('상대 차례'));
});

test('내 기물이 있는 칸으로는 갈 수 없음', () => {
  const s = R.startState();
  assert.ok(R.explainIllegal(s, R.toIndex('a1'), R.toIndex('a2')).includes('내 기물'));
});

test('영어로 바꾸면 이유와 기물 이름도 영어로 나오고, 다시 한국어로 돌아옴', () => {
  const s = R.startState();
  R.setLang('en');
  try {
    assert.ok(R.explainIllegal(s, R.toIndex('e7'), R.toIndex('e5')).includes("opponent's turn"));
    assert.ok(R.explainIllegal(s, R.toIndex('a1'), R.toIndex('a2')).includes('your own piece'));
    assert.ok(R.explainIllegal(s, R.toIndex('b1'), R.toIndex('b3')).includes('The knight'));
    assert.strictEqual(R.pieceName('q'), 'queen');
    assert.strictEqual(R.lessonText(R.LESSONS[0]).title, 'Pawn');
    for (const L of R.LESSONS) assert.ok(R.lessonText(L).how, `레슨 ${L.id} 영어 설명이 없어요`);
  } finally {
    R.setLang('ko');
  }
  assert.ok(R.explainIllegal(s, R.toIndex('e7'), R.toIndex('e5')).includes('상대 차례'));
  assert.strictEqual(R.lessonText(R.LESSONS[0]).title, '폰');
});

// ---------- 특수 규칙 ----------
test('캐슬링(킹 쪽): 사이가 비고 지나가는 칸이 안전하면 가능, 왕은 g1, 룩은 f1로', () => {
  const s = playAll(R.startState(), [
    ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5']
  ]);
  const castle = R.legalMoves(s, R.toIndex('e1')).find((x) => x.castle === 'K');
  assert.ok(castle, '캐슬링 수가 있어야 해요');
  const after = R.applyMove(s, castle);
  assert.strictEqual(at(after, 'g1').t, 'k');
  assert.strictEqual(at(after, 'f1').t, 'r');
  assert.strictEqual(at(after, 'e1'), null);
});

test('캐슬링 금지: 지나가는 칸(f1)이 공격받으면 캐슬링 불가', () => {
  // 검은 룩 f8이 f 파일을 따라 f1을 공격
  const s = setup([['e1', 'k', 'w'], ['h1', 'r', 'w'], ['f8', 'r', 'b'], ['a8', 'k', 'b']]);
  assert.strictEqual(R.legalMoves(s, R.toIndex('e1')).some((x) => x.castle === 'K'), false);
});

test('캐슬링 금지: 왕이 이미 체크 상태면 캐슬링 불가', () => {
  const s = setup([['e1', 'k', 'w'], ['h1', 'r', 'w'], ['e8', 'r', 'b'], ['a8', 'k', 'b']]);
  assert.strictEqual(R.legalMoves(s, R.toIndex('e1')).some((x) => x.castle), false);
});

test('앙파상: 두 칸 간 폰을 옆으로 와서 잡을 수 있고, 잡힌 폰이 사라짐', () => {
  const s = playAll(R.startState(), [
    ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']
  ]);
  const ep = R.legalMoves(s, R.toIndex('e5')).find((x) => x.ep);
  assert.ok(ep, '앙파상 수가 있어야 해요');
  const after = R.applyMove(s, ep);
  assert.strictEqual(at(after, 'd6').t, 'p');
  assert.strictEqual(at(after, 'd6').c, 'w');
  assert.strictEqual(at(after, 'd5'), null);
});

test('앙파상 기회는 바로 다음 한 수에만 있음', () => {
  const s = playAll(R.startState(), [
    ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['a2', 'a3'], ['a6', 'a5']
  ]);
  assert.strictEqual(R.legalMoves(s, R.toIndex('e5')).some((x) => x.ep), false);
});

test('폰 승진: 끝 줄에 가면 자동으로 퀸이 됨', () => {
  const s = setup([['h1', 'k', 'w'], ['e7', 'p', 'w'], ['a8', 'k', 'b']]);
  const after = play(s, 'e7', 'e8');
  assert.strictEqual(at(after, 'e8').t, 'q');
  assert.strictEqual(at(after, 'e8').c, 'w');
});

test('잡힌 기물은 captured 목록에 들어감', () => {
  const s = playAll(R.startState(), [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']]);
  assert.strictEqual(s.captured.length, 1);
  assert.strictEqual(s.captured[0].t, 'p');
});

// ---------- 컴퓨터 ----------
test('컴퓨터 초급: 운이 좋을 때(10번 중 3번)만 일부러 잡음', () => {
  // 흰 퀸 a2는 검은 룩이 잡을 수 있지만, 검은 왕은 체크가 아니라서 둘 수 있는 수가 14개
  const s = setup([['h8', 'k', 'b'], ['a8', 'r', 'b'], ['a2', 'q', 'w'], ['h1', 'k', 'w']], 'b');
  assert.strictEqual(R.inCheck(s, 'b'), false);
  assert.strictEqual(R.allLegalMoves(s, 'b').length, 14);
  // 운을 0으로 정하면 잡는 쪽을 고름
  assert.strictEqual(R.aiMove(s, 'easy', () => 0).to, R.toIndex('a2'));
  // 운을 0.5로 정하면 잡기를 건너뛰고 아무 수나 고름 (잡는 수가 아님)
  assert.notStrictEqual(R.aiMove(s, 'easy', () => 0.5).to, R.toIndex('a2'));
  // 실제로 400번 두어 보면 퀸을 잡는 건 대략 1/3 정도 (전에는 매번 잡았음)
  let caps = 0;
  for (let i = 0; i < 400; i++) if (R.aiMove(s, 'easy').to === R.toIndex('a2')) caps++;
  const rate = caps / 400;
  assert.ok(rate > 0.2 && rate < 0.5, `잡는 비율이 ${rate.toFixed(2)}예요`);
});

test('컴퓨터 보통: 두 수 앞을 보고 공짜 퀸을 잡음', () => {
  const s = setup([['h8', 'k', 'b'], ['a8', 'r', 'b'], ['a1', 'q', 'w'], ['h1', 'k', 'w']], 'b');
  assert.strictEqual(R.aiMove(s, 'normal').to, R.toIndex('a1'));
});

test('컴퓨터 보통: 한 수로 체크메이트 되는 수를 찾음 (Ra8#)', () => {
  const s = setup([['h1', 'k', 'w'], ['a1', 'r', 'w'], ['g8', 'k', 'b'], ['f7', 'p', 'b'], ['g7', 'p', 'b'], ['h7', 'p', 'b']]);
  const m = R.aiMove(s, 'normal');
  assert.strictEqual(R.status(R.applyMove(s, m)), 'checkmate');
});

test('컴퓨터 고급(세 수 앞): 공짜 퀸을 잡고, 한 수 체크메이트도 찾음', () => {
  const s = setup([['h8', 'k', 'b'], ['a8', 'r', 'b'], ['a1', 'q', 'w'], ['h1', 'k', 'w']], 'b');
  assert.strictEqual(R.aiMove(s, 'hard').to, R.toIndex('a1'));
  const mate = setup([['h1', 'k', 'w'], ['a1', 'r', 'w'], ['g8', 'k', 'b'], ['f7', 'p', 'b'], ['g7', 'p', 'b'], ['h7', 'p', 'b']]);
  assert.strictEqual(R.status(R.applyMove(mate, R.aiMove(mate, 'hard'))), 'checkmate');
});

test('컴퓨터 초급/중급/고급이 돌려주는 수는 모두 합법 수', () => {
  const s = R.startState();
  const legal = R.allLegalMoves(s, 'w');
  for (const level of ['easy', 'normal', 'hard']) {
    const m = R.aiMove(s, level);
    assert.ok(legal.some((x) => x.from === m.from && x.to === m.to), level + ' 수가 불법이에요');
  }
});

test('힌트(bestMove)는 합법 수', () => {
  const s = playAll(R.startState(), [['e2', 'e4'], ['d7', 'd5']]);
  const h = R.bestMove(s, 2);
  assert.ok(R.legalMoves(s, h.from).some((x) => x.to === h.to));
});

// ---------- 배우기 레슨 ----------
function solvable(L) {
  const key = (s) => s.board.map((p) => (p ? p.t + p.c : '.')).join(',');
  const start = R.lessonState(L);
  const seen = new Set([key(start)]);
  const queue = [start];
  while (queue.length) {
    const s = queue.shift();
    if (R.starsLeft(s) === 0) return true;
    for (const mv of R.allLegalMoves(s, 'w')) {
      const ns = R.applyMove(s, mv);
      const k = key(ns);
      if (!seen.has(k)) { seen.add(k); queue.push(ns); }
    }
  }
  return false;
}
for (const L of R.LESSONS.filter((x) => !x.mate)) {
  test(`레슨 ${L.id} (${L.title}): 별을 모두 먹을 수 있음`, () => {
    assert.ok(solvable(L), '별을 모두 먹는 길이 없어요');
  });
}
test('레슨 7 (체크메이트): 흰색이 한 수로 체크메이트 할 수 있음', () => {
  const L = R.LESSONS.find((x) => x.mate);
  const s = R.lessonState(L);
  assert.strictEqual(R.status(s), 'playing');
  const win = R.allLegalMoves(s, 'w').some((mv) => R.status(R.applyMove(s, mv)) === 'checkmate');
  assert.ok(win, '체크메이트 수가 없어요');
});

// ---------- 결과 ----------
console.log(results.join('\n'));
console.log(`\n통과 ${pass}개 / 실패 ${fail}개`);
if (fail > 0) process.exitCode = 1;
