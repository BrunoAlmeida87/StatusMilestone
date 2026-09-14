import csv, collections, re
def norm(v):
    if v is None: return ''
    s=str(v).replace('_x000D_','').replace('\r','\n')
    return re.sub(r'\s+',' ',s).strip()
B=[]
for r in csv.DictReader(open('rcfv_file2.csv',encoding='utf-8')):
    r={k:norm(v) for k,v in r.items()}; r['Item']=str(int(float(r['Item']))); B.append(r)
A=[]
for r in csv.DictReader(open('report_crossing_fv.csv',encoding='utf-8')):
    r={k:norm(v) for k,v in r.items()}
    if r['Item']: r['Item']=str(int(float(r['Item']))); A.append(r)
OPEN=lambda s: not(s=='1 - Validated by ICN' or s.startswith('2 - Not Blocking') or s=='2 - Not Available Jx')
P='Actual Status | [10/09/2026]'; O='Previous Status | [09/09/2026]'
print('--- RECONCILE Evidence Flow (file2) ---')
b05=[r for r in B if r['InspType']=='B05']; nb=[r for r in B if r['InspType']!='B05']
print('B05 total',len(b05),'expect 166 ; remaining',sum(1 for r in b05 if OPEN(r['Actual Status'])),'expect 12')
print('ExceptB05 total',len(nb),'expect 262; remaining',sum(1 for r in nb if OPEN(r['Actual Status'])),'expect 59')
print('B05 by status:',dict(collections.Counter(r['Actual Status'] for r in b05)))
print('ExcB05 by status:',dict(collections.Counter(r['Actual Status'] for r in nb)))
print('\n--- RECONCILE BD (file1) ---')
sp=[r for r in A if r['InspType']=='Shipyard prerequisites' and r['OriginalJx']=='J08']
print('Shipyard prereq J08 total',len(sp),'expect 22')
print('  prev by status',dict(collections.Counter(r[O] for r in sp)))
print('  act  by status',dict(collections.Counter(r[P] for r in sp)))
print('  remaining = total - validated - notblocking =',len(sp)-sum(1 for r in sp if r[P].startswith('1 - Validated by ICN'))-sum(1 for r in sp if r[P].startswith('2 - Not Blocking')),'expect 21')
func=['AIS','HAT','HCT','PTRH','STW','SCT','SAT','MT3','Shipyard certificate']
tot=0;rem=0
for t in func:
    rows=[r for r in A if r['InspType']==t]
    o=sum(1 for r in rows if OPEN(r[O])); p=sum(1 for r in rows if OPEN(r[P]))
    tot+=len(rows); rem+=p
    print(f'  {t:22s} total={len(rows):4d} prevOpen={o:3d} actOpen={p:3d} delta(prev-act)={o-p:+d}')
print('  TOTAL',tot,'expect 240; REMAINING',rem,'expect 38')
b=[r for r in A if r['InspType']=='B05']
print('B05 total',len(b),'expect 166')
print('  act by status',dict(collections.Counter(r[P] for r in b)))
print('  remaining(=tot-val-notblk-notavail)',len(b)-sum(1 for r in b if r[P].startswith('1 - Validated by ICN') or r[P].startswith('2 - Not Blocking') or r[P].startswith('2 - Not Available Jx')),'expect 12')
print('\n--- Grand check ---')
print('21+38+12 =',21+38+12,' vs file2 71 remaining:',sum(1 for r in B if OPEN(r['Actual Status'])))
print('\n--- Item ranges / gaps ---')
it=sorted(int(r['Item']) for r in B)
print('min',it[0],'max',it[-1],'count',len(it))
blocks=[];s=it[0];p=it[0]
for x in it[1:]:
    if x!=p+1: blocks.append((s,p)); s=x
    p=x
blocks.append((s,p))
print('contiguous blocks:',blocks)
print('\n--- Evidence as alternative key ---')
ce=collections.Counter(r['Evidence'] for r in B)
print('distinct Evidence',len(ce),'dups',{k:v for k,v in ce.items() if v>1})
print('\n--- status domains ---')
print('file1 O:',sorted(set(r[O] for r in A)))
print('file1 P:',sorted(set(r[P] for r in A)))
print('file1 W:',sorted(set(r['Previous Status | [29/07/2026]'] for r in A)))
print('file2 Prev:',sorted(set(r['Previous Status ??/??/2026'] for r in B)))
print('file2 Act:',sorted(set(r['Actual Status'] for r in B)))
