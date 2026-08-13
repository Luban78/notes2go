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


/* ========================================
   DRAG & DROP – stav
======================================== */

let draggedTodoIndex = null;
let draggedTodoElement = null;
let todoDragGhost = null;
let todoDropPlaceholder = null;
let todoDragActive = false;

let todoLongPressTimer = null;
let pendingDragType = null;
let pendingTouchIdentifier = null;
let pendingTodoIndex = null;
let pendingTodoElement = null;
let pendingStartX = 0;
let pendingStartY = 0;

let dragPointerOffsetY = 0;
let dragGhostLeft = 0;
let suppressTodoClickUntil = 0;
let lastTouchTime = 0;

const TODO_LONG_PRESS_TIME = 420;
const TODO_LONG_PRESS_CANCEL_DISTANCE = 32;
const TODO_GHOST_LIFT = 48;


/* ========================================
   ZÁKLADNÍ TODO FUNKCE
======================================== */

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
  renderTodos();
}

function loadTodos(todos) {
  activeTodos = Array.isArray(todos)
    ? todos.map(todo => ({
        text: todo?.text ?? "",
        completed: todo?.completed === true
      }))
    : [];

  renderTodos();
}

addTodoButton.addEventListener("click", () => {
  if (activeTodos.length > 0) {
    activeTodos.push({
      text: "",
      completed: false
    });

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
    ? todoLines.map(line => ({
        text: line,
        completed: false
      }))
    : [{
        text: "",
        completed: false
      }];

  todoModalText.value = "";

  if (todoRichText) {
    todoRichText.innerHTML = "";
  }

  renderTodos();
  focusTodo(0, activeTodos[0].text.length);
});

function removeTodo(index) {
  activeTodos.splice(index, 1);

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
   DRAG & DROP – dlouhé podržení

   Ovládání:
   - krátké klepnutí na text = editace
   - pokud už text edituji, dlouhé podržení =
     systémový výběr / kopírování textu
   - dlouhé podržení na needitovaném řádku = přesun
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
}

function isTodoTextAlreadyEditing(event) {
  const text = event.target.closest?.(".todoTextInput");

  /*
   * Textarea je aktivní pouze v režimu editace. V běžném režimu
   * je nad ní samostatný textový prvek, takže Android nemá co
   * označovat a long-press může spolehlivě patřit přesunu.
   */
  return Boolean(
    text &&
    text.classList.contains("todoEditing")
  );
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

  text.classList.remove("todoEditing");
  display.textContent = text.value || " ";
  text.hidden = true;
  display.hidden = false;

  if (activeTodoEditorItem === item) {
    activeTodoEditorItem = null;
  }
}

function beginPendingTodoDrag(
  type,
  index,
  todoItem,
  clientX,
  clientY,
  touchIdentifier = null
) {
  clearPendingTodoDrag();

  pendingDragType = type;
  pendingTouchIdentifier = touchIdentifier;
  pendingTodoIndex = index;
  pendingTodoElement = todoItem;
  pendingStartX = clientX;
  pendingStartY = clientY;

  todoLongPressTimer = setTimeout(() => {
    todoLongPressTimer = null;

    if (
      pendingTodoIndex === null ||
      !pendingTodoElement
    ) {
      return;
    }

    activateTodoDrag(
      pendingTodoIndex,
      pendingTodoElement,
      pendingStartX,
      pendingStartY
    );
  }, TODO_LONG_PRESS_TIME);
}


/* ---------- TOUCH ---------- */

function prepareTodoTouchLongPress(event, index, todoItem) {
  lastTouchTime = performance.now();

  if (event.touches.length !== 1) {
    clearPendingTodoDrag();
    return;
  }

  /*
   * Pokud už v textarea bliká kurzor, necháme Androidu
   * jeho nativní dlouhé podržení – označení a kopírování.
   */
  if (isTodoTextAlreadyEditing(event)) {
    return;
  }

  const touch = event.touches[0];

  beginPendingTodoDrag(
    "touch",
    index,
    todoItem,
    touch.clientX,
    touch.clientY,
    touch.identifier
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

  if (!todoDragActive) {
    const distance = Math.hypot(
      touch.clientX - pendingStartX,
      touch.clientY - pendingStartY
    );

    /*
     * Uživatel začal normálně scrollovat dřív,
     * než doběhl long-press. Drag zrušíme a scroll necháme být.
     */
    if (distance > TODO_LONG_PRESS_CANCEL_DISTANCE) {
      clearPendingTodoDrag();
      removeTodoTouchListeners();
    }

    return;
  }

  event.preventDefault();
  updateActiveTodoDrag(touch.clientY);
}

function handleTodoTouchEnd(event) {
  if (pendingDragType !== "touch") {
    return;
  }

  const endedTouch = findTrackedTouch(event.changedTouches);

  if (!endedTouch) {
    return;
  }

  if (todoDragActive) {
    event.preventDefault();
    finishTodoDrag(false);
  } else {
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

  if (isTodoTextAlreadyEditing(event)) {
    return;
  }

  beginPendingTodoDrag(
    "mouse",
    index,
    todoItem,
    event.clientX,
    event.clientY
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

  if (!todoDragActive) {
    const distance = Math.hypot(
      event.clientX - pendingStartX,
      event.clientY - pendingStartY
    );

    if (distance > TODO_LONG_PRESS_CANCEL_DISTANCE) {
      clearPendingTodoDrag();
      removeTodoMouseListeners();
    }

    return;
  }

  event.preventDefault();
  updateActiveTodoDrag(event.clientY);
}

function handleTodoMouseUp() {
  if (todoDragActive) {
    finishTodoDrag(false);
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


/* ========================================
   DRAG & DROP – aktivní přesun
======================================== */

function activateTodoDrag(index, todoItem, clientX, clientY) {
  if (todoDragActive) {
    return;
  }

  draggedTodoIndex = index;
  draggedTodoElement = todoItem;

  /* Při skutečném přesunu zavřeme případnou editaci jiného řádku. */
  closeOtherTodoEditors();

  const rect =
    draggedTodoElement.getBoundingClientRect();

  /*
   * Pokud se textarea při prvním dotyku mezitím zaměřila,
   * drag má přednost. Při dalším long-pressu už bude textarea
   * předem aktivní a prepare... drag vůbec nespustí.
   */
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

  todoDropPlaceholder = document.createElement("div");
  todoDropPlaceholder.classList.add("todoDropPlaceholder");
  todoDropPlaceholder.style.height = `${rect.height}px`;

  todoList.insertBefore(
    todoDropPlaceholder,
    draggedTodoElement
  );

  draggedTodoElement.classList.add("dragSource");

  createTodoDragGhost(index, rect);

  dragPointerOffsetY = clientY - rect.top;
  dragGhostLeft = rect.left;

  todoDragGhost.style.width = `${rect.width}px`;
  todoDragGhost.style.left = `${dragGhostLeft}px`;

  document.body.append(todoDragGhost);
  positionTodoDragGhost(clientY);

  suppressTodoClickUntil = performance.now() + 650;

  if (navigator.vibrate) {
    navigator.vibrate(18);
  }
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

  todoDragGhost.append(
    ghostCheckbox,
    ghostText
  );

  todoDragGhost.style.minHeight = `${rect.height}px`;
}

function positionTodoDragGhost(clientY) {
  if (!todoDragGhost) {
    return;
  }

  /*
   * Ghost je lehce NAD prstem. Uživatel tak vidí celý text,
   * i když drží řádek přímo přes jeho obsah.
   */
  const ghostHeight = todoDragGhost.offsetHeight;

  const requestedTop =
    clientY -
    dragPointerOffsetY -
    TODO_GHOST_LIFT;

  const minTop = 8;
  const maxTop = Math.max(
    minTop,
    window.innerHeight - ghostHeight - 8
  );

  const top = Math.min(
    maxTop,
    Math.max(minTop, requestedTop)
  );

  todoDragGhost.style.top = `${top}px`;
}

function updateTodoDropPlaceholder(clientY) {
  if (!todoDropPlaceholder) {
    return;
  }

  const items = [
    ...todoList.querySelectorAll(
      ".todoItem:not(.dragSource)"
    )
  ];

  for (const item of items) {
    const rect = item.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;

    if (clientY < middle) {
      if (todoDropPlaceholder.nextSibling !== item) {
        todoList.insertBefore(
          todoDropPlaceholder,
          item
        );
      }
      return;
    }
  }

  if (todoList.lastElementChild !== todoDropPlaceholder) {
    todoList.append(todoDropPlaceholder);
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

function updateActiveTodoDrag(clientY) {
  if (!todoDragActive) {
    return;
  }

  positionTodoDragGhost(clientY);
  autoScrollTodoList(clientY);
  updateTodoDropPlaceholder(clientY);
}

function getTodoDropIndex() {
  if (!todoDropPlaceholder) {
    return draggedTodoIndex;
  }

  let index = 0;

  for (const child of todoList.children) {
    if (child === todoDropPlaceholder) {
      return index;
    }

    if (
      child.classList?.contains("todoItem") &&
      child !== draggedTodoElement
    ) {
      index += 1;
    }
  }

  return index;
}

function cleanupTodoDrag() {
  todoDragGhost?.remove();
  todoDropPlaceholder?.remove();
  draggedTodoElement?.classList.remove("dragSource");

  todoDragGhost = null;
  todoDropPlaceholder = null;
  draggedTodoElement = null;
  todoDragActive = false;

  document.body.classList.remove("todoDragging");
}

function finishTodoDrag(cancelled = false) {
  const fromIndex = draggedTodoIndex;

  const toIndex =
    !cancelled && todoDragActive
      ? getTodoDropIndex()
      : fromIndex;

  cleanupTodoDrag();
  clearPendingTodoDrag();

  draggedTodoIndex = null;

  if (
    !cancelled &&
    fromIndex !== null &&
    toIndex !== null &&
    fromIndex !== toIndex
  ) {
    moveTodo(fromIndex, toIndex);
    renderTodos();
  }
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
  textDisplay.textContent = todo.text || " ";
  textDisplay.setAttribute(
    "aria-label",
    `TODO položka ${index + 1}`
  );

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

  textDisplay.addEventListener("click", () => {
    if (performance.now() < suppressTodoClickUntil) {
      return;
    }

    enterTodoEditMode(text, textDisplay);
  });

  text.addEventListener("blur", () => {
    leaveTodoEditMode(text, textDisplay);
  });

  text.addEventListener("input", event => {
    const currentIndex = getTodoItemIndex(todoItem);

    if (currentIndex < 0 || !activeTodos[currentIndex]) {
      return;
    }

    activeTodos[currentIndex].text = text.value;
    textDisplay.textContent = text.value || " ";

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
      textDisplay.textContent = textBefore || " ";
      autoResizeTodoText(text);

      const newTodo = {
        text: textAfter,
        completed: false
      };

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
    { passive: true }
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
      (
        todoLongPressTimer !== null &&
        pendingTodoElement === todoItem
      )
    ) {
      event.preventDefault();
    }
  });

  todoItem.addEventListener(
    "click",
    event => {
      if (performance.now() < suppressTodoClickUntil) {
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

