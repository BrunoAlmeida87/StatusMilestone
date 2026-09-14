import csv, collections, re
def norm(v):
    if v is None: return ''
    s=str(v).replace('_x000D_','').replace('\r','\n').replace('“','"').replace('”','"')
    return re.sub(r'\s+',' ',s).strip()
A={}; B={}
for r in csv.DictReader(open('report_crossing_fv.csv',encoding='utf-8')):
    k=norm(r['Item'])
    if k: A[str(int(float(k)))]=r
for r in csv.DictReader(open('rcfv_file2.csv',encoding='utf-8')):
    B[str(int(float(norm(r['Item']))))]=r
common=['SBR','Item','OriginalJx','ActualJx','ActualJxDescription','NºandDescription','Bigram','Performance','Mode','Evidence','HullPassageParts','Description','Insp','InspType','Updated Status Obs','General Obs',"NCR's",'Position AC','Tests']
print('== FIELD-LEVEL DIVERGENCE (common fields, normalized) ==')
for f in common:
    diff=[]; onlyA=0; onlyB=0
    for k in A:
        a=norm(A[k][f]); b=norm(B[k][f])
        if a==b: continue
        if a and not b: onlyA+=1
        elif b and not a: onlyB+=1
        else: diff.append((k,a,b))
    print(f'{f:24s} conflict={len(diff):4d}  onlyFile1={onlyA:4d}  onlyFile2={onlyB:4d}')
    for k,a,b in diff[:3]:
        print(f'      item {k}: F1={a[:70]!r} | F2={b[:70]!r}')
print()
print('== STATUS COLUMN CROSS-CHECK ==')
pairs=[('Actual Status | [10/09/2026]','Actual Status'),
       ('Previous Status | [09/09/2026]','Actual Status'),
       ('Actual Status | [09/09/2026]','Actual Status'),
       ('Previous Status | [29/07/2026]','Previous Status ??/??/2026'),
       ('Previous Status | [09/09/2026]','Previous Status ??/??/2026')]
for fa,fb in pairs:
    eq=sum(1 for k in A if norm(A[k][fa])==norm(B[k][fb]))
    print(f'F1[{fa}] == F2[{fb}] : {eq}/428')
print()
print('== INTERNAL CHECK file1: Prev[09/09] vs Actual[09/09] (cols O vs X) ==')
eq=sum(1 for k in A if norm(A[k]['Previous Status | [09/09/2026]'])==norm(A[k]['Actual Status | [09/09/2026]']))
print(eq,'/428 equal')
print('== file1: Actual[10/09] vs Prev[09/09] changed items ==')
ch=[(k,norm(A[k]['Previous Status | [09/09/2026]']),norm(A[k]['Actual Status | [10/09/2026]'])) for k in A if norm(A[k]['Previous Status | [09/09/2026]'])!=norm(A[k]['Actual Status | [10/09/2026]'])]
print(len(ch),'items changed 09/09 -> 10/09')
for x in ch: print('   ',x)
print()
print('== file1: Prev[29/07] -> Actual[09/09] transitions ==')
t=collections.Counter((norm(A[k]['Previous Status | [29/07/2026]']),norm(A[k]['Actual Status | [09/09/2026]'])) for k in A)
for (a,b),c in t.most_common():
    if a!=b: print(f'   {c:4d}  {a}  ->  {b}')
print()
print('== file2: Previous(baseline) -> Actual transitions (top) ==')
t2=collections.Counter((norm(B[k]['Previous Status ??/??/2026']),norm(B[k]['Actual Status'])) for k in B)
for (a,b),c in t2.most_common(): print(f'   {c:4d}  {a}  ->  {b}')
