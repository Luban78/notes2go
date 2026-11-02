#!/usr/bin/env bash
# 698C: installuje sdileny lock do JIZ BEZICIHO Migration Manageru.
# NEPREPISUJE jeho funkce ani konfiguraci; meni jen vkladany guard u umask 077.
set -Eeuo pipefail
umask 077
MODE="${1:---check}"
case "$MODE" in --check|--apply) ;; *) echo 'Pouziti: install-shared-lock.sh --check|--apply' >&2; exit 2;; esac
BASE="${LUBANOTE_MIGRATION_BASE:-$HOME/luba-server/migration-manager}"
CONTROL="${SOURCE_CONTROL_STATE_FILE:-$HOME/luba-server/migration-bridge/control-state.json}"
MM="$BASE/bin/lubanote-migrate"
SELECT="$BASE/bin/backend-select"
LOCK="$BASE/state"
command -v flock >/dev/null || { echo 'BLOCKED=NO_FLOCK'; exit 1; }
command -v python3 >/dev/null || { echo 'BLOCKED=NO_PYTHON'; exit 1; }
for f in "$MM" "$SELECT"; do [[ -f "$f" && ! -L "$f" && -w "$f" ]] || { echo "BLOCKED=FILE_NOT_WRITABLE $f"; exit 1; }; done
[[ -f "$CONTROL" ]] || { echo 'BLOCKED=NO_CONTROL'; exit 1; }
[[ -f "$BASE/state/state" ]] || { echo 'BLOCKED=NO_MANAGER_STATE'; exit 1; }
python3 - "$CONTROL" "$BASE/state/state" <<'PYCONTROL'
import json,sys
x=json.load(open(sys.argv[1])); st=open(sys.argv[2]).read().strip()
if x.get('mode')!='NORMAL' or x.get('cutover_enabled') is not False or st not in ('IDLE','CUTOVER_COMPLETE'):
    raise SystemExit('BLOCKED=NOT_IDLE_OR_CONTROL_NOT_NORMAL')
print('MANAGER_STATE='+st)
print('ACTIVE_BACKEND='+str(x.get('active_backend')))
PYCONTROL
# Jediny zamykaci soubor pro schema deploy a migraci; nevytvarime nove DB objekty.
exec 8< "$LOCK"
flock -n 8 || { echo 'BLOCKED=SERVER_OPERATION_RUNNING'; exit 1; }
# vubec se nesahat do manageru, pokud skripty nelze bezpečne napatchovat.
python3 - "$MODE" "$MM" "$SELECT" <<'PYPATCH'
import os,sys,subprocess,tempfile,pathlib,stat,shutil,datetime
mode=sys.argv[1]
files=[pathlib.Path(x) for x in sys.argv[2:]]
marker='LUBANOTE_SHARED_OP_LOCK_698C'
common='''
# LUBANOTE_SHARED_OP_LOCK_698C – stejne flock jako Server Deploy.
'''
parts=[
'''
if [[ "${1:-status}" != status ]]; then
  command -v flock >/dev/null || { echo 'MIGRATION=BLOCKED reason=flock_missing' >&2; exit 1; }
  exec 8< "$HOME/luba-server/migration-manager/state"
  flock -n 8 || { echo 'MIGRATION=BLOCKED reason=server_deploy_or_migration_running' >&2; exit 1; }
fi
''',
'''
command -v flock >/dev/null || { echo 'BACKEND_SELECT=BLOCKED reason=flock_missing' >&2; exit 1; }
exec 8< "$HOME/luba-server/migration-manager/state"
flock -n 8 || { echo 'BACKEND_SELECT=BLOCKED reason=server_deploy_or_migration_running' >&2; exit 1; }
'''
]
changes=[]
for i,p in enumerate(files):
    original=p.read_text()
    if marker in original:
        # A different implementation may use marker with different behavior;
        # require exact code (skip only if snippets match) to avoid false sense of protection.
        if parts[i].strip() not in original:
            raise SystemExit('BLOCKED=EXISTING_GUARD_DIFFERS '+p.name)
        print('FILE='+p.name+' STATUS=ALREADY_GUARDED')
        continue
    if original.count('umask 077\n') != 1 or not original.startswith('#!/usr/bin/env bash\n'):
        raise SystemExit('BLOCKED=UNEXPECTED_SCRIPT_FORMAT '+p.name)
    new=original.replace('umask 077\n','umask 077\n'+common+parts[i],1)
    with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',suffix='.sh',delete=False) as f:
        f.write(new)
        temp=f.name
    try:
        subprocess.run(['bash','-n',temp],check=True,capture_output=True)
    finally:
        os.unlink(temp)
    changes.append((p,original,new))
    print('FILE='+p.name+' STATUS=PATCHABLE')
if mode=='--check':
    print('SHARED_GUARD_PREFLIGHT=PASS')
    print('FILES_CHANGED=0')
    print('DATABASE_WRITES=NONE')
    raise SystemExit(0)
# Re-check state under shared lock.
base=files[0].parent.parent
control=pathlib.Path(os.environ.get('SOURCE_CONTROL_STATE_FILE',str(pathlib.Path.home()/'luba-server/migration-bridge/control-state.json')))
import json
x=json.loads(control.read_text())
state=(base/'state/state').read_text().strip()
if x.get('mode')!='NORMAL' or x.get('cutover_enabled') is not False or state not in ('IDLE','CUTOVER_COMPLETE'):
    raise SystemExit('BLOCKED=STATE_CHANGED_BEFORE_INSTALL')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backups=[]
try:
    # Zaloha OBOU souboru pred prvnim prepnutim.
    for p,old,new in changes:
        backup=p.with_name(p.name+'.before-698C-'+stamp)
        shutil.copy2(p,backup)
        backups.append((p,backup))
    for p,old,new in changes:
        st=p.stat()
        fd,tmp=tempfile.mkstemp(dir=p.parent,prefix='.'+p.name+'.698C.')
        try:
            os.chmod(tmp, stat.S_IMODE(st.st_mode))
            with os.fdopen(fd,'w',encoding='utf-8') as f: f.write(new)
            os.replace(tmp,p)
            subprocess.run(['bash','-n',str(p)],check=True)
        finally:
            if os.path.exists(tmp): os.unlink(tmp)
        print('INSTALLED='+p.name)
except Exception as exc:
    # Pokud dojde k chybe po prvnim souboru, vratit obe puvodni verze.
    rollback_errors=[]
    for p,backup in backups:
        try: shutil.copy2(backup,p)
        except Exception as e: rollback_errors.append(str(e))
    print('SHARED_GUARD_INSTALL=FAIL reason='+str(exc),file=sys.stderr)
    print('ROLLBACK='+('PASS' if not rollback_errors else 'FAILED '+repr(rollback_errors)),file=sys.stderr)
    raise SystemExit(1)
for p,backup in backups:
    print('BACKUP='+str(backup))
print('SHARED_GUARD_INSTALL=PASS')
print('DATABASE_WRITES=NONE')
PYPATCH
