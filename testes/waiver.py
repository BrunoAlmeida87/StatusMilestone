"""Waiver e janelas que nao fogem — em Chromium real.

Duas coisas que so um navegador de verdade prova:

  1. o waiver do comeco ao fim: pedir pela tela, gravar na base, mover os itens,
     registrar o passivo feito a mao e imprimir o documento (que e medido em
     paginas de A4 de verdade, nao estimado);
  2. a janela que fechava sozinha: arrastar para selecionar o texto de um campo
     e soltar o botao FORA da janela dava um clique no fundo, e o que estava
     escrito ia junto. Isso precisa de mouse de verdade para ser reproduzido.

    export SM_DATABASE=~/caminho/para/database.json
    python3 testes/waiver.py
"""
from playwright.sync_api import sync_playwright
import pathlib, json, os, tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
APP  = (RAIZ/"docs"/"index.html").as_uri()
VIZ  = (RAIZ/"docs"/"visualizador.html").as_uri()
_DBP = os.environ.get("SM_DATABASE")
if not _DBP:
    raise SystemExit("Defina SM_DATABASE com o caminho do seu database.json "
                     "(ex.: SM_DATABASE=~/base/database.json python3 %s)" % __file__)
DB = json.load(open(os.path.expanduser(_DBP), encoding="utf-8"))
CHROMIUM = os.environ.get("SM_CHROMIUM")          # opcional
LAUNCH = {"args": ["--no-sandbox"]} | ({"executable_path": CHROMIUM} if CHROMIUM else {})
SAIDA = pathlib.Path(os.environ.get("SM_SAIDA", tempfile.gettempdir()))

falhas, erros = [], []
def chk(n, c, e=""):
    print(("  OK  " if c else "  XXX ") + n + (f"  {e}" if e else ""))
    if not c:
        falhas.append(n)

INJETAR = """(db)=>{
  localStorage.setItem('sm.autor','Bruno Almeida');
  Store.gravar = async (d)=>{ d.meta.revisao=(d.meta.revisao||0)+1; return d.meta.revisao; };
  Store.backup = async ()=> 'fake.json';
  Store.dirHandle = {fake:true};
  S.db = db; normalizar(S.db); S.recolhidas=new Set(); Pend.iniciar(); irPara('dashboard');
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(**LAUNCH)
    pg = b.new_page(viewport={"width":1500,"height":950})
    pg.on("console", lambda m: erros.append(m.text) if m.type=="error" else None)
    pg.on("pageerror", lambda e: erros.append("PAGEERROR: "+str(e)))
    # confirm() responde "sim" por padrao; alguns testes trocam isto.
    resposta = {"sim": True, "vistas": []}
    pg.on("dialog", lambda d: (resposta["vistas"].append(d.message),
                               d.accept() if resposta["sim"] else d.dismiss()))
    pg.goto(APP); pg.wait_for_timeout(600)
    pg.evaluate(INJETAR, DB)
    pg.wait_for_timeout(500)

    print("=== 1. A TELA DE WAIVERS EXISTE E COMECA VAZIA")
    pg.evaluate("() => irPara('waivers')"); pg.wait_for_timeout(400)
    chk("o menu tem a entrada", "Waivers" in pg.inner_text("#nav"))
    chk("a tela abre sem nenhum waiver", pg.locator("#view .empty").count() == 1)
    chk("com o botão de pedir um novo", pg.locator("#wvNovo").count() == 1)

    print("=== 2. PEDIR UM WAIVER PARA VARIOS ITENS, PELA TELA")
    alvos = pg.evaluate("""() => S.db.itens.filter(i=>R.aberto(i.status)).slice(0,3).map(i=>i.item)""")
    antes = pg.evaluate("(a)=>a.map(x=>S.db.itens.find(i=>i.item===x).status)", alvos)
    pg.click("#wvNovo"); pg.wait_for_timeout(300)
    chk("a janela do waiver abre", pg.locator("#ov").count() == 1)
    for it in alvos:
        pg.fill("#wItemAdd", it)
        pg.click("#wItemBtn")
    chk("os três itens entraram como fichas", pg.locator("#wItens [data-wi]").count() == 3,
        str(pg.locator("#wItens [data-wi]").count()))
    pg.click("#wModelo")
    chk("o modelo de texto entra no campo",
        "Situação encontrada" in pg.input_value("#wTexto"))
    pg.fill("#wTexto", "Solicitamos waiver: a montagem está concluída e o teste de vácuo "
                       "não pode ser executado antes do docking, sem impacto em segurança.")
    pg.fill("#wAssunto", "Dispensa de teste de vácuo antes do docking")
    pg.fill("#wPara", "ICN / Classificadora")
    pg.fill("#wRef", "CARTA-GTO-2026-0042")
    pg.fill("#wCondicao", "Executar o teste na primeira janela de docking e reportar em 5 dias.")
    pg.select_option("#wSituacao", "enviado")
    pg.select_option("#wFinal", "1 - Validated by ICN")
    chk("sem status de tramitação escolhido, a janela não pergunta nada",
        pg.inner_html("#wDivergencia").strip() == "")
    pg.select_option("#wDestino", "4 - Under Analysis")
    pg.wait_for_timeout(250)
    perg = pg.inner_text("#wDivergencia")
    chk("escolhendo um status diferente do atual, ela pergunta ali mesmo",
        "status atual é outro" in perg.lower() or "O status atual é outro" in perg, perg[:70])
    chk("dizendo quantos itens não estão nele", f"de {len(alvos)}" in perg, perg[:90])
    chk("com a caixa de alterar o status", pg.locator("#wAplicar").count() == 1)
    chk("e a de registrar o texto como observação", pg.locator("#wObs").count() == 1)
    pg.check("#wAplicar"); pg.check("#wObs")
    pg.click("#mb1"); pg.wait_for_timeout(600)

    w = pg.evaluate("() => S.db.waivers[0]")
    chk("o waiver foi gravado na base", pg.evaluate("() => S.db.waivers.length") == 1)
    chk("com número da série do ano", bool(w and w["numero"].startswith("W-")), w and w["numero"])
    chk("com os três itens", w and w["itens"] == alvos, str(w and w["itens"]))
    chk("com o status de tramitação", w and w["statusDestino"] == "4 - Under Analysis")
    chk("com o status final desejado", w and w["statusFinal"] == "1 - Validated by ICN")
    chk("com a referência do documento", w and w["referencia"] == "CARTA-GTO-2026-0042")
    chk("e assinado por quem pediu", w and w["autor"] == "Bruno Almeida")

    depois = pg.evaluate("(a)=>a.map(x=>S.db.itens.find(i=>i.item===x).status)", alvos)
    movidos = sum(1 for a, d in zip(antes, depois) if a != d and d == "4 - Under Analysis")
    chk("os itens foram movidos para o status de tramitação",
        all(d == "4 - Under Analysis" for d in depois), f"{movidos} mudaram de fato")
    chk("como alteração pendente, igual a qualquer edição",
        pg.evaluate("() => S.db.pendentes.length") == movidos, str(movidos))
    chk("e o motivo no pendente diz de qual waiver veio",
        pg.evaluate("() => S.db.pendentes.every(p=>/^Waiver W-/.test(p.motivo||''))"))

    print("--- e o texto vira observação no item, junto da mudança de status")
    obs = pg.evaluate("(a)=>S.db.observacoes.filter(o=>a.includes(o.item))", alvos)
    chk("uma observação por item movido", len(obs) == movidos, f"{len(obs)} para {movidos}")
    chk("dizendo de qual waiver veio", all(w["numero"] in o["texto"] for o in obs))
    chk("de qual status para qual", all('"4 - Under Analysis"' in o["texto"] for o in obs))
    chk("e com o texto que foi escrito",
        all("não pode ser executado antes do docking" in o["texto"] for o in obs))
    pg.evaluate("(x)=>UI.detalhe(x)", alvos[0]); pg.wait_for_timeout(400)
    pg.click('.tabs button[data-t="o"]'); pg.wait_for_timeout(250)
    chk("e ela aparece na aba Observações do item", w["numero"] in pg.inner_text("#tp-o"))
    pg.evaluate("() => UI.fechar()")

    print("--- um status que os itens já têm não vira pergunta")
    ja = pg.evaluate("() => S.db.itens.filter(i=>i.status==='4 - Under Analysis').slice(0,2).map(i=>i.item)")
    pg.evaluate("() => irPara('waivers')"); pg.wait_for_timeout(300)
    pg.click("#wvNovo"); pg.wait_for_timeout(300)
    for it in ja:
        pg.fill("#wItemAdd", it); pg.click("#wItemBtn")
    pg.select_option("#wDestino", "4 - Under Analysis"); pg.wait_for_timeout(250)
    chk("ela diz que não há o que mudar", "já estão" in pg.inner_text("#wDivergencia"),
        pg.inner_text("#wDivergencia")[:70])
    chk("e não oferece caixa nenhuma", pg.locator("#wAplicar").count() == 0)
    pg.evaluate("() => UI.fechar()")

    print("=== 3. O WAIVER APARECE ONDE O ITEM ESTA")
    pg.evaluate("(x)=>UI.detalhe(x)", alvos[0]); pg.wait_for_timeout(400)
    chk("a janela do item mostra o waiver", w["numero"] in pg.inner_text("#ov"))
    chk("e oferece pedir outro", pg.locator("#wvNovoDoItem").count() == 1)
    pg.evaluate("() => UI.fechar()")
    pg.evaluate("() => irPara('waivers')"); pg.wait_for_timeout(400)
    chk("a lista traz o waiver", w["numero"] in pg.inner_text("#view"))
    pg.click(f'tr[data-wv="{w["id"]}"]'); pg.wait_for_timeout(300)
    chk("clicar na linha abre o waiver", "Dispensa de teste de vácuo" in pg.inner_text("#ov"))
    chk("com o texto inteiro", "não pode ser executado antes do docking" in pg.inner_text("#ov"))
    pg.evaluate("() => UI.fechar()")

    print("=== 3b. A RESPOSTA DO DESTINATARIO, QUE CHEGA DEPOIS")
    pg.evaluate("() => irPara('waivers')"); pg.wait_for_timeout(300)
    pg.click(f'tr[data-wv="{w["id"]}"]'); pg.wait_for_timeout(300)
    chk("enquanto não há resposta, o waiver diz que está esperando",
        "aguardando a resposta" in pg.inner_text("#ov"))
    chk("e oferece registrar a resposta", "Registrar resposta" in pg.inner_text("#ov"))
    pg.click('#ov footer button:has-text("Registrar resposta")'); pg.wait_for_timeout(350)
    chk("a janela da resposta abre", "Resposta ao waiver" in pg.inner_text("#ov"))
    chk("com o destinatário sugerido como quem respondeu",
        pg.input_value("#wrPor") == "ICN / Classificadora", pg.input_value("#wrPor"))
    chk("e o status a aplicar já vem do status final pedido",
        pg.input_value("#wrStatus") == "1 - Validated by ICN", pg.input_value("#wrStatus"))
    chk("perguntando sobre os itens que ainda não estão lá",
        "status atual é outro" in pg.inner_text("#wrDiv"))
    chk("com as duas caixas já marcadas",
        pg.is_checked("#wrAplicar") and pg.is_checked("#wrObs"))

    print("--- recusar não move nada por conta própria")
    pg.select_option("#wrResultado", "recusado"); pg.wait_for_timeout(250)
    chk("recusando, nenhum status é sugerido", pg.input_value("#wrStatus") == "",
        pg.input_value("#wrStatus"))
    chk("e não há o que perguntar sobre status", pg.locator("#wrAplicar").count() == 0)
    chk("mas a caixa de registrar o parecer continua ali",
        pg.locator("#wrObs").count() == 1 and pg.is_checked("#wrObs"))

    print("--- aprovando: parecer, status final e observação num gesto")
    pg.select_option("#wrResultado", "aprovado"); pg.wait_for_timeout(250)
    chk("voltando a aprovar, o status final volta",
        pg.input_value("#wrStatus") == "1 - Validated by ICN")
    pg.fill("#wrPor", "ICN — J. Marques")
    pg.fill("#wrData", "2026-09-19")
    pg.fill("#wrParecer", "Waiver concedido nas condições propostas. "
                          "Reavaliar no fechamento do J08.")
    pg.check("#wrAplicar"); pg.check("#wrObs")
    pg.click('#ov footer button:has-text("Registrar resposta")'); pg.wait_for_timeout(700)

    wr = pg.evaluate("(id)=>S.db.waivers.find(x=>x.id===id)", w["id"])
    chk("a situação vira aprovado", wr["situacao"] == "aprovado", wr["situacao"])
    chk("com quem respondeu e quando",
        wr["decisaoPor"] == "ICN — J. Marques" and wr["decisaoEm"] == "2026-09-19")
    chk("e o parecer registrado", "Reavaliar no fechamento" in wr["decisaoObs"])
    fim = pg.evaluate("(a)=>a.map(x=>S.db.itens.find(i=>i.item===x).status)", alvos)
    chk("os itens foram para o status final",
        all(x == "1 - Validated by ICN" for x in fim), str(set(fim)))
    ob2 = pg.evaluate("(a)=>S.db.observacoes.filter(o=>a.includes(o.item) "
                      "&& o.texto.includes('Reavaliar'))", alvos)
    chk("o parecer virou observação em cada item movido", len(ob2) == len(alvos), str(len(ob2)))
    chk("com o PARECER, não com o texto do pedido",
        all("antes do docking" not in o["texto"] for o in ob2))

    print("--- respondido, o botão de responder sai do item")
    pg.evaluate("(x)=>UI.detalhe(x)", alvos[0]); pg.wait_for_timeout(400)
    chk("o item não oferece responder de novo", pg.locator("[data-wvr]").count() == 0)
    chk("mas o waiver continua lá, agora aprovado", "Aprovado" in pg.inner_text("#ov"))
    pg.evaluate("() => UI.fechar()")

    print("=== 3c. O CAMINHO PELO ITEM: RESPONDER DE DENTRO DELE")
    it3 = pg.evaluate("() => S.db.itens.filter(i=>i.status==='3 - Blocking').slice(0,1)[0].item")
    pg.evaluate("""(x)=>{ Waiver.guardar({id:'viaItem', numero:'W-2026-900', itens:[x],
        assunto:'pedido respondido pelo item', texto:'pedido', para:'ICN',
        situacao:'enviado', statusFinal:'2 - Not Blocking',
        criadoEm:agora(), autor:'Bruno Almeida'}); }""", it3)
    pg.evaluate("(x)=>UI.detalhe(x)", it3); pg.wait_for_timeout(400)
    chk("o item oferece responder enquanto não há resposta",
        pg.locator('[data-wvr="viaItem"]').count() == 1)
    pg.click('[data-wvr="viaItem"]'); pg.wait_for_timeout(350)
    chk("abre a janela da resposta", "W-2026-900" in pg.inner_text("#ov"))
    pg.fill("#wrParecer", "Aceito pelo ICN por e-mail de 19/09.")
    pg.check("#wrAplicar"); pg.check("#wrObs")
    pg.click('#ov footer button:has-text("Registrar resposta")'); pg.wait_for_timeout(800)
    chk("o item vai para o status final",
        pg.evaluate("(x)=>S.db.itens.find(i=>i.item===x).status", it3) == "2 - Not Blocking")
    chk("a janela do ITEM reabre, para ver o resultado",
        pg.locator("#ov").count() == 1 and it3 in pg.inner_text("#ov h2"))
    pg.click('.tabs button[data-t="o"]'); pg.wait_for_timeout(250)
    chk("com a observação do parecer já lá", "Aceito pelo ICN" in pg.inner_text("#tp-o"))
    pg.evaluate("() => UI.fechar()")

    print("=== 4. O PASSIVO: WAIVER QUE JA TINHA SIDO FEITO A MAO")
    velho = pg.evaluate("""() => S.db.itens.filter(i=>R.aberto(i.status)).slice(5,6)[0].item""")
    st0 = pg.evaluate("(x)=>S.db.itens.find(i=>i.item===x).status", velho)
    pend0 = pg.evaluate("() => S.db.pendentes.length")
    pg.click("#wvNovo"); pg.wait_for_timeout(300)
    pg.fill("#wItemAdd", velho); pg.click("#wItemBtn")
    pg.fill("#wTexto", "Waiver emitido em papel em 12/03/2026, assinado pelo gerente da obra.")
    pg.fill("#wAssunto", "Regularização de waiver em papel")
    pg.select_option("#wOrigem", "passivo")
    pg.fill("#wData", "2026-03-12")
    pg.fill("#wRef", "Ata 07/2026")
    pg.select_option("#wSituacao", "aprovado")
    pg.select_option("#wDestino", "2 - Not Blocking")
    pg.click("#mb1"); pg.wait_for_timeout(500)
    p = pg.evaluate("() => S.db.waivers.find(w=>w.origem==='passivo')")
    chk("o passivo entra na base", bool(p))
    chk("com a data do papel, não a de hoje", p and p["dataDocumento"] == "2026-03-12",
        p and p["dataDocumento"])
    chk("marcado como aprovado", p and p["situacao"] == "aprovado")
    chk("e NÃO mexe no status por conta própria",
        pg.evaluate("(x)=>S.db.itens.find(i=>i.item===x).status", velho) == st0, st0)
    chk("nem cria pendente nenhum",
        pg.evaluate("() => S.db.pendentes.length") == pend0)
    chk("a lista marca o passivo como tal", "passivo" in pg.inner_text("#view"))

    print("=== 5. O DOCUMENTO QUE VAI PARA O PAPEL")
    html = pg.evaluate("() => Waiver.documento([S.db.waivers[0]])")
    arq = SAIDA/"waiver.html"
    arq.write_text(html, encoding="utf-8")
    pg2 = b.new_page()
    pg2.goto(arq.as_uri()); pg2.wait_for_timeout(500)
    chk("o documento abre limpo", pg2.locator(".waiver").count() == 1)
    chk("com o número no alto", w["numero"] in pg2.inner_text(".wtopo"))
    chk("a ficha traz solicitante, destinatário e referência",
        all(x in pg2.inner_text(".wficha") for x in ["Bruno Almeida", "ICN", "CARTA-GTO-2026-0042"]))
    chk("a faixa da tramitação mostra os dois status",
        "4 - Under Analysis" in pg2.inner_text(".wtram") and
        "1 - Validated by ICN" in pg2.inner_text(".wtram"))
    chk("a tabela traz uma linha por item",
        pg2.locator(".witens tbody tr").count() == 3,
        str(pg2.locator(".witens tbody tr").count()))
    chk("o texto do waiver está lá", "docking" in pg2.inner_text(".wtexto"))
    chk("as condições também", "primeira janela de docking" in pg2.inner_text(".waiver"))
    chk("duas assinaturas: solicitante e aprovação", pg2.locator(".wassin .lin").count() == 2)
    chk("sem o bloco de análise técnica", "nálise técnica" not in pg2.inner_text(".waiver"))
    chk("a faixa de tramitação tem as três etapas", pg2.locator(".wtram .cx").count() == 3)
    chk("e mostra de onde os itens saem hoje",
        "atual" in pg2.inner_text(".wtram").lower())
    chk("os status saem como pílulas coloridas", pg2.locator(".waiver .stp").count() >= 4,
        str(pg2.locator(".waiver .stp").count()))
    chk("as seções são numeradas", pg2.locator(".wsec > h2 .n").count() >= 4)
    chk("o aprovado não leva marca d'água", pg2.locator(".wmarca").count() == 0)
    chk("e o parecer registrado sai impresso",
        "Reavaliar no fechamento" in pg2.inner_text(".waiver"))
    pdf = SAIDA/"waiver.pdf"
    pg2.pdf(path=str(pdf), format="A4", print_background=True)
    dados = pdf.read_bytes()
    paginas = dados.count(b"/Type /Page") - dados.count(b"/Type /Pages")
    chk("um waiver cabe em uma folha A4", paginas == 1, f"{paginas} página(s)")
    pg2.screenshot(path=str(SAIDA/"waiver.png"), full_page=True)

    rasc = pg.evaluate("""() => Waiver.documento([{...S.db.waivers[0], situacao:'rascunho'}])""")
    (SAIDA/"waiver-rascunho.html").write_text(rasc, encoding="utf-8")
    pg2.goto((SAIDA/"waiver-rascunho.html").as_uri()); pg2.wait_for_timeout(300)
    chk("mas o rascunho leva — um papel que não vale não pode parecer que vale",
        pg2.locator(".wmarca").count() == 1 and "RASCUNHO" in pg2.inner_text(".wmarca").upper())
    pg2.screenshot(path=str(SAIDA/"waiver-rascunho.png"), full_page=True)

    quantos = pg.evaluate("() => S.db.waivers.length")
    dois = pg.evaluate("() => Waiver.documento(S.db.waivers)")
    (SAIDA/"waivers.html").write_text(dois, encoding="utf-8")
    pg2.goto((SAIDA/"waivers.html").as_uri()); pg2.wait_for_timeout(400)
    pg2.pdf(path=str(SAIDA/"waivers.pdf"), format="A4", print_background=True)
    d2 = (SAIDA/"waivers.pdf").read_bytes()
    paginas2 = d2.count(b"/Type /Page") - d2.count(b"/Type /Pages")
    chk("vários waivers saem um por página", paginas2 == quantos,
        f"{paginas2} páginas para {quantos} waivers")
    pg2.close()

    print("=== 6. A JANELA NAO FOGE COM O MOUSE FORA DELA")
    pg.evaluate("() => irPara('itens')"); pg.wait_for_timeout(400)
    alvo = pg.evaluate("() => ordenar(itensFiltrados())[0].item")
    pg.evaluate("(x)=>UI.detalhe(x)", alvo); pg.wait_for_timeout(400)
    chk("a janela do item está aberta", pg.locator("#ov").count() == 1)
    pg.fill("#dObs", "texto que eu não quero perder")
    cx = pg.locator("#dObs").bounding_box()
    ov = pg.locator("#ov").bounding_box()
    # arrasta de dentro do campo ate fora da janela, como quem seleciona texto
    pg.mouse.move(cx["x"]+20, cx["y"]+cx["height"]/2)
    pg.mouse.down()
    pg.mouse.move(ov["x"]+6, ov["y"]+ov["height"]-6, steps=12)
    pg.mouse.up()
    pg.wait_for_timeout(300)
    chk("arrastar para fora e soltar NÃO fecha a janela", pg.locator("#ov").count() == 1)
    chk("e o que estava escrito continua lá",
        pg.input_value("#dObs") == "texto que eu não quero perder")

    # clicar de verdade no fundo, comecando e terminando nele, ainda fecha -
    # mas como ha coisa escrita, pergunta antes. Respondendo nao, fica aberta.
    resposta["sim"] = False; resposta["vistas"].clear()
    pg.mouse.click(ov["x"]+6, ov["y"]+ov["height"]-6)
    pg.wait_for_timeout(300)
    chk("clique no fundo com coisa escrita pergunta antes",
        any("salvas" in m or "unsaved" in m for m in resposta["vistas"]),
        str(resposta["vistas"]))
    chk("e respondendo não, a janela continua aberta", pg.locator("#ov").count() == 1)
    chk("com o texto intacto", pg.input_value("#dObs") == "texto que eu não quero perder")

    resposta["sim"] = True
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    chk("respondendo sim, o Esc fecha", pg.locator("#ov").count() == 0)

    # janela sem nada escrito: fecha no primeiro clique, sem perguntar nada
    resposta["vistas"].clear()
    pg.evaluate("(x)=>UI.detalhe(x)", alvo); pg.wait_for_timeout(300)
    ov = pg.locator("#ov").bounding_box()
    pg.mouse.click(ov["x"]+6, ov["y"]+ov["height"]-6)
    pg.wait_for_timeout(300)
    chk("sem nada escrito, o clique fora fecha direto", pg.locator("#ov").count() == 0)
    chk("e não pergunta nada", not resposta["vistas"], str(resposta["vistas"]))

    print("=== 7. O VISUALIZADOR LE O WAIVER E NAO O ALTERA")
    base_com_waivers = pg.evaluate("() => S.db")
    pv = b.new_page(viewport={"width":1400,"height":900})
    pv.on("pageerror", lambda e: erros.append("VIZ: "+str(e)))
    pv.goto(VIZ); pv.wait_for_timeout(500)
    pv.evaluate("""(db)=>{ S.db=db; normalizar(S.db); S.recolhidas=new Set(); irPara('waivers'); }""",
                base_com_waivers)
    pv.wait_for_timeout(400)
    chk("o visualizador lista os waivers", w["numero"] in pv.inner_text("#view"))
    chk("sem o botão de pedir um novo", pv.locator("#wvNovo").count() == 0)
    chk("mas com o de imprimir", pv.locator("#wvImp").count() == 1)
    pv.evaluate("() => Waiver.painel({itens:['x']})"); pv.wait_for_timeout(200)
    chk("pedir waiver ali não abre janela nenhuma", pv.locator("#ov").count() == 0)
    n0 = pv.evaluate("() => S.db.waivers.length")
    pv.evaluate("() => Waiver.guardar({id:'zz',numero:'W-9999-999',itens:['x'],texto:'t'})")
    chk("e guardar não guarda", pv.evaluate("() => S.db.waivers.length") == n0)
    chk("o documento, esse continua saindo",
        w["numero"] in pv.evaluate("() => Waiver.documento([S.db.waivers[0]])"))
    pv.close()
    b.close()

reais = [e for e in erros if "favicon" not in e]
print("\nerros:", reais or "nenhum")
print("falhas:", falhas or "nenhuma")
print(f"\nArquivos em {SAIDA}: waiver.html, waiver.pdf, waiver.png, waivers.pdf")
raise SystemExit(1 if (falhas or reais) else 0)
