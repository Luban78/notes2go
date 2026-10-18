CREATE OR REPLACE FUNCTION public.lubanote_get_note_changes_since(p_after_seq bigint DEFAULT 0, p_limit integer DEFAULT 200)
 RETURNS TABLE(seq bigint, note_id uuid, revision bigint, action text, source_operation text, changed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_after_seq bigint := greatest(coalesce(p_after_seq, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  if not public.lubanote_user_has_data_access(v_user_id) then
    raise exception 'account_not_active_or_plan_expired'
      using errcode = '42501';
  end if;

  return query
  select
    c.seq,
    c.note_id,
    c.revision,
    case
      when c.new_user_id = v_user_id then 'upsert'::text
      else 'remove'::text
    end as action,
    c.operation::text as source_operation,
    c.changed_at
  from public.lubanote_note_changes c
  where c.seq > v_after_seq
    and (
      c.old_user_id = v_user_id
      or c.new_user_id = v_user_id
    )
  order by c.seq asc
  limit v_limit;
end;
$function$

CREATE OR REPLACE FUNCTION public.lubanote_get_notes_by_ids_safe(p_note_ids uuid[])
 RETURNS TABLE(id uuid, user_id uuid, data jsonb, updated_at timestamp with time zone, deleted_at timestamp with time zone, deleted_by_device_id text, revision bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_requested_count integer := coalesce(cardinality(p_note_ids), 0);
begin
  if v_user_id is null then
    raise exception 'not_authenticated'
      using errcode = '42501';
  end if;

  if not public.lubanote_user_has_data_access(v_user_id) then
    raise exception 'account_not_active_or_plan_expired'
      using errcode = '42501';
  end if;

  -- Ochrana proti zneuziti targeted cesty jako noveho full snapshotu.
  -- Bezne delta/conflict pouziti ma jednotky az desitky ID.
  if v_requested_count > 200 then
    raise exception 'too_many_note_ids'
      using errcode = '22023';
  end if;

  if v_requested_count = 0 then
    return;
  end if;

  return query
  with requested_ids as (
    select distinct requested_id
    from unnest(p_note_ids) as requested_id
    where requested_id is not null
  )
  select
    n.id,
    n.user_id,
    n.data,
    n.updated_at,
    n.deleted_at,
    n.deleted_by_device_id,
    n.revision
  from requested_ids r
  join public.notes n
    on n.id = r.requested_id
  where n.user_id = v_user_id
  order by n.id;
end;
$function$

CREATE OR REPLACE FUNCTION public.save_note_safe(p_id uuid, p_data jsonb, p_expected_revision bigint, p_delete boolean DEFAULT false, p_deleted_by_device_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

DECLARE
  v_user_id uuid := auth.uid();
  v_current public.notes%ROWTYPE;

  v_server_time timestamptz := now();
  v_new_revision bigint;

  v_note_limit integer;
  v_note_count bigint;

BEGIN

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '42501';
  END IF;


  IF NOT public.lubanote_user_has_data_access(v_user_id) THEN
    RAISE EXCEPTION 'account_not_active_or_plan_expired'
      USING ERRCODE = '42501';
  END IF;


  SELECT *
  INTO v_current
  FROM public.notes
  WHERE id = p_id
  FOR UPDATE;


  -- ==========================================================
  -- NEW NOTE
  -- ==========================================================

  IF NOT FOUND THEN

    IF COALESCE(p_expected_revision, 0) <> 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'conflict', true,
        'reason', 'note_missing',
        'current_revision', null
      );
    END IF;


    -- New tombstones do not consume note quota.
    IF NOT p_delete THEN

      SELECT p.note_limit
      INTO v_note_limit
      FROM public.lubanote_user_access ua
      LEFT JOIN public.lubanote_plans p
        ON p.id = ua.plan_id
      WHERE ua.user_id = v_user_id
      FOR UPDATE OF ua;


      IF v_note_limit IS NOT NULL THEN

        SELECT count(*)
        INTO v_note_count
        FROM public.notes n
        WHERE n.user_id = v_user_id
          AND n.deleted_at IS NULL;


        IF v_note_count >= v_note_limit THEN

          RETURN jsonb_build_object(
            'ok', false,
            'conflict', false,
            'limit', true,
            'reason', 'note_limit_reached',
            'note_limit', v_note_limit,
            'current_count', v_note_count
          );

        END IF;

      END IF;

    END IF;


    INSERT INTO public.notes (
      id,
      user_id,
      data,
      updated_at,
      deleted_at,
      deleted_by_device_id,
      revision
    )
    VALUES (
      p_id,
      v_user_id,
      p_data,
      v_server_time,

      CASE
        WHEN p_delete
          THEN v_server_time
        ELSE null
      END,

      CASE
        WHEN p_delete
          THEN p_deleted_by_device_id
        ELSE null
      END,

      1
    );


    RETURN jsonb_build_object(
      'ok', true,
      'conflict', false,
      'revision', 1,
      'updated_at', v_server_time
    );

  END IF;


  -- ==========================================================
  -- EXISTING NOTE – OWNER CHECK
  -- ==========================================================

  IF v_current.user_id <> v_user_id THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;


  -- ==========================================================
  -- NOVÁ OCHRANA PRO SDÍLENÉ POZNÁMKY
  --
  -- Jakmile existuje collaborator, stará save cesta
  -- už nesmí obejít shared editor lock.
  -- ==========================================================

  IF EXISTS (
    SELECT 1
    FROM public.note_collaborators c
    WHERE c.note_id = p_id
  )
  THEN

    RETURN jsonb_build_object(
      'ok', false,
      'conflict', false,
      'shared', true,

      'reason',
      'shared_note_requires_shared_save',

      'current_revision',
      v_current.revision,

      'current_updated_at',
      v_current.updated_at
    );

  END IF;


  -- ==========================================================
  -- REVISION CHECK
  -- ==========================================================

  IF
    p_expected_revision IS NULL
    OR
    p_expected_revision <> v_current.revision
  THEN

    RETURN jsonb_build_object(
      'ok', false,
      'conflict', true,
      'reason', 'revision_mismatch',

      'expected_revision',
      p_expected_revision,

      'current_revision',
      v_current.revision,

      'current_updated_at',
      v_current.updated_at
    );

  END IF;


  -- ==========================================================
  -- RESTORE FROM TRASH
  -- ==========================================================

  IF
    v_current.deleted_at IS NOT NULL
    AND NOT p_delete
  THEN

    SELECT p.note_limit
    INTO v_note_limit
    FROM public.lubanote_user_access ua
    LEFT JOIN public.lubanote_plans p
      ON p.id = ua.plan_id
    WHERE ua.user_id = v_user_id
    FOR UPDATE OF ua;


    IF v_note_limit IS NOT NULL THEN

      SELECT count(*)
      INTO v_note_count
      FROM public.notes n
      WHERE n.user_id = v_user_id
        AND n.deleted_at IS NULL;


      IF v_note_count >= v_note_limit THEN

        RETURN jsonb_build_object(
          'ok', false,
          'conflict', false,
          'limit', true,
          'reason', 'note_limit_reached',
          'note_limit', v_note_limit,
          'current_count', v_note_count
        );

      END IF;

    END IF;

  END IF;


  -- ==========================================================
  -- SAVE
  -- ==========================================================

  v_new_revision :=
    v_current.revision + 1;


  UPDATE public.notes
  SET
    data = p_data,
    updated_at = v_server_time,

    deleted_at =
      CASE
        WHEN p_delete
          THEN v_server_time
        ELSE null
      END,

    deleted_by_device_id =
      CASE
        WHEN p_delete
          THEN p_deleted_by_device_id
        ELSE null
      END,

    revision = v_new_revision

  WHERE id = p_id;


  RETURN jsonb_build_object(
    'ok', true,
    'conflict', false,

    'revision',
    v_new_revision,

    'updated_at',
    v_server_time
  );

END;

$function$

