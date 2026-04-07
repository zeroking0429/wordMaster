// ════════════════════════════════════════════
// DATA MODEL
// decks: [{id, name, createdAt}]
// words: [{id, deckId, en, ko, star, diff}]
// wordStats: {wordId: {correct, wrong}}
// quizState: {deckIds[], cycleNum, cycleQueue[], cycleTotalStart, cycleCorrect, cycleWrong}
// globals: correct, wrong, cycleCompleted, history[]
// ════════════════════════════════════════════

let decks = [];
let words = [];
let wordStats = {};
let correct = 0,
  wrong = 0,
  cycleCompleted = 0;
let history = [];

// Quiz state
let quizDeckIds = []; // which decks are active for quiz ([] = all)
let quizCycleNum = 1;
let quizQueue = []; // array of word IDs
let quizTotalStart = 0;
let quizCorrect = 0,
  quizWrong = 0;
let quizCurrentId = null;
let quizMode = 0;
let mcqLocked = false;

// Flash state
let flashDeckId = null; // null = all
let flashFilter = 0;
let flashPool = [];
let flashPos = 0;
let flashFlipped = false;

// Word panel filter
let wordFilterDeckId = null; // null = all
let newDiff = 1;

// ── ID generator
let _idCounter = 0;
function genId() {
  return Date.now().toString(36) + (++_idCounter).toString(36);
}

// ── Persist ──────────────────────────────────
function save() {
  try {
    localStorage.setItem("wm2_decks", JSON.stringify(decks));
    localStorage.setItem("wm2_words", JSON.stringify(words));
    localStorage.setItem("wm2_wordStats", JSON.stringify(wordStats));
    localStorage.setItem("wm2_correct", correct);
    localStorage.setItem("wm2_wrong", wrong);
    localStorage.setItem("wm2_cycleCompleted", cycleCompleted);
    localStorage.setItem("wm2_history", JSON.stringify(history.slice(-300)));
    localStorage.setItem(
      "wm2_quizState",
      JSON.stringify({
        quizDeckIds,
        quizCycleNum,
        quizQueue,
        quizTotalStart,
        quizCorrect,
        quizWrong,
        quizCurrentId,
        quizMode,
      }),
    );
  } catch (e) {}
}

function load() {
  try {
    decks = JSON.parse(localStorage.getItem("wm2_decks")) || [];
  } catch (e) {}
  try {
    words = JSON.parse(localStorage.getItem("wm2_words")) || [];
  } catch (e) {}
  try {
    wordStats = JSON.parse(localStorage.getItem("wm2_wordStats")) || {};
  } catch (e) {}
  try {
    correct = +localStorage.getItem("wm2_correct") || 0;
  } catch (e) {}
  try {
    wrong = +localStorage.getItem("wm2_wrong") || 0;
  } catch (e) {}
  try {
    cycleCompleted = +localStorage.getItem("wm2_cycleCompleted") || 0;
  } catch (e) {}
  try {
    history = JSON.parse(localStorage.getItem("wm2_history")) || [];
  } catch (e) {}
  try {
    let qs = JSON.parse(localStorage.getItem("wm2_quizState"));
    if (qs) {
      quizDeckIds = qs.quizDeckIds || [];
      quizCycleNum = qs.quizCycleNum || 1;
      quizQueue = qs.quizQueue || [];
      quizTotalStart = qs.quizTotalStart || 0;
      quizCorrect = qs.quizCorrect || 0;
      quizWrong = qs.quizWrong || 0;
      quizCurrentId = qs.quizCurrentId || null;
      quizMode = qs.quizMode || 0;
    }
  } catch (e) {}
}

// ── Toast ──────────────────────────────────
function toast(msg, dur = 2200) {
  let t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), dur);
}

// ── Panel nav ──────────────────────────────
function showPanel(id, btn) {
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("panel-" + id).classList.add("active");
  if (btn) btn.classList.add("active");
  if (id === "decks") renderDeckList();
  if (id === "words") {
    renderWordDeckSelects();
    renderWordFilterChips();
    renderWordList();
  }
  if (id === "flash") {
    renderFlashDeckChips();
    rebuildFlashPool();
    nextFlash();
  }
  if (id === "quiz") {
    renderQuizDeckChips();
  }
  if (id === "stats") renderStats();
}

// ── TTS ────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  let u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = +document.getElementById("ttsRate").value || 0.9;
  speechSynthesis.speak(u);
}
function speakFlash() {
  let w = flashPool[flashPos];
  if (w) speak(w.en);
}
function speakQuiz() {
  let w = getWordById(quizCurrentId);
  if (!w) return;
  let isKoEn = quizMode === 1 || quizMode === 3;
  if (!isKoEn) speak(w.en);
  else toast("한국어 TTS는 지원되지 않습니다");
}

// ── Helpers ────────────────────────────────
function shuffle(arr) {
  let a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getDeckById(id) {
  return decks.find((d) => d.id === id);
}
function getWordById(id) {
  return words.find((w) => w.id === id);
}
function wordsForDecks(deckIds) {
  if (!deckIds || !deckIds.length) return words;
  return words.filter((w) => deckIds.includes(w.deckId));
}

// ════════════════════════════════════════════
// DECK MANAGEMENT
// ════════════════════════════════════════════
function createDeck() {
  let name = document.getElementById("deckNameInput").value.trim();
  if (!name) {
    toast("단어장 이름을 입력하세요");
    return;
  }
  if (decks.find((d) => d.name === name)) {
    toast("이미 같은 이름의 단어장이 있습니다");
    return;
  }
  decks.push({ id: genId(), name, createdAt: Date.now() });
  document.getElementById("deckNameInput").value = "";
  save();
  renderDeckList();
  renderWordDeckSelects();
  toast(`"${name}" 단어장 생성됨`);
}

function renameDeck(id) {
  let d = getDeckById(id);
  if (!d) return;
  let newName = prompt("새 단어장 이름:", d.name);
  if (!newName || !newName.trim()) return;
  d.name = newName.trim();
  save();
  renderDeckList();
  renderWordDeckSelects();
  renderWordFilterChips();
  renderFlashDeckChips();
  renderQuizDeckChips();
}

function deleteDeck(id) {
  let d = getDeckById(id);
  if (!d) return;
  let cnt = words.filter((w) => w.deckId === id).length;
  if (!confirm(`"${d.name}" 단어장과 단어 ${cnt}개를 삭제할까요?`)) return;
  decks = decks.filter((d) => d.id !== id);
  let removed = words.filter((w) => w.deckId === id).map((w) => w.id);
  words = words.filter((w) => w.deckId !== id);
  removed.forEach((wid) => delete wordStats[wid]);
  // clean quiz queue
  quizQueue = quizQueue.filter((wid) => !removed.includes(wid));
  save();
  renderDeckList();
  renderWordDeckSelects();
  renderWordFilterChips();
  renderWordList();
  renderFlashDeckChips();
  renderQuizDeckChips();
  toast("단어장 삭제됨");
}

function renderDeckList() {
  let el = document.getElementById("deckList");
  if (!decks.length) {
    el.innerHTML = '<div class="empty-state">단어장을 만들어보세요</div>';
    return;
  }
  el.innerHTML = decks
    .map((d) => {
      let cnt = words.filter((w) => w.deckId === d.id).length;
      let ws = words
        .filter((w) => w.deckId === d.id)
        .map((w) => wordStats[w.id] || { correct: 0, wrong: 0 });
      let tot = ws.reduce((s, w) => s + w.correct + w.wrong, 0);
      let cor = ws.reduce((s, w) => s + w.correct, 0);
      let acc = tot ? Math.round((cor / tot) * 100) + "%" : "—";
      return `<div class="deck-row">
      <div style="min-width:0">
        <div class="deck-name">${d.name}</div>
        <div class="deck-meta">${cnt}개 단어 · 정답률 ${acc}</div>
      </div>
      <div class="deck-actions">
        <button class="btn btn-ghost btn-sm" onclick="renameDeck('${d.id}')">이름 변경</button>
        <button class="btn btn-danger" onclick="deleteDeck('${d.id}')">삭제</button>
      </div>
    </div>`;
    })
    .join("");
}

// ── Deck selects (word panel) ──────────────
function renderWordDeckSelects() {
  let opts = decks
    .map((d) => `<option value="${d.id}">${d.name}</option>`)
    .join("");
  let placeholder = decks.length ? "" : '<option value="">단어장 없음</option>';
  document.getElementById("wordDeckSel").innerHTML = placeholder + opts;
  document.getElementById("importDeckSel").innerHTML = placeholder + opts;
}

function onWordDeckChange() {
  /* nothing needed */
}

// ── Word filter chips ──────────────────────
function renderWordFilterChips() {
  let el = document.getElementById("wordFilterChips");
  let chips = `<button class="deck-chip deck-chip-all ${wordFilterDeckId === null ? "active" : ""}" onclick="setWordFilter(null)">전체</button>`;
  chips += decks
    .map(
      (d) =>
        `<button class="deck-chip ${wordFilterDeckId === d.id ? "active" : ""}" onclick="setWordFilter('${d.id}')">${d.name}</button>`,
    )
    .join("");
  el.innerHTML = chips;
}
function setWordFilter(id) {
  wordFilterDeckId = id;
  renderWordFilterChips();
  renderWordList();
}

// ════════════════════════════════════════════
// WORD MANAGEMENT
// ════════════════════════════════════════════
function setNewDiff(d) {
  newDiff = d;
  [1, 2, 3].forEach((i) =>
    document.getElementById("ns" + i).classList.toggle("on", i <= d),
  );
}

function addWord() {
  let en = document.getElementById("inEn").value.trim();
  let ko = document.getElementById("inKo").value.trim();
  if (!en || !ko) {
    toast("단어와 뜻을 입력하세요");
    return;
  }
  if (!decks.length) {
    toast("먼저 단어장을 만드세요");
    return;
  }
  let deckId = document.getElementById("wordDeckSel").value;
  if (!deckId) {
    toast("단어장을 선택하세요");
    return;
  }
  let wid = genId();
  words.push({ id: wid, deckId, en, ko, star: false, diff: newDiff });
  document.getElementById("inEn").value = "";
  document.getElementById("inKo").value = "";
  document.getElementById("inEn").focus();
  // Add to quiz queue if this deck is active
  addToQuizQueue(wid);
  save();
  renderWordList();
  toast(`"${en}" 추가됨`);
}

function addToQuizQueue(wid) {
  let w = getWordById(wid);
  if (!w) return;
  let active = quizDeckIds.length === 0 || quizDeckIds.includes(w.deckId);
  if (active && quizQueue.length > 0) {
    let pos = Math.floor(Math.random() * quizQueue.length) + 1;
    quizQueue.splice(pos, 0, wid);
    quizTotalStart++;
  }
}

function deleteWord(id) {
  words = words.filter((w) => w.id !== id);
  delete wordStats[id];
  quizQueue = quizQueue.filter((wid) => wid !== id);
  if (quizCurrentId === id) quizCurrentId = null;
  save();
  renderWordList();
}

function toggleStar(id) {
  let w = getWordById(id);
  if (w) {
    w.star = !w.star;
    save();
    renderWordList();
  }
}

function renderWordList() {
  let q = document.getElementById("search").value.toLowerCase();
  let el = document.getElementById("list");
  let inQueue = new Set(quizQueue);
  let pool = wordFilterDeckId
    ? words.filter((w) => w.deckId === wordFilterDeckId)
    : words;
  let items = pool.filter(
    (w) => w.en.toLowerCase().includes(q) || w.ko.includes(q),
  );
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">${words.length ? "검색 결과 없음" : "단어를 추가해보세요"}</div>`;
    return;
  }
  el.innerHTML = items
    .map((w) => {
      let stars = "★".repeat(w.diff || 1) + "☆".repeat(3 - (w.diff || 1));
      let sc =
        w.diff === 3
          ? "var(--red)"
          : w.diff === 2
            ? "var(--amber)"
            : "var(--green)";
      let status =
        w.id === quizCurrentId
          ? `<span class="status-dot dot-current">▶ 현재</span>`
          : inQueue.has(w.id)
            ? `<span class="status-dot dot-pending">● 대기</span>`
            : `<span class="status-dot dot-done">✓ 완료</span>`;
      let ws = wordStats[w.id] || { correct: 0, wrong: 0 };
      let tot = ws.correct + ws.wrong;
      let acc = tot ? Math.round((ws.correct / tot) * 100) + "%" : "—";
      let deck = getDeckById(w.deckId);
      let deckName = deck ? deck.name : "?";
      return `<div class="word-item">
      <div style="min-width:0;flex:1">
        <div><span class="word-en">${w.en}</span><span class="word-ko">| ${w.ko}</span></div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--text3);margin-top:2px">${acc} · ${deckName}</div>
      </div>
      <div class="w-actions">
        ${status}
        <span style="font-size:11px;color:${sc};font-family:var(--mono)">${stars}</span>
        <button class="btn-icon" onclick="toggleStar('${w.id}')">${w.star ? "⭐" : "☆"}</button>
        <button class="btn btn-danger" onclick="deleteWord('${w.id}')">삭제</button>
      </div>
    </div>`;
    })
    .join("");
}

// ── Import / Export ────────────────────────
function parseAndAddLines(text, deckId) {
  let lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let added = 0;
  lines.forEach((line) => {
    if (line.startsWith("#")) return;
    let parts = line.includes("\t") ? line.split("\t") : line.split(",");
    if (parts.length < 2) return;
    let en = parts[0].trim(),
      ko = parts[1].trim();
    if (!en || !ko) return;
    let wid = genId();
    words.push({ id: wid, deckId, en, ko, star: false, diff: 1 });
    addToQuizQueue(wid);
    added++;
  });
  return added;
}

function importWords() {
  let text = document.getElementById("importText").value.trim();
  if (!text) return;
  if (!decks.length) {
    toast("먼저 단어장을 만드세요");
    return;
  }
  let deckId = document.getElementById("importDeckSel").value;
  if (!deckId) {
    toast("단어장을 선택하세요");
    return;
  }
  let added = parseAndAddLines(text, deckId);
  document.getElementById("importText").value = "";
  if (!quizQueue.length && added) initQuizQueue();
  save();
  renderWordList();
  toast(`${added}개 단어 추가됨`);
}

function exportCSV() {
  let lines = ["# WordMaster export", "# 단어장,영어,한국어"];
  words.forEach((w) => {
    let d = getDeckById(w.deckId);
    lines.push(`${d ? d.name : ""},${w.en},${w.ko}`);
  });
  copyText(lines.join("\n"), "CSV 복사됨");
}

function exportJSON() {
  let data = {
    version: 2,
    decks,
    words,
    stats: { correct, wrong, cycleCompleted },
    wordStats,
    exportedAt: new Date().toISOString(),
  };
  copyText(JSON.stringify(data, null, 2), "JSON 백업 복사됨");
}

function copyText(text, msg) {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast(msg))
      .catch(() => fallbackCopy(text, msg));
  } else fallbackCopy(text, msg);
}

function fallbackCopy(text, msg) {
  let ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  toast(msg);
}

function triggerFileImport() {
  document.getElementById("fileInput").click();
}

function importFromFile(event) {
  let file = event.target.files[0];
  if (!file) return;
  if (!decks.length) {
    toast("먼저 단어장을 만드세요");
    return;
  }
  let deckId =
    document.getElementById("importDeckSel").value || (decks[0] && decks[0].id);
  let reader = new FileReader();
  reader.onload = (e) => {
    let text = e.target.result;
    let added = 0;
    if (file.name.endsWith(".json")) {
      try {
        let data = JSON.parse(text);
        // version 2 (multi-deck)
        if (data.version === 2 && data.decks) {
          let idMap = {};
          data.decks.forEach((d) => {
            let existing = decks.find((x) => x.name === d.name);
            if (!existing) {
              let nd = {
                id: genId(),
                name: d.name,
                createdAt: d.createdAt || Date.now(),
              };
              decks.push(nd);
              idMap[d.id] = nd.id;
            } else idMap[d.id] = existing.id;
          });
          (data.words || []).forEach((w) => {
            let wid = genId();
            words.push({
              id: wid,
              deckId: idMap[w.deckId] || deckId,
              en: w.en,
              ko: w.ko,
              star: w.star || false,
              diff: w.diff || 1,
            });
            addToQuizQueue(wid);
            added++;
          });
        } else if (data.words) {
          // version 1 (single-deck, legacy)
          data.words.forEach((w) => {
            let wid = genId();
            words.push({
              id: wid,
              deckId,
              en: w.en,
              ko: w.ko,
              star: w.star || false,
              diff: w.diff || 1,
            });
            addToQuizQueue(wid);
            added++;
          });
        }
      } catch (e) {
        toast("JSON 파싱 오류");
        return;
      }
    } else {
      // CSV/TXT — check if has deck column
      let lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.startsWith("#"));
      let hasDeckCol = lines[0] && lines[0].split(",").length >= 3;
      lines.forEach((line) => {
        let parts = line.includes("\t") ? line.split("\t") : line.split(",");
        if (hasDeckCol && parts.length >= 3) {
          let dname = parts[0].trim(),
            en = parts[1].trim(),
            ko = parts[2].trim();
          if (!en || !ko) return;
          let deck =
            decks.find((d) => d.name === dname) ||
            (() => {
              let nd = {
                id: genId(),
                name: dname,
                createdAt: Date.now(),
              };
              decks.push(nd);
              return nd;
            })();
          let wid = genId();
          words.push({
            id: wid,
            deckId: deck.id,
            en,
            ko,
            star: false,
            diff: 1,
          });
          addToQuizQueue(wid);
          added++;
        } else if (parts.length >= 2) {
          let en = parts[0].trim(),
            ko = parts[1].trim();
          if (!en || !ko) return;
          let wid = genId();
          words.push({ id: wid, deckId, en, ko, star: false, diff: 1 });
          addToQuizQueue(wid);
          added++;
        }
      });
    }
    if (!quizQueue.length && added) initQuizQueue();
    save();
    renderDeckList();
    renderWordDeckSelects();
    renderWordFilterChips();
    renderWordList();
    renderFlashDeckChips();
    renderQuizDeckChips();
    toast(`${added}개 단어 가져옴`);
  };
  reader.readAsText(file, "UTF-8");
  event.target.value = "";
}

function clearAll() {
  if (!confirm("모든 데이터를 삭제할까요?")) return;
  decks = [];
  words = [];
  wordStats = {};
  correct = 0;
  wrong = 0;
  cycleCompleted = 0;
  history = [];
  quizDeckIds = [];
  quizCycleNum = 1;
  quizQueue = [];
  quizTotalStart = 0;
  quizCorrect = 0;
  quizWrong = 0;
  quizCurrentId = null;
  save();
  renderDeckList();
  renderWordDeckSelects();
  renderWordFilterChips();
  renderWordList();
  renderFlashDeckChips();
  renderQuizDeckChips();
  toast("초기화 완료");
}

function resetStats() {
  if (!confirm("통계를 초기화할까요?")) return;
  correct = 0;
  wrong = 0;
  cycleCompleted = 0;
  history = [];
  wordStats = {};
  save();
  toast("통계 초기화됨");
}

// ════════════════════════════════════════════
// FLASHCARD
// ════════════════════════════════════════════
function renderFlashDeckChips() {
  let el = document.getElementById("flashDeckChips");
  let chips = `<button class="deck-chip deck-chip-all ${flashDeckId === null ? "active" : ""}" onclick="setFlashDeck(null)">전체</button>`;
  chips += decks
    .map(
      (d) =>
        `<button class="deck-chip ${flashDeckId === d.id ? "active" : ""}" onclick="setFlashDeck('${d.id}')">${d.name}</button>`,
    )
    .join("");
  el.innerHTML = chips;
}

function setFlashDeck(id) {
  flashDeckId = id;
  renderFlashDeckChips();
  rebuildFlashPool();
  nextFlash();
}

function setFlashFilter(f) {
  flashFilter = f;
  [0, 1, 2, 3].forEach((i) => {
    let b = document.getElementById("ff" + i);
    b.style.borderColor = i === f ? "var(--accent)" : "";
    b.style.color = i === f ? "var(--accent2)" : "";
  });
  rebuildFlashPool();
  nextFlash();
}

function rebuildFlashPool() {
  let pool = flashDeckId
    ? words.filter((w) => w.deckId === flashDeckId)
    : words;
  if (flashFilter > 0) pool = pool.filter((w) => (w.diff || 1) === flashFilter);
  flashPool = shuffle(pool);
  flashPos = 0;
}

function nextFlash() {
  if (!flashPool.length) {
    document.getElementById("fcWord").textContent = "단어 없음";
    document.getElementById("fcMeaning").textContent = "—";
    document.getElementById("fcCounter").textContent = "";
    document.getElementById("fcDiff").innerHTML = "";
    document.getElementById("fcDeckTag").innerHTML = "";
    return;
  }
  flashFlipped = false;
  document.getElementById("flashcard").classList.remove("flipped");
  flashPos =
    ((flashPos % flashPool.length) + flashPool.length) % flashPool.length;
  let w = flashPool[flashPos];
  document.getElementById("fcWord").textContent = w.en;
  document.getElementById("fcMeaning").textContent = w.ko;
  let sc =
    w.diff === 3
      ? "var(--red)"
      : w.diff === 2
        ? "var(--amber)"
        : "var(--green)";
  document.getElementById("fcDiff").innerHTML =
    `<span style="font-size:12px;color:${sc}">${"★".repeat(w.diff || 1)}</span>`;
  let deck = getDeckById(w.deckId);
  document.getElementById("fcDeckTag").innerHTML = deck
    ? `<span class="deck-tag">${deck.name}</span>`
    : "";
  document.getElementById("fcCounter").textContent =
    `${flashPos + 1} / ${flashPool.length}`;
  flashPos++;
  if (document.getElementById("optAutoTTS").checked) speak(w.en);
}

function prevFlash() {
  flashPos = Math.max(0, flashPos - 2);
  nextFlash();
}

function flipCard() {
  flashFlipped = !flashFlipped;
  document
    .getElementById("flashcard")
    .classList.toggle("flipped", flashFlipped);
}

// ════════════════════════════════════════════
// QUIZ + CYCLE  (BUG-FIXED)
// ════════════════════════════════════════════

function renderQuizDeckChips() {
  let el = document.getElementById("quizDeckChips");
  let chips = `<button class="deck-chip deck-chip-all ${quizDeckIds.length === 0 ? "active" : ""}" onclick="setQuizDecks([])">전체</button>`;
  chips += decks
    .map((d) => {
      let active = quizDeckIds.includes(d.id);
      return `<button class="deck-chip ${active ? "active" : ""}" onclick="toggleQuizDeck('${d.id}')">${d.name}</button>`;
    })
    .join("");
  el.innerHTML = chips;
}

function setQuizDecks(ids) {
  quizDeckIds = ids;
  renderQuizDeckChips();
  initQuizQueue();
}

function toggleQuizDeck(id) {
  if (quizDeckIds.includes(id)) {
    quizDeckIds = quizDeckIds.filter((x) => x !== id);
    if (!quizDeckIds.length) quizDeckIds = []; // means all
  } else {
    quizDeckIds.push(id);
  }
  renderQuizDeckChips();
  initQuizQueue();
}

function getQuizWords() {
  return quizDeckIds.length === 0
    ? words
    : words.filter((w) => quizDeckIds.includes(w.deckId));
}

// Build a brand-new queue from scratch (resets cycle)
function initQuizQueue() {
  let pool = getQuizWords();
  if (!pool.length) {
    quizQueue = [];
    quizTotalStart = 0;
    updateCycleUI();
    return;
  }
  quizQueue = shuffle(pool.map((w) => w.id));
  quizTotalStart = quizQueue.length;
  quizCorrect = 0;
  quizWrong = 0;
  // reset UI
  document.getElementById("cycleComplete").style.display = "none";
  document.getElementById("quizArea").style.display = "";
  save();
  nextQuiz();
}

// ★★★ FIXED: startNewCycle — only increments cycleNum ONCE, rebuilds queue, then calls nextQuiz
function startNewCycle() {
  let pool = getQuizWords();
  if (!pool.length) return;
  quizCycleNum++;
  quizQueue = shuffle(pool.map((w) => w.id));
  quizTotalStart = quizQueue.length;
  quizCorrect = 0;
  quizWrong = 0;
  document.getElementById("cycleComplete").style.display = "none";
  document.getElementById("quizArea").style.display = "";
  save();
  nextQuiz(); // queue is non-empty so will NOT trigger showCycleComplete
}

function updateCycleUI() {
  let remain = quizQueue.length;
  let total = quizTotalStart || getQuizWords().length;
  document.getElementById("cycleRemain").textContent = remain;
  document.getElementById("cycleTotal").textContent = total;
  document.getElementById("cycleTag").textContent = "CYCLE " + quizCycleNum;
  let pct = total > 0 ? Math.round(((total - remain) / total) * 100) : 0;
  document.getElementById("progressFill").style.width = pct + "%";
}

function setQMode(m) {
  quizMode = m;
  [0, 1, 2, 3].forEach((i) =>
    document.getElementById("qt" + i).classList.toggle("active", i === m),
  );
  let isMcq = m >= 2;
  document.getElementById("mcqArea").style.display = isMcq ? "grid" : "none";
  document.getElementById("textArea").style.display = isMcq ? "none" : "";
  document.getElementById("quizResult").textContent = "";
  if (quizCurrentId) {
    let isKoEn = m === 1 || m === 3;
    let w = getWordById(quizCurrentId);
    if (w) {
      document.getElementById("quizLabel").textContent = isKoEn
        ? "KOREAN"
        : "ENGLISH";
      document.getElementById("quizWord").textContent = isKoEn ? w.ko : w.en;
      document.getElementById("quizTtsBtn").style.display = isKoEn
        ? "none"
        : "";
    }
    if (isMcq) renderMcq(isKoEn);
  }
  save();
}

// ★★★ FIXED nextQuiz: only show cycle complete if queue truly empty AND we're in quiz mode AND cycle complete not already showing
function nextQuiz() {
  let pool = getQuizWords();
  if (!pool.length) {
    document.getElementById("quizWord").textContent = "단어 없음";
    updateCycleUI();
    return;
  }
  // Already showing cycle complete - don't call again
  if (document.getElementById("cycleComplete").style.display === "block") {
    return;
  }
  // ★ KEY FIX: only show cycle complete if queue truly empty AND we're in quiz mode
  if (quizQueue.length === 0) {
    showCycleComplete();
    return;
  }
  mcqLocked = false;
  quizCurrentId = quizQueue[0];
  let w = getWordById(quizCurrentId);
  if (!w) {
    quizQueue.shift();
    nextQuiz();
    return;
  } // skip deleted words
  let isKoEn = quizMode === 1 || quizMode === 3;
  document.getElementById("quizLabel").textContent = isKoEn
    ? "KOREAN"
    : "ENGLISH";
  document.getElementById("quizWord").textContent = isKoEn ? w.ko : w.en;
  document.getElementById("quizResult").textContent = "";
  document.getElementById("quizTtsBtn").style.display = isKoEn ? "none" : "";
  let inp = document.getElementById("quizInput");
  if (inp) inp.value = "";
  if (quizMode >= 2) renderMcq(isKoEn);
  updateCycleUI();
  renderWordList();
  if (document.getElementById("optAutoTTS").checked && !isKoEn) speak(w.en);
}

function renderMcq(isKoEn) {
  let w = getWordById(quizCurrentId);
  if (!w) return;
  let ca = isKoEn ? w.en : w.ko;
  let pool = getQuizWords().filter((x) => x.id !== quizCurrentId);
  if (pool.length < 3) pool = words.filter((x) => x.id !== quizCurrentId); // fallback to all
  let opts = [ca];
  let shuffled = shuffle(pool);
  for (let x of shuffled) {
    if (opts.length >= 4) break;
    let cand = isKoEn ? x.en : x.ko;
    if (!opts.includes(cand)) opts.push(cand);
  }
  opts = shuffle(opts);
  document.getElementById("mcqArea").innerHTML = opts
    .map(
      (o) =>
        `<button class="mcq-btn" onclick="checkMcq(this,'${o.replace(/'/g, "\\'")}','${ca.replace(/'/g, "\\'")}')">  ${o}</button>`,
    )
    .join("");
}

function recordResult(ok) {
  let w = getWordById(quizCurrentId);
  if (!w) return;
  if (!wordStats[quizCurrentId])
    wordStats[quizCurrentId] = { correct: 0, wrong: 0 };
  if (ok) {
    correct++;
    quizCorrect++;
    wordStats[quizCurrentId].correct++;
    quizQueue.shift(); // ★ correct: remove from queue
  } else {
    wrong++;
    quizWrong++;
    wordStats[quizCurrentId].wrong++;
    quizQueue.shift(); // remove from front
    // re-insert further back (not immediately next)
    let noImmediate = document.getElementById("optNoImmediate").checked;
    let minPos = noImmediate ? Math.min(1, quizQueue.length) : 0;
    let maxPos = quizQueue.length;
    let pos = minPos + Math.floor(Math.random() * (maxPos - minPos + 1));
    quizQueue.splice(pos, 0, quizCurrentId);
  }
  history.push({ word: w.en, deckId: w.deckId, ok, ts: Date.now() });
  save();
  updateStats();
}

function checkMcq(btn, chosen, ca) {
  if (mcqLocked) return;
  mcqLocked = true;
  let ok = chosen === ca;
  btn.classList.add(ok ? "correct" : "wrong");
  if (!ok)
    document.querySelectorAll(".mcq-btn").forEach((b) => {
      if (b.textContent.trim() === ca) b.classList.add("correct");
    });
  recordResult(ok);
  document.getElementById("quizResult").innerHTML =
    `<span class="${ok ? "result-ok" : "result-ng"}">${ok ? "✓ 정답! 사이클에서 제거됨" : "✗ 오답: " + ca + " — 다시 출제됩니다"}</span>`;
  setTimeout(nextQuiz, 1300);
}

function checkText() {
  if (!quizCurrentId) return;
  let inp = document.getElementById("quizInput");
  let ans = inp.value.trim();
  if (!ans) return;
  let w = getWordById(quizCurrentId);
  if (!w) return;
  let isKoEn = quizMode === 1;
  let target = isKoEn ? w.en : w.ko;
  let cs = document.getElementById("optCaseSensitive").checked;
  let ok = cs ? ans === target : ans.toLowerCase() === target.toLowerCase();
  recordResult(ok);
  document.getElementById("quizResult").innerHTML =
    `<span class="${ok ? "result-ok" : "result-ng"}">${ok ? "✓ 정답! 사이클에서 제거됨" : "✗ 오답: " + target + " — 다시 출제됩니다"}</span>`;
  inp.value = "";
  setTimeout(nextQuiz, 1100);
}

// ★★★ FIXED showCycleComplete: does NOT touch cycleNum (startNewCycle handles it)
function showCycleComplete() {
  document.getElementById("quizArea").style.display = "none";
  document.getElementById("cycleComplete").style.display = "block";
  cycleCompleted++;
  document.getElementById("ccTitle").textContent =
    `사이클 ${quizCycleNum} 완료!`;
  document.getElementById("ccSub").textContent = "모든 단어를 맞혔습니다 🎉";
  document.getElementById("ccCorrect").textContent = quizCorrect;
  document.getElementById("ccWrong").textContent = quizWrong;
  let t = quizCorrect + quizWrong;
  document.getElementById("ccAcc").textContent = t
    ? Math.round((quizCorrect / t) * 100) + "%"
    : "—";
  save();
}

// ── Stats ──────────────────────────────────
function updateStats() {
  document.getElementById("stTotal").textContent = words.length;
  document.getElementById("stDecks").textContent = decks.length;
  document.getElementById("stCorrect").textContent = correct;
  document.getElementById("stWrong").textContent = wrong;
  let t = correct + wrong;
  document.getElementById("stAcc").textContent = t
    ? Math.round((correct / t) * 100) + "%"
    : "—";
}

function renderStats() {
  updateStats();
  let hl = document.getElementById("historyList");
  if (!history.length) {
    hl.innerHTML = '<div class="empty-state">기록 없음</div>';
  } else {
    hl.innerHTML = [...history]
      .reverse()
      .slice(0, 80)
      .map((h) => {
        let d = new Date(h.ts);
        let time =
          d.getHours().toString().padStart(2, "0") +
          ":" +
          d.getMinutes().toString().padStart(2, "0");
        let deck = h.deckId ? getDeckById(h.deckId) : null;
        return `<div class="history-item">
        <span>${h.word}</span>
        <span style="color:var(--text3)">${deck ? deck.name : ""}</span>
        <span>${time}</span>
        <span class="${h.ok ? "h-ok" : "h-ng"}">${h.ok ? "✓" : "✗"}</span>
      </div>`;
      })
      .join("");
  }
  let wsl = document.getElementById("wordStatsList");
  if (!words.length) {
    wsl.innerHTML = '<div class="empty-state">단어를 추가하세요</div>';
    return;
  }
  let sorted = words
    .map((w) => {
      let s = wordStats[w.id] || { correct: 0, wrong: 0 };
      let tot = s.correct + s.wrong;
      return { ...w, s, acc: tot ? s.correct / tot : -1, tot };
    })
    .sort((a, b) => a.acc - b.acc);
  wsl.innerHTML = sorted
    .map((w) => {
      let accStr = w.tot ? Math.round(w.acc * 100) + "%" : "—";
      let ac =
        w.acc < 0
          ? "var(--text3)"
          : w.acc < 0.5
            ? "var(--red)"
            : w.acc < 0.8
              ? "var(--amber)"
              : "var(--green)";
      let deck = getDeckById(w.deckId);
      return `<div class="word-item">
      <div style="min-width:0;flex:1">
        <div><span class="word-en">${w.en}</span><span class="word-ko">| ${w.ko}</span></div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:1px">${deck ? deck.name : ""}</div>
      </div>
      <div class="w-actions" style="gap:8px">
        <span style="font-family:var(--mono);font-size:12px;color:${ac}">${accStr}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--text3)">${w.s.correct}/${w.tot}</span>
      </div>
    </div>`;
    })
    .join("");
}

// ── Init ───────────────────────────────────
load();
setNewDiff(1);
renderDeckList();
renderWordDeckSelects();
renderWordFilterChips();
renderWordList();
renderFlashDeckChips();
rebuildFlashPool();
renderQuizDeckChips();
updateCycleUI();
updateStats();

// Restore quiz UI state
if (quizQueue.length > 0 && quizCurrentId) {
  // resume in progress
  let w = getWordById(quizCurrentId);
  if (w) {
    let isKoEn = quizMode === 1 || quizMode === 3;
    document.getElementById("quizLabel").textContent = isKoEn
      ? "KOREAN"
      : "ENGLISH";
    document.getElementById("quizWord").textContent = isKoEn ? w.ko : w.en;
    document.getElementById("quizTtsBtn").style.display = isKoEn ? "none" : "";
    [0, 1, 2, 3].forEach((i) =>
      document
        .getElementById("qt" + i)
        .classList.toggle("active", i === quizMode),
    );
    let isMcq = quizMode >= 2;
    document.getElementById("mcqArea").style.display = isMcq ? "grid" : "none";
    document.getElementById("textArea").style.display = isMcq ? "none" : "";
    if (isMcq) renderMcq(isKoEn);
  }
} else if (words.length && quizQueue.length === 0) {
  initQuizQueue();
}
