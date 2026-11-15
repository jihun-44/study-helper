// index.html, study.html이 둘 다 이 파일을 쓴다.
// 어느 페이지인지는 화면에 있는 요소(id)로 구분한다.

// JSON 파일을 읽어오는 함수 (fetch는 서버 통해서만 동작 → python -m http.server 필요)
async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(path + " 을(를) 불러오지 못했어요 (" + res.status + ")");
  return res.json();
}

// 태그 만들기 도우미. textContent를 쓰면 JSON 글자가 HTML로 해석되지 않아 안전하다.
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ---------- 1단계: 메인 화면 (학교 → 과목 → 단원) ----------
async function initHome() {
  const tabs = document.getElementById("schools");
  const tags = document.getElementById("tags");
  const list = document.getElementById("list");
  const form = document.getElementById("search");
  const input = document.getElementById("q");

  try {
    const { schools } = await loadJSON("data/list.json");

    // 지난번에 고른 학교를 기억해뒀다가 다시 보여준다 (저장이 막힌 브라우저면 그냥 첫 학교)
    let saved = null;
    try { saved = localStorage.getItem("school"); } catch (e) {}
    let current = schools.find((s) => s.id === saved) || schools[0];
    let tag = null; // 눌러 둔 #과목 (없으면 전체 과목)

    // 학교 버튼은 한 번만 만든다 (다시 만들면 키보드 포커스가 사라지기 때문)
    const buttons = schools.map((s) => {
      const b = el("button", "school", s.name);
      b.type = "button";
      b.onclick = () => {
        current = s;
        tag = null;
        try { localStorage.setItem("school", s.id); } catch (e) {}
        renderTags();
        render();
      };
      return b;
    });
    tabs.replaceChildren(...buttons);

    // 선택한 학교의 과목 이름으로 #해시태그 버튼을 만든다. 다시 누르면 해제.
    function renderTags() {
      tags.replaceChildren(...current.subjects.map((sub) => {
        const b = el("button", "tag", "#" + sub.name);
        b.type = "button";
        b.dataset.name = sub.name;
        b.setAttribute("aria-pressed", "false");
        b.onclick = () => {
          tag = tag === sub.name ? null : sub.name;
          tags.querySelectorAll(".tag").forEach((t) => t.setAttribute("aria-pressed", t.dataset.name === tag));
          render();
        };
        return b;
      }));
    }

    // 학교 + 과목태그 + 검색어로 걸러서 단원 카드를 그린다
    function render() {
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", schools[i] === current));
      const q = input.value.trim().toLowerCase();

      const cards = current.subjects
        .filter((sub) => !tag || sub.name === tag)
        .flatMap((sub) => sub.units
          .filter((u) => u.title.toLowerCase().includes(q))
          .map((u) => {
            // 단원 카드: 제목 아래에 "공부하기"(요약 페이지)와 "퀴즈 풀기"(퀴즈 페이지) 버튼을 따로 둔다
            const id = encodeURIComponent(u.id); // 예: jungang/science-photosynthesis
            const card = el("div", "unit");
            const study = el("a", "mini", "공부하기");
            study.href = "study.html?id=" + id;
            const quiz = el("a", "mini fill", "퀴즈 풀기");
            quiz.href = "quiz.html?id=" + id;
            const actions = el("div", "unit-actions");
            actions.append(study, quiz);
            card.append(el("span", "chip", sub.name), el("span", "unit-title", u.title), actions);
            return card;
          }));

      if (cards.length === 0) {
        const msg = current.subjects.length === 0 ? "아직 올라온 자료가 없어요." : "찾는 단원이 없어요. 검색어를 바꿔 보세요.";
        list.replaceChildren(el("p", "empty", msg));
        return;
      }
      list.replaceChildren(...cards);
    }

    form.onsubmit = (e) => e.preventDefault(); // 엔터를 쳐도 페이지가 새로고침되지 않게
    input.oninput = render;                    // 글자를 칠 때마다 바로 걸러줌
    renderTags();
    render();
  } catch (err) {
    list.replaceChildren(el("p", "empty", "목록을 불러오지 못했어요. 서버(python -m http.server)로 열었는지 확인해 주세요."));
  }
}

// ---------- 2단계: 공부 페이지(요약)와 퀴즈 페이지가 같이 쓰는 데이터 읽기 ----------
// 주소의 ?id=학교폴더/단원파일명 → data/학교폴더/단원파일명.json
// 성공하면 { id, data }를 돌려주고, 실패하면 msgBox에 안내를 띄우고 null을 돌려준다.
async function loadUnit(msgBox) {
  const title = document.getElementById("title");
  const id = new URLSearchParams(location.search).get("id") || "";
  // 영문/숫자/-/_ 만 허용 (이상한 경로로 다른 파일을 읽지 못하게)
  if (!/^[\w-]+\/[\w-]+$/.test(id)) {
    title.textContent = "단원을 찾을 수 없어요";
    msgBox.textContent = "목록에서 단원을 다시 골라 주세요.";
    return null;
  }
  try {
    const data = await loadJSON("data/" + id + ".json");
    document.title = data.subject + " - 토토로";
    title.textContent = data.subject;
    return { id, data };
  } catch (err) {
    title.textContent = "단원을 불러오지 못했어요";
    msgBox.textContent = "파일 이름이 맞는지, 서버로 열었는지 확인해 주세요.";
    return null;
  }
}

// ----- 요약을 그리는 도우미들 -----
// 요약(summary)은 그냥 글(문자열)이거나, 아래 "블록"들의 배열이다. 블록 종류:
//   h(큰 제목) h2(작은 제목) p(문단) list(목록) table(표) quote(사료 글) tip(교과서 보충 상자) image(사진)
// 글 속의 [[정답]]은 형광펜(<mark>)으로 보여준다. innerHTML을 쓰지 않아서 JSON 글자가 HTML로 해석되지 않는다.
function rich(parent, text) {
  // split 결과는 [글, 정답, 글, 정답, ...] 순서라서 홀수 번째가 [[정답]] 부분이다
  String(text).split(/\[\[(.+?)\]\]/).forEach((part, i) => {
    if (i % 2) parent.append(el("mark", "fill", part));
    else if (part) parent.append(part);
  });
  return parent;
}

// 목록: 문자열 항목 바로 뒤에 오는 배열(또는 {style, items} 객체)은 그 항목의 하위 목록
function makeList(items, style) {
  const ul = el("ul", style === "plain" ? "plain" : "");
  let li = null;
  items.forEach((it) => {
    if (typeof it === "string") {
      li = rich(el("li"), it);
      ul.append(li);
    } else {
      const sub = Array.isArray(it) ? { style, items: it } : it;
      if (!li) { li = el("li"); ul.append(li); }
      li.append(makeList(sub.items, sub.style || "bullet"));
    }
  });
  return ul;
}

function makeTable(b) {
  const table = el("table");
  const cols = b.head ? b.head.length : b.rows[0].length;
  if (cols >= 3) table.className = "wide"; // 칸이 3개 이상이면 폰에서 옆으로 밀어서 보게 함 (글자가 세로로 쪼개지지 않게)
  if (b.caption) table.append(rich(el("caption"), b.caption));
  if (b.head) {
    const tr = el("tr");
    b.head.forEach((h) => { const th = rich(el("th"), h); th.scope = "col"; tr.append(th); });
    const thead = el("thead");
    thead.append(tr);
    table.append(thead);
  }
  const tbody = el("tbody");
  b.rows.forEach((row) => {
    const tr = el("tr");
    row.forEach((cell, i) => {
      const isHead = b.rowHead && i === 0; // rowHead:true 이면 첫 칸이 행 제목
      const c = rich(el(isHead ? "th" : "td"), cell);
      if (isHead) {
        c.scope = "row";
        if (cell.length > 9) c.className = "long"; // 긴 행 제목은 줄바꿈 허용
      }
      tr.append(c);
    });
    tbody.append(tr);
  });
  table.append(tbody);
  const wrap = el("div", "table-wrap");
  wrap.append(table);
  return wrap;
}

function makeImage(b) {
  const fig = el("figure");
  const img = el("img");
  if (/^(https:\/\/|data\/)/.test(b.src)) img.src = b.src; // 다른 주소(javascript: 등)는 거부
  img.alt = b.alt || "";
  img.loading = "lazy";
  img.onerror = () => fig.remove(); // 사진을 못 불러오면 칸째 숨김
  fig.append(img, rich(el("figcaption"), b.caption || ""));
  return fig;
}

function renderBlocks(parent, blocks) {
  blocks.forEach((b) => {
    if (b.type === "h") parent.append(rich(el("h2"), b.text));
    else if (b.type === "h2") parent.append(rich(el("h3"), b.text));
    else if (b.type === "p") parent.append(rich(el("p"), b.text));
    else if (b.type === "list") parent.append(makeList(b.items, b.style || "bullet"));
    else if (b.type === "table") parent.append(makeTable(b));
    else if (b.type === "image") parent.append(makeImage(b));
    else if (b.type === "quote") {
      const q = el("blockquote", "source");
      if (b.title) q.append(rich(el("strong"), b.title));
      q.append(rich(el("p"), b.text));
      if (b.source) q.append(rich(el("cite"), b.source));
      parent.append(q);
    } else if (b.type === "tip") {
      const box = el("aside", "tip");
      box.append(el("p", "tip-title", b.title));
      renderBlocks(box, b.blocks);
      parent.append(box);
    }
  });
}

// study.html: 요약을 보여주고, 퀴즈 페이지로 가는 버튼을 켠다
async function initStudy() {
  const summary = document.getElementById("summary");
  const unit = await loadUnit(summary);
  if (!unit) return;
  const s = unit.data.summary;
  if (typeof s === "string") rich(summary, s); // 옛 형식(그냥 글)도 그대로 지원
  else renderBlocks(summary, s);

  // 퀴즈 페이지로 가는 버튼(배너 안과 맨 아래 두 곳). 퀴즈가 없으면 숨긴다
  const hasQuiz = !!(unit.data.quiz && unit.data.quiz.length > 0);
  ["go-quiz-top", "go-quiz"].forEach((id) => {
    const go = document.getElementById(id);
    go.href = "quiz.html?id=" + encodeURIComponent(unit.id);
    go.hidden = !hasQuiz;
  });
}

// quiz.html: 퀴즈만 보여준다
async function initQuizPage() {
  const box = document.getElementById("quiz");
  const unit = await loadUnit(box);
  if (!unit) return;
  document.getElementById("back").href = "study.html?id=" + encodeURIComponent(unit.id); // 요약으로 돌아가기

  const quiz = unit.data.quiz || [];
  if (quiz.length === 0) box.textContent = "이 단원에는 퀴즈가 아직 없어요.";
  else initQuiz(quiz);
}

// ---------- 3단계: 퀴즈 (빈칸 / 단답 / 객관식 / OX / 주관식) ----------
// 순서: 설정 화면(난이도 고르기) → 문제를 한 개씩 → 4단계(결과)
const LEVELS = ["하", "중", "상", "최상"];     // 난이도 (쉬운 것부터)
const CIRCLED = ["①", "②", "③", "④", "⑤"];  // 객관식 보기 번호

// 배열을 무작위로 섞은 새 배열을 돌려준다 (원래 배열은 그대로)
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initQuiz(quiz) {
  if (quiz.length === 0) return;
  const box = document.getElementById("quiz");
  const result = document.getElementById("result");

  // ----- 설정 화면: 풀고 싶은 난이도를 고르고 시작 -----
  function showSetup() {
    result.replaceChildren();
    if (!quiz.some((q) => q.level)) { run(quiz); return; } // 난이도 표시가 없는 옛 데이터는 바로 시작

    const card = el("div", "question");
    card.append(el("p", "q-text", "전체 " + quiz.length + "문제 — 풀 난이도를 골라 주세요."));
    const boxes = {};
    const group = el("div", "level-pick");
    LEVELS.forEach((lv) => {
      const n = quiz.filter((q) => q.level === lv).length;
      if (n === 0) return;
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = true;
      boxes[lv] = cb;
      const label = el("label", "pick");
      label.append(cb, el("span", "", "난이도 " + lv + " (" + n + "문제)"));
      group.append(label);
    });
    const shuffle = el("input");
    shuffle.type = "checkbox";
    const shuffleLabel = el("label", "pick");
    shuffleLabel.append(shuffle, el("span", "", "문제 순서 섞기"));
    const msg = el("p", "feedback no");
    const go = el("button", "btn", "퀴즈 시작");
    go.type = "button";
    go.onclick = () => {
      // 체크한 난이도(와 난이도 표시가 없는 문제)만 모은다
      const picked = quiz.filter((q) => !boxes[q.level] || boxes[q.level].checked);
      if (picked.length === 0) { msg.textContent = "난이도를 하나 이상 골라 주세요."; return; }
      run(shuffle.checked ? shuffled(picked) : picked);
    };
    card.append(group, shuffleLabel, el("p", "note", "주관식은 자동 채점이 없어서 맞은 개수에 넣지 않아요."), msg, go);
    box.replaceChildren(el("h2", "section-title", "퀴즈 설정"), card);
    go.focus({ preventScroll: true });
  }

  // ----- 문제 풀기 -----
  function run(list) {
    let i = 0;        // 지금 몇 번째 문제인지 (0부터 시작)
    let score = 0;    // 맞힌 개수
    let stats = {};   // 난이도별 { ok: 맞힌 수, n: 푼 수 }
    // 주관식은 자동 채점이 없으니 "맞은 개수"를 셀 때 제외한다
    const graded = list.filter((q) => q.type !== "주관식").length;

    function showQuestion() {
      result.replaceChildren();
      const q = list[i];
      const isLast = i === list.length - 1;
      const card = el("div", "question");

      // 맨 위 줄: 몇 번째 문제 + 유형 + 난이도
      const meta = el("p", "progress");
      meta.append((i + 1) + "/" + list.length, el("span", "tag-type", q.type));
      if (q.level) {
        const lv = el("span", "tag-level", "난이도 " + q.level);
        lv.dataset.level = q.level;
        meta.append(lv);
      }
      card.append(meta, el("p", "q-text", q.question));

      const feedback = el("p", "feedback");
      feedback.setAttribute("aria-live", "polite"); // 스크린리더가 결과를 읽어줌
      const detail = el("div", "detail");            // 해설과 복습할 곳이 들어갈 자리

      // 답을 낸 뒤에만 나타나는 "다음" 버튼
      const next = el("button", "btn", isLast ? "결과 보기" : "다음 문제");
      next.type = "button";
      next.hidden = true;
      next.onclick = () => { if (isLast) showResult(); else { i++; showQuestion(); } };

      // 답을 낸 뒤 공통 처리: 점수 기록, 정답/오답 안내, 해설과 "복습할 곳" 보여주기
      let done = false;
      function finish(ok, answerText) {
        if (done) return;
        done = true;
        if (q.type === "주관식") {
          feedback.textContent = "모범 답안: " + answerText;
        } else {
          if (ok) score++;
          if (q.level) {
            stats[q.level] = stats[q.level] || { ok: 0, n: 0 };
            stats[q.level].n++;
            if (ok) stats[q.level].ok++;
          }
          feedback.className = "feedback " + (ok ? "ok" : "no");
          feedback.textContent = ok ? "정답이에요!" : "틀렸어요. 정답: " + answerText;
        }
        if (q.explain) detail.append(el("p", "explain", "해설: " + q.explain));
        if (q.src && q.src.length) detail.append(el("p", "src", "복습할 곳: " + q.src.join(" / ")));
        next.hidden = false;
        next.focus();
      }

      let first; // 문제가 나타날 때 포커스를 줄 요소
      if (q.type === "객관식") {
        // 보기를 버튼으로 보여주고, 누르면 바로 채점 (정답 번호 q.answer 는 1부터 시작)
        const answer = Number(q.answer);
        const group = el("div", "choices");
        q.choices.forEach((text, k) => {
          const b = el("button", "choice", CIRCLED[k] + " " + text);
          b.type = "button";
          b.onclick = () => {
            [...group.children].forEach((c, idx) => {
              c.disabled = true;
              if (idx + 1 === answer) c.classList.add("right");
            });
            if (k + 1 !== answer) b.classList.add("wrong");
            finish(k + 1 === answer, CIRCLED[answer - 1] + " " + q.choices[answer - 1]);
          };
          group.append(b);
        });
        card.append(group);
        first = group.firstChild;
      } else if (q.type === "OX") {
        // O / X 두 버튼 (정답 q.answer 는 "O" 또는 "X")
        const isO = ["O", "o", "맞음"].includes(String(q.answer).trim());
        const group = el("div", "choices ox");
        [["O 맞다", true], ["X 틀리다", false]].forEach(([label, pickO]) => {
          const b = el("button", "choice", label);
          b.type = "button";
          b.dataset.o = pickO ? "1" : "0";
          b.onclick = () => {
            [...group.children].forEach((c) => {
              c.disabled = true;
              if ((c.dataset.o === "1") === isO) c.classList.add("right");
            });
            if (pickO !== isO) b.classList.add("wrong");
            finish(pickO === isO, isO ? "O (맞다)" : "X (틀리다)");
          };
          group.append(b);
        });
        card.append(group);
        first = group.firstChild;
      } else if (q.type === "주관식") {
        // 자동 채점 없음: 모범 답안을 보고 스스로 비교
        const show = el("button", "btn", "모범 답안 보기");
        show.type = "button";
        show.onclick = () => { show.hidden = true; finish(true, [].concat(q.answer)[0]); };
        card.append(show);
        first = show;
      } else {
        // 빈칸/단답: 공백을 모두 지우고 소문자로 바꿔서 비교한다 (띄어쓰기·대소문자 실수는 봐줌)
        // 정답(answer)이 배열이면 그중 하나만 맞아도 정답, 화면에는 첫 번째를 보여준다
        const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
        const answers = [].concat(q.answer);
        const input = el("input", "answer");
        input.type = "text";
        input.autocomplete = "off";
        input.setAttribute("aria-label", "정답 입력");
        const check = el("button", "btn", "정답 확인");
        check.type = "button";
        const submit = () => {
          const mine = norm(input.value);
          if (mine === "") { input.focus(); return; } // 빈 칸은 확인하지 않음
          input.disabled = true;
          check.hidden = true;
          finish(answers.some((a) => norm(a) === mine), answers[0]);
        };
        check.onclick = submit;
        input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
        card.append(input, check);
        first = input;
      }
      card.append(feedback, detail, next);
      box.replaceChildren(el("h2", "section-title", "퀴즈"), card);
      first.focus({ preventScroll: true });
    }

    // ---------- 4단계: 결과 ----------
    function showResult() {
      box.replaceChildren();
      const card = el("div", "question");
      card.append(el("h2", "section-title", "퀴즈 끝!"));
      card.append(el("p", "score", graded > 0 ? "맞은 개수: " + graded + "개 중 " + score + "개" : "자동 채점 문제가 없어요."));
      const rows = LEVELS.filter((lv) => stats[lv]);
      if (rows.length) {
        const ul = el("ul", "level-score");
        rows.forEach((lv) => ul.append(el("li", "", "난이도 " + lv + ": " + stats[lv].n + "문제 중 " + stats[lv].ok + "개")));
        card.append(ul);
      }
      if (graded < list.length) {
        card.append(el("p", "note", "주관식 " + (list.length - graded) + "문제는 모범 답안과 직접 비교해 보세요."));
      }
      const actions = el("div", "actions");
      const again = el("button", "btn", "같은 문제 다시 풀기");
      again.type = "button";
      again.onclick = () => { i = 0; score = 0; stats = {}; showQuestion(); };
      actions.append(again);
      if (list !== quiz) { // 설정 화면을 거쳤다면 난이도를 다시 고를 수 있다
        const redo = el("button", "btn ghost", "난이도 다시 고르기");
        redo.type = "button";
        redo.onclick = showSetup;
        actions.append(redo);
      }
      card.append(actions);
      result.replaceChildren(card);
      again.focus({ preventScroll: true });
    }

    showQuestion();
  }

  showSetup();
}

// 현재 페이지 판별 후 시작
if (document.getElementById("list")) initHome();
else if (document.getElementById("summary")) initStudy();
else if (document.getElementById("quiz")) initQuizPage();
