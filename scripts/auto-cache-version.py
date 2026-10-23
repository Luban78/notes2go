from pathlib import Path
import re,hashlib,sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()
p=root/'index.html'
s=p.read_text(encoding='utf-8')
pat=re.compile(r'''(?P<pre>\b(?:src|href)\s*=\s*["'])(?P<path>(?!https?:|//|data:|blob:|/)[^"'?#]+\.(?:js|css))(?P<query>\?[^"'#]*)?(?P<frag>\#[^"']*)?(?P<end>["'])''',re.I)
count=[0]
def replace(m):
    target=(root/m.group('path')).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise SystemExit('Missing referenced asset: '+m.group('path'))
    digest=hashlib.sha256(target.read_bytes()).hexdigest()[:16]
    query=m.group('query') or ''
    params=[x for x in query.lstrip('?').split('&') if x and not x.startswith('v=')]
    params.append('v='+digest)
    count[0]+=1
    return m.group('pre')+m.group('path')+'?'+'&'.join(params)+(m.group('frag') or '')+m.group('end')
out=pat.sub(replace,s)
if count[0]==0: raise SystemExit('No local JS/CSS references found')
p.write_text(out,encoding='utf-8')
print(f'Cache hashes applied to {count[0]} JS/CSS references in {p}')
