import csv, collections, re
def norm(v):
    if v is None: return ''
    s=str(v).replace('_x000D_','').replace('\r','\n')
    return re.sub(r'\s+',' ',s).strip()
B=[]
for r in csv.DictReader(open('rcfv_file2.csv',encoding='utf-8')):
    r={k:norm(v) for k,v in r.items()}; r['Item']=str(int(float(r['Item']))); B.append(r)
print('== Insp -> InspType mapping ==')
m=collections.defaultdict(collections.Counter)
for r in B: m[r['InspType']][r['Insp'] or '(blank)']+=1
for k in sorted(m): print(' ',k,'->',dict(m[k]))
print('\n== rows with blank Insp / ActualJxDescription ==')
for f in ['Insp','ActualJxDescription','Performance','Mode','Position AC']:
    miss=[r['Item'] for r in B if not r[f]]
    print(f' {f}: {len(miss)} missing', miss[:12] if len(miss)<=40 else '')
print('\n== Mode raw variants ==')
for k,v in collections.Counter(r['Mode'] for r in B).most_common(): print(f'  {v:4d} | {k[:80]!r}')
print('\n== Bigram multiplicity ==')
c=collections.Counter()
for r in B:
    for b in re.split(r'[;,]', r['Bigram']): 
        b=b.strip()
        if b: c[b]+=1
print(' distinct atomic bigrams:',len(c),'| top:',c.most_common(12))
print(' max per item:', max(len([x for x in re.split(r'[;,]',r['Bigram']) if x.strip()]) for r in B))
print('\n== NºandDescription vs Performance 1:1? ==')
d=collections.defaultdict(set)
for r in B: d[r['NºandDescription']].add(r['Performance'])
for k,v in d.items():
    if len(v)>1: print('  MULTI',k,'->',[x[:60] for x in v])
print('\n== ActualJxDescription vs values ==')
print(dict(collections.Counter(r['ActualJxDescription'] for r in B)))
print('\n== Updated Status Obs: value list (file2) ==')
for k,v in collections.Counter(r['Updated Status Obs'] for r in B).most_common(): print(f'  {v:4d} | {k[:90]!r}')
print('\n== status vs obs coherence (file2): validated items with non-"done" obs ==')
n=0
for r in B:
    if r['Actual Status']=='1 - Validated by ICN' and r['Updated Status Obs'] and 'done' not in r['Updated Status Obs'].lower() and 'conform' not in r['Updated Status Obs'].lower():
        n+=1
        if n<=10: print('   ',r['Item'],'|',r['Updated Status Obs'][:80])
print('  total',n)
