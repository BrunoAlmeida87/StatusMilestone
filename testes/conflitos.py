from playwright.sync_api import sync_playwright
import pathlib,json
APP=pathlib.Path('/home/user/StatusMilestone/docs/index.html').resolve().as_uri()
DBP='/tmp/claude-0/-home-user-StatusMilestone/1a537918-4090-5771-81f5-3c87119b1495/scratchpad/entregar/database.json'
DB=json.load(open(DBP,encoding='utf-8'))
falhas=[]
def chk(n,c,e=""):
    print(("  OK  " if c else "  XXX ")+n+(f"  {e}" if e else ""))
    if not c: falhas.append(n)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args=["--no-sandbox"])
    pg=b.new_page(viewport={"width":1500,"height":980}); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append("C:"+m.text) if m.type=="error" else None)
    pg.goto(APP); pg.wait_for_timeout(400)
    pg.evaluate("""(db)=>{localStorage.setItem('sm.autor','Bruno Almeida');localStorage.setItem('sm.tema','light');
      Store.gravar=async d=>1;Store.backup=async()=>'x';Store.dirHandle={};window.confirm=()=>true;
      S.db=db;normalizar(S.db);aplicarTema();
      // a migracao ja decide os 40; reabrimos 3 para testar a tela de decisao
      S.db.conflitos.filter(c=>c.campo==='Bigram').slice(0,3)
        .forEach(c=>{c.resolvido=false; delete c.valorAplicado; delete c.resolvidoPor;});
      irPara('conflitos');}""",DB)
    pg.wait_for_timeout(600)
    chk("3 conflitos em aberto (Bigram)", pg.evaluate("S.db.conflitos.filter(c=>!c.resolvido).length")==3)
    chk("nomes dos arquivos nos cartoes", "SafetyMilestoneJ08" in pg.inner_text("#view") and "Resumo Fluxo" in pg.inner_text("#view"))
    chk("nao ha mais 'Manter este'", "Manter este" not in pg.inner_text("#view"))
    chk("botao 'Usar este' em cada conflito", pg.locator("button[data-c][data-v='1']").count()==3)
    chk("sem 'Combinar' em Bigram (so em observacao)", pg.locator("button[data-comb]").count()==0)
    chk("regra corrigida: Missing Vacuum + B05 done nao alerta",
        pg.evaluate("incoerente('7 - Missing Vacuum Test or Sign','B05 done, without pendencies.')")==False)
    pg.screenshot(path="/tmp/conf.png")

    print("--- lote (Bigram, usar Arquivo 2)")
    pg.evaluate("UI.resolverLote('Bigram','2')"); pg.wait_for_timeout(400)
    chk("3 Bigram resolvidos", pg.evaluate("S.db.conflitos.filter(c=>c.campo==='Bigram'&&!c.resolvido).length")==0)
    chk("bigram do item 1027 virou lista completa",
        pg.evaluate("S.db.itens.find(i=>i.item==='1027').bigram.join(';')")=="DA;DM;DN",
        pg.evaluate("S.db.itens.find(i=>i.item==='1027').bigram.join(';')"))

    print("--- resolvidos ficam visiveis com o valor descartado")
    chk("todos os 40 resolvidos apos o lote", pg.evaluate("S.db.conflitos.filter(c=>c.resolvido).length")==40)
    chk("valor descartado visivel na tabela", "B05 done" in pg.inner_text("#view"))
    pg.wait_for_timeout(300); pg.screenshot(path="/tmp/conf2.png")
    b.close()
print("\nerros:", errs or "nenhum")
print("falhas:", falhas or "nenhuma")
