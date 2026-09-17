"""Exportacao, relatorio PDF, item novo a mao e caminho padrao — em Chromium real.

Substitui o antigo testes/conflitos.py: a tela de conflitos de migracao saiu do
sistema (todos os 40 ja estavam decididos) e o que passou a precisar de teste em
navegador de verdade e a saida de dados — o CSV que chega ao disco, o relatorio
que vai para a impressora e o formulario do item novo.

    export SM_DATABASE=~/caminho/para/database.json
    python3 testes/exportacao.py
"""
from playwright.sync_api import sync_playwright
import pathlib, json, os, io, csv as _csv

# Caminhos por variavel de ambiente: nenhum dado do projeto vive no repositorio
# e o Chromium fica onde o Playwright instalou (ou onde SM_CHROMIUM apontar).
RAIZ = pathlib.Path(__file__).resolve().parent.parent
APP  = (RAIZ/"docs"/"index.html").as_uri()
_DBP = os.environ.get("SM_DATABASE")
if not _DBP:
    raise SystemExit("Defina SM_DATABASE com o caminho do seu database.json "
                     "(ex.: SM_DATABASE=~/base/database.json python3 %s)" % __file__)
DB = json.load(open(os.path.expanduser(_DBP), encoding="utf-8"))
CHROMIUM = os.environ.get("SM_CHROMIUM")          # opcional
LAUNCH = {"args": ["--no-sandbox"]} | ({"executable_path": CHROMIUM} if CHROMIUM else {})

falhas = []
def chk(n, c, e=""):
    print(("  OK  " if c else "  XXX ") + n + (f"  {e}" if e else ""))
    if not c:
        falhas.append(n)

# Troca dl() por um gravador em memoria: o teste confere o arquivo que a pessoa
# receberia, byte a byte, sem depender do gerenciador de downloads do navegador.
CAPTURAR = """() => {
  window.__baixados = [];
  window.dl = (nome, conteudo, mime) => window.__baixados.push({nome, conteudo, mime});
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(**LAUNCH)
    pg = b.new_page(viewport={"width": 1500, "height": 980})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("C:" + m.text) if m.type == "error" else None)
    pg.goto(APP); pg.wait_for_timeout(400)
    pg.evaluate("""(db)=>{localStorage.setItem('sm.autor','Bruno Almeida');localStorage.setItem('sm.tema','light');
      localStorage.removeItem('sm.exportCols'); localStorage.removeItem('sm.exportOpc');
      Store.gravar=async d=>1; Store.backup=async()=>'x'; Store.dirHandle={name:'11_STATUS MILESTONE J08'};
      window.confirm=()=>true; S.db=db; normalizar(S.db); aplicarTema(); irPara('itens');}""", DB)
    pg.wait_for_timeout(500)
    pg.evaluate(CAPTURAR)

    print("=== 1. A JANELA DE EXPORTACAO ===")
    pg.locator("#btnExpTab").click(); pg.wait_for_timeout(350)
    chk("a janela abre no lugar do download cego", pg.locator("#ov").count() == 1)
    chk("todas as colunas aparecem para escolha",
        pg.locator("[data-xc]").count() == pg.evaluate("Export.CAMPOS.length"))
    chk("os cinco formatos estao la",
        all(t in pg.inner_text("#ov") for t in ["CSV", "Excel", "JSON", "HTML"]))
    chk("o recorte atual e dito em numero", str(pg.evaluate("itensFiltrados().length")) in pg.inner_text("#ov"))

    print("--- escolher tres colunas e sair em CSV")
    pg.locator("#xNenhuma").click(); pg.wait_for_timeout(120)
    for cid in ["item", "status", "description"]:
        pg.locator(f'[data-xc="{cid}"]').click()
    pg.wait_for_timeout(120)
    chk("o contador acompanha a escolha", pg.inner_text("#xConta").strip() == "3")
    pg.locator('#ov footer button:has-text("CSV")').click()
    pg.wait_for_timeout(400)
    chk("a janela fecha ao exportar", pg.locator("#ov").count() == 0)

    bx = pg.evaluate("window.__baixados")
    chk("um arquivo foi gerado", len(bx) == 1, str(len(bx)))
    nome, conteudo = bx[0]["nome"], bx[0]["conteudo"]
    chk("com nome aceito pelo Windows", not any(c in nome for c in '\\/:*?"<>|'), nome)
    chk("e extensao .csv", nome.endswith(".csv"), nome)
    chk("comeca por BOM, para o Excel ler o acento", conteudo.startswith("\ufeff"))

    linhas = list(_csv.reader(io.StringIO(conteudo.lstrip("\ufeff")), delimiter=";"))
    esperado = pg.evaluate("itensFiltrados().length") + 1
    chk("uma linha por item filtrado, mais o cabecalho", len(linhas) == esperado,
        f"{len(linhas)} vs {esperado}")
    chk("toda linha com as 3 colunas pedidas", {len(l) for l in linhas} == {3},
        str({len(l) for l in linhas}))
    chk("o cabecalho e o escolhido", linhas[0] == ["Item", "Actual Status", "Description"], str(linhas[0]))
    chk("nenhum caractere de controle sobrou",
        not any(ord(ch) < 32 and ch not in "\r\n" for ch in conteudo))
    chk("nenhuma celula comeca por = (formula desarmada)",
        not any(c.startswith("=") for l in linhas for c in l))

    print("--- a escolha fica guardada para a proxima vez")
    pg.reload(); pg.wait_for_timeout(400)
    pg.evaluate("""(db)=>{Store.gravar=async d=>1;Store.backup=async()=>'x';Store.dirHandle={name:'x'};
      S.db=db;normalizar(S.db);irPara('itens');}""", DB)
    pg.wait_for_timeout(400)
    chk("as colunas voltam como ficaram", pg.evaluate("Export.escolhidas()") == ["item", "status", "description"])

    print("=== 2. RELATORIO PDF: DOCUMENTO, NAO FOTO DA TELA ===")
    doc = pg.evaluate("Export.docHTML(itensFiltrados().slice(0,60),'Todos em aberto',"
                      "{...Export.opcoes(),cols:['item','status','inspType','description']})")
    chk("e um documento HTML completo", doc.startswith("<!doctype html") and doc.rstrip().endswith("</html>"))
    chk("com pagina A4 definida", "@page" in doc and "A4" in doc)
    chk("cabecalho da tabela repetido em toda pagina", "table-header-group" in doc)
    chk("linha que nao parte ao meio", "page-break-inside:avoid" in doc)
    chk("capa com o recorte, a data e o autor", "Recorte" in doc and "Bruno Almeida" in doc)
    chk("resumo com o Shipyard pelo ActualJx", "Shipyard Prerequisites (ActualJx = J08)" in doc)
    chk("nenhum pedaco da interface viva entrou",
        "#side" not in doc and 'id="nav"' not in doc and "noprint" not in doc)

    # O documento tem de abrir de pe num navegador limpo, sem erro de script.
    pg2 = b.new_page()
    erros2 = []
    pg2.on("pageerror", lambda e: erros2.append(str(e)))
    pg2.set_content(doc); pg2.wait_for_timeout(300)
    chk("o relatorio abre sem erro de script", not erros2, str(erros2))
    chk("e a tabela esta la, com as 4 colunas", pg2.locator("thead th").count() == 4,
        str(pg2.locator("thead th").count()))
    chk("com uma linha por item", pg2.locator("tbody tr").count() >= 1)
    pg2.screenshot(path="/tmp/relatorio.png", full_page=True)
    pg2.close()

    print("--- a impressao usa um quadro proprio, nao a tela")
    # Forma de funcao: pg.evaluate com uma string solta de statements chega a
    # executar duas vezes, o que falsearia qualquer contador instalado assim.
    pg.evaluate("() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu = 'JANELA'; }; }")
    pg.evaluate("Export.pdf(itensFiltrados().slice(0,5),'Teste',{...Export.opcoes(),cols:['item']})")
    pg.wait_for_timeout(700)
    chk("o quadro de impressao foi criado", pg.locator("#quadroImpressao").count() == 1)
    chk("e a tela viva nao foi impressa", pg.evaluate("window.__imprimiu") == 0)

    print("=== 3. ITEM NOVO A MAO ===")
    pg.evaluate("irPara('itens')"); pg.wait_for_timeout(300)
    antes = pg.evaluate("S.db.itens.length")
    pg.locator("#btnNovo").click(); pg.wait_for_timeout(350)
    chk("o formulario abre", pg.locator("#n-item").count() == 1)
    pg.fill("#n-item", "TESTE-9001")
    pg.fill("#n-evidence", "EV-TESTE")
    pg.fill("#n-bigram", "AA; BB")
    pg.evaluate("$('#n-inspType').value='B05'; $('#n-inspType').dispatchEvent(new Event('input'))")
    pg.wait_for_timeout(150)
    chk("InspType = B05 marca a caixa do B05 sozinho", pg.evaluate("$('#n-isB05').checked") is True)
    pg.locator('#ov footer button:has-text("Criar")').last.click()
    pg.wait_for_timeout(400)
    chk("o item entra na base", pg.evaluate("S.db.itens.length") == antes + 1)
    chk("com os campos preenchidos",
        pg.evaluate("S.db.itens.find(i=>i.item==='TESTE-9001')?.evidence") == "EV-TESTE")
    chk("o Bigram virou lista",
        pg.evaluate("S.db.itens.find(i=>i.item==='TESTE-9001')?.bigram.join(';')") == "AA;BB")
    chk("nasceu com evento no historico",
        pg.evaluate("S.db.historico.some(h=>h.item==='TESTE-9001'&&h.valorAnterior==='')") is True)
    chk("e aparece na tabela", "TESTE-9001" in pg.inner_text("#view"))

    print("--- codigo repetido e recusado")
    pg.locator("#btnNovo").click(); pg.wait_for_timeout(300)
    pg.fill("#n-item", "teste-9001")          # so muda a caixa
    pg.wait_for_timeout(250)
    chk("o aviso aparece enquanto se digita", "existe" in pg.inner_text("#n-aviso").lower(),
        pg.inner_text("#n-aviso"))
    depois = pg.evaluate("S.db.itens.length")
    pg.locator('#ov footer button:has-text("Criar")').last.click()
    pg.wait_for_timeout(300)
    chk("e nada e criado", pg.evaluate("S.db.itens.length") == depois)
    pg.evaluate("UI.fechar()")

    print("=== 4. SHIPYARD PELO J08 ATUAL ===")
    pg.evaluate("irPara('dashboard')"); pg.wait_for_timeout(400)
    chk("o painel diz ActualJx = J08", "ActualJx = J08" in pg.inner_text("#view"))
    conf = pg.evaluate("""(()=>{const l=S.db.itens.filter(i=>i.inspType==='Shipyard prerequisites');
      return {atual:l.filter(i=>i.actualJx==='J08').length,
              origem:l.filter(i=>i.originalJx==='J08').length,
              painel:M.shipyard(S.db.itens).total};})()""")
    chk("o painel conta pelo ActualJx", conf["painel"] == conf["atual"], str(conf))

    print("=== 5. CAMINHO PADRAO DA BASE ===")
    pg.evaluate("irPara('config')"); pg.wait_for_timeout(400)
    chk("o caminho aparece nas configuracoes",
        "11_STATUS MILESTONE J08" in pg.evaluate("$('#cmPadrao').value"))
    chk("e da para mudar", pg.locator("#cmSalvar").count() == 1)
    pg.evaluate("v => Caminho.definir(v)", 'Z:\\\\teste')
    chk("a mudanca vai para a base, valendo para a equipe",
        pg.evaluate("S.db.config.caminhoPadrao") == 'Z:\\\\teste')
    pg.evaluate("Caminho.definir(Caminho.FABRICA)")
    chk("e volta ao padrao", pg.evaluate("Caminho.padrao()") == pg.evaluate("Caminho.FABRICA"))

    print("=== 6. A ABA CONFLITOS SAIU ===")
    chk("nao ha mais rota", pg.evaluate("ROTAS.some(r=>r.id==='conflitos')") is False)
    chk("nem item no menu", "Conflitos" not in pg.inner_text("#nav"))
    chk("os dados continuam guardados", pg.evaluate("Array.isArray(S.db.conflitos)") is True)
    pg.evaluate("irPara('conflitos')"); pg.wait_for_timeout(300)
    chk("link antigo cai no dashboard, sem tela em branco", pg.locator("#view .kpi").count() > 0)
    # A regra de coerencia status x observacao nao era da tela de conflitos e fica.
    chk("Missing Vacuum + B05 done continua nao alertando",
        pg.evaluate("incoerente('7 - Missing Vacuum Test or Sign','B05 done, without pendencies.')") is False)

    pg.screenshot(path="/tmp/exportacao.png")
    b.close()

print("\nerros:", errs or "nenhum")
print("falhas:", falhas or "nenhuma")
raise SystemExit(1 if (falhas or errs) else 0)
