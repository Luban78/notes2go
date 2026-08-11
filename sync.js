function getLocalNotesForSync() {
  const notes = loadTask();
  
  console.log(
    "Sync: lokální poznámky:",
    notes.length
  );
  
  return notes;
}

//getLocalNotesForSync();

const localNotes = getLocalNotesForSync();

console.log(
  "Sync: poznámky s ID:",
  localNotes.filter((note) => note.id).length,
  "/",
  localNotes.length
);

console.log(
  localNotes.map((note) => ({
    title: note.title,
    id: note.id
  }))
);


async function uploadLocalNoteToSupabase(note) {
  const user = await getCurrentUser();

  if (!user) {
    console.log("Sync upload: uživatel není přihlášen");
    return;
  }

  const { error } =
    await supabaseClient
      .from("notes")
      .upsert({
        id: note.id,
        user_id: user.id,
        data: note,
        updated_at:
  note.updatedAt || new Date().toISOString(),
        deleted_at: null
      });

  if (error) {
    console.log("Sync upload: CHYBA", error.message);
  } else {
    console.log("Sync upload: OK", note.title);
  }
}

async function markNoteDeletedInSupabase(note) {
  const user = await getCurrentUser();

  if (!user || !note?.id) {
    return;
  }

  const { error } =
    await supabaseClient
      .from("notes")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", note.id)
      .eq("user_id", user.id);

  if (error) {
    console.log("Sync delete: CHYBA", error.message);
  } else {
    console.log("Sync delete: OK", note.title);
  }
}

async function getCloudNotesForSync() {
  const { data, error } =
await supabaseClient
  .from("notes")
  .select("*");

  if (error) {
    console.log(
      "Sync download: CHYBA",
      error.message
    );

    return [];
  }

  return data;
}

async function testCloudNotesForSync() {
  const cloudNotes =
    await getCloudNotesForSync();

  console.log(
    "Sync download: nalezeno",
    cloudNotes.length,
    cloudNotes.map((row) => row.data?.title)
  );
}

function convertCloudRowsToLocalNotes(cloudRows) {
  return cloudRows.map((row) => ({
    ...row.data,
    id: row.id,
    updatedAt: row.updated_at
  }));
}


async function testConvertedCloudNotes() {
  const cloudRows =
    await getCloudNotesForSync();
    
  const cloudMap =
  createCloudNotesMap(cloudRows);
  for (const note of localNotes) {
  if (!note.id) {
    continue;
  }
  
  const cloudRow =
    cloudMap.get(note.id);
  
  const localTime =
    new Date(note.updatedAt || 0).getTime();
  
  const cloudTime =
    cloudRow ?
    new Date(cloudRow.updated_at || 0).getTime() :
    0;
  
  if (!cloudRow || localTime > cloudTime) {
    await uploadLocalNoteToSupabase(note);
  }
}


  const localNotes =
    convertCloudRowsToLocalNotes(cloudRows);

  console.log(
    "Sync convert:",
    localNotes.map((note) => ({
      id: note.id,
      title: note.title
    }))
  );
}


//testCloudNotesForSync();

//testConvertedCloudNotes();
async function downloadCloudNotesToLocal() {
  const cloudRows =
    await getCloudNotesForSync();

  const cloudNotes =
    convertCloudRowsToLocalNotes(cloudRows);

  saveAllTasks(cloudNotes);
console.log(
  "Stažené názvy:",
  cloudNotes.map((note) => note.title)
);
  console.log(
    "Sync download: uloženo",
    cloudNotes.length
  );
}

//downloadCloudNotesToLocal();

function mergeLocalAndCloudNotes(localNotes, cloudRows) {
  const cloudNotes =
    convertCloudRowsToLocalNotes(cloudRows);
  const deletedIds = new Set(
  cloudRows
  .filter((row) => row.deleted_at)
  .map((row) => row.id)
);

  const mergedMap = new Map();

  localNotes.forEach((note) => {
  if (note.id && !deletedIds.has(note.id)) {
    mergedMap.set(note.id, note);
  }
});

  cloudNotes.forEach((note) => {
      if (!note.id) {
        return;
      }
      
      if (deletedIds.has(note.id)) {
        return;
      }
      
      const localNote =
        mergedMap.get(note.id);
  if (!localNote) {
    mergedMap.set(note.id, note);
    return;
  }
  
  const localTime =
    new Date(localNote.updatedAt || 0).getTime();
  
  const cloudTime =
    new Date(note.updatedAt || 0).getTime();
  
  if (cloudTime > localTime) {
    mergedMap.set(note.id, note);
  }
});

  return Array.from(mergedMap.values());
}

async function syncNotes() {
  const localNotes =
    getLocalNotesForSync();

  const cloudRows =
    await getCloudNotesForSync();

  const mergedNotes =
    mergeLocalAndCloudNotes(
      localNotes,
      cloudRows
    );

  saveAllTasks(mergedNotes);

  renderTasks();
  
  console.log(
    "Sync hotov:",
    mergedNotes.length
  );
}

function createCloudNotesMap(cloudRows) {
  return new Map(
    cloudRows.map((row) => [
      row.id,
      row
    ])
  );
}

syncNotes();
