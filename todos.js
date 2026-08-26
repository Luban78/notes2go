/* ========================================
   TODO POLOŽKY NOTES2GO
======================================== */

const todoModalText =
  document.getElementById("modalText");

const todoRichText =
  document.getElementById("modalRichText");

const todoList =
  document.getElementById("todoList");

const addTodoButton =
  document.getElementById("addTodoButton");

let activeTodos = [];
let activeTodoEditorItem = null;
let selectedTodoId = null;


/* ========================================
   DRAG & DROP – stav
======================================== */

let draggedTodoIndex = null;
let draggedTodoElement = null;
let todoDragGhost = null;
let todoDragActive = false;

let todoLongPressTimer = null;
let pendingDragType = null;
let pendingTouchIdentifier = null;
let pendingTodoIndex = null;
let pendingTodoElement = null;
let pendingStartX = 0;
let pendingStartY = 0;
let pendingTodoMoveReady = false;

let todoMoveSelectedElement = null;

let suppressTodoClickUntil = 0;
let lastTouchTime = 0;
let cekaniNaDruhyTapTodo = null;

const TODO_LONG_PRESS_TIME = 420;
const TODO_DOUBLE_TAP_TIME = 460;
const TODO_LONG_PRESS_CANCEL_DISTANCE = 20;
const TODO_DRAG_START_DISTANCE = 8;
const TODO_GHOST_LIFT = 92;


/* ========================================
   ZÁKLADNÍ TODO FUNKCE
======================================== */

function createTodoId() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `todo-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function normalizeTodo(todo = {}) {
  return {
    ...todo,
    id:
      typeof todo?.id === "string" && todo.id
        ? todo.id
        : createTodoId(),
    text: todo?.text ?? "",
    completed: todo?.completed === true,
    highlightColor:
      typeof todo?.highlightColor === "string"
        ? todo.highlightColor
        : ""
  };
}

function getTodoById(todoId) {
  if (!todoId) {
    return null;
  }

  return activeTodos.find(
    todo => todo?.id === todoId
  ) || null;
}

function getTodoItemElementById(todoId) {
  if (!todoId) {
    return null;
  }

  return [...todoList.querySelectorAll(".todoItem")]
    .find(
      item => item.dataset.todoId === todoId
    ) || null;
}

function getSelectedTodo() {
  if (
    todoList.hidden ||
    activeTodos.length === 0 ||
    !selectedTodoId
  ) {
    return null;
  }

  return getTodoById(selectedTodoId);
}

function setTodoDisplayColor(todoItem, color = "") {
  if (!todoItem) {
    return;
  }

  const value =
    todoItem.querySelector(".todoTextValue");

  if (!value) {
    return;
  }

  value.style.backgroundColor = color || "";

  const input = todoItem.querySelector(
    ".todoTextInput"
  );

  if (input) {
    input.style.backgroundColor = color || "";
    input.style.borderRadius = color ? "4px" : "";
  }
}

function setSelectedTodoHighlight(color = "") {
  const todo = getSelectedTodo();

  if (!todo) {
    return false;
  }

  todo.highlightColor = color || "";

  const todoItem = getTodoItemElementById(todo.id);

  setTodoDisplayColor(
    todoItem,
    todo.highlightColor
  );

  return true;
}

function getActiveTodosSnapshot() {
  return activeTodos.map(todo => ({ ...todo }));
}

function blurSelectedTodoEditor() {
  if (!selectedTodoId) {
    return;
  }

  const todoItem = getTodoItemElementById(
    selectedTodoId
  );

  const input = todoItem?.querySelector(
    ".todoTextInput.todoEditing"
  );

  input?.blur();
}

function setTodoCompletedById(todoId, completed = true) {
  const todo = getTodoById(todoId);

  if (!todo) {
    return false;
  }

  todo.completed = completed === true;

  const todoItem = getTodoItemElementById(todoId);

  if (todoItem) {
    todoItem.classList.toggle(
      "todoCompleted",
      todo.completed
    );

    const checkbox = todoItem.querySelector(
      'input[type="checkbox"]'
    );

    if (checkbox) {
      checkbox.checked = todo.completed;
    }
  }

  return true;
}

function scrollTodoIntoView(todoId) {
  if (!todoId || todoList.hidden) {
    return false;
  }

  const todoItem = getTodoItemElementById(todoId);

  if (!todoItem) {
    return false;
  }

  todoItem.scrollIntoView({
    block: "center",
    behavior: "smooth"
  });

  return true;
}

function autoResizeTodoText(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function ensureTodoItemVisible(item) {
  if (
    !item ||
    !item.isConnected ||
    todoList.hidden
  ) {
    return;
  }

  /*
   * Posouváme pouze vnitřní TODO seznam. Focus zůstává v textarea,
   * takže Android klávesnice nezajede. Rezerva 64 px nechá aktivní
   * položku přibližně o jeden řádek nad spodní lištou.
   */
  const bottomBar =
    document.querySelector(".editorBottomBar");

  if (!bottomBar) {
    return;
  }

  const listRect = todoList.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const barRect = bottomBar.getBoundingClientRect();

  const safeGap = 64;
  const safeBottom =
    Math.min(listRect.bottom, barRect.top) - safeGap;
  const safeTop = listRect.top + 8;

  let delta = 0;

  if (itemRect.bottom > safeBottom) {
    delta = itemRect.bottom - safeBottom;
  } else if (itemRect.top < safeTop) {
    delta = itemRect.top - safeTop;
  }

  if (Math.abs(delta) < 1) {
    return;
  }

  const maxScroll = Math.max(
    0,
    todoList.scrollHeight - todoList.clientHeight
  );

  todoList.scrollTop = Math.max(
    0,
    Math.min(maxScroll, todoList.scrollTop + delta)
  );
}

function scheduleTodoItemVisibility(item) {
  /*
   * visualViewport se při otevření klávesnice mění asynchronně.
   * Dva requestAnimationFrame zajistí, že nejdřív proběhne změna
   * výšky editoru a teprve potom spočítáme správnou pozici řádku.
   */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ensureTodoItemVisible(item);
    });
  });
}

function keepActiveTodoEditorVisible() {
  if (activeTodoEditorItem) {
    scheduleTodoItemVisibility(activeTodoEditorItem);
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener(
    "resize",
    keepActiveTodoEditorVisible
  );

  window.visualViewport.addEventListener(
    "scroll",
    keepActiveTodoEditorVisible
  );
}

function focusTodo(index, cursorPosition = null) {
  const item = todoList.children[index];

  if (!item) {
    return;
  }

  const input =
    item.querySelector(".todoTextInput");

  const display =
    item.querySelector(".todoTextDisplay");

  if (!input || !display) {
    return;
  }

  enterTodoEditMode(
    input,
    display,
    cursorPosition
  );
}

function resetTodos() {
  activeTodos = [];
  selectedTodoId = null;
  renderTodos();
}

function loadTodos(todos) {
  activeTodos = Array.isArray(todos)
    ? todos.map(todo => normalizeTodo(todo))
    : [];

  selectedTodoId = null;

  renderTodos();
}

addTodoButton.addEventListener("click", () => {
  if (activeTodos.length > 0) {
    activeTodos.push(normalizeTodo({
      text: "",
      completed: false
    }));

    renderTodos();
    focusTodo(activeTodos.length - 1, 0);
    return;
  }

  const sourceText = todoRichText
    ? todoRichText.innerText
    : todoModalText.value;

  const todoLines = sourceText
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "");

  activeTodos = todoLines.length > 0
    ? todoLines.map(line => normalizeTodo({
        text: line,
        completed: false
      }))
    : [normalizeTodo({
        text: "",
        completed: false
      })];

  todoModalText.value = "";

  if (todoRichText) {
    todoRichText.innerHTML = "";
  }

  renderTodos();
  focusTodo(0, activeTodos[0].text.length);
});

function removeTodo(index) {
  const removedTodo = activeTodos[index] || null;

  activeTodos.splice(index, 1);

  if (removedTodo?.id === selectedTodoId) {
    selectedTodoId = null;
  }

  if (activeTodos.length === 0) {
    renderTodos();

    if (todoRichText) {
      todoRichText.focus();
    } else {
      todoModalText.focus();
    }

    return;
  }

  const newFocusIndex = Math.max(0, index - 1);
  renderTodos();
  focusTodo(newFocusIndex);
}

function moveTodo(fromIndex, toIndex) {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= activeTodos.length ||
    toIndex >= activeTodos.length
  ) {
    return;
  }

  const [movedTodo] = activeTodos.splice(fromIndex, 1);
  activeTodos.splice(toIndex, 0, movedTodo);
}


/* ========================================
   TODO – JEDNOTNÉ OVLÁDÁNÍ ŘÁDKU

   1× tap / klik = editace
   2× tap / klik = výběr slova v aktivním textarea
   long-press kdekoliv v řádku = MOVE MODE
   po aktivaci MOVE MODE lze řádek táhnout kdekoliv
======================================== */

function clearTodoLongPressTimer() {
  if (todoLongPressTimer !== null) {
    clearTimeout(todoLongPressTimer);
    todoLongPressTimer = null;
  }
}


function clearPendingTodoDrag() {
  clearTodoLongPressTimer();

  pendingDragType = null;
  pendingTouchIdentifier = null;
  pendingTodoIndex = null;
  pendingTodoElement = null;
  pendingTodoMoveReady = false;
}


function clearTodoMoveSelection() {
  todoMoveSelectedElement?.classList.remove(
    "todoMoveSelected"
  );

  todoMoveSelectedElement = null;
  todoList.classList.remove("todoMoveMode");
}


function selectTodoForMove(todoItem) {
  if (!todoItem) {
    return;
  }

  if (todoMoveSelectedElement !== todoItem) {
    clearTodoMoveSelection();
  }

  closeOtherTodoEditors();

  todoMoveSelectedElement = todoItem;
  todoItem.classList.add("todoMoveSelected");
  todoList.classList.add("todoMoveMode");

  if (todoItem.dataset.todoId) {
    selectedTodoId = todoItem.dataset.todoId;
  }

  window.getSelection()?.removeAllRanges();

  suppressTodoClickUntil =
    performance.now() + 650;

  if (navigator.vibrate) {
    navigator.vibrate(18);
  }
}


function najdiRozsahSlovaTodo(hodnota, pozice) {
  if (!hodnota) {
    return null;
  }

  const bezpecnaPozice = Math.max(
    0,
    Math.min(pozice ?? 0, hodnota.length)
  );

  const jeZnakSlova = znak =>
    /[\p{L}\p{N}_]/u.test(znak || "");

  /*
   * Důležité pravidlo LubaNote:
   * kurzor musí opravdu ležet UPROSTŘED slova.
   * Mezery a konec řádku nesmí přebírat sousední slovo,
   * protože dvojtap tam patří nabídce Vložit / Vše.
   */
  if (
    bezpecnaPozice >= hodnota.length ||
    !jeZnakSlova(hodnota[bezpecnaPozice])
  ) {
    return null;
  }

  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(
      "cs",
      { granularity: "word" }
    );

    const segment = [
      ...segmenter.segment(hodnota)
    ].find(cast => (
      cast.isWordLike &&
      bezpecnaPozice >= cast.index &&
      bezpecnaPozice <
        cast.index + cast.segment.length
    ));

    if (segment) {
      return {
        start: segment.index,
        end: segment.index + segment.segment.length
      };
    }
  }

  let start = bezpecnaPozice;
  let end = bezpecnaPozice + 1;

  while (
    start > 0 &&
    jeZnakSlova(hodnota[start - 1])
  ) {
    start -= 1;
  }

  while (
    end < hodnota.length &&
    jeZnakSlova(hodnota[end])
  ) {
    end += 1;
  }

  return { start, end };
}


function vyberSlovoVTodoTextarea(text) {
  if (!text || text.hidden) {
    return false;
  }

  const rozsah = najdiRozsahSlovaTodo(
    text.value,
    text.selectionStart ?? 0
  );

  if (!rozsah) {
    return false;
  }

  try {
    text.focus({ preventScroll: true });
  } catch {
    text.focus();
  }

  text.setSelectionRange(
    rozsah.start,
    rozsah.end
  );

  return true;
}


function closeOtherTodoEditors(exceptText = null) {
  todoList
    .querySelectorAll(".todoTextInput.todoEditing")
    .forEach(input => {
      if (input !== exceptText) {
        input.blur();
      }
    });
}


function enterTodoEditMode(
  text,
  display,
  cursorPosition = null
) {
  closeOtherTodoEditors(text);

  const todoItem = text.closest(".todoItem");

  if (todoItem?.dataset.todoId) {
    selectedTodoId = todoItem.dataset.todoId;
  }

  display.hidden = true;
  text.hidden = false;
  text.classList.add("todoEditing");

  /*
   * Focus musí zůstat souvislý. Hlavně po Enteru nesmíme
   * zbourat DOM a čekat na další frame, jinak Android na
   * okamžik zavře klávesnici a znovu ji otevře.
   */
  autoResizeTodoText(text);

  try {
    text.focus({ preventScroll: true });
  } catch {
    text.focus();
  }

  const position =
    cursorPosition === null
      ? text.value.length
      : Math.max(
          0,
          Math.min(cursorPosition, text.value.length)
        );

  text.setSelectionRange(position, position);

  activeTodoEditorItem =
    text.closest(".todoItem");

  requestAnimationFrame(() => {
    autoResizeTodoText(text);
    scheduleTodoItemVisibility(activeTodoEditorItem);
  });
}


function leaveTodoEditMode(text, display) {
  const item = text.closest(".todoItem");

  const value = display.querySelector(
    ".todoTextValue"
  );

  text.classList.remove("todoEditing");

  if (value) {
    value.textContent = text.value || " ";
  }

  text.hidden = true;
  display.hidden = false;

  if (activeTodoEditorItem === item) {
    activeTodoEditorItem = null;
  }
}


function beginPendingTodoMove(
  type,
  index,
  todoItem,
  clientX,
  clientY,
  touchIdentifier = null,
  moveModeReady = false
) {
  clearPendingTodoDrag();

  pendingDragType = type;
  pendingTouchIdentifier = touchIdentifier;
  pendingTodoIndex = index;
  pendingTodoElement = todoItem;
  pendingStartX = clientX;
  pendingStartY = clientY;
  pendingTodoMoveReady = moveModeReady;

  if (moveModeReady) {
    return;
  }

  todoLongPressTimer = setTimeout(() => {
    todoLongPressTimer = null;

    if (
      pendingTodoIndex === null ||
      !pendingTodoElement
    ) {
      return;
    }

    selectTodoForMove(
      pendingTodoElement
    );

    pendingTodoMoveReady = true;
  }, TODO_LONG_PRESS_TIME);
}


/* ---------- TOUCH ---------- */

function prepareTodoTouchLongPress(event, index, todoItem) {
  lastTouchTime = performance.now();

  if (event.touches.length !== 1) {
    clearPendingTodoDrag();
    return;
  }

  const touch = event.touches[0];
  const uzJeVybrany =
    todoMoveSelectedElement === todoItem;

  if (uzJeVybrany) {
    /* MOVE MODE už je aktivní – toto gesto patří přesunu. */
    event.preventDefault();
  }

  beginPendingTodoMove(
    "touch",
    index,
    todoItem,
    touch.clientX,
    touch.clientY,
    touch.identifier,
    uzJeVybrany
  );

  document.addEventListener(
    "touchmove",
    handleTodoTouchMove,
    { passive: false }
  );

  document.addEventListener(
    "touchend",
    handleTodoTouchEnd,
    { passive: false }
  );

  document.addEventListener(
    "touchcancel",
    handleTodoTouchCancel,
    { passive: false }
  );
}


function findTrackedTouch(touchList) {
  if (pendingTouchIdentifier === null) {
    return null;
  }

  return [...touchList].find(
    touch => touch.identifier === pendingTouchIdentifier
  ) || null;
}


function handleTodoTouchMove(event) {
  if (pendingDragType !== "touch") {
    return;
  }

  const touch = findTrackedTouch(event.touches);

  if (!touch) {
    return;
  }

  const distance = Math.hypot(
    touch.clientX - pendingStartX,
    touch.clientY - pendingStartY
  );

  if (!pendingTodoMoveReady) {
    /* Uživatel začal scrollovat dřív, než doběhl long-press. */
    if (distance > TODO_LONG_PRESS_CANCEL_DISTANCE) {
      clearPendingTodoDrag();
      removeTodoTouchListeners();
    }

    return;
  }

  event.preventDefault();

  if (!todoDragActive) {
    if (distance < TODO_DRAG_START_DISTANCE) {
      return;
    }

    activateTodoDrag(
      pendingTodoIndex,
      pendingTodoElement,
      touch.clientX,
      touch.clientY
    );
  }

  updateActiveTodoDrag(
    touch.clientX,
    touch.clientY
  );
}


function handleTodoTouchEnd(event) {
  if (pendingDragType !== "touch") {
    return;
  }

  const endedTouch = findTrackedTouch(
    event.changedTouches
  );

  if (!endedTouch) {
    return;
  }

  if (todoDragActive) {
    event.preventDefault();
    finishTodoDrag(false);
  } else if (pendingTodoMoveReady) {
    /* Long-press pouze vybral řádek. MOVE MODE zůstává aktivní. */
    event.preventDefault();
    suppressTodoClickUntil =
      performance.now() + 650;
    clearPendingTodoDrag();
  } else {
    /* Krátký tap necháme běžně otevřít editaci. */
    clearPendingTodoDrag();
  }

  removeTodoTouchListeners();
}


function handleTodoTouchCancel() {
  if (todoDragActive) {
    finishTodoDrag(true);
  } else {
    clearPendingTodoDrag();
  }

  removeTodoTouchListeners();
}


function removeTodoTouchListeners() {
  document.removeEventListener(
    "touchmove",
    handleTodoTouchMove
  );

  document.removeEventListener(
    "touchend",
    handleTodoTouchEnd
  );

  document.removeEventListener(
    "touchcancel",
    handleTodoTouchCancel
  );
}


/* ---------- MYŠ ---------- */

function prepareTodoMouseLongPress(event, index, todoItem) {
  /* Syntetický mouse event po touchi ignorujeme. */
  if (performance.now() - lastTouchTime < 700) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const uzJeVybrany =
    todoMoveSelectedElement === todoItem;

  beginPendingTodoMove(
    "mouse",
    index,
    todoItem,
    event.clientX,
    event.clientY,
    null,
    uzJeVybrany
  );

  document.addEventListener(
    "mousemove",
    handleTodoMouseMove
  );

  document.addEventListener(
    "mouseup",
    handleTodoMouseUp,
    { once: true }
  );
}


function handleTodoMouseMove(event) {
  if (pendingDragType !== "mouse") {
    return;
  }

  const distance = Math.hypot(
    event.clientX - pendingStartX,
    event.clientY - pendingStartY
  );

  if (!pendingTodoMoveReady) {
    if (distance > TODO_LONG_PRESS_CANCEL_DISTANCE) {
      clearPendingTodoDrag();
      removeTodoMouseListeners();
    }

    return;
  }

  event.preventDefault();

  if (!todoDragActive) {
    if (distance < TODO_DRAG_START_DISTANCE) {
      return;
    }

    activateTodoDrag(
      pendingTodoIndex,
      pendingTodoElement,
      event.clientX,
      event.clientY
    );
  }

  updateActiveTodoDrag(
    event.clientX,
    event.clientY
  );
}


function handleTodoMouseUp() {
  if (todoDragActive) {
    finishTodoDrag(false);
  } else if (pendingTodoMoveReady) {
    suppressTodoClickUntil =
      performance.now() + 650;
    clearPendingTodoDrag();
  } else {
    clearPendingTodoDrag();
  }

  removeTodoMouseListeners();
}


function removeTodoMouseListeners() {
  document.removeEventListener(
    "mousemove",
    handleTodoMouseMove
  );

  document.removeEventListener(
    "mouseup",
    handleTodoMouseUp
  );
}


/* Aktivní TODO MOVE MODE zruší tap/klik mimo vybraný řádek. */
document.addEventListener(
  "pointerdown",
  event => {
    if (!todoMoveSelectedElement) {
      return;
    }

    if (
      todoMoveSelectedElement.contains(
        event.target
      )
    ) {
      return;
    }

    clearTodoMoveSelection();
  },
  true
);


/* ========================================
   DRAG & DROP – aktivní přesun
======================================== */

function zrusTodoDropIndikator() {
  todoList
    .querySelectorAll(
      ".todoDropBefore, .todoDropAfter"
    )
    .forEach(item => {
      item.classList.remove(
        "todoDropBefore",
        "todoDropAfter"
      );
    });
}


function activateTodoDrag(index, todoItem, clientX, clientY) {
  if (
    todoDragActive ||
    !todoItem ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    return;
  }

  draggedTodoIndex = index;
  draggedTodoElement = todoItem;

  closeOtherTodoEditors();

  const rect =
    draggedTodoElement.getBoundingClientRect();

  const activeElement = document.activeElement;

  if (
    activeElement &&
    draggedTodoElement.contains(activeElement) &&
    typeof activeElement.blur === "function"
  ) {
    activeElement.blur();
  }

  window.getSelection?.().removeAllRanges();

  todoDragActive = true;
  document.body.classList.add("todoDragging");
  todoList.classList.add("todoDragActive");

  /*
   * Stejně jako u bulletů zůstává skutečný řádek v seznamu.
   * Při pohybu ho rovnou přesouváme mezi ostatními položkami.
   * Na mobilu je původní řádek zeslabený a nad prstem běží náhled.
   */
  draggedTodoElement.classList.add(
    "todoDraggingItem"
  );

  const jeMobil = window.innerWidth < 900;

  if (jeMobil) {
    createTodoDragGhost(index, rect);

    const ghostWidth = Math.min(
      rect.width,
      Math.max(170, window.innerWidth * 0.76)
    );

    todoDragGhost.style.width = `${ghostWidth}px`;
    document.body.append(todoDragGhost);
    positionTodoDragGhost(clientX, clientY);
  }

  suppressTodoClickUntil =
    performance.now() + 650;
}


function createTodoDragGhost(index, rect) {
  const todo = activeTodos[index] || {
    text: "",
    completed: false
  };

  todoDragGhost = document.createElement("div");
  todoDragGhost.classList.add(
    "todoItem",
    "todoDragGhost"
  );

  if (todo.completed === true) {
    todoDragGhost.classList.add("todoCompleted");
  }

  const ghostCheckbox = document.createElement("span");
  ghostCheckbox.classList.add("todoDragGhostCheckbox");

  if (todo.completed === true) {
    ghostCheckbox.textContent = "✓";
  }

  const ghostText = document.createElement("div");
  ghostText.classList.add("todoDragGhostText");
  ghostText.textContent = todo.text || " ";

  if (todo.highlightColor) {
    ghostText.style.backgroundColor =
      todo.highlightColor;
  }

  todoDragGhost.append(
    ghostCheckbox,
    ghostText
  );

  todoDragGhost.style.minHeight = `${rect.height}px`;
}


function positionTodoDragGhost(clientX, clientY) {
  if (!todoDragGhost) {
    return;
  }

  const ghostHeight = todoDragGhost.offsetHeight;
  const ghostWidth = todoDragGhost.offsetWidth;

  const left = Math.max(
    8,
    Math.min(
      clientX - ghostWidth / 2,
      window.innerWidth - ghostWidth - 8
    )
  );

  let top = clientY - TODO_GHOST_LIFT;

  const minTop = 8;
  const maxTop = Math.max(
    minTop,
    window.innerHeight - ghostHeight - 8
  );

  top = Math.min(
    maxTop,
    Math.max(minTop, top)
  );

  todoDragGhost.style.left = `${left}px`;
  todoDragGhost.style.top = `${top}px`;
}


function presunTodoPodlePozice(clientY) {
  if (
    !todoDragActive ||
    !draggedTodoElement
  ) {
    return;
  }

  zrusTodoDropIndikator();

  const polozky = [
    ...todoList.querySelectorAll(
      ":scope > .todoItem"
    )
  ].filter(
    item => item !== draggedTodoElement
  );

  for (const item of polozky) {
    const rect = item.getBoundingClientRect();
    const stred = rect.top + rect.height / 2;

    if (clientY < stred) {
      item.classList.add("todoDropBefore");

      if (draggedTodoElement.nextSibling !== item) {
        todoList.insertBefore(
          draggedTodoElement,
          item
        );
      }

      return;
    }
  }

  const posledniPolozka =
    polozky[polozky.length - 1];

  if (posledniPolozka) {
    posledniPolozka.classList.add(
      "todoDropAfter"
    );
  }

  if (todoList.lastElementChild !== draggedTodoElement) {
    todoList.append(draggedTodoElement);
  }
}


function autoScrollTodoList(clientY) {
  const rect = todoList.getBoundingClientRect();
  const edgeSize = 56;
  const scrollStep = 12;

  if (clientY < rect.top + edgeSize) {
    todoList.scrollTop -= scrollStep;
    return;
  }

  if (clientY > rect.bottom - edgeSize) {
    todoList.scrollTop += scrollStep;
  }
}


function updateActiveTodoDrag(clientX, clientY) {
  if (!todoDragActive) {
    return;
  }

  positionTodoDragGhost(clientX, clientY);
  autoScrollTodoList(clientY);
  presunTodoPodlePozice(clientY);
}


function obnovPuvodniPoziciTodo() {
  if (
    !draggedTodoElement ||
    draggedTodoIndex === null
  ) {
    return;
  }

  const ostatniPolozky = [
    ...todoList.querySelectorAll(
      ":scope > .todoItem"
    )
  ].filter(
    item => item !== draggedTodoElement
  );

  const cilovaPolozka =
    ostatniPolozky[draggedTodoIndex] || null;

  if (cilovaPolozka) {
    todoList.insertBefore(
      draggedTodoElement,
      cilovaPolozka
    );
  } else {
    todoList.append(draggedTodoElement);
  }
}


function ulozPoradiTodoPodleDom() {
  const poradiId = [
    ...todoList.querySelectorAll(
      ":scope > .todoItem"
    )
  ]
    .map(item => item.dataset.todoId)
    .filter(Boolean);

  if (poradiId.length !== activeTodos.length) {
    return false;
  }

  const todoPodleId = new Map(
    activeTodos.map(todo => [todo.id, todo])
  );

  const novePoradi = poradiId
    .map(id => todoPodleId.get(id))
    .filter(Boolean);

  if (novePoradi.length !== activeTodos.length) {
    return false;
  }

  activeTodos = novePoradi;
  refreshTodoIndexes();

  return true;
}


function cleanupTodoDrag() {
  zrusTodoDropIndikator();

  todoDragGhost?.remove();

  draggedTodoElement?.classList.remove(
    "todoDraggingItem"
  );

  todoDragGhost = null;
  draggedTodoElement = null;
  todoDragActive = false;

  todoList.classList.remove("todoDragActive");
  document.body.classList.remove("todoDragging");
}


function finishTodoDrag(cancelled = false) {
  const fromIndex = draggedTodoIndex;

  if (cancelled) {
    obnovPuvodniPoziciTodo();
  } else {
    ulozPoradiTodoPodleDom();
  }

  cleanupTodoDrag();
  clearPendingTodoDrag();

  draggedTodoIndex = null;

  if (cancelled) {
    /*
     * Při touchcancel necháme MOVE MODE aktivní,
     * aby mohl uživatel přesun bez nového long-pressu zopakovat.
     */
    return;
  }

  /* Skutečný drop vždy ukončí MOVE MODE. */
  clearTodoMoveSelection();

  /*
   * fromIndex necháváme kvůli čitelnosti stavu a případnému debugování.
   * Pořadí samotné už je uloženo přímo podle aktuálního DOM.
   */
  void fromIndex;
}


/* ========================================
   VYKRESLENÍ TODO
======================================== */

function getTodoItemIndex(todoItem) {
  const index = Number(todoItem.dataset.todoIndex);

  return Number.isInteger(index)
    ? index
    : -1;
}

function refreshTodoIndexes() {
  [...todoList.querySelectorAll(".todoItem")]
    .forEach((item, index) => {
      item.dataset.todoIndex = index;

      const display =
        item.querySelector(".todoTextDisplay");

      const input =
        item.querySelector(".todoTextInput");

      display?.setAttribute(
        "aria-label",
        `TODO položka ${index + 1}`
      );

      input?.setAttribute(
        "aria-label",
        `Upravit TODO položku ${index + 1}`
      );
    });
}

function createTodoItem(todo, index) {
  const todoItem = document.createElement("div");
  todoItem.classList.add("todoItem");
  todoItem.dataset.todoIndex = index;
  todoItem.dataset.todoId = todo.id;

  if (todo.completed === true) {
    todoItem.classList.add("todoCompleted");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.completed === true;
  checkbox.setAttribute(
    "aria-label",
    "Označit jako hotové"
  );

  checkbox.addEventListener("change", () => {
    const currentIndex = getTodoItemIndex(todoItem);

    if (currentIndex < 0 || !activeTodos[currentIndex]) {
      return;
    }

    activeTodos[currentIndex].completed = checkbox.checked;
    todoItem.classList.toggle(
      "todoCompleted",
      checkbox.checked
    );
  });

  const textDisplay = document.createElement("div");
  textDisplay.classList.add("todoTextDisplay");
  textDisplay.setAttribute(
    "aria-label",
    `TODO položka ${index + 1}`
  );

  const textValue = document.createElement("span");
  textValue.classList.add("todoTextValue");
  textValue.textContent = todo.text || " ";

  if (todo.highlightColor) {
    textValue.style.backgroundColor =
      todo.highlightColor;
  }

  textDisplay.append(textValue);

  const text = document.createElement("textarea");
  text.rows = 1;
  text.enterKeyHint = "enter";
  text.value = todo.text;
  text.classList.add("todoTextInput");
  text.hidden = true;
  text.setAttribute(
    "aria-label",
    `Upravit TODO položku ${index + 1}`
  );

  if (todo.highlightColor) {
    text.style.backgroundColor =
      todo.highlightColor;
    text.style.borderRadius = "4px";
  }

  textDisplay.addEventListener("click", () => {
    if (performance.now() < suppressTodoClickUntil) {
      return;
    }

    selectedTodoId = todo.id;

    cekaniNaDruhyTapTodo = {
      todoId: todo.id,
      cas: performance.now()
    };

    enterTodoEditMode(text, textDisplay);
  });

  text.addEventListener(
    "pointerup",
    (event) => {
      if (
        !cekaniNaDruhyTapTodo ||
        cekaniNaDruhyTapTodo.todoId !== todo.id
      ) {
        return;
      }

      if (
        performance.now() - cekaniNaDruhyTapTodo.cas >
        TODO_DOUBLE_TAP_TIME
      ) {
        cekaniNaDruhyTapTodo = null;
        return;
      }

      cekaniNaDruhyTapTodo = null;

      /*
       * První tap otevřel editaci, druhý tap už leží v textarea.
       * Uprostřed slova vybereme celé slovo. Mimo slovo otevřeme
       * stejnou nabídku Vložit / Vše jako v hlavním editoru.
       */
      requestAnimationFrame(() => {
        const vybranoSlovo =
          vyberSlovoVTodoTextarea(text);

        if (vybranoSlovo) {
          return;
        }

        document.dispatchEvent(
          new CustomEvent(
            "lubanote:todo-kurzor-menu",
            {
              detail: {
                textarea: text,
                x: event.clientX,
                y: event.clientY
              }
            }
          )
        );
      });
    }
  );

  text.addEventListener("blur", () => {
    leaveTodoEditMode(text, textDisplay);
  });

  text.addEventListener("input", event => {
    const currentIndex = getTodoItemIndex(todoItem);

    if (currentIndex < 0 || !activeTodos[currentIndex]) {
      return;
    }

    activeTodos[currentIndex].text = text.value;
    textValue.textContent = text.value || " ";

    if (
      text.value === "" &&
      typeof event.inputType === "string" &&
      event.inputType.startsWith("delete")
    ) {
      removeTodo(currentIndex);
      return;
    }

    autoResizeTodoText(text);
    scheduleTodoItemVisibility(todoItem);
  });

  text.addEventListener("keydown", event => {
    const currentIndex = getTodoItemIndex(todoItem);

    if (currentIndex < 0 || !activeTodos[currentIndex]) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      const cursorPosition =
        text.selectionStart ?? text.value.length;

      const textBefore =
        text.value.slice(0, cursorPosition);

      const textAfter =
        text.value.slice(cursorPosition);

      activeTodos[currentIndex].text = textBefore;
      text.value = textBefore;
      textValue.textContent = textBefore || " ";
      autoResizeTodoText(text);

      const newTodo = normalizeTodo({
        text: textAfter,
        completed: false
      });

      activeTodos.splice(
        currentIndex + 1,
        0,
        newTodo
      );

      /*
       * Klíčová část pro Android klávesnici:
       * nevykreslujeme celý seznam znovu. Přidáme jen nový DOM
       * řádek vedle právě editovaného textarea. Focus tedy nikdy
       * nezmizí z dokumentu a IME nemusí zajet a znovu vyjet.
       */
      const newItem = createTodoItem(
        newTodo,
        currentIndex + 1
      );

      todoItem.insertAdjacentElement(
        "afterend",
        newItem
      );

      refreshTodoIndexes();

      const newInput =
        newItem.querySelector(".todoTextInput");

      const newDisplay =
        newItem.querySelector(".todoTextDisplay");

      if (newInput && newDisplay) {
        enterTodoEditMode(
          newInput,
          newDisplay,
          0
        );
      }

      return;
    }

    if (
      event.key === "Backspace" &&
      text.value === ""
    ) {
      event.preventDefault();
      removeTodo(currentIndex);
    }
  });

  todoItem.addEventListener(
    "touchstart",
    event => {
      prepareTodoTouchLongPress(
        event,
        getTodoItemIndex(todoItem),
        todoItem
      );
    },
    { passive: false }
  );

  todoItem.addEventListener(
    "mousedown",
    event => {
      prepareTodoMouseLongPress(
        event,
        getTodoItemIndex(todoItem),
        todoItem
      );
    }
  );

  todoItem.addEventListener("contextmenu", event => {
    if (
      todoDragActive ||
      todoMoveSelectedElement === todoItem ||
      pendingTodoElement === todoItem
    ) {
      event.preventDefault();
    }
  });

  todoItem.addEventListener(
    "click",
    event => {
      if (
        performance.now() < suppressTodoClickUntil ||
        todoMoveSelectedElement === todoItem
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );

  todoItem.append(
    checkbox,
    textDisplay,
    text
  );

  autoResizeTodoText(text);

  return todoItem;
}

function renderTodos() {
  clearTodoMoveSelection();
  todoList.innerHTML = "";

  /* Starý textarea už slouží jen jako kompatibilní datový prvek. */
  todoModalText.hidden = true;

  if (activeTodos.length === 0) {
    todoList.hidden = true;

    if (todoRichText) {
      todoRichText.hidden = false;
    }

    return;
  }

  todoList.hidden = false;

  if (todoRichText) {
    todoRichText.hidden = true;
  }

  activeTodos.forEach((todo, index) => {
    todoList.append(
      createTodoItem(todo, index)
    );
  });
}



/* ========================================
   VEŘEJNÉ API – BARVA A PLÁNOVÁNÍ TODO
======================================== */

window.LubaNoteTodos = {
  jeTodoRezimAktivni: () =>
    !todoList.hidden && activeTodos.length > 0,

  ziskejVybraneTodo: () => {
    const todo = getSelectedTodo();
    return todo ? { ...todo } : null;
  },

  ziskejAktivniTodos: getActiveTodosSnapshot,

  nastavBarvuVybranehoTodo: (color) =>
    setSelectedTodoHighlight(color),

  odstranBarvuVybranehoTodo: () =>
    setSelectedTodoHighlight(""),

  ukonciEditaciVybranehoTodo:
    blurSelectedTodoEditor,

  oznacTodoJakoHotove:
    setTodoCompletedById,

  zobrazTodoPodleId:
    scrollTodoIntoView
};
