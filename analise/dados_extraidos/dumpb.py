from pyxlsb import open_workbook
import csv, sys
sheet=sys.argv[1]
with open_workbook('raw/resumo.xlsb') as wb:
    with wb.get_sheet(sheet) as sh:
        rows=[]
        for r in sh.rows():
            rows.append({c.c:c.v for c in r if c.v not in (None,'')})
        maxc=max((max(d) for d in rows if d), default=0)
        for i,d in enumerate(rows):
            if not d: continue
            print('R%d'%(i+1), ' || '.join(f'{k}:{v!r}' for k,v in sorted(d.items()))[:1600])
