import csv, collections, re
def norm(v):
    if v is None: return ''
    s=str(v).replace('_x000D_','').replace('\r','\n').replace('“','"').replace('”','"')
    return re.sub(r'\s+',' ',s).strip()
A={};B={}
for r in csv.DictReader(open('report_crossing_fv.csv',encoding='utf-8')):
    k=norm(r['Item'])
    if k: A[str(int(float(k)))]=r
for r in csv.DictReader(open('rcfv_file2.csv',encoding='utf-8')):
    B[str(int(float(norm(r['Item']))))]=r
P='Actual Status | [10/09/2026]'; O='Previous Status | [09/09/2026]'
print('=== OriginalJx conflicts ===')
for k in A:
    a,b=norm(A[k]['OriginalJx']),norm(B[k]['OriginalJx'])
    if a!=b: print(f'  item {k:6s} F1={a:12s} F2={b:12s} InspType={norm(A[k]["InspType"])} status={norm(A[k][P])}')
print('\n=== Updated Status Obs conflicts (26) ===')
n=0
for k in A:
    a,b=norm(A[k]['Updated Status Obs']),norm(B[k]['Updated Status Obs'])
    if a and b and a!=b:
        n+=1
        print(f'  item {k:6s} st={norm(A[k][P])[:22]:24s}\n      F1={a[:95]!r}\n      F2={b[:95]!r}')
print('total',n)
print('\n=== 14 items changed 09/09->10/09: what file2 says ===')
for k in A:
    if norm(A[k][O])!=norm(A[k][P]):
        print(f'  {k:6s} {norm(A[k][O]):34s} -> {norm(A[k][P]):34s} | F2 actual={norm(B[k]["Actual Status"]):30s} | F1obs={norm(A[k]["Updated Status Obs"])[:40]!r} F2obs={norm(B[k]["Updated Status Obs"])[:40]!r}')
print('\n=== Coverage of descriptive fields by InspType in file1 vs file2 ===')
for f in ['SBR','ActualJx','ActualJxDescription','NºandDescription','Performance','Mode','Description','Insp','Position AC','Tests']:
    a=sum(1 for k in A if norm(A[k][f])); b=sum(1 for k in B if norm(B[k][f]))
    print(f'  {f:22s} file1={a:4d}  file2={b:4d}')
print('\n=== B05 identification consistency (file2) ===')
c=collections.Counter()
for k in B:
    ev=norm(B[k]['Evidence']).upper().startswith('B05')
    it=norm(B[k]['InspType'])=='B05'
    ins=norm(B[k]['Insp'])=='B05'
    hp=bool(norm(B[k]['HullPassageParts']))
    c[(ev,it,ins,hp)]+=1
print('  (EvidenceStartsB05, InspType=B05, Insp=B05, HullPassageParts filled) -> count')
for kk,v in c.items(): print('   ',kk,v)
