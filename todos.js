/* ========================================
   TODO POLOŽKY NOTES2GO
======================================== */

const todoModalText =
  document.getElementById("modalText");

const todoList =
  document.getElementById("todoList");

const addTodoButton =
  document.getElementById("addTodoButton");

let activeTodos = [];
let draggedTodoIndex = null;

function autoResizeTodoText(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function focusTodo(index, cursorPosition = null) {
  requestAnimationFrame(() => {
    const inputs =
      todoList.querySelectorAll(".todoTextInput");

    const input = inputs[index];

    if (!input) {
      return;
    }

    input.focus();

    const position =
      cursorPosition === null
        ? input.value.length
        : cursorPosition;

    input.setSelectionRange(position, position);
  });
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
  /* Pokud už jsme v TODO režimu, přidáme další položku. */
  if (activeTodos.length > 0) {
    activeTodos.push({
      text: "",
      completed: false
    });

    renderTodos();
    focusTodo(activeTodos.length - 1, 0);
    return;
  }

  /* Převod běžného textu po řádcích na TODO. */
  const todoLines = todoModalText.value
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
  renderTodos();
  focusTodo(0, activeTodos[0].text.length);
});

function removeTodo(index) {
  activeTodos.splice(index, 1);

  if (activeTodos.length === 0) {
    renderTodos();
    todoModalText.focus();
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

function startTodoDrag(event, index) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  event.preventDefault();
  draggedTodoIndex = index;
  document.body.classList.add("todoDragging");

  document.addEventListener(
    "pointermove",
    handleTodoDragMove,
    { passive: false }
  );

  document.addEventListener(
    "pointerup",
    finishTodoDrag,
    { once: true }
  );

  document.addEventListener(
    "pointercancel",
    finishTodoDrag,
    { once: true }
  );
}

function handleTodoDragMove(event) {
  if (draggedTodoIndex === null) {
    return;
  }

  event.preventDefault();

  const element =
    document.elementFromPoint(event.clientX, event.clientY);

  const targetItem =
    element?.closest(".todoItem");

  if (!targetItem) {
    return;
  }

  const targetIndex =
    Number(targetItem.dataset.todoIndex);

  if (
    !Number.isInteger(targetIndex) ||
    targetIndex === draggedTodoIndex
  ) {
    return;
  }

  moveTodo(draggedTodoIndex, targetIndex);
  draggedTodoIndex = targetIndex;
  renderTodos();
}

function finishTodoDrag() {
  draggedTodoIndex = null;
  document.body.classList.remove("todoDragging");

  document.removeEventListener(
    "pointermove",
    handleTodoDragMove
  );
  document.removeEventListener(
    "pointerup",
    finishTodoDrag
  );
  document.removeEventListener(
    "pointercancel",
    finishTodoDrag
  );
}

function renderTodos() {
  todoList.innerHTML = "";

  if (activeTodos.length === 0) {
    todoList.hidden = true;
    todoModalText.hidden = false;
    return;
  }

  todoList.hidden = false;
  todoModalText.hidden = true;

  activeTodos.forEach((todo, index) => {
    const todoItem = document.createElement("div");
    todoItem.classList.add("todoItem");
    todoItem.dataset.todoIndex = index;

    if (todo.completed === true) {
      todoItem.classList.add("todoCompleted");
    }

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.classList.add("todoDragHandle");
    dragHandle.textContent = "⠿";
    dragHandle.setAttribute(
      "aria-label",
      "Přesunout položku"
    );

    dragHandle.addEventListener("pointerdown", event => {
      startTodoDrag(event, index);
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.completed === true;
    checkbox.setAttribute(
      "aria-label",
      "Označit jako hotové"
    );

    checkbox.addEventListener("change", () => {
      activeTodos[index].completed = checkbox.checked;
      todoItem.classList.toggle(
        "todoCompleted",
        checkbox.checked
      );
    });

    const text = document.createElement("textarea");
    text.rows = 1;
    text.enterKeyHint = "enter";
    text.value = todo.text;
    text.classList.add("todoTextInput");
    text.setAttribute(
      "aria-label",
      `TODO položka ${index + 1}`
    );

    text.addEventListener("input", event => {
      activeTodos[index].text = text.value;

      if (
        text.value === "" &&
        typeof event.inputType === "string" &&
        event.inputType.startsWith("delete")
      ) {
        removeTodo(index);
        return;
      }

      autoResizeTodoText(text);
    });

    text.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();

        const cursorPosition =
          text.selectionStart ?? text.value.length;

        const textBefore =
          text.value.slice(0, cursorPosition);

        const textAfter =
          text.value.slice(cursorPosition);

        activeTodos[index].text = textBefore;

        activeTodos.splice(index + 1, 0, {
          text: textAfter,
          completed: false
        });

        renderTodos();
        focusTodo(index + 1, 0);
        return;
      }

      if (
        event.key === "Backspace" &&
        text.value === ""
      ) {
        event.preventDefault();
        removeTodo(index);
      }
    });

    todoItem.append(
      dragHandle,
      checkbox,
      text
    );

    todoList.append(todoItem);

    /* Výšku lze správně změřit až po vložení do DOM. */
    autoResizeTodoText(text);
  });
}
