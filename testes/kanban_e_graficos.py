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
    chk("2 diagramas de fluxo", pg.locator("#view svg marker").count()==2)
    caixas=pg.evaluate("[...document.querySelectorAll('#view svg rect[rx=\"11\"]')].length")
    chk("caixas de status desenhadas nos dois diagramas", caixas==12, str(caixas))
    pg.screenshot(path="/tmp/f_dash.png")
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(700); pg.screenshot(path="/tmp/f_kanban.png")
    pg.evaluate("localStorage.setItem('sm.tema','dark');aplicarTema();irPara('dashboard')"); pg.wait_for_timeout(800)
    pg.screenshot(path="/tmp/f_dark.png")
    pg.set_viewport_size({"width":420,"height":900}); pg.wait_for_timeout(400)
    chk("sem rolagem horizontal em 420px",
        pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2"))

    print("=== G) diagrama de fluxo sem config.fluxo na base (base antiga) ===")
    pg.set_viewport_size({"width":1600,"height":1000})
    pg.evaluate("""(db)=>{localStorage.setItem('sm.tema','light');
      const d=structuredClone(db); delete d.config.fluxo;      // base gerada antes do diagrama
      S.db=d; normalizar(S.db); aplicarTema(); irPara('dashboard');}""",DB)
    pg.wait_for_timeout(900)
    chk("o padrao embutido repoe o desenho", pg.evaluate("!!S.db.config.fluxo.b05.principal"))
    chk("os 2 diagramas continuam aparecendo", pg.locator("#view svg marker").count()==2)
    cx=pg.evaluate("[...document.querySelectorAll('#view svg rect[rx=\"11\"]')].length")
    chk("12 caixas desenhadas, nao um painel em branco", cx==12, str(cx))
    painel=pg.evaluate("""[...document.querySelectorAll('#view .panel')]
        .find(p=>p.textContent.includes('somente'))?.querySelector('.pad')?.textContent.trim()""")
    chk("painel 'somente B05' traz numeros", bool(painel) and any(c.isdigit() for c in painel or ""), (painel or "")[:40])

    print("=== H) a soma do diagrama fecha com o total (nenhum item invisivel) ===")
    soma=pg.evaluate("""(()=>{const l=S.db.itens.filter(i=>i.isB05);
      const lay=R.fluxoLayout('b05',l);
      const desenhados=new Set([...lay.principal,...lay.grupoA,...lay.grupoB,...lay.grupoC,
                                lay.desvio,lay.bloqueio].filter(Boolean));
      return l.filter(i=>desenhados.has(i.status)).length===l.length;})()""")
    chk("todo status B05 tem lugar no desenho", soma)

    print("=== I) tabela: conteudo cortado acessivel ===")
    pg.evaluate("localStorage.setItem('sm.textoCompleto','0');S.textoCompleto=false;irPara('itens')")
    pg.wait_for_timeout(600)
    nt=pg.locator("#view td .trunc[data-tip]").count()
    chk("celulas longas marcadas com o texto completo", nt>0, str(nt))
    alvo=pg.locator("#view td .trunc[data-tip]").first
    completo=alvo.get_attribute("data-tip")
    alvo.hover(); pg.wait_for_timeout(400)
    chk("balao aparece ao passar o mouse", pg.evaluate("getComputedStyle($('#tip')).display")=="block")
    chk("balao mostra o conteudo inteiro", completo in pg.inner_text("#tip"),
        (completo or "")[:38]+"...")
    chk("o balao nao corta", len(pg.inner_text("#tip"))>=len(completo))
    pg.locator("#btnTxt").click(); pg.wait_for_timeout(500)
    chk("modo texto completo desliga o corte", pg.locator("#view table.livre").count()==1)
    chk("sem balao quando tudo ja esta visivel", pg.locator("#view td .trunc[data-tip]").count()==0)
    pg.locator("#btnTxt").click(); pg.wait_for_timeout(400)

    print("=== J) linhas e cores mais fortes ===")
    pg.evaluate("irPara('dashboard')"); pg.wait_for_timeout(700)
    bw=pg.evaluate("getComputedStyle(document.querySelector('.panel')).borderTopWidth")
    chk("borda do painel reforcada", float(bw.replace("px",""))>=1.5, bw)
    cores=pg.evaluate("""[...document.querySelectorAll('#view svg rect[rx="11"]')]
        .map(r=>r.getAttribute('stroke'))""")
    chk("cada caixa usa a cor do seu status", len(set(cores))>=5, str(len(set(cores))))
    linhas=pg.evaluate("""[...document.querySelectorAll('#view svg path[marker-end]')]
        .every(p=>parseFloat(p.getAttribute('stroke-width'))>=3)""")
    chk("setas do fluxo mais grossas", linhas)
    pg.screenshot(path="/tmp/f_dash.png", full_page=True)

    b.close()
print("\nerros:",errs or "nenhum"); print("falhas:",f or "nenhuma")
