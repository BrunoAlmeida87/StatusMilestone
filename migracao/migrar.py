#!/usr/bin/env python3
"""
Migracao dos dois arquivos Excel para a base unica do StatusMilestone.

Entradas (nao versionadas - ficam fora do repositorio):
  --file1  CSV extraido de SafetyMilestoneJ08.xlsx / aba Report_Crossing_FV
  --file2  CSV extraido de Resumo_Fluxo_Evidencia.xlsb / aba Report_Crossing_FV

Saida:
  database.json  -- base unica do sistema

Regras aplicadas (conforme analise/02_DECISOES.md):
  C1  Previous Status deixa de ser campo; vira historico datado
  C2  Conflitos nunca sobrescritos: vao para a fila de decisao
  C3  Item 3102: OriginalJx = J06 (Arquivo 2 vence)
  C4  OriginalJx = marco de origem (J06/J07/J08); ActualJx = sempre J08
  C5  Baseline "??/??/2026" do Arquivo 2 e descartado
  I6  Tests permanece como texto (fonte: Arquivo 1)
  I7  Bigram e separado em codigos atomicos
  I10 Limpeza tecnica + normalizacao, preservando o valor de origem
"""
import csv, json, re, argparse, hashlib
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# Datas de corte conhecidas (cabecalhos das colunas do Arquivo 1)
BASELINE   = "2026-07-29"   # Previous Status [29/07/2026]
CICLO_09   = "2026-09-09"   # Actual Status [09/09/2026]  == Previous Status [09/09/2026]
CICLO_10   = "2026-09-10"   # Actual Status [10/09/2026]

COL = {
    "prev_2907": "Previous Status | [29/07/2026]",
    "act_0909":  "Actual Status | [09/09/2026]",
    "prev_0909": "Previous Status | [09/09/2026]",
    "act_1009":  "Actual Status | [10/09/2026]",
}

# Campos cuja fonte preferencial e o Arquivo 2 (mais completo: preenche os 262 nao-B05)
DESCRITIVOS_F2 = ["SBR","ActualJx","ActualJxDescription","NºandDescription","Performance",
                  "Mode","Description","Insp","General Obs","NCR's"]
# Campos identicos nos dois arquivos
IDENTICOS      = ["Evidence","HullPassageParts","InspType","Position AC"]
# Campos em conflito que vao para decisao do usuario
CONFLITANTES   = ["Updated Status Obs","Bigram"]

# Conflitos já decididos pelo usuário (ver analise/02_DECISOES.md).
# Chave "item:campo", ou "*:campo" para valer em todo o campo.
# Valor: "arquivo1" | "arquivo2" | um texto literal.
DECISOES_CONFLITO = {
    # C3/C4 — OriginalJx é o marco de ORIGEM. O Arquivo 2 preserva J06/J07;
    # o Arquivo 1 achatou tudo para J08.
    "*:OriginalJx": "arquivo2",
    # "Para todo o resto, considere a planilha J08 como a correta":
    # o SafetyMilestoneJ08 é a fonte oficial de Updated Status Obs, sem exceção.
    # Efeito colateral positivo: preserva "New intervention Ficha 339/340/341/342"
    # (itens 624, 625, 628 e 629), que só existe nesse arquivo.
    "*:Updated Status Obs": "arquivo1",
    # Bigram fica de fora: ali o Arquivo 1 é um SUBCONJUNTO do Arquivo 2
    # (HG vs HG;HP), então aplicar o J08 apagaria códigos. Segue em aberto.
}

JUSTIFICATIVAS = {
    "OriginalJx:arquivo2": ("Decisão C3/C4: OriginalJx é o marco de origem; o Arquivo 2 "
                            "preserva J06/J07 e o Arquivo 1 achatou tudo para J08."),
    "Updated Status Obs:arquivo1": ("O SafetyMilestoneJ08 é a fonte oficial em questão de status."),
    "Updated Status Obs:arquivo2": "Decisão do usuário",
    "Bigram:arquivo2": "O Arquivo 2 preserva todos os códigos; o Arquivo 1 perdeu parte deles.",
}

MODE_NORM = {
    "local": "Local",
    "remote": "Remote",
    "local/remote": "Local/Remote",
    "local / remote": "Local/Remote",
    "local/ remote (da, dm). local (dn).": "Local/Remote",
    "mode: local / remote (da, dm). local (dn)": "Local/Remote",
    "local/ remoto (dj)": "Local/Remote",
    "not applicable": "Not applicable",
    "-": "Not applicable",
}

STATUS_DEF = [
    # code                                     familia      ativo  ordem
    ("0 - Canceled",                            "cancelado", False, 0),
    ("1 - Validated by ICN",                    "validado",  True,  1),
    ("2 - Not Blocking",                        "ressalva",  True,  2),
    ("2 - Not Blocking - Downgraded",           "ressalva",  False, 3),
    ("2 - Not Available Jx",                    "ressalva",  False, 4),
    ("3 - Blocking",                            "bloqueado", True,  5),
    ("4 - Under Analysis",                      "analise",   True,  6),
    ("4 - Under Analysis to Not Blocking",      "analise",   False, 7),
    ("4 - Under Analysis To Downgraded",        "analise",   False, 8),
    ("4 - Under Analysis To Not Available Jx",  "analise",   False, 9),
    ("5 - Waiting Proof",                       "prova",     True, 10),
    ("6 - Waiting B05",                         "pendente",  False,11),
    ("7 - Missing Vacuum Test or Sign",         "bloqueado", True, 12),
    ("8 - Mounting not Completed",              "pendente",  False,13),
]

FAMILIAS = [
    {"id":"pendente", "pt":"Pendente",           "en":"Pending",          "cor":"#8a8f98", "ordem":1},
    {"id":"prova",    "pt":"Em prova",           "en":"Waiting Proof",    "cor":"#b8860b", "ordem":2},
    {"id":"analise",  "pt":"Em análise",    "en":"Under Analysis",   "cor":"#c2703d", "ordem":3},
    {"id":"bloqueado","pt":"Bloqueado",          "en":"Blocking",         "cor":"#b3403a", "ordem":4},
    {"id":"ressalva", "pt":"Aceito c/ ressalva", "en":"Accepted w/ note", "cor":"#3d6fa8", "ordem":5},
    {"id":"validado", "pt":"Validado",           "en":"Validated",        "cor":"#2f7a4f", "ordem":6},
    {"id":"cancelado","pt":"Cancelado",          "en":"Canceled",         "cor":"#5c5f66", "ordem":7},
]

# InspType considerados "funcionais" no painel 2 do Resumo original
INSPTYPES_FUNCIONAIS = ["AIS","HAT","HCT","PTRH","STW","SCT","SAT","MT3","Shipyard certificate"]


def limpar(v):
    """Limpeza tecnica: remove lixo de exportacao e normaliza espacos."""
    if v is None:
        return ""
    s = str(v).replace("_x000D_", "").replace("\r\n", "\n").replace("\r", "\n")
    s = s.replace("“", '"').replace("”", '"')
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def chave(v):
    v = limpar(v)
    if not v:
        return None
    try:
        return str(int(float(v)))
    except ValueError:
        return v


def ler(caminho):
    with open(caminho, encoding="utf-8") as fh:
        return [{k: limpar(v) for k, v in linha.items()} for linha in csv.DictReader(fh)]


def novo_id(*partes):
    return hashlib.sha1("|".join(str(p) for p in partes).encode()).hexdigest()[:16]


def migrar(p1, p2, saida, autor="Migração"):
    agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    A = {chave(r["Item"]): r for r in ler(p1) if chave(r["Item"])}
    B = {chave(r["Item"]): r for r in ler(p2) if chave(r["Item"])}

    relatorio = {
        "gerado_em": agora,
        "itens_arquivo1": len(A), "itens_arquivo2": len(B),
        "itens_nos_dois": len(set(A) & set(B)),
        "somente_arquivo1": sorted(set(A) - set(B)),
        "somente_arquivo2": sorted(set(B) - set(A)),
        "duplicados_arquivo1": [], "duplicados_arquivo2": [],
        "sem_item": 0, "campos_conflitantes": {}, "campos_so_arquivo1": [], "campos_so_arquivo2": [],
    }

    itens, historico, conflitos = [], [], []

    for it in sorted(set(A) | set(B), key=lambda x: int(x) if x.isdigit() else 0):
        a, b = A.get(it, {}), B.get(it, {})
        fonte = b if b else a

        # ---- campos descritivos: Arquivo 2 preferencial, Arquivo 1 como reserva
        def pega(campo):
            v = limpar(b.get(campo, ""))
            return v if v else limpar(a.get(campo, ""))

        mode_bruto = pega("Mode")
        mode_norm = MODE_NORM.get(mode_bruto.lower().replace("\n", " ").strip(), mode_bruto)

        insp_type = pega("InspType")
        is_b05 = insp_type == "B05"

        # ---- Bigram: separa em codigos atomicos (I7)
        bigram_txt = pega("Bigram")
        bigram = [x.strip() for x in re.split(r"[;,]", bigram_txt) if x.strip() and x.strip() != "-"]

        # ---- status atual: Arquivo 1 col P (10/09) == Arquivo 2 Actual Status (428/428)
        st_2907 = limpar(a.get(COL["prev_2907"], ""))
        st_0909 = limpar(a.get(COL["act_0909"], "")) or limpar(a.get(COL["prev_0909"], ""))
        st_1009 = limpar(a.get(COL["act_1009"], "")) or limpar(b.get("Actual Status", ""))
        status_atual = st_1009 or st_0909 or st_2907

        # ---- historico semeado a partir das 3 datas de corte reais do Arquivo 1
        eventos = []
        if st_2907:
            eventos.append((BASELINE, None, st_2907, "baseline"))
        if st_0909 and st_0909 != st_2907:
            eventos.append((CICLO_09, st_2907, st_0909, "ciclo"))
        if st_1009 and st_1009 != st_0909:
            eventos.append((CICLO_10, st_0909, st_1009, "ciclo"))

        ultima_mudanca = eventos[-1][0] if eventos else BASELINE

        for data, de, para, tipo in eventos:
            historico.append({
                "id": novo_id(it, "status", data, para),
                "item": it, "campo": "status",
                "valorAnterior": de, "valorNovo": para,
                "dataEfetiva": data,
                "consolidadoEm": data + "T00:00:00Z",
                "primeiraAlteracaoEm": data + "T00:00:00Z",
                "autor": autor,
                "origem": "migracao",
                "tipo": "baseline" if tipo == "baseline" else "status",
                "observacao": "Estado inicial importado do SafetyMilestoneJ08" if tipo == "baseline"
                              else "Ciclo de emissão do relatório",
            })

        # ---- conflitos entre os dois arquivos (C2: nada sobrescrito)
        for campo in ["OriginalJx"] + CONFLITANTES:
            va, vb = limpar(a.get(campo, "")), limpar(b.get(campo, ""))
            if not (va and vb and va != vb):
                continue
            decisao = DECISOES_CONFLITO.get(f"{it}:{campo}") or DECISOES_CONFLITO.get(f"*:{campo}")
            if decisao in ("arquivo1", "arquivo2"):
                aplicado = va if decisao == "arquivo1" else vb
                just = JUSTIFICATIVAS.get(f"{campo}:{decisao}", "Decisão do usuário")
            elif decisao:
                aplicado, just = decisao, "Valor definido pelo usuário"
            else:
                aplicado, just = vb, None      # provisório, aguarda decisão na tela
            conflitos.append({
                "id": novo_id(it, campo),
                "item": it, "campo": campo,
                "valorArquivo1": va, "valorArquivo2": vb,
                "valorAplicado": aplicado,
                "resolvido": bool(decisao),
                "resolvidoPor": autor if decisao else None,
                "resolvidoEm": agora if decisao else None,
                "justificativa": just,
            })
            relatorio["campos_conflitantes"][campo] = relatorio["campos_conflitantes"].get(campo, 0) + 1

        def aplicado_de(campo, padrao):
            """Se houve conflito neste item/campo, o item recebe o valor aplicado."""
            for c in conflitos:
                if c["item"] == it and c["campo"] == campo:
                    return c["valorAplicado"]
            return padrao

        itens.append({
            "item": it,
            # --- somente leitura (vem da extracao)
            "sbr": pega("SBR"),
            "originalJx": pega("OriginalJx"),
            "actualJx": pega("ActualJx"),
            "actualJxDescription": pega("ActualJxDescription"),
            "numAndDescription": pega("NºandDescription"),
            "bigram": bigram,
            "bigramOrigem": bigram_txt,
            "performance": pega("Performance"),
            "mode": mode_norm,
            "modeOrigem": mode_bruto if mode_bruto != mode_norm else None,
            "evidence": pega("Evidence"),
            "hullPassageParts": pega("HullPassageParts"),
            "description": pega("Description"),
            "insp": pega("Insp"),
            "inspType": insp_type,
            "positionAC": pega("Position AC"),
            "isB05": is_b05,
            # --- editaveis (I8)
            "status": status_atual,
            "updatedStatusObs": aplicado_de("Updated Status Obs",
                limpar(b.get("Updated Status Obs", "")) or limpar(a.get("Updated Status Obs", ""))),
            "generalObs": pega("General Obs"),
            "ncr": pega("NCR's"),
            "tests": limpar(a.get("Tests", "")),      # I6: so existe no Arquivo 1
            # --- controle
            "criadoEm": BASELINE,
            "ultimaAlteracaoStatus": ultima_mudanca,
            "atualizadoEm": agora,
            "presenteEm": ("ambos" if it in A and it in B else ("arquivo1" if it in A else "arquivo2")),
        })

    # campos existentes so em uma base
    c1 = set(next(iter(A.values())).keys()) if A else set()
    c2 = set(next(iter(B.values())).keys()) if B else set()
    relatorio["campos_so_arquivo1"] = sorted(x for x in c1 - c2 if x and x != "None")
    relatorio["campos_so_arquivo2"] = sorted(x for x in c2 - c1 if x and x != "None")
    relatorio["conflitos_total"] = len(conflitos)
    relatorio["conflitos_em_aberto"] = sum(1 for c in conflitos if not c["resolvido"])

    base = {
        "schemaVersion": 1,
        "meta": {
            "criadoEm": agora, "atualizadoEm": agora,
            "revisao": 1, "ultimoAutor": autor,
            "appVersion": "1.0.0",
            "origem": "Migração de SafetyMilestoneJ08.xlsx + Resumo_Fluxo_Evidencia.xlsb",
        },
        "config": {
            "idioma": "pt",
            "minutosConsolidacao": 10,
            "diasSemAtualizacao": 30,
            "diasAlertaAging": 60,
            "status": [{"codigo": c, "familia": f, "ativo": at, "ordem": o} for c, f, at, o in STATUS_DEF],
            "familias": FAMILIAS,
            "statusAbertoExcecoes": ["1 - Validated by ICN", "2 - Not Blocking", "2 - Not Available Jx"],
            # Status posteriores a execucao: fazer o B05 e depois aguardar o teste a vacuo
            # ou a assinatura e o fluxo normal, entao "B05 done" neles nao e contradicao.
            "statusPosExecucao": ["7 - Missing Vacuum Test or Sign"],
            "inspTypesFuncionais": INSPTYPES_FUNCIONAIS,
            "colunasRecolhidas": [],
        },
        "marcos": [
            {"id": "m1", "nome": "Emissão 29/07/2026", "data": BASELINE, "tipo": "baseline"},
            {"id": "m2", "nome": "Emissão 09/09/2026", "data": CICLO_09, "tipo": "ciclo"},
            {"id": "m3", "nome": "Emissão 10/09/2026", "data": CICLO_10, "tipo": "ciclo"},
        ],
        "itens": itens,
        "historico": sorted(historico, key=lambda h: (h["dataEfetiva"], h["item"])),
        "pendentes": [],
        "observacoes": [],
        "conflitos": conflitos,
        "relatorioMigracao": relatorio,
    }

    with open(saida, "w", encoding="utf-8") as fh:
        json.dump(base, fh, ensure_ascii=False, indent=1)
    return base


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file1", required=True)
    ap.add_argument("--file2", required=True)
    ap.add_argument("--out", default="database.json")
    a = ap.parse_args()
    b = migrar(a.file1, a.file2, a.out)
    r = b["relatorioMigracao"]
    print(f"itens            : {len(b['itens'])}")
    print(f"historico        : {len(b['historico'])} eventos")
    print(f"conflitos        : {r['conflitos_total']} ({r['conflitos_em_aberto']} em aberto)")
    print(f"nos dois arquivos: {r['itens_nos_dois']}")
    print(f"so no arquivo 1  : {len(r['somente_arquivo1'])}")
    print(f"so no arquivo 2  : {len(r['somente_arquivo2'])}")
    print(f"conflitos/campo  : {r['campos_conflitantes']}")
    print(f"-> {a.out}")
