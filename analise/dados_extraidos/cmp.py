import csv, collections, json, re
def norm(v):
    if v is None: return ''
    s=str(v)
    s=s.replace('_x000D_','').replace('\r','\n')
    s=re.sub(r'\s+',' ',s).strip()
    return s
A=list(csv.DictReader(open('report_crossing_fv.csv',encoding='utf-8')))   # file1
B=list(csv.DictReader(open('rcfv_file2.csv',encoding='utf-8')))           # file2
print('file1 rows',len(A),'file2 rows',len(B))
def key(v):
    v=norm(v)
    if v=='' : return None
    try: return str(int(float(v)))
    except: return v
ka=[key(r['Item']) for r in A]; kb=[key(r['Item']) for r in B]
print('file1 blank Item rows:', sum(1 for k in ka if k is None))
print('file2 blank Item rows:', sum(1 for k in kb if k is None))
ca=collections.Counter(k for k in ka if k); cb=collections.Counter(k for k in kb if k)
print('file1 dup items:', {k:v for k,v in ca.items() if v>1})
print('file2 dup items:', {k:v for k,v in cb.items() if v>1})
sa=set(ca); sb=set(cb)
print('only in file1 (%d):'%len(sa-sb), sorted(sa-sb, key=lambda x:int(x))[:30])
print('only in file2 (%d):'%len(sb-sa), sorted(sb-sa, key=lambda x:int(x))[:30])
print('in both:', len(sa&sb))
# blank rows in file1
for i,(k,r) in enumerate(zip(ka,A)):
    if k is None:
        print('  file1 blank-Item row', i+3, {kk:vv for kk,vv in r.items() if norm(vv)})
print()
print('file1 headers:', list(A[0].keys()))
print('file2 headers:', list(B[0].keys()))
