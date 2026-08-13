function getLocalNotesForSync() {
  return loadTask();
}

async function uploadLocalNoteToSupabase(note) {
  const user = await getCurrentUser();

  if (!user || !note?.id) {
    return false;
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
    console.error("Sync upload error:", error.message);
    return false;
  }

  return true;
}

async function markNoteDeletedInSupabase(note) {
  const user = await getCurrentUser();

  if (!user || !note?.id) {
    return false;
  }

  const deletedAt = new Date().toISOString();

  const { error } =
    await supabaseClient
      .from("notes")
      .update({
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq("id", note.id)
      .eq("user_id", user.id);

  if (error) {
    console.error("Sync delete error:", error.message);
    return false;
  }

  return true;
}

async function getCloudNotesForSync() {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const { data, error } =
    await supabaseClient
      .from("notes")
      .select("*");

  if (error) {
    console.error("Sync download error:", error.message);
    return [];
  }

  return data || [];
}

function convertCloudRowsToLocalNotes(cloudRows) {
  return cloudRows.map((row) => ({
    ...row.data,
    id: row.id,
    updatedAt: row.updated_at
  }));
}

function createCloudNotesMap(cloudRows) {
  return new Map(
    cloudRows.map((row) => [
      row.id,
      row
    ])
  );
}

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
    if (!note.id || deletedIds.has(note.id)) {
      return;
    }

    const localNote = mergedMap.get(note.id);

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
  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  const localNotes = getLocalNotesForSync();

  /* Přeneseme i starší lokální Planner položky do objektů poznámek,
     aby se automaticky dostaly do stejného Supabase syncu. */
  if (
    typeof migrateLocalPlannedItemsIntoNotes === "function" &&
    migrateLocalPlannedItemsIntoNotes(localNotes)
  ) {
    saveAllTasks(localNotes);
  }

  const cloudRows = await getCloudNotesForSync();
  const cloudMap = createCloudNotesMap(cloudRows);

  for (const note of localNotes) {
    if (!note.id) {
      continue;
    }

    const cloudRow = cloudMap.get(note.id);

    if (cloudRow?.deleted_at) {
      continue;
    }

    const localTime =
      new Date(note.updatedAt || 0).getTime();

    const cloudTime = cloudRow
      ? new Date(cloudRow.updated_at || 0).getTime()
      : 0;

    if (!cloudRow || localTime > cloudTime) {
      await uploadLocalNoteToSupabase(note);
    }
  }

  const mergedNotes =
    mergeLocalAndCloudNotes(
      localNotes,
      cloudRows
    );

  saveAllTasks(mergedNotes);
  renderTasks();
}

syncNotes();
