"""O visualizador em Chromium real, servido de uma pasta com o database.json ao lado.

Sobe um servidor estatico numa pasta temporaria com o visualizador e uma copia
da sua base - e assim que ele vai viver na pasta de transferencia - e confere
que a base abre sozinha, que a tela nao oferece edicao e, sobretudo, que nao ha
caminho daqui ate uma escrita.

    export SM_DATABASE=~/caminho/para/database.json
    python3 testes/visualizador.py
"""
from playwright.sync_api import sync_playwright
import pathlib, json, os, shutil, tempfile, threading, functools, http.server, socketserver

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VIZ = RAIZ / "docs" / "visualizador.html"
_DBP = os.environ.get("SM_DATABASE")
if not _DBP:
    raise SystemExit("Defina SM_DATABASE com o caminho do seu database.json "
                     "(ex.: SM_DATABASE=~/base/database.json python3 %s)" % __file__)
if not VIZ.exists():
    raise SystemExit("docs/visualizador.html nao existe. "
                     "Rode: python3 ferramentas/gerar_visualizador.py")
DB = json.load(open(os.path.expanduser(_DBP), encoding="utf-8"))
CHROMIUM = os.environ.get("SM_CHROMIUM")          # opcional
LAUNCH = {"args": ["--no-sandbox"]} | ({"executable_path": CHROMIUM} if CHROMIUM else {})

falhas = []
def chk(n, c, e=""):
    print(("  OK  " if c else "  XXX ") + n + (f"  {e}" if e else ""))
    if not c:
        falhas.append(n)

# A pasta de transferencia, reproduzida: o .html e o database.json lado a lado.
pasta = pathlib.Path(tempfile.mkdtemp(prefix="sm-transferencia-"))
shutil.copy(VIZ, pasta / "visualizador.html")
(pasta / "database.json").write_text(json.dumps(DB), encoding="utf-8")

class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

srv = socketserver.TCPServer(("127.0.0.1", 0),
                             functools.partial(Silencioso, directory=str(pasta)))
PORTA = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE_URL = f"http://127.0.0.1:{PORTA}/visualizador.html"

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(**LAUNCH)
        pg = b.new_page(viewport={"width": 1440, "height": 1000})
        errs = []
        pg.on("pageerror", lambda e: errs.append("P:" + str(e)))
        # O texto do console nao traz a URL, e o favicon.ico que o proprio
        # navegador pede sozinho responderia 404 numa pasta de rede tambem.
        # O que interessa e recurso DA PAGINA que falhou: esse tem URL.
        pg.on("response", lambda r: errs.append(f"{r.status} {r.url}")
              if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)

        print("=== 1. ABRE SOZINHO, LENDO O ARQUIVO AO LADO ===")
        pg.goto(BASE_URL)
        pg.wait_for_timeout(1500)
        chk("nenhum erro de script", not errs, str(errs[:3]))
        chk("a base carregou sem pedir nada",
            pg.evaluate("!!S.db") and pg.evaluate("S.db.itens.length") == len(DB["itens"]),
            str(pg.evaluate("S.db && S.db.itens.length")))
        chk("e veio do arquivo ao lado da pagina",
            pg.evaluate("Visualizador.origem").endswith("/database.json"),
            pg.evaluate("Visualizador.origem"))
        chk("nunca perguntou o nome de ninguem",
            pg.evaluate("localStorage.getItem('sm.autor')") in (None, ""))
        chk("a marca diz que e somente leitura",
            "somente leitura" in pg.inner_text("#brandsub").lower(),
            pg.inner_text("#brandsub"))

        print("=== 2. NAO OFERECE EDICAO ===")
        menu = pg.inner_text("#nav")
        chk("sem Configuracoes no menu", "Configura" not in menu, menu.replace("\n", " "))
        chk("com 'Sobre a base' no lugar", "Sobre a base" in menu)
        chk("os modulos de edicao nao existem",
            pg.evaluate("typeof NovoItem === 'undefined' && typeof Arquivamento === 'undefined'"))
        pg.evaluate("irPara('itens')"); pg.wait_for_timeout(500)
        chk("sem botao de item novo", pg.locator("#btnNovo").count() == 0)
        chk("sem caixas de selecao para o lote", pg.locator("input[data-sel]").count() == 0)
        chk("sem botao de salvar no topo", pg.locator("#btnSaveNow").count() == 0)
        chk("mas com o botao de exportar", pg.locator("#btnExpTab").count() == 1)

        print("--- o detalhe mostra, nao edita")
        pg.locator("tbody tr[data-i]").first.click(); pg.wait_for_timeout(500)
        chk("a janela do item abre", pg.locator("#ov").count() == 1)
        chk("sem seletor de status", pg.locator("#dStatus").count() == 0)
        chk("sem campo de observacao", pg.locator("#dObs").count() == 0)
        chk("sem botao de salvar", "Salvar" not in pg.inner_text("#ov"))
        chk("mas com o historico do item", 'data-t="h"' in pg.inner_html("#ov"))
        pg.evaluate("UI.fechar()")

        print("=== 3. NAO EXISTE CAMINHO ATE UMA ESCRITA ===")
        recusa = pg.evaluate("""async () => {
          const out = {};
          for(const m of ["gravar","backup","restaurarBackup","travar","destravar","arquivarHistorico"]){
            try{ await Store[m](S.db); out[m] = "NAO RECUSOU"; }
            catch(e){ out[m] = e.message; }
          }
          return out;
        }""")
        for m, r in recusa.items():
            chk(f"Store.{m} recusa", r == "SOMENTE_LEITURA", r)

        antes = pg.evaluate("S.db.itens[0].status")
        pg.evaluate("() => Pend.alterar(S.db.itens[0].item,'status','1 - Validated by ICN')")
        pg.wait_for_timeout(300)
        chk("uma tentativa de edicao nao muda o item",
            pg.evaluate("S.db.itens[0].status") == antes)
        chk("nem cria pendencia", pg.evaluate("S.db.pendentes.length") == 0)
        chk("nem suja a base", pg.evaluate("S.sujo") is not True)

        # O arquivo na pasta tem de continuar byte a byte o que era.
        depois = (pasta / "database.json").read_text(encoding="utf-8")
        chk("o database.json da pasta continua intacto", depois == json.dumps(DB))
        chk("e nenhuma subpasta de escrita foi criada",
            not (pasta / "backups").exists() and not (pasta / "presenca").exists()
            and not (pasta / "database.lock.json").exists())

        print("=== 4. OS NUMEROS SAO OS MESMOS DO SISTEMA ===")
        nums = pg.evaluate("""(()=>{const k=M.kpis(S.db.itens), ef=M.evidenceFlow(S.db.itens);
          return {total:k.total, aberto:k.aberto, b05:ef.b05.total, exceto:ef.exceto.total,
                  shipyard:M.shipyard(S.db.itens).total};})()""")
        esperado_ship = len([i for i in DB["itens"]
                             if i.get("inspType") == "Shipyard prerequisites"
                             and i.get("actualJx") == "J08"])
        chk("total de itens bate", nums["total"] == len(DB["itens"]), str(nums))
        chk("Shipyard conta pelo ActualJx, como no sistema",
            nums["shipyard"] == esperado_ship, f'{nums["shipyard"]} vs {esperado_ship}')

        print("=== 5. A EXPORTACAO INTEIRA CONTINUA AQUI ===")
        pg.evaluate("() => { window.__baixados = []; "
                    "window.dl = (n,c,m) => window.__baixados.push({n,c,m}); }")
        pg.evaluate("() => Export.csv(itensFiltrados(),{cols:['item','status']})")
        bx = pg.evaluate("window.__baixados")
        chk("o CSV sai, um arquivo por clique", len(bx) == 1, str(len(bx)))
        chk("com o cabecalho escolhido", bx and "Actual Status" in bx[0]["c"])
        doc = pg.evaluate("""Export.documento(itensFiltrados().slice(0,80),'Quadro',
          {...Export.opcoes(),layout:'kanban',cols:['item','status','inspType']})""")
        chk("o relatorio em quadro sai", 'class="quadro"' in doc and "<!doctype html" in doc)
        tab = pg.evaluate("""Export.documento(itensFiltrados().slice(0,80),'Tabela',
          {...Export.opcoes(),layout:'tabela',cols:['item','status']})""")
        chk("e o relatorio em tabela tambem", '<table class="itens"' in tab)

        print("=== 6. RECARREGAR PEGA O QUE MUDOU NA PASTA ===")
        mudado = json.loads(json.dumps(DB))
        mudado["meta"]["revisao"] = DB["meta"]["revisao"] + 99
        (pasta / "database.json").write_text(json.dumps(mudado), encoding="utf-8")
        pg.evaluate("Visualizador.recarregar()"); pg.wait_for_timeout(900)
        chk("a revisao nova chega sem recarregar a pagina",
            pg.evaluate("S.db.meta.revisao") == mudado["meta"]["revisao"],
            str(pg.evaluate("S.db.meta.revisao")))

        pg.evaluate("irPara('kanban')"); pg.wait_for_timeout(600)
        pg.screenshot(path="/tmp/visualizador.png")
        b.close()
finally:
    srv.shutdown()
    shutil.rmtree(pasta, ignore_errors=True)

print("\nerros:", errs or "nenhum")
print("falhas:", falhas or "nenhuma")
raise SystemExit(1 if (falhas or errs) else 0)
