# -*- coding: utf-8 -*-
"""
Trabalho simultaneo de duas pessoas sobre o mesmo database.json.

Exercita o motor de juncao (Sync.receber) como se a outra pessoa tivesse
acabado de gravar: alteracoes que nao se cruzam sao juntadas sozinhas;
alteracoes no mesmo campo do mesmo item NUNCA sao sobrescritas em silencio.
"""
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
CHROMIUM = os.environ.get("SM_CHROMIUM")          # opcional
LAUNCH = {"args":["--no-sandbox"]} | ({"executable_path":CHROMIUM} if CHROMIUM else {})

f = []
def chk(n, c, e=""):
    print(("  OK  " if c else "  XXX ") + n + (f"  {e}" if e else ""))
    if not c: f.append(n)

BOOT = """(db)=>{
  localStorage.setItem('sm.autor','Bruno');
  localStorage.setItem('sm.tema','light');
  Store.gravar=async d=>1; Store.backup=async()=>'x'; Store.mtime=async()=>1;
  Store.dirHandle={}; Sync.presenca=async()=>{}; window.confirm=()=>true;
  S.db=structuredClone(db); normalizar(S.db); Store.revisaoCarregada=S.db.meta.revisao||0;
  Pend.diario=[]; aplicarTema(); irPara('itens');
}"""

# Versao que a "outra pessoa" gravou. Parte da base ORIGINAL (nao do estado
# atual desta sessao): o disco dela nunca conteria as minhas alteracoes ainda
# nao gravadas.
OUTRA = """(arg)=>{
  const d=structuredClone(arg.db); normalizar(d);
  d.meta = {...d.meta, revisao:(S.db.meta.revisao||0)+1, ultimoAutor:'Maria'};
  for(const m of arg.sobre){ const it=d.itens.find(i=>i.item===m.item); it[m.campo]=m.valor; }
  return d;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(**LAUNCH)
    pg = b.new_page(viewport={"width":1500,"height":950}); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(APP); pg.wait_for_timeout(300)

    print("=== 1. a outra pessoa gravou e eu nao tinha nada pendente ===")
    pg.evaluate(BOOT, DB)
    a, c = pg.evaluate("[S.db.itens[0].item, S.db.itens[1].item]")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": c, "campo": "generalObs", "valor": "nota da Maria"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("adota a versao do disco", res == "adotado", res)
    chk("a alteracao dela chegou aqui",
        pg.evaluate(f"S.db.itens.find(i=>i.item==='{c}').generalObs") == "nota da Maria")
    chk("revisao acompanhada", pg.evaluate("Store.revisaoCarregada===S.db.meta.revisao"))

    print("=== 2. cada um mexeu num item diferente: junta sozinho ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','minha nota')")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": c, "campo": "generalObs", "valor": "nota da Maria"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("juntou as duas versoes", res == "juntado", res)
    chk("a minha alteracao sobreviveu",
        pg.evaluate(f"S.db.itens.find(i=>i.item==='{a}').generalObs") == "minha nota")
    chk("a dela tambem",
        pg.evaluate(f"S.db.itens.find(i=>i.item==='{c}').generalObs") == "nota da Maria")
    chk("a minha continua pendente de consolidacao",
        pg.evaluate(f"S.db.pendentes.filter(p=>p.item==='{a}'&&p.campo==='generalObs').length") == 1)
    chk("nenhuma janela foi aberta", pg.locator("#ov").count() == 0)

    print("=== 3. campos diferentes do MESMO item: tambem junta ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','minha nota')")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": a, "campo": "ncr", "valor": "NCR-999"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("juntou", res == "juntado", res)
    chk("os dois campos convivem",
        pg.evaluate(f"(()=>{{const i=S.db.itens.find(i=>i.item==='{a}');"
                    f"return i.generalObs==='minha nota' && i.ncr==='NCR-999';}})()"))

    print("=== 4. MESMO campo do MESMO item: ninguem perde nada em silencio ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','versao do Bruno')")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": a, "campo": "generalObs", "valor": "versao da Maria"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("nao decide sozinho", res == "decidir", res)
    chk("abre a tela de decisao", pg.locator("#ov").count() == 1)
    txt = pg.inner_text("#ov")
    chk("mostra os dois valores lado a lado",
        "versao do Bruno" in txt and "versao da Maria" in txt)
    chk("o polling para enquanto o usuario decide", pg.evaluate("Sync.ligado") is False)

    print("--- escolhendo o valor da outra pessoa")
    pg.evaluate("""[...document.querySelectorAll('#ov input[type=radio][value=deles]')].forEach(r=>r.click())""")
    pg.evaluate("""[...document.querySelectorAll('#ov footer button')].find(b=>/Aplicar/.test(b.textContent)).click()""")
    pg.wait_for_timeout(400)
    chk("valor dela aplicado",
        pg.evaluate(f"S.db.itens.find(i=>i.item==='{a}').generalObs") == "versao da Maria")
    chk("voltou a sincronizar", pg.evaluate("Sync.ligado") is True)

    print("--- escolhendo o meu valor")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','versao do Bruno')")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": a, "campo": "generalObs", "valor": "versao da Maria"}]})
    pg.evaluate("(d)=>Sync.receber(d)", disco); pg.wait_for_timeout(200)
    pg.evaluate("""[...document.querySelectorAll('#ov footer button')].find(b=>/Manter tudo meu|Keep all/.test(b.textContent)).click()""")
    pg.wait_for_timeout(400)
    chk("meu valor prevaleceu",
        pg.evaluate(f"S.db.itens.find(i=>i.item==='{a}').generalObs") == "versao do Bruno")
    chk("o valor descartado dela fica registrado como anterior (rastreabilidade)",
        pg.evaluate(f"S.db.pendentes.find(p=>p.item==='{a}'&&p.campo==='generalObs').valorOriginal")
        == "versao da Maria")

    print("=== 5. mesmo campo, mesmo valor nos dois lados: nao e conflito ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','igual')")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": a, "campo": "generalObs", "valor": "igual"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("nao incomoda o usuario", res == "juntado", res)

    print("=== 6. observacoes locais sobrevivem a versao da outra pessoa ===")
    pg.evaluate(BOOT, DB)
    n0 = pg.evaluate("S.db.observacoes.length")
    pg.evaluate(f"""(()=>{{const o={{id:uid(),item:'{a}',texto:'obs local',criadoEm:agora(),autor:'Bruno'}};
        S.db.observacoes.push(o); Pend.registrar({{t:'obs',obj:o}});}})()""")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": c, "campo": "ncr", "valor": "NCR-1"}]})
    pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("observacao reaplicada sobre a base nova",
        pg.evaluate("S.db.observacoes.filter(o=>o.texto==='obs local').length") == 1)
    chk("sem duplicar", pg.evaluate("S.db.observacoes.length") == n0 + 1)

    print("=== 7. alteracao estrutural (config) exige decisao, nao some ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate("S.db.config.minutosConsolidacao=45; Pend.registrar({t:'outro',o:'config'})")
    disco = pg.evaluate(OUTRA, {"db": DB, "sobre": [{"item": c, "campo": "ncr", "valor": "NCR-2"}]})
    res = pg.evaluate("(d)=>Sync.receber(d)", disco)
    chk("pede decisao em vez de descartar", res == "decidir", res)
    chk("explica que nao da para reaplicar sozinho",
        "conflito de migração" in pg.inner_text("#ov") or "restaura" in pg.inner_text("#ov").lower()
        or "configura" in pg.inner_text("#ov").lower())
    pg.keyboard.press("Escape")

    print("=== 8. gravacao concorrente: tenta juntar antes de reclamar ===")
    pg.evaluate(BOOT, DB)
    pg.evaluate(f"Pend.alterar('{a}','generalObs','minha')")
    pg.evaluate("(db)=>{window.BASE=db}", DB)
    pg.evaluate(f"""(()=>{{
        const outro = (function(){{
          const d=structuredClone(window.BASE); normalizar(d);
          d.meta={{...d.meta, revisao:(S.db.meta.revisao||0)+1, ultimoAutor:'Maria'}};
          d.itens.find(i=>i.item==='{c}').ncr='NCR-3';
          return d;
        }})();
        let n=0;
        Store.gravar = async (db)=>{{
          n++;
          if(n===1){{ const e=new Error('CONFLITO_REVISAO'); e.disco=outro;
            e.revisaoDisco=outro.meta.revisao; e.autorDisco='Maria'; throw e; }}
          db.meta.revisao=(db.meta.revisao||0)+1; Store.revisaoCarregada=db.meta.revisao;
          window.__gravou=n; return db.meta.revisao;
        }};
      }})()""")
    pg.evaluate("Pend.autosave()"); pg.wait_for_timeout(700)
    chk("gravou na segunda tentativa, sozinho", pg.evaluate("window.__gravou") == 2)
    chk("nenhuma janela de conflito foi aberta", pg.locator("#ov").count() == 0)
    chk("as duas alteracoes estao na base",
        pg.evaluate(f"""(()=>{{const A=S.db.itens.find(i=>i.item==='{a}'),C=S.db.itens.find(i=>i.item==='{c}');
            return A.generalObs==='minha' && C.ncr==='NCR-3';}})()"""))
    chk("diario zerado apos gravar", pg.evaluate("Pend.diario.length") == 0)

    print("=== 9. presenca: quem mais esta com a base aberta ===")
    pg.evaluate("""Sync.presentes=['Bruno','Maria','Joao']; Sync.pintar();""")
    pg.wait_for_timeout(150)
    chk("mostra o total de pessoas", "3" in pg.inner_text("#presenca"), pg.inner_text("#presenca"))
    chk("nomeia as outras no tooltip",
        "Maria" in (pg.get_attribute("#presenca", "title") or ""))
    pg.evaluate("""Sync.presentes=['Bruno']; Sync.pintar();""")
    chk("some quando estou sozinho",
        pg.evaluate("getComputedStyle($('#presenca')).display") == "none")
    chk("nome vira arquivo seguro",
        pg.evaluate("Sync.slug('José da Silva Júnior')") == "jose-da-silva-junior",
        pg.evaluate("Sync.slug('José da Silva Júnior')"))

    b.close()

print("\nerros:", errs or "nenhum")
print("falhas:", f or "nenhuma")
