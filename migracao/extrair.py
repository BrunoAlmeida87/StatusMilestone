#!/usr/bin/env python3
"""
Extrai a aba Report_Crossing_FV dos dois arquivos originais para CSV.

É o primeiro passo do pipeline:

    extrair.py  ->  dois CSV  ->  migrar.py  ->  database.json  ->  validar.py

Substitui os scripts avulsos usados na fase de análise. Lida com as duas
diferenças dos arquivos: o .xlsx tem o cabeçalho na linha 2 e duas gerações
extras de status à direita; o .xlsb guarda Item como float.

    pip install openpyxl pyxlsb
    python3 migracao/extrair.py --xlsx SafetyMilestoneJ08.xlsx \
                                --xlsb Resumo_Fluxo_Evidencia.xlsb --out-dir .

Os CSV gerados contêm dados do projeto: NÃO os versione (o .gitignore bloqueia).
"""
import csv, argparse, os

ABA = "Report_Crossing_FV"
LINHA_CABECALHO = 2          # nos dois arquivos o cabeçalho está na linha 2


def do_xlsx(caminho, aba=ABA):
    """Lê o .xlsx com openpyxl, já com os valores calculados das fórmulas."""
    import openpyxl
    wb = openpyxl.load_workbook(caminho, data_only=True)
    ws = wb[aba]
    hdr = [ws.cell(LINHA_CABECALHO, c).value for c in range(1, ws.max_column + 1)]
    linhas = []
    for r in range(LINHA_CABECALHO + 1, ws.max_row + 1):
        linha = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
        if any(v not in (None, "") for v in linha):
            linhas.append(linha)
    return hdr, linhas


def do_xlsb(caminho, aba=ABA):
    """Lê o .xlsb com pyxlsb. Item vem como float e é normalizado para inteiro."""
    from pyxlsb import open_workbook
    with open_workbook(caminho) as wb:
        with wb.get_sheet(aba) as sh:
            bruto = [{c.c: c.v for c in linha} for linha in sh.rows()]
    ncols = max((max(d) for d in bruto if d), default=0) + 1
    hdr = [bruto[LINHA_CABECALHO - 1].get(i) for i in range(ncols)]
    linhas = []
    for i in range(LINHA_CABECALHO, len(bruto)):
        linha = [bruto[i].get(j) for j in range(ncols)]
        if any(v not in (None, "") for v in linha):
            linhas.append(linha)
    return hdr, linhas


def normaliza_cabecalho(hdr):
    """Quebras de linha no cabeçalho viram ' | ', para o CSV ficar com uma linha."""
    return [str(h).replace("\n", " | ") if h is not None else "" for h in hdr]


def grava(caminho, hdr, linhas):
    with open(caminho, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(normaliza_cabecalho(hdr))
        w.writerows(linhas)
    return len(linhas)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", required=True, help="SafetyMilestoneJ08.xlsx")
    ap.add_argument("--xlsb", required=True, help="Resumo_Fluxo_Evidencia.xlsb")
    ap.add_argument("--out-dir", default=".")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    f1 = os.path.join(a.out_dir, "file1_SafetyMilestoneJ08.csv")
    f2 = os.path.join(a.out_dir, "file2_ResumoFluxoEvidencia.csv")
    n1 = grava(f1, *do_xlsx(a.xlsx))
    n2 = grava(f2, *do_xlsb(a.xlsb))
    print(f"{n1:>4} linhas -> {f1}")
    print(f"{n2:>4} linhas -> {f2}")
    print(f"\npróximo passo:\n  python3 migracao/migrar.py --file1 {f1} --file2 {f2} --out database.json")
