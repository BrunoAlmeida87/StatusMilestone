from playwright.sync_api import sync_playwright
import pathlib,json
APP=pathlib.Path('/home/user/StatusMilestone/docs/index.html').resolve().as_uri()
DB=json.load(open('/tmp/claude-0/-home-user-StatusMilestone/1a537918-4090-5771-81f5-3c87119b1495/scratchpad/entregar/database.json',encoding='utf-8'))
f=[]
def chk(n,c,e=""):
    print(("  OK  " if c else "  XXX ")+n+(f"  {e}" if e else ""))
    if not c: f.append(n)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1600,"height":1000}); errs=[]; mv=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:(mv.append(m.text.split()[3]) if m.text.startswith("MOVE ") else
                              (errs.append("C:"+m.text) if m.type=="error" else None)))
    pg.goto(APP); pg.wait_for_timeout(300)
    pg.evaluate("""(db)=>{localStorage.setItem('sm.autor','Bruno Almeida');localStorage.setItem('sm.tema','light');
      Store.gravar=async d=>1;Store.backup=async()=>'x';Store.dirHandle={};window.confirm=()=>true;
      S.db=db;normalizar(S.db);aplicarTema();S.recolhidas=new Set();
      const _m=UI.moverPara.bind(UI); UI.moverPara=(id,fa)=>{console.log('MOVE ->',fa,id); return _m(id,fa);};
      irPara('kanban');}""",DB)
    pg.wait_for_timeout(700)

    print("=== A) arraste entre faixas vizinhas ===")
    mv.clear()
    pg.locator(".col[data-f='prova'] .card").first.drag_to(pg.locator(".col[data-f='analise'] .colbody"))
    pg.wait_for_timeout(600)
    it=mv[0] if mv else None
    chk("arraste aplicou", it and pg.evaluate(f"S.db.itens.find(i=>i.item==='{it}').status")=="4 - Under Analysis", str(it))

    print("=== B) botao de status no card (sem arrastar, funciona a qualquer distancia) ===")
    card=pg.locator(".col[data-f='validado'] .card").first
    it2=card.locator(".cid").inner_text()
    chk("card tem botao de status", card.locator(".cst").count()==1)
    chk("botao mostra o status atual", "Validated" in card.locator(".cst").inner_text(), card.locator(".cst").inner_text())
    card.locator(".cst").click(); pg.wait_for_timeout(500)
    chk("abriu o seletor, nao o detalhe", pg.locator("#ov").count()==1 and "Detalhes" not in pg.inner_text("#ov"))
    grupos=pg.evaluate("[...document.querySelectorAll('#ov button[data-s]')].length")
    chk("lista todos os status ativos agrupados", grupos>=6, str(grupos))
    pg.evaluate("""[...document.querySelectorAll('#ov button[data-s]')]
        .find(b=>b.dataset.s==='6 - Waiting B05' || b.dataset.s.startsWith('8 -') || b.dataset.s.startsWith('3 -')).click()""")
    pg.wait_for_timeout(600)
    st=pg.evaluate(f"S.db.itens.find(i=>i.item==='{it2}').status")
    chk(f"item {it2} mudou para {st}", st!="1 - Validated by ICN", st)
    chk("virou pendente (mesmo motor)", pg.evaluate("S.db.pendentes.length")==2, str(pg.evaluate("S.db.pendentes.length")))
    chk("card foi para a faixa nova",
        pg.evaluate(f"document.querySelector(\"[data-i='{it2}']\")?.closest('.col')?.dataset.f")
          ==pg.evaluate(f"R.familiaDe('{st}')"))

    print("=== C) consolidacao ===")
    pg.evaluate("Pend.consolidarTudo()"); pg.wait_for_timeout(600)
    chk("2 eventos no historico", pg.evaluate("S.db.historico.filter(h=>h.origem==='manual').length")==2)
    chk("pendentes zerados", pg.evaluate("S.db.pendentes.length")==0)

    print("=== D) clique no corpo do card abre o detalhe ===")
    pg.locator(".col[data-f='prova'] .card").first.locator(".cdesc").click(); pg.wait_for_timeout(500)
    chk("detalhe abriu", pg.locator("#ov").count()==1 and "Detalhes" in pg.inner_text("#ov"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

    print("=== E) ordenacao na tabela ===")
    pg.evaluate("irPara('itens')"); pg.wait_for_timeout(500)
    th=pg.evaluate("document.querySelector(\"thead th[data-s='item']\").outerHTML.slice(0,140)")
    chk("th tem title e indicador", "title=" in th and ("▲" in th or "▼" in th), th[:110])
    pg.locator("thead th[data-s='inspType']").click(); pg.wait_for_timeout(400)
    chk("coluna ativa destacada",
        "accent" in (pg.evaluate("document.querySelector(\"thead th[data-s='inspType']\").getAttribute('style')") or ""))
    v=pg.evaluate("[...document.querySelectorAll('tbody tr td:nth-child(3)')].slice(0,8).map(e=>e.textContent.trim())")
    chk("ordem alfabetica", v==sorted(v,key=str.lower), str(v[:5]))
    pg.locator("thead th[data-s='item']").click(); pg.wait_for_timeout(400)
    n=pg.evaluate("[...document.querySelectorAll('tbody tr td:first-child b')].slice(0,8).map(e=>+e.textContent)")
    chk("Item natural (9 antes de 10)", n==sorted(n), str(n[:6]))

    print("=== F) telas e temas ===")
    for r in ["dashboard","kanban","historico","relatorios","conflitos","config"]:
        pg.evaluate(f"irPara('{r}')"); pg.wait_for_timeout(260)
    pg.evaluate("irPara('dashboard')"); pg.wait_for_timeout(800)
    chk("2 diagramas de fluxo", pg.locator("#view svg marker#pf").count()==2)
    pg.screenshot(path="f_dash.png")
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(700); pg.screenshot(path="f_kanban.png")
    pg.evaluate("localStorage.setItem('sm.tema','dark');aplicarTema();irPara('dashboard')"); pg.wait_for_timeout(800)
    pg.screenshot(path="f_dark.png")
    pg.set_viewport_size({"width":420,"height":900}); pg.wait_for_timeout(400)
    chk("sem rolagem horizontal em 420px",
        pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2"))
    b.close()
print("\nerros:",errs or "nenhum"); print("falhas:",f or "nenhuma")
