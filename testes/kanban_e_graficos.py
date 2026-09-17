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
f=[]
def chk(n,c,e=""):
    print(("  OK  " if c else "  XXX ")+n+(f"  {e}" if e else ""))
    if not c: f.append(n)
with sync_playwright() as pw:
    b=pw.chromium.launch(**LAUNCH)
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
    # a 1a celula agora e a caixinha de selecao do lote, entao os indices andam um
    v=pg.evaluate("[...document.querySelectorAll('tbody tr td:nth-child(4)')].slice(0,8).map(e=>e.textContent.trim())")
    chk("ordem alfabetica", v==sorted(v,key=str.lower), str(v[:5]))
    pg.locator("thead th[data-s='item']").click(); pg.wait_for_timeout(400)
    n=pg.evaluate("[...document.querySelectorAll('tbody tr td:nth-child(2) b')].slice(0,8).map(e=>+e.textContent)")
    chk("Item natural (9 antes de 10)", n==sorted(n), str(n[:6]))

    print("=== F) telas e temas ===")
    for r in ["dashboard","itens","kanban","fluxo","historico","relatorios","config"]:
        pg.evaluate(f"irPara('{r}')"); pg.wait_for_timeout(260)
    pg.evaluate("irPara('fluxo')"); pg.wait_for_timeout(800)
    chk("2 diagramas de fluxo", pg.locator("#view svg marker").count()==2)
    caixas=pg.evaluate("[...document.querySelectorAll('#view svg rect.fxcaixa')].length")
    chk("caixas de status desenhadas nos dois diagramas", caixas==12, str(caixas))
    pg.screenshot(path="/tmp/f_dash.png")
    pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(700); pg.screenshot(path="/tmp/f_kanban.png")
    pg.evaluate("localStorage.setItem('sm.tema','dark');aplicarTema();irPara('fluxo')"); pg.wait_for_timeout(800)
    pg.screenshot(path="/tmp/f_dark.png")
    pg.set_viewport_size({"width":420,"height":900}); pg.wait_for_timeout(400)
    chk("sem rolagem horizontal em 420px",
        pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2"))

    print("=== G) diagrama de fluxo sem config.fluxo na base (base antiga) ===")
    pg.set_viewport_size({"width":1600,"height":1000})
    pg.evaluate("""(db)=>{localStorage.setItem('sm.tema','light');
      const d=structuredClone(db); delete d.config.fluxo;      // base gerada antes do diagrama
      S.db=d; normalizar(S.db); aplicarTema(); irPara('fluxo');}""",DB)
    pg.wait_for_timeout(900)
    chk("o padrao embutido repoe o desenho", pg.evaluate("!!S.db.config.fluxo.b05.principal"))
    chk("os 2 diagramas continuam aparecendo", pg.locator("#view svg marker").count()==2)
    cx=pg.evaluate("[...document.querySelectorAll('#view svg rect.fxcaixa')].length")
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

    print('=== H2) o quadro \"outros status\" cabe dentro do desenho ===')
    pg.evaluate("""(db)=>{const d=structuredClone(db);
      const b05=d.itens.filter(i=>i.isB05);
      b05[0].status='0 - Cancelado'; b05[1].status='9 - Em espera externa';
      b05[2].status='X - Status desconhecido muito comprido';
      S.db=d; normalizar(S.db); irPara('fluxo');}""",DB)
    pg.wait_for_timeout(900)
    # o diagrama nao e mais o primeiro svg da pagina: pega o do painel B05
    g=pg.evaluate("""(()=>{const sv=document.querySelector('#view .panel[data-dobra=b05] svg');
      const vb=sv.getAttribute('viewBox').split(' ').map(Number); const bb=sv.getBBox();
      return {alt:vb[3], fim:Math.round(bb.y+bb.height), outros:sv.textContent.includes('OUTROS')};})()""")
    chk("status fora do fluxo ganham o quadro 'outros'", g["outros"])
    chk("nada e cortado pela borda do desenho", g["fim"] <= g["alt"], f"conteudo ate {g['fim']}, viewBox {g['alt']}")
    somam=pg.evaluate("""(()=>{const l=S.db.itens.filter(i=>i.isB05);
      const lay=R.fluxoLayout('b05',l);
      const d=new Set([...lay.principal,...lay.grupoA,...lay.grupoB,...lay.grupoC,lay.desvio,lay.bloqueio].filter(Boolean));
      return l.every(i=>d.has(i.status));})()""")
    chk("nenhum item some da conta", somam)
    pg.evaluate("(db)=>{S.db=structuredClone(db); normalizar(S.db); irPara('fluxo');}",DB)
    pg.wait_for_timeout(700)

    print("=== H3) funcao vital: largura cheia e rotulos inteiros ===")
    fv=pg.evaluate("""(()=>{const p=[...document.querySelectorAll('#view .panel')]
        .find(p=>/FUN\u00c7\u00c3O VITAL/i.test(p.innerText));
      if(!p) return null;
      const divs=[...p.querySelectorAll('.pad > div')];   // [0]=rotulos do eixo x, [1]=legenda
      const rot=divs[0]? [...divs[0].children] : [];
      return {larg:Math.round(p.getBoundingClientRect().width),
              irmao:Math.round(p.parentElement.getBoundingClientRect().width),
              n:rot.length, cortado:rot.some(d=>d.textContent.includes('\u2026')),
              multilinha:rot.some(d=>d.getBoundingClientRect().height>20)};})()""")
    chk("o painel existe", bool(fv), str(fv))
    chk("ocupa a linha inteira", fv and abs(fv["larg"]-fv["irmao"])<=4, f"{fv and fv['larg']} de {fv and fv['irmao']}")
    chk("mostra mais funcoes vitais", fv and fv["n"]>=12, str(fv and fv["n"]))
    chk("nenhum nome cortado com reticencias", fv and not fv["cortado"])
    chk("os nomes quebram em mais de uma linha", fv and fv["multilinha"])

    print("=== H4) paineis recolhiveis e ordem da pagina ===")
    pg.evaluate("(db)=>{localStorage.removeItem('sm.dobradas');S.dobradas=new Set();"
                "S.db=structuredClone(db);normalizar(S.db);irPara('dashboard');}",DB)
    pg.wait_for_timeout(900)
    ordem=pg.evaluate("[...document.querySelectorAll('#view .panel')].map(p=>p.dataset.dobra)")
    chk("todo painel do dashboard pode ser recolhido", all(ordem), str(ordem))
    chk("os diagramas de evidencia sairam do dashboard",
        "b05" not in ordem and "exceto" not in ordem, str(ordem))
    pg.evaluate("irPara('fluxo')"); pg.wait_for_timeout(700)
    ordemF=pg.evaluate("[...document.querySelectorAll('#view .panel')].map(p=>p.dataset.dobra)")
    chk("e ganharam tela propria", ordemF==["b05","exceto"], str(ordemF))
    alt0=pg.evaluate("document.querySelector('#view').scrollHeight")
    pg.locator(".panel[data-dobra=b05] h3").click(); pg.wait_for_timeout(300)
    chk("clicar no cabecalho recolhe", pg.locator(".panel[data-dobra=b05].recolhido").count()==1)
    chk("a pagina encolhe junto", pg.evaluate("document.querySelector('#view').scrollHeight")<alt0)
    chk("a seta muda de lado",
        pg.inner_text(".panel[data-dobra=b05] h3 .caret").strip()=="\u25b8",
        repr(pg.inner_text(".panel[data-dobra=b05] h3 .caret")))
    chk("a escolha fica guardada", "b05" in (pg.evaluate("localStorage.getItem('sm.dobradas')") or ""))
    pg.evaluate("irPara('itens');irPara('fluxo')"); pg.wait_for_timeout(800)
    chk("continua recolhido depois de sair e voltar",
        pg.locator(".panel[data-dobra=b05].recolhido").count()==1)
    pg.locator(".panel[data-dobra=b05] h3").click(); pg.wait_for_timeout(300)
    chk("clicar de novo reabre", pg.locator(".panel[data-dobra=b05].recolhido").count()==0)

    print("=== H5) cores dos status e valores nas faixas ===")
    cor=lambda st: pg.evaluate(f"R.corDe({st!r})")
    chk("o laranja que se confundia com o vermelho foi trocado",
        cor("7 - Missing Vacuum Test or Sign")!="#eb6834", cor("7 - Missing Vacuum Test or Sign"))
    chk("o rosa que se confundia com o vermelho foi trocado",
        cor("5 - Waiting Proof")!="#e87ba4", cor("5 - Waiting Proof"))
    chk("Missing Vacuum e Blocking deixaram de ser da mesma familia de cor",
        cor("7 - Missing Vacuum Test or Sign")!=cor("3 - Blocking"))
    # base antiga (com a cor velha gravada) tem de ser corrigida ao carregar
    pg.evaluate("""(db)=>{const d=structuredClone(db);
      d.config.status.find(x=>x.codigo==='7 - Missing Vacuum Test or Sign').cor='#eb6834';
      d.config.status.find(x=>x.codigo==='5 - Waiting Proof').cor='#e87ba4';
      S.db=d; normalizar(S.db); irPara('fluxo');}""",DB)
    pg.wait_for_timeout(700)
    chk("base gravada com as cores antigas e corrigida ao carregar",
        cor("7 - Missing Vacuum Test or Sign")!="#eb6834" and cor("5 - Waiting Proof")!="#e87ba4",
        cor("7 - Missing Vacuum Test or Sign")+" / "+cor("5 - Waiting Proof"))
    # uma cor ajustada a mao nao pode ser sobrescrita
    pg.evaluate("""(db)=>{const d=structuredClone(db);
      d.config.status.find(x=>x.codigo==='7 - Missing Vacuum Test or Sign').cor='#123456';
      S.db=d; normalizar(S.db);}""",DB)
    chk("cor escolhida a mao e preservada", cor("7 - Missing Vacuum Test or Sign")=="#123456")
    pg.evaluate("(db)=>{S.db=structuredClone(db);normalizar(S.db);irPara('dashboard');}",DB)
    pg.wait_for_timeout(900)
    vals=pg.evaluate("""(()=>{const p=[...document.querySelectorAll('#view .panel')]
        .find(p=>/FUN\u00c7\u00c3O VITAL/i.test(p.innerText));
      const t=[...p.querySelectorAll('svg text')].filter(t=>t.getAttribute('paint-order')==='stroke');
      return {n:t.length, corpo:t[0]&&+t[0].getAttribute('font-size'),
              topo:[...p.querySelectorAll('svg text')].filter(t=>!t.getAttribute('paint-order'))
                    .map(t=>+t.getAttribute('font-size'))[0]};})()""")
    chk("cada faixa da barra mostra o seu valor", vals["n"]>=8, str(vals["n"]))
    chk("em corpo menor que o total da coluna", vals["corpo"] < vals["topo"],
        f"faixa {vals['corpo']}px, total {vals['topo']}px")

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
    pg.evaluate("irPara('fluxo')"); pg.wait_for_timeout(700)
    bw=pg.evaluate("getComputedStyle(document.querySelector('.panel')).borderTopWidth")
    chk("borda do painel reforcada", float(bw.replace("px",""))>=1.5, bw)
    cores=pg.evaluate("""[...document.querySelectorAll('#view svg rect.fxcaixa')]
        .map(r=>r.getAttribute('stroke'))""")
    chk("cada caixa usa a cor do seu status", len(set(cores))>=5, str(len(set(cores))))
    linhas=pg.evaluate("""[...document.querySelectorAll('#view svg path[marker-end]')]
        .every(p=>parseFloat(p.getAttribute('stroke-width'))>=3)""")
    chk("setas do fluxo mais grossas", linhas)
    pg.screenshot(path="/tmp/f_dash.png", full_page=True)

    b.close()
print("\nerros:",errs or "nenhum"); print("falhas:",f or "nenhuma")
