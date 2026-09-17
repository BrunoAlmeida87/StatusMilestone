#!/usr/bin/env python3
"""Etapa 11 - Reconciliacao: compara a base migrada com os numeros dos dois Excel."""
import json, sys, collections
from datetime import date

ABERTO_EXCECOES = ["1 - Validated by ICN", "2 - Not Blocking", "2 - Not Available Jx"]

def aberto(s):
    return not (s == ABERTO_EXCECOES[0] or s.startswith("2 - Not Blocking") or s == ABERTO_EXCECOES[2])

def status_em(hist_por_item, item, data):
    """Reconstroi o status de um item numa data (event sourcing)."""
    st = None
    for h in hist_por_item.get(item, []):
        if h["dataEfetiva"] <= data:
            st = h["valorNovo"]
        else:
            break
    return st

def main(caminho):
    db = json.load(open(caminho, encoding="utf-8"))
    itens = db["itens"]
    hp = collections.defaultdict(list)
    for h in db["historico"]:
        if h["campo"] == "status":
            hp[h["item"]].append(h)
    for k in hp:
        hp[k].sort(key=lambda x: x["dataEfetiva"])

    ok = True
    def check(rotulo, obtido, esperado):
        nonlocal ok
        bateu = obtido == esperado
        ok = ok and bateu
        print(f"  {'OK ' if bateu else 'XXX'} {rotulo:52s} esperado={esperado:<5} obtido={obtido}")

    print("=" * 78)
    print("ARQUIVO 2 - Evidence Flow")
    print("=" * 78)
    b05 = [i for i in itens if i["isB05"]]
    nb  = [i for i in itens if not i["isB05"]]
    check("B05 Total", len(b05), 166)
    check("B05 Remaining", sum(1 for i in b05 if aberto(i["status"])), 12)
    check("B05 Validated", sum(1 for i in b05 if i["status"] == "1 - Validated by ICN"), 152)
    check("B05 Not Blocking", sum(1 for i in b05 if i["status"] == "2 - Not Blocking"), 2)
    check("B05 Blocking", sum(1 for i in b05 if i["status"] == "3 - Blocking"), 7)
    check("B05 Missing Vacuum", sum(1 for i in b05 if i["status"].startswith("7 -")), 5)
    check("Except-B05 Total", len(nb), 262)
    check("Except-B05 Remaining", sum(1 for i in nb if aberto(i["status"])), 59)
    check("Except-B05 Validated", sum(1 for i in nb if i["status"] == "1 - Validated by ICN"), 203)
    check("Except-B05 Waiting Proof", sum(1 for i in nb if i["status"] == "5 - Waiting Proof"), 43)
    check("Except-B05 Under Analysis", sum(1 for i in nb if i["status"] == "4 - Under Analysis"), 11)
    check("Except-B05 Blocking", sum(1 for i in nb if i["status"] == "3 - Blocking"), 5)

    print("=" * 78)
    print("ARQUIVO 2 - INSP (pendencias por InspType)")
    print("=" * 78)
    for t, esp in [("AIS",8),("B05",12),("HAT",2),("HCT",11),("PTRH",1),("STW",15),
                   ("Shipyard prerequisites",21),("SCT",1)]:
        check(f"INSP {t}", sum(1 for i in itens if i["inspType"] == t and aberto(i["status"])), esp)
    check("INSP Total Geral", sum(1 for i in itens if aberto(i["status"])), 71)

    print("=" * 78)
    print("ARQUIVO 1 - BD/Resumo  (comparativo 09/09 -> 10/09 reconstruido do historico)")
    print("=" * 78)
    d_ant, d_atu = "2026-09-09", "2026-09-10"
    func = db["config"]["inspTypesFuncionais"]
    tot = rem = 0
    for t in func:
        rows = [i for i in itens if i["inspType"] == t]
        a = sum(1 for i in rows if (s := status_em(hp, i["item"], d_ant)) and aberto(s))
        p = sum(1 for i in rows if (s := status_em(hp, i["item"], d_atu)) and aberto(s))
        tot += len(rows); rem += p
        if len(rows):
            print(f"      {t:24s} total={len(rows):3d}  anterior={a:3d}  atual={p:3d}  delta={a-p:+d}")
    check("Functional Insp Total", tot, 240)
    check("Functional Insp Remaining", rem, 38)

    # O painel conta pelo marco ATUAL (ActualJx), nao pelo de origem: um
    # pre-requisito transferido de J07 para J08 e um pre-requisito do J08, e o
    # que saiu do J08 para o J09 deixou de ser. A conta do Excel e 22 / 21.
    sp  = [i for i in itens if i["inspType"] == "Shipyard prerequisites" and i["actualJx"]   == "J08"]
    spo = [i for i in itens if i["inspType"] == "Shipyard prerequisites" and i["originalJx"] == "J08"]
    print("\n  Shipyard Prerequisites (ActualJx = J08):")
    print(f"      pelo marco de origem (OriginalJx = J08): total={len(spo):3d}  "
          f"em aberto={sum(1 for i in spo if aberto(i['status'])):3d}   [so para comparacao]")
    check("Shipyard Prereq Total", len(sp), 22)
    check("Shipyard Prereq Remaining",
          sum(1 for i in sp if aberto(i["status"])), 21)

    b = [i for i in itens if i["inspType"] == "B05"]
    check("B05 Total", len(b), 166)
    check("B05 Remaining", sum(1 for i in b if aberto(i["status"])), 12)

    print("=" * 78)
    print("FECHAMENTO CRUZADO")
    print("=" * 78)
    check("B05 + ExceptB05 = 71", sum(1 for i in b05 if aberto(i["status"])) + sum(1 for i in nb if aberto(i["status"])), 71)
    check("Soma dos universos = 428",
          len([i for i in itens if i["inspType"] == "Shipyard prerequisites"]) + tot + len(b), 428)

    print("=" * 78)
    print("HISTORICO RECONSTRUIDO (event sourcing)")
    print("=" * 78)
    for d, esp_total in [("2026-07-29", 428), ("2026-09-09", 428), ("2026-09-10", 428)]:
        dist = collections.Counter(status_em(hp, i["item"], d) for i in itens)
        ab = sum(1 for i in itens if (s := status_em(hp, i["item"], d)) and aberto(s))
        print(f"  {d}: itens={sum(dist.values()):3d}  em aberto={ab:3d}  "
              f"validados={dist.get('1 - Validated by ICN',0)}")
    check("Em aberto em 29/07 (Excel col W: 428-348-6=74)",
          sum(1 for i in itens if (s := status_em(hp, i["item"], "2026-07-29")) and aberto(s)), 74)
    check("Em aberto em 09/09 (Excel col O/X: 428-346-2=80)",
          sum(1 for i in itens if (s := status_em(hp, i["item"], "2026-09-09")) and aberto(s)), 80)
    check("Em aberto em 10/09 (Excel col P: 428-355-2=71)",
          sum(1 for i in itens if (s := status_em(hp, i["item"], "2026-09-10")) and aberto(s)), 71)

    print("=" * 78)
    print(("RECONCILIACAO COMPLETA - todos os numeros batem" if ok
           else "DIVERGENCIAS ENCONTRADAS - ver linhas marcadas com XXX"))
    print("=" * 78)
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
