from playwright.sync_api import sync_playwright
import pathlib, json, os
# Caminhos por variavel de ambiente: nenhum dado do projeto vive no repositorio
# e o Chromium fica onde o Playwright instalou (ou onde SM_CHROMIUM apontar).
RAIZ = pathlib.Path(__file__).resolve().parent.parent
APP  = (RAIZ/"docs"/"index.html").as_uri()
_DBP = os.environ.get("SM_DATABASE")
if not _DBP:
    raise SystemExit("Defina SM_DATABASE com o caminho do seu database.json "
                     "(ex.: SM_DATABASE=~/base/database.json python3 %s)" % __file__)
DB   = json.load(open(os.path.expanduser(_DBP), encoding="utf-8"))
DBP  = os.path.expanduser(_DBP)
CHROMIUM = os.environ.get("SM_CHROMIUM")          # opcional
LAUNCH = {"args":["--no-sandbox"]} | ({"executable_path":CHROMIUM} if CHROMIUM else {})
erros=[]; falhas=[]
def chk(nome, cond, extra=""):
    print(("  OK  " if cond else "  XXX ")+nome+(f"  {extra}" if extra else ""))
    if not cond: falhas.append(nome)

with sync_playwright() as pw:
    b=pw.chromium.launch(**LAUNCH)
    pg=b.new_page(viewport={"width":1500,"height":950})
    pg.on("console", lambda m: erros.append(m.text) if m.type=="error" else None)
    pg.on("pageerror", lambda e: erros.append("PAGEERROR: "+str(e)))
    pg.goto(APP); pg.wait_for_timeout(600)
    # injeta a base (simula a pasta escolhida) e desliga a gravacao em disco
    pg.evaluate("""(db)=>{
        localStorage.setItem('sm.autor','Bruno Almeida');
        Store.gravar = async (d)=>{ d.meta.revisao=(d.meta.revisao||0)+1; return d.meta.revisao; };
        Store.backup = async ()=> 'fake.json';
        Store.dirHandle = {fake:true};
        S.db = db; normalizar(S.db); S.recolhidas=new Set(); Pend.iniciar(); irPara('dashboard');
    }""", DB)
    pg.wait_for_timeout(500)

    print("=== 1. CARGA E DASHBOARD");
    chk("428 itens carregados", pg.evaluate("S.db.itens.length")==428)
    chk("484 eventos de historico", pg.evaluate("S.db.historico.length")==484)
    chk("KPI total = 428", "428" in pg.inner_text("#view"))
    k = pg.evaluate("M.kpis(S.db.itens)")
    chk("KPI em aberto = 71", k["aberto"]==71, str(k["aberto"]))
    chk("KPI validados = 355", k["validado"]==355, str(k["validado"]))
    chk("KPI alterados no ciclo = 14", k["mudou"]==14, str(k["mudou"]))
    ef = pg.evaluate("M.evidenceFlow(S.db.itens)")
    chk("Evidence Flow B05 166/12", ef["b05"]["total"]==166 and ef["b05"]["aberto"]==12)
    chk("Evidence Flow ExceptB05 262/59", ef["exceto"]["total"]==262 and ef["exceto"]["aberto"]==59)
    sy = pg.evaluate("M.shipyard(S.db.itens)")
    chk("Shipyard J08 21/20 (decisao C3)", sy["total"]==21 and sy["aberto"]==20, f'{sy["total"]}/{sy["aberto"]}')
    fu = pg.evaluate("M.funcional(S.db.itens)")
    chk("Functional 240/38", fu["total"]==240 and fu["aberto"]==38, f'{fu["total"]}/{fu["aberto"]}')
    chk("grafico SVG renderizado", pg.locator("#view svg").count()>=4, str(pg.locator("#view svg").count()))

    print("=== 2. NAVEGACAO ENTRE TELAS")
    for rota,marca in [("itens","table"),("kanban",".kb"),("historico","table"),
                       ("relatorios",".chip"),("conflitos","table"),("config",".panel")]:
        pg.evaluate(f"irPara('{rota}')"); pg.wait_for_timeout(250)
        chk(f"tela {rota}", pg.locator(f"#view {marca}").count()>0)

    print("=== 3. KANBAN")
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(300)
    chk("7 faixas empilhadas", pg.locator(".col").count()==7, str(pg.locator(".col").count()))
    xs=lambda: [round(v) for v in pg.evaluate("[...document.querySelectorAll('.col')].map(c=>c.getBoundingClientRect().x)")]
    chk("padrao e horizontal (colunas lado a lado)", len(set(xs()))>1, str(sorted(set(xs()))[:4]))
    pg.locator("#kbLay").click(); pg.wait_for_timeout(350)
    chk("alterna para vertical (faixas empilhadas)", len(set(xs()))==1)
    pg.locator("#kbLay").click(); pg.wait_for_timeout(350)
    chk("volta para horizontal", len(set(xs()))>1)
    chk("cards renderizados", pg.locator(".card").count()>0, str(pg.locator(".card").count()))
    pg.locator(".col[data-f='validado'] .colh").click(); pg.wait_for_timeout(500)
    chk("coluna recolhivel", pg.locator(".col[data-f='validado'].collapsed").count()==1)
    pg.locator(".col[data-f='validado'] .colh").click(); pg.wait_for_timeout(500)
    chk("coluna reexpande", pg.locator(".col[data-f='validado'].collapsed").count()==0)

    print("=== 4. EDICAO -> PENDING CHANGE")
    st0 = pg.evaluate("S.db.itens.find(i=>i.item==='609').status")
    pg.evaluate("Pend.alterar('609','status','3 - Blocking')"); pg.wait_for_timeout(120)
    chk("status alterado na memoria", pg.evaluate("S.db.itens.find(i=>i.item==='609').status")=="3 - Blocking")
    chk("1 pendente criado", pg.evaluate("S.db.pendentes.length")==1)
    chk("valorOriginal preservado", pg.evaluate("S.db.pendentes[0].valorOriginal")==st0, st0)
    chk("badge de pendentes visivel", pg.locator("#pendBadge").is_visible())
    chk("nenhum historico novo ainda", pg.evaluate("S.db.historico.length")==484)

    print("=== 5. AGRUPAMENTO A->B->C  (deve virar A->C)")
    pg.evaluate("Pend.alterar('609','status','5 - Waiting Proof')"); pg.wait_for_timeout(100)
    chk("continua 1 pendente (agrupado)", pg.evaluate("S.db.pendentes.length")==1)
    pg.evaluate("Pend.consolidarTudo()"); pg.wait_for_timeout(300)
    h = pg.evaluate("S.db.historico.filter(h=>h.item==='609'&&h.origem==='manual')")
    chk("1 unico evento consolidado", len(h)==1, str(len(h)))
    chk(f"evento {st0} -> 5 - Waiting Proof",
        len(h)==1 and h[0]["valorAnterior"]==st0 and h[0]["valorNovo"]=="5 - Waiting Proof")
    chk("pendentes zerados", pg.evaluate("S.db.pendentes.length")==0)

    print("=== 6. IDA-E-VOLTA A->B->A  (nao deve gerar historico)")
    n0 = pg.evaluate("S.db.historico.length")
    pg.evaluate("Pend.alterar('610','status','3 - Blocking')"); pg.wait_for_timeout(80)
    pg.evaluate("Pend.alterar('610','status','1 - Validated by ICN')"); pg.wait_for_timeout(80)
    chk("pendente registrado", pg.evaluate("S.db.pendentes.length")==1)
    pg.evaluate("Pend.consolidarTudo()"); pg.wait_for_timeout(300)
    chk("historico NAO cresceu", pg.evaluate("S.db.historico.length")==n0, str(pg.evaluate("S.db.historico.length")-n0))
    chk("pendentes zerados", pg.evaluate("S.db.pendentes.length")==0)

    print("=== 7. CONSOLIDACAO AUTOMATICA POR TEMPO")
    pg.evaluate("S.db.config.minutosConsolidacao=0; Pend.alterar('611','status','3 - Blocking')")
    pg.wait_for_timeout(120); pg.evaluate("Pend.varrer()"); pg.wait_for_timeout(200)
    chk("consolidou sozinho", pg.evaluate("S.db.pendentes.length")==0)
    chk("gerou evento", pg.evaluate("S.db.historico.filter(h=>h.item==='611').length")>1)
    pg.evaluate("S.db.config.minutosConsolidacao=10")

    print("=== 8. DESCARTE DE PENDENTES")
    pg.evaluate("window.confirm=()=>true")
    st612 = pg.evaluate("S.db.itens.find(i=>i.item==='612').status")
    pg.evaluate("Pend.alterar('612','status','3 - Blocking')"); pg.wait_for_timeout(100)
    n1 = pg.evaluate("S.db.historico.length")
    pg.evaluate("Pend.descartarTudo()"); pg.wait_for_timeout(300)
    chk("status revertido ao original", pg.evaluate("S.db.itens.find(i=>i.item==='612').status")==st612)
    chk("historico intacto", pg.evaluate("S.db.historico.length")==n1)
    chk("log de descarte gravado (recuperavel)", pg.evaluate("(S.db.logDescartes||[]).length")==1)

    print("=== 9. DRAG & DROP usa a mesma logica")
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(250)
    pg.evaluate("UI.moverPara('613','bloqueado')"); pg.wait_for_timeout(300)
    npend = pg.evaluate("S.db.pendentes.length")
    modal = pg.locator("#ov").count()
    chk("mover card cria pendente OU abre escolha de status", npend==1 or modal==1, f"pend={npend} modal={modal}")
    if modal:
        pg.locator("#ov button[data-s]").first.click(); pg.wait_for_timeout(250)
        chk("apos escolher, virou pendente", pg.evaluate("S.db.pendentes.length")==1)
    pg.evaluate("Pend.descartarTudo()"); pg.wait_for_timeout(200)

    print("=== 10. OBSERVACOES (salvam na hora, fora do fluxo de pendentes)")
    n2 = pg.evaluate("S.db.historico.length")
    pg.evaluate("""S.db.observacoes.push({id:'x1',item:'614',texto:'teste de observacao',
                  criadoEm:new Date().toISOString(),autor:'Bruno Almeida'})""")
    chk("observacao gravada", pg.evaluate("S.db.observacoes.length")==1)
    chk("nao virou pendente", pg.evaluate("S.db.pendentes.length")==0)
    chk("nao poluiu o historico", pg.evaluate("S.db.historico.length")==n2)

    print("=== 11. DASHBOARD HISTORICO / COMPARACAO DE PERIODOS")
    cmp1 = pg.evaluate("M.comparar(S.db.itens,'2026-07-29','2026-09-10')")
    chk("em aberto 29/07 = 74", cmp1["abertoInicio"]==74, str(cmp1["abertoInicio"]))
    chk("em aberto 10/09 = 71", cmp1["abertoFim"]==71, str(cmp1["abertoFim"]))
    chk("alterados = melhoraram + pioraram e fecha com iguais",
        len(cmp1["alterados"])==len(cmp1["melhoraram"])+len(cmp1["pioraram"])
        and len(cmp1["alterados"])+cmp1["iguais"]==428,
        f'{len(cmp1["alterados"])}+{cmp1["iguais"]}=428')
    cmp2 = pg.evaluate("M.comparar(S.db.itens,'2026-09-09','2026-09-10')")
    chk("ciclo 09/09->10/09 tem 14 alterados", len(cmp2["alterados"])==14, str(len(cmp2["alterados"])))
    chk("reconstrucao 29/07: 348 validados",
        pg.evaluate("S.db.itens.filter(i=>R.statusEm(i.item,'2026-07-29')==='1 - Validated by ICN').length")==348)

    print("=== 12. FILTROS E BUSCA")
    pg.evaluate("irPara('itens')"); pg.wait_for_timeout(250)
    pg.evaluate("S.filtros.b05='sim'"); chk("filtro B05 = 166", pg.evaluate("itensFiltrados().length")==166)
    pg.evaluate("S.filtros.b05=''; S.filtros.status=['3 - Blocking']")
    chk("filtro status Blocking bate com a base",
        pg.evaluate("itensFiltrados().length")==pg.evaluate("S.db.itens.filter(i=>i.status==='3 - Blocking').length"))
    pg.evaluate("S.filtros=filtrosVazios(); S.filtros.busca='pressure hull'")
    chk("busca textual encontra", pg.evaluate("itensFiltrados().length")>100, str(pg.evaluate("itensFiltrados().length")))
    pg.evaluate("S.filtros=filtrosVazios(); S.filtros.bigram=['AC']")
    chk("filtro Bigram AC = 168", pg.evaluate("itensFiltrados().length")==168, str(pg.evaluate("itensFiltrados().length")))
    pg.evaluate("S.filtros=filtrosVazios()")

    print("=== 13. CONFLITOS")
    pg.evaluate("""S.db.conflitos.filter(c=>c.campo==='Bigram').slice(0,3)
        .forEach(c=>{c.resolvido=false; delete c.valorAplicado;}); irPara('conflitos');""")
    pg.wait_for_timeout(250)
    chk("40 conflitos, 3 reabertos para decisao manual (Bigram)",
        pg.evaluate("S.db.conflitos.length")==40 and pg.evaluate("S.db.conflitos.filter(c=>!c.resolvido).length")==3)
    cid = pg.evaluate("S.db.conflitos.find(c=>!c.resolvido).id")
    pg.evaluate(f"UI.resolverConflito('{cid}','1')"); pg.wait_for_timeout(300)
    chk("conflito resolvido", pg.evaluate("S.db.conflitos.filter(c=>!c.resolvido).length")==2)
    chk("resolucao gerou evento de historico", pg.evaluate("S.db.historico.filter(h=>h.origem==='conflito').length")==1)

    print("=== 14. INTEGRIDADE, IDIOMA, TEMA, EXPORT")
    pg.evaluate("irPara('config')"); pg.wait_for_timeout(250)
    chk("verificacao de integridade roda", "conflito" in pg.inner_text("#integ").lower() or "✓" in pg.inner_text("#integ"))
    pg.locator("#btnLang").click(); pg.wait_for_timeout(350)
    chk("interface em ingles", "Settings" in pg.inner_text("#nav"))
    pg.locator("#btnLang").click(); pg.wait_for_timeout(350)
    chk("volta para portugues", "Configura" in pg.inner_text("#nav"))
    pg.locator("#btnTheme").click(); pg.wait_for_timeout(200)
    chk("tema alterna", pg.evaluate("document.documentElement.dataset.theme")in("dark","light"))
    csv = pg.evaluate("(()=>{const l=S.db.itens.slice(0,3);const q=s=>'\"'+String(s).replace(/\"/g,'\"\"')+'\"';return [Export.COLS.map(c=>q(c[1])).join(';')].concat(l.map(i=>Export.COLS.map(c=>q(Export.val(i,c[0]))).join(';'))).join('\\n');})()")
    import io as _io, csv as _csv
    linhas=list(_csv.reader(_io.StringIO(csv),delimiter=";"))
    chk("CSV gera cabecalho + 3 linhas, colunas alinhadas",
        len(linhas)==4 and len({len(l) for l in linhas})==1 and "Actual Status" in csv,
        f"{len(linhas)} linhas x {len(linhas[0])} colunas")
    xls_ok = pg.evaluate("(()=>{try{ const o=[]; const orig=window.URL.createObjectURL; window.URL.createObjectURL=b=>{o.push(b);return 'blob:x'}; Export.excel(S.db.itens.slice(0,5),'teste'); window.URL.createObjectURL=orig; return o.length===1 && o[0].size>1000;}catch(e){return 'ERRO:'+e.message}})()")
    chk("export Excel (SpreadsheetML) gera arquivo", xls_ok is True, str(xls_ok))

    print("=== 15. RESPONSIVO / SEM ERROS")
    pg.set_viewport_size({"width":420,"height":880}); pg.evaluate("irPara('dashboard')"); pg.wait_for_timeout(400)
    ow = pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2")
    chk("sem rolagem horizontal em 420px", ow)
    pg.set_viewport_size({"width":1500,"height":950}); pg.wait_for_timeout(300)
    pg.screenshot(path="/tmp/dash.png", full_page=False)
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(400); pg.screenshot(path="/tmp/kanban.png")
    pg.evaluate("irPara('historico')"); pg.wait_for_timeout(500); pg.screenshot(path="/tmp/hist.png")
    b.close()

print("\n"+"="*70)
reais=[e for e in erros if "favicon" not in e.lower()]
print(f"ERROS DE CONSOLE: {len(reais)}")
for e in reais[:12]: print("   ",e[:220])
print(f"FALHAS: {len(falhas)}")
for f in falhas: print("   -",f)
print("TUDO OK" if not falhas and not reais else "REVISAR")
