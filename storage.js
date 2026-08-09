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
  
function updateTask(index, updatedTask) {
  const tasks = loadTask();
  console.log(index);
  console.log(updatedTask);
  tasks[index] = updatedTask;
  
  localStorage.setItem("savedTask", JSON.stringify(tasks));
  
}


function exportTasks() {
  const tasks = loadTask();

  const data = JSON.stringify(tasks, null, 2);

  const blob = new Blob([data], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = "notes2go-backup.json";

  document.body.appendChild(link);

  link.click();

  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}





function importTasks(file) {
  const reader = new FileReader();

  reader.onload = () => {
    const importedTasks = JSON.parse(reader.result);

    localStorage.setItem(
      "savedTask",
      JSON.stringify(importedTasks)
    );

    location.reload();
  };

  reader.readAsText(file);
}
