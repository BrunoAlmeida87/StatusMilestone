from pyxlsb import open_workbook
import collections, csv
with open_workbook('raw/resumo.xlsb') as wb:
    with wb.get_sheet('Report_Crossing_FV') as sh:
        raw=[]
        for r in sh.rows():
            raw.append({c.c:c.v for c in r})
hdr=[raw[1].get(i) for i in range(21)]
rows=[[raw[i].get(j) for j in range(21)] for i in range(2,len(raw))]
rows=[r for r in rows if any(v not in (None,'') for v in r)]
print('data rows',len(rows))
with open('rcfv_file2.csv','w',newline='',encoding='utf-8') as fh:
    w=csv.writer(fh); w.writerow(hdr); w.writerows(rows)
for i,h in enumerate(hdr):
    vals=[r[i] for r in rows]
    nn=[v for v in vals if v not in (None,'')]
    u=collections.Counter(str(v) for v in nn)
    print('\n### COL',i,repr(h),'nonnull',len(nn),'distinct',len(u))
    if len(u)<=25:
        for k,c in u.most_common(): print('   ',c,'|',k[:100])
    else:
        for k,c in u.most_common(6): print('    top:',c,'|',k[:100])
