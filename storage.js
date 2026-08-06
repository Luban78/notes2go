function saveTask(task){
 const tasks = loadTask();
 tasks.push(task);
  localStorage.setItem("savedTask", JSON.stringify(tasks));
}

function loadTask() {
  const savedTask = localStorage.getItem("savedTask");
  const parsedTask = JSON.parse(savedTask);
  if (parsedTask){
    return parsedTask;
  }else{
    return [];
  }
  
  console.log(savedTask);
  console.log(parsedTask);
}

function deleteTask(index) {
  console.log(index);
  const tasks = loadTask();
  tasks.splice(index, 1);
  localStorage.setItem("savedTask", JSON.stringify(tasks));
}

function toggleTaskCompleted(index) {
  const tasks = loadTask();
  console.log(tasks[index]);
  tasks[index].completed = !tasks[index].completed;
    localStorage.setItem("savedTask", JSON.stringify(tasks));
  }
  
