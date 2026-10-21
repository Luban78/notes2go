#!/usr/bin/env bash
# 691BG: isolated, disposable PostgreSQL regression against corrected save_note_safe.
# Does not alter existing 689F files or connect to the production database.
set -Eeuo pipefail
ROOT="${TEST_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
RPC="$ROOT/server/autotester/689F_real_rpc.sql"
CASES="$ROOT/server/autotester/689F_cases.sql"
FIXTURE="$ROOT/server/autotester/689F_fixture.sql"
RUNNER="$ROOT/tests/autotester-real-rpc-689F.sh"
for f in "$RPC" "$CASES" "$FIXTURE" "$RUNNER"; do
  [[ -f "$f" ]] || { echo '691BG_BLOCKED: reference file missing'; exit 2; }
done
# 689F snapshot integrity. Fail closed if future versions differ.
[[ "$(sha256sum "$RPC" | awk '{print $1}')" == 'a46d38e29819ae67b037ebebc5dbedf3539109c25f747156437b4cc6e27302b3' ]] || {
  echo '691BG_BLOCKED: unexpected source RPC SHA'; exit 2;
}
TMP="$(mktemp -d /tmp/ln691bg.XXXXXXXX)"
cleanup(){ rm -rf -- "$TMP"; }
trap cleanup EXIT
mkdir -p "$TMP/server/autotester" "$TMP/tests"
cp -- "$RPC" "$TMP/server/autotester/689F_real_rpc.sql"
cp -- "$CASES" "$TMP/server/autotester/689F_cases.sql"
cp -- "$FIXTURE" "$TMP/server/autotester/689F_fixture.sql"
cp -- "$RUNNER" "$TMP/tests/autotester-real-rpc-689F.sh"
python3 - "$TMP" <<'PY691BG'
import hashlib,pathlib,sys
base=pathlib.Path(sys.argv[1]); rpc=base/'server/autotester/689F_real_rpc.sql'; cases=base/'server/autotester/689F_cases.sql'; runner=base/'tests/autotester-real-rpc-689F.sh'

def replace_exact(path, old, new):
    txt=path.read_text()
    if txt.count(old)!=1:
        raise SystemExit('691BG_BLOCKED: unexpected test fixture/runner content: '+path.name)
    path.write_text(txt.replace(old,new,1))
replace_exact(rpc, '    data = p_data,', '    data = CASE WHEN p_delete THEN v_current.data ELSE p_data END,')
replace_exact(cases,
'''  -- 689F FIX: production sync.js sends {"deleted":true} on permanent deletion.
  -- Real save_note_safe stores p_data as provided; it does NOT preserve old ciphertext.''',
'''  -- 691BG: deployed save_note_safe preserves current payload on tombstone.
  -- E2E envelope remains stored; actual decryption is not tested in this SQL lab.''')
replace_exact(cases,
'''(SELECT data FROM public.notes WHERE id=n) IS DISTINCT FROM '{"deleted":true}'::jsonb THEN''',
'''(SELECT data FROM public.notes WHERE id=n) IS DISTINCT FROM box1 THEN''')
replace_exact(cases,
"REAL_RPC_PASS 13 permanent deletion stores client tombstone and revision=4",
"REAL_RPC_PASS 13 tombstone retains encrypted payload and revision=4")
old='a46d38e29819ae67b037ebebc5dbedf3539109c25f747156437b4cc6e27302b3'
new=hashlib.sha256(rpc.read_bytes()).hexdigest()
replace_exact(runner, "EXPECTED_SHA='"+old+"'", "EXPECTED_SHA='"+new+"'")
print('691BG_LAB_SNAPSHOT_SHA256='+new)
PY691BG
chmod 755 "$TMP/tests/autotester-real-rpc-689F.sh"
# Existing runner enforces Docker --network none, isolated tmpfs Postgres, rollback.
# It must never receive production credentials or host mounts.
set +e
( cd "$TMP" && bash tests/autotester-real-rpc-689F.sh )
rc=$?
set -e
if [[ "$rc" == 0 ]]; then
  echo '691BG_RESULT: SNAPSHOT_RPC_BODY_PASS=22 / ROLLBACK=PASS / DISPOSABLE_DB=YES'
  echo '691BG_SCOPE: isolated corrected production body; NOT live-DB write, trigger, or two-device sync'
else
  echo '691BG_RESULT: BLOCKED_OR_FAILED; no production access attempted'
fi
exit "$rc"
