/* Testes de unidade do motor do StatusMilestone, sem navegador e sem base real.
   O proprio docs/index.html e carregado no Node (testes/app_em_node.mjs) e a
   pasta do usuario e substituida por uma pasta de mentira que sabe falhar de
   proposito. Cobrem persistencia, concorrencia, descarte de pendentes e cache
   do historico.

       python3 -m http.server   # nao e preciso nada disso
       node testes/unidade.mjs  # a partir da raiz do repositorio
*/
import { carregarApp, pastaFalsa, baseDeTeste } from "./app_em_node.mjs";

const falhas = [];
let grupo = "";
const secao = t => { grupo = t; console.log("=== "+t); };
const chk = (nome, cond, extra="") => {
  console.log((cond ? "  OK  " : "  XXX ") + nome + (extra ? `  ${extra}` : ""));
  if(!cond) falhas.push(`${grupo} / ${nome}` + (extra ? ` (${extra})` : ""));
};
const igual = (nome,a,b)=>chk(nome, JSON.stringify(a)===JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
const erroDe = async fn => { try{ await fn(); return null; }catch(e){ return e; } };

/* Cenario novo a cada teste: app recarregado, pasta limpa, base sintetica. */
function cenario({falhas:fal={}, semPasta=false, database}={}){
  const app = carregarApp();
  const estado = [];
  app.Render.atual = ()=>{};  app.Render.badgePendentes = ()=>{};  app.Render.semBase = ()=>{};
  app.ctx.toast = ()=>{};                              /* sem timers de UI presos no processo */
  app.ctx.marcarEstado = t => estado.push(t);
  const db = baseDeTeste();
  const pasta = pastaFalsa({database: database===undefined ? JSON.stringify(db) : database, falhas:fal});
  app.S.db = db; app.normalizar(db);
  if(!semPasta){ app.Store.dirHandle = pasta; app.Store.revisaoCarregada = db.meta.revisao; }
  app.Sync.parar();
  return {app, db, pasta, estado, disco:()=>JSON.parse(pasta.conteudo()),
          editar(item,campo,valor,op){ app.Pend.alterar(item,campo,valor,op);
                                       clearTimeout(app.Pend.timerAuto); }};
}

/* ================= 1. persistencia: erros de leitura e escrita ============ */
secao("1. PERSISTENCIA");
{
  const c = cenario({database:null});                       /* pasta sem database.json */
  const rev = await c.app.Store.gravar(c.db);
  chk("arquivo inexistente: cria a base", rev===8 && c.disco().meta.revisao===8, String(rev));
  chk("revisaoCarregada acompanha o disco", c.app.Store.revisaoCarregada===8);
}
{
  const c = cenario();
  const rev = await c.app.Store.gravar(c.db);
  chk("mesma revisão no disco: grava e incrementa", rev===8 && c.disco().meta.revisao===8, String(rev));
  igual("meta em memória e disco coincidem", c.db.meta.revisao, c.disco().meta.revisao);
}
{
  const c = cenario();
  const outro = baseDeTeste(); outro.meta.revisao = 9; outro.meta.ultimoAutor = "Bia";
  c.pasta.arquivos.set("database.json", JSON.stringify(outro));
  const e = await erroDe(()=>c.app.Store.gravar(c.db));
  chk("revisão diferente: CONFLITO_REVISAO", e?.message==="CONFLITO_REVISAO", String(e?.message));
  chk("conflito informa autor e revisão do disco", e?.revisaoDisco===9 && e?.autorDisco==="Bia");
  chk("nada foi gravado por cima", c.disco().meta.revisao===9);
  chk("revisão em memória intacta", c.db.meta.revisao===7, String(c.db.meta.revisao));
}
{
  const c = cenario({database:"{ isto nao e json valido"});
  const e = await erroDe(()=>c.app.Store.gravar(c.db));
  chk("JSON corrompido não é confundido com arquivo novo", e?.message==="LEITURA_JSON_INVALIDO", String(e?.message));
  chk("arquivo corrompido não é sobrescrito", c.pasta.conteudo()==="{ isto nao e json valido");
  chk("revisão em memória intacta", c.db.meta.revisao===7);
}
{
  const c = cenario({falhas:{permissaoLeitura:1}});
  const e = await erroDe(()=>c.app.Store.gravar(c.db));
  chk("permissão negada na leitura: interrompe", e?.message==="LEITURA_PERMISSAO", String(e?.message));
  chk("disco intacto após permissão negada", c.disco().meta.revisao===7);
  chk("revisaoCarregada intacta", c.app.Store.revisaoCarregada===7);
}
{
  const c = cenario({falhas:{falhaLeitura:1}});
  const e = await erroDe(()=>c.app.Store.gravar(c.db));
  chk("falha de I/O na leitura: interrompe", e?.message==="LEITURA_LEITURA", String(e?.message));
  chk("disco intacto após falha de leitura", c.disco().meta.revisao===7);
}
for(const [ponto,falha] of [["createWritable",{createWritable:1}],["write",{write:1}],["close",{close:1}]]){
  const c = cenario({falhas:falha});
  const e = await erroDe(()=>c.app.Store.gravar(c.db));
  chk(`falha em ${ponto}: FALHA_ESCRITA`, e?.message==="FALHA_ESCRITA", String(e?.message));
  chk(`falha em ${ponto}: revisão em memória inalterada`, c.db.meta.revisao===7, String(c.db.meta.revisao));
  chk(`falha em ${ponto}: revisaoCarregada inalterada`, c.app.Store.revisaoCarregada===7);
  chk(`falha em ${ponto}: disco inalterado`, c.disco().meta.revisao===7);
  chk(`falha em ${ponto}: nenhum writer ficou aberto`, c.pasta.estado.writersAbertos===0);
}
{
  const c = cenario();
  await c.app.Store.gravar(c.db);
  await c.app.Store.gravar(c.db);
  chk("gravações seguidas: revisão 7 -> 9", c.disco().meta.revisao===9, String(c.disco().meta.revisao));
  chk("autor e data gravados", !!c.disco().meta.atualizadoEm && c.disco().meta.ultimoAutor==="Teste");
  const msg = c.app.avaliar('mensagemArmazenamento({message:"LEITURA_JSON_INVALIDO"})');
  chk("mensagem de erro é acionável e sem stack", /backups\//.test(msg) && !/Error/.test(msg));
}
{
  const c = cenario();
  const e1 = await erroDe(()=>c.app.Store.backup(c.db,"teste"));
  chk("backup confirmado devolve o nome do arquivo", typeof e1!=="object" || e1===null);
  chk("backup existe na subpasta backups/", c.pasta.backups().length===1, c.pasta.backups().join(","));
  const c2 = cenario({falhas:{close:1}});
  const e2 = await erroDe(()=>c2.app.Store.backup(c2.db,"teste"));
  chk("backup que não fecha falha explicitamente", !!e2, String(e2?.message));
}

/* ====================== 2. concorrencia na mesma sessao =================== */
secao("2. CONCORRÊNCIA");
{
  const c = cenario();
  c.editar("A-001","generalObs","nota 1");
  await Promise.all([c.app.Pend.autosave(), c.app.Pend.autosave()]);
  clearTimeout(c.app.Pend.timerAuto);
  chk("dois autosaves não abrem dois writers", c.pasta.estado.maxWriters===1, String(c.pasta.estado.maxWriters));
  chk("as duas gravações acontecem em sequência", c.disco().meta.revisao===9, String(c.disco().meta.revisao));
  chk("estado passa por salvando e salvo", c.estado.includes("salvando...") && c.estado.some(t=>t.startsWith("salvo")));
}
{
  const c = cenario();
  c.editar("A-001","generalObs","nota 1");
  const gravando = c.app.Pend.autosave();
  await new Promise(r=>setTimeout(r,2));                  /* no meio da escrita */
  c.editar("A-003","generalObs","escrita no meio");
  await gravando; clearTimeout(c.app.Pend.timerAuto);
  chk("edição durante a escrita não é dada como salva", c.app.S.sujo===true);
  chk("ela continua no diário", c.app.Pend.diario.length===1, String(c.app.Pend.diario.length));
  await c.app.Pend.autosave(); clearTimeout(c.app.Pend.timerAuto);
  const it = c.disco().itens.find(i=>i.item==="A-003");
  chk("aparece na gravação seguinte", it.generalObs==="escrita no meio", it.generalObs);
  chk("agora sim o estado está limpo", c.app.S.sujo===false && c.app.Pend.diario.length===0);
}
{
  const c = cenario({falhas:{write:1}});
  c.editar("A-001","generalObs","nota 1");
  await c.app.Pend.autosave(); clearTimeout(c.app.Pend.timerAuto);
  chk("falha ao salvar mantém S.sujo", c.app.S.sujo===true);
  chk("falha ao salvar é anunciada", c.estado.includes("falha ao salvar"));
  chk("revisão em memória inalterada após falha", c.db.meta.revisao===7, String(c.db.meta.revisao));
  await c.app.Pend.autosave(); clearTimeout(c.app.Pend.timerAuto);
  chk("a fila não trava: a tentativa seguinte grava", c.disco().meta.revisao===8, String(c.disco().meta.revisao));
  chk("e o conteúdo chega ao disco", c.disco().itens[0].generalObs==="nota 1");
}
{
  const c = cenario();
  c.editar("A-001","status","5 - Waiting Proof");
  const gravando = c.app.Pend.autosave();
  const consolidando = c.app.Pend.consolidarTudo();
  await Promise.all([gravando, consolidando]); clearTimeout(c.app.Pend.timerAuto);
  chk("consolidação durante autosave não abre dois writers", c.pasta.estado.maxWriters===1, String(c.pasta.estado.maxWriters));
  chk("consolidação manual é aguardável", typeof consolidando?.then==="function");
  chk("o histórico consolidado chega ao disco", c.disco().historico.length===4, String(c.disco().historico.length));
  chk("e a pendência sai do disco", c.disco().pendentes.length===0);
}

/* ===================== 3. pendentes, descarte e metadados ================= */
secao("3. PENDENTES E DESCARTE");
{
  const c = cenario({semPasta:true});
  const it = c.db.itens.find(i=>i.item==="A-001");
  const antes = {status:it.status, ult:it.ultimaAlteracaoStatus, atu:it.atualizadoEm,
                 aging:c.app.R.diasSemAtualizacao(it)};
  c.editar("A-001","status","5 - Waiting Proof");
  const p = c.db.pendentes[0];
  chk("A -> B cria uma pendência", c.db.pendentes.length===1 && p.valorOriginal==="3 - Blocking");
  igual("snapshot guarda ultimaAlteracaoStatus", p.origUltimaAlteracaoStatus, antes.ult);
  igual("snapshot guarda atualizadoEm", p.origAtualizadoEm, antes.atu);
  c.editar("A-001","status","4 - Under Analysis");
  chk("A -> B -> C agrupa numa pendência só", c.db.pendentes.length===1);
  igual("valorOriginal continua sendo A", c.db.pendentes[0].valorOriginal, "3 - Blocking");
  igual("snapshot continua o de antes de A", c.db.pendentes[0].origUltimaAlteracaoStatus, antes.ult);
  chk("o aging mudou durante a edição", c.app.R.diasSemAtualizacao(it)!==antes.aging);

  c.app.Pend.descartarTudo();
  igual("descarte devolve o status", it.status, antes.status);
  igual("descarte devolve ultimaAlteracaoStatus", it.ultimaAlteracaoStatus, antes.ult);
  igual("descarte devolve atualizadoEm", it.atualizadoEm, antes.atu);
  igual("aging idêntico ao de antes", c.app.R.diasSemAtualizacao(it), antes.aging);
  chk("nenhum evento de histórico foi criado", c.db.historico.length===3, String(c.db.historico.length));
  chk("o descarte fica registrado no log", (c.db.logDescartes||[]).length===1);
}
{
  const c = cenario({semPasta:true});
  c.app.S.filtros = {...c.app.avaliar("filtrosVazios()"), dataDe:"2026-01-14", dataAte:"2026-01-16"};
  const antes = c.app.avaliar("itensFiltrados()").map(i=>i.item);
  c.editar("A-001","status","5 - Waiting Proof");
  const durante = c.app.avaliar("itensFiltrados()").map(i=>i.item);
  c.app.Pend.descartarTudo();
  const depois = c.app.avaliar("itensFiltrados()").map(i=>i.item);
  igual("filtro por data antes da alteração", antes, ["A-001"]);
  chk("o filtro realmente se mexe durante a alteração", JSON.stringify(durante)!==JSON.stringify(antes));
  igual("filtro por data volta ao mesmo resultado", depois, antes);
}
{
  const c = cenario({semPasta:true});
  const it = c.db.itens.find(i=>i.item==="A-001");
  const antes = {ult:it.ultimaAlteracaoStatus, atu:it.atualizadoEm, aging:c.app.R.diasSemAtualizacao(it)};
  c.editar("A-001","status","5 - Waiting Proof");
  c.editar("A-001","status","3 - Blocking");                       /* ida e volta */
  const r = c.app.Pend.consolidar(c.db.pendentes[0],{forcado:true});
  igual("A -> B -> A é descartado na consolidação", r, "descartado");
  chk("A -> B -> A não gera evento", c.db.historico.length===3, String(c.db.historico.length));
  igual("A -> B -> A devolve ultimaAlteracaoStatus", it.ultimaAlteracaoStatus, antes.ult);
  igual("A -> B -> A devolve atualizadoEm", it.atualizadoEm, antes.atu);
  igual("A -> B -> A mantém o aging", c.app.R.diasSemAtualizacao(it), antes.aging);
}
{
  const c = cenario({semPasta:true});
  const it = c.db.itens.find(i=>i.item==="A-001");
  const original = it.atualizadoEm;
  c.editar("A-001","generalObs","observação que continua pendente");
  c.editar("A-001","status","5 - Waiting Proof");
  c.editar("A-001","status","3 - Blocking");
  const pStatus = c.db.pendentes.find(p=>p.campo==="status");
  c.app.Pend.consolidar(pStatus,{forcado:true});
  chk("descarte parcial mantém a outra pendência", c.db.pendentes.length===1);
  chk("atualizadoEm não volta enquanto há pendência de pé", it.atualizadoEm!==original);
  igual("mas ultimaAlteracaoStatus volta", it.ultimaAlteracaoStatus, "2026-01-15");
}

/* ========================== 4. cache do historico ======================== */
secao("4. HISTÓRICO");
{
  const c = cenario({semPasta:true});
  const revAntes = c.db.meta.revisao;
  igual("statusEm reconstrói a data pedida", c.app.R.statusEm("A-001","2026-01-10"), "4 - Under Analysis");
  c.app.R.histStatus();                                    /* cache preenchido de proposito */
  c.editar("A-003","status","1 - Validated by ICN");
  c.app.Pend.consolidar(c.db.pendentes[0],{forcado:true});
  igual("evento recém-consolidado aparece na hora",
        c.app.R.statusEm("A-003", c.app.hoje()), "1 - Validated by ICN");
  chk("sem precisar de autosave: a revisão não mudou", c.db.meta.revisao===revAntes);
  chk("mudouNoCiclo usa o mesmo índice", c.app.R.mudouNoCiclo(c.db.itens.find(i=>i.item==="A-001"))===true);
  chk("item sem evento no marco anterior não conta como alterado",
      !c.app.R.mudouNoCiclo(c.db.itens.find(i=>i.item==="A-003")));
}
{
  const c = cenario({semPasta:true});
  c.db.historico.push(
    {id:"h5", item:"A-003", campo:"status", valorAnterior:"5 - Waiting Proof", valorNovo:"4 - Under Analysis",
     dataEfetiva:"2026-02-01", consolidadoEm:"2026-02-01T18:00:00.000Z", autor:"Ana", tipo:"status"},
    {id:"h4", item:"A-003", campo:"status", valorAnterior:"4 - Under Analysis", valorNovo:"3 - Blocking",
     dataEfetiva:"2026-02-01", consolidadoEm:"2026-02-01T09:00:00.000Z", autor:"Ana", tipo:"status"});
  c.app.R.invalidarHist();
  const ordem = c.app.R.histStatus()["A-003"].map(h=>h.id);
  igual("mesma data: desempate por consolidadoEm, depois id", ordem, ["h4","h5"]);
  igual("statusEm usa o último do dia", c.app.R.statusEm("A-003","2026-02-01"), "4 - Under Analysis");
}
{
  const c = cenario({semPasta:true});
  c.app.R.histStatus();
  const outra = baseDeTeste(); outra.historico = []; c.app.normalizar(outra);
  c.app.S.db = outra;
  igual("trocar a base invalida o índice", Object.keys(c.app.R.histStatus()).length, 0);
}

/* ============ 5. caracterizacao: os numeros nao podem se mexer =========== */
secao("5. CARACTERIZAÇÃO (regra aberto/fechado)");
{
  const c = cenario({semPasta:true});
  const k = c.app.M.kpis(c.db.itens);
  igual("KPIs da base sintética", [k.total,k.aberto,k.validado,k.mudou], [4,2,1,1]);
  chk("'2 - Not Blocking - Downgraded' conta como fechado (regra por prefixo)",
      c.app.R.aberto("2 - Not Blocking - Downgraded")===false);
  chk("'2 - Not Available Jx' conta como fechado", c.app.R.aberto("2 - Not Available Jx")===false);
  chk("'1 - Validated by ICN' conta como fechado", c.app.R.aberto("1 - Validated by ICN")===false);
  chk("'3 - Blocking' conta como aberto", c.app.R.aberto("3 - Blocking")===true);
  chk("'5 - Waiting Proof' conta como aberto", c.app.R.aberto("5 - Waiting Proof")===true);
}


/* ============ 6. filtros como endereco: URL, localStorage, vistas ======== */
secao("6. FILTROS PERSISTENTES");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.rota = "itens";
  app.S.filtros = {...app.avaliar("filtrosVazios()"), status:["3 - Blocking","5 - Waiting Proof"],
                   busca:"solda", aging:"60", comObs:true};
  app.S.ordenacao = {campo:"aging", dir:-1};
  const txt = app.FiltroURL.paraTexto();
  chk("o endereço começa pela rota", txt.startsWith("itens?"), txt);
  const volta = app.FiltroURL.doTexto(txt);
  igual("rota sobrevive à ida e volta", volta.rota, "itens");
  igual("status múltiplo sobrevive", volta.filtros.status, ["3 - Blocking","5 - Waiting Proof"]);
  igual("busca sobrevive", volta.filtros.busca, "solda");
  igual("aging sobrevive", volta.filtros.aging, "60");
  igual("marcadores sobrevivem", [volta.filtros.comObs, volta.filtros.alteradas], [true,false]);
  igual("ordenação sobrevive", volta.ordenacao, {campo:"aging", dir:-1});
  igual("filtro vazio não polui o endereço", app.FiltroURL.paraTexto(app.avaliar("filtrosVazios()"),"dashboard",{campo:"item",dir:1}), "dashboard");
  igual("rota inventada cai no dashboard", app.FiltroURL.doTexto("naoexiste?status=X").rota, "dashboard");
}
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.rota = "kanban"; app.S.filtros.inspType = ["FUN"];
  app.Filtros.persistir();
  chk("grava no localStorage", app.ctx.localStorage.getItem("sm.filtros")==="kanban?inspType=FUN",
      String(app.ctx.localStorage.getItem("sm.filtros")));
  chk("e no hash da URL (o link que se manda)", app.ctx.location.hash==="#kanban?inspType=FUN",
      app.ctx.location.hash);
  const c2 = cenario({semPasta:true});
  c2.app.ctx.location.hash = "#itens?status=3+-+Blocking&alteradas=1";
  c2.app.Filtros.restaurar();
  igual("restaura do hash", [c2.app.S.rotaInicial, c2.app.S.filtros.status, c2.app.S.filtros.alteradas],
        ["itens", ["3 - Blocking"], true]);
  const c3 = cenario({semPasta:true});
  c3.app.ctx.localStorage.setItem("sm.filtros","relatorios?b05=sim");
  c3.app.Filtros.restaurar();
  igual("sem hash, restaura do localStorage", [c3.app.S.rotaInicial, c3.app.S.filtros.b05], ["relatorios","sim"]);
}
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.filtros = {...app.avaliar("filtrosVazios()"), status:["3 - Blocking"], b05:"sim", comObs:true};
  const ativos = app.Filtros.ativos();
  igual("um chip por filtro ligado", ativos.length, 3);
  igual("chip traz o rótulo legível", ativos[0].rotulo, "3 - Blocking");
  app.Filtros.remover("status","3 - Blocking");
  igual("remover tira só aquele valor", app.S.filtros.status, []);
  app.Filtros.remover("comObs","");
  chk("remover desliga o marcador", app.S.filtros.comObs===false);
  igual("e o resto continua de pé", app.S.filtros.b05, "sim");
}
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.rota="itens"; app.S.filtros.status=["3 - Blocking"];
  app.Filtros.salvarVista();                       /* prompt devolve "Teste" */
  igual("vista salva na config (vai junto com a base)", app.S.db.config.vistas.length, 1);
  igual("com nome e autor", [app.S.db.config.vistas[0].nome, app.S.db.config.vistas[0].autor], ["Teste","Teste"]);
  chk("salvar vista marca a base como suja", app.Pend.diario.some(e=>e.o==="vista"));
  clearTimeout(app.Pend.timerAuto);
  app.S.filtros = app.avaliar("filtrosVazios()"); app.S.rota="dashboard";
  app.Filtros.aplicarVista(app.S.db.config.vistas[0].id);
  igual("aplicar a vista devolve filtro e rota", [app.S.rota, app.S.filtros.status], ["itens",["3 - Blocking"]]);
  app.ctx.confirm = ()=>true;
  app.Filtros.removerVista(app.S.db.config.vistas[0].id);
  igual("remover a vista", app.S.db.config.vistas.length, 0);
  clearTimeout(app.Pend.timerAuto);
}

/* ================= 7. o que mudou desde a ultima visita ================= */
secao("7. NOVIDADES DESDE A ÚLTIMA VISITA");
{
  const c = cenario({semPasta:true});
  igual("sem marca anterior, nada a anunciar", c.app.Visita.calcular(), null);
  c.app.ctx.localStorage.setItem("sm.visto", JSON.stringify({revisao:5, em:"2026-01-10T00:00:00.000Z"}));
  const n = c.app.Visita.calcular();
  igual("conta os eventos consolidados depois da marca", n.eventos, 2);   /* h2 e h3 */
  igual("nomeia as outras pessoas, não a própria", n.autores, ["Ana","Bia"]);
  igual("aponta a data do evento mais antigo", n.dataDe, "2026-01-15");
  c.app.S.db.observacoes.push({id:"o1", item:"A-001", texto:"nota", criadoEm:"2026-02-01T10:00:00.000Z", autor:"Ana"});
  igual("observações também contam", c.app.Visita.calcular().obs, 1);
  c.app.Visita.marcar();
  igual("depois de marcar, não há novidade", c.app.Visita.calcular(), null);
}
{
  const c = cenario({semPasta:true});
  c.app.ctx.localStorage.setItem("sm.autor","Ana");
  c.app.ctx.localStorage.setItem("sm.visto", JSON.stringify({revisao:5, em:"2026-01-10T00:00:00.000Z"}));
  igual("o que eu mesmo fiz não vira novidade minha", c.app.Visita.calcular().autores, ["Bia"]);
}

/* =================== 8. descartar uma pendencia so ===================== */
secao("8. DESCARTE DE UMA PENDÊNCIA");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  const it = app.S.db.itens.find(i=>i.item==="A-001");
  const antes = {ult:it.ultimaAlteracaoStatus, atu:it.atualizadoEm, aging:app.R.diasSemAtualizacao(it)};
  c.editar("A-001","status","5 - Waiting Proof");
  c.editar("A-003","generalObs","nota que fica");
  app.ctx.confirm = ()=>false;
  chk("com a confirmação negada, nada acontece", app.Pend.descartarUma(app.S.db.pendentes[0])===false);
  igual("as duas pendências continuam", app.S.db.pendentes.length, 2);
  app.ctx.confirm = ()=>true;
  chk("descarta a pendência escolhida", app.Pend.descartarUma(app.S.db.pendentes.find(p=>p.campo==="status"))===true);
  igual("a outra pendência fica de pé", app.S.db.pendentes.length, 1);
  igual("e é a do outro item", app.S.db.pendentes[0].item, "A-003");
  igual("o item volta ao status original", it.status, "3 - Blocking");
  igual("com ultimaAlteracaoStatus de antes", it.ultimaAlteracaoStatus, antes.ult);
  igual("e atualizadoEm de antes", it.atualizadoEm, antes.atu);
  igual("aging idêntico", app.R.diasSemAtualizacao(it), antes.aging);
  chk("nenhum evento de histórico criado", app.S.db.historico.length===3);
  igual("fica no log de descartes", app.S.db.logDescartes.length, 1);
  chk("sai do diário (não é mais trabalho nosso)",
      !app.Pend.diario.some(e=>e.item==="A-001" && e.campo==="status"));
  chk("o diário mantém o que continua pendente",
      app.Pend.diario.some(e=>e.item==="A-003"));
  clearTimeout(app.Pend.timerAuto);
}


/* =================== 9. validacao estrutural da base =================== */
secao("9. VALIDAÇÃO DA BASE");
{
  const c = cenario({semPasta:true});
  const val = c.app.avaliar("validarBase");
  chk("base sintética é válida", val(baseDeTeste()).valido);
  const semAviso = val(baseDeTeste());
  igual("e sem avisos", semAviso.avisos, []);

  const casos = [
    ["raiz não é objeto", "texto solto"],
    ["raiz é lista", [1,2,3]],
    ["itens como objeto em vez de lista", {...baseDeTeste(), itens:{a:1}}],
    ["histórico como objeto", {...baseDeTeste(), historico:{}}],
    ["config como lista", {...baseDeTeste(), config:[]}],
  ];
  for(const [nome, db] of casos) chk(nome+" é recusada", val(db).valido===false);

  const semId = baseDeTeste(); semId.itens[1] = {...semId.itens[1], item:""};
  chk("item sem identificador é recusado", val(semId).valido===false, val(semId).erros[0]);
  const dupl = baseDeTeste(); dupl.itens[2] = {...dupl.itens[2], item:"A-001"};
  chk("identificador duplicado é recusado", val(dupl).valido===false, val(dupl).erros[0]);
  const rev = baseDeTeste(); rev.meta.revisao = "7";
  chk("meta.revisao não inteira é recusada", val(rev).valido===false);

  const orfao = baseDeTeste(); orfao.historico.push({...orfao.historico[0], id:"hx", item:"NAO-EXISTE"});
  const r1 = val(orfao);
  chk("evento órfão não bloqueia", r1.valido===true);
  chk("mas aparece como aviso", r1.avisos.some(a=>/não existem|do not exist/.test(a)), r1.avisos[0]);
  const idDup = baseDeTeste(); idDup.historico.push({...idDup.historico[0]});
  chk("id de evento repetido vira aviso", val(idDup).avisos.some(a=>/id\(s\)|event id/.test(a)));
  const dataRuim = baseDeTeste(); dataRuim.historico[0].dataEfetiva = "15/01/2026";
  chk("data fora do padrão vira aviso", val(dataRuim).avisos.some(a=>/AAAA-MM-DD|YYYY-MM-DD/.test(a)));
  const stRuim = baseDeTeste(); stRuim.itens[0].status = "9 - Inventado";
  chk("status fora do domínio vira aviso", val(stRuim).avisos.some(a=>/domínio|domain/.test(a)));
  const pRuim = baseDeTeste();
  pRuim.pendentes.push({id:"p1", item:"NAO-EXISTE", campo:"inspType", valorOriginal:"", valorAtual:"x"});
  const r2 = val(pRuim);
  chk("pendência órfã vira aviso", r2.avisos.some(a=>/pendência|pending/.test(a)));
  chk("pendência em campo não editável vira aviso", r2.avisos.some(a=>/editável|non-editable/.test(a)));
  chk("base com avisos continua utilizável", r2.valido===true);

  const intacta = baseDeTeste(), copia = JSON.parse(JSON.stringify(intacta));
  val(intacta);
  igual("validar não mexe no objeto recebido", intacta, copia);
}
{
  /* a base inválida não pode substituir a que está aberta */
  const c = cenario({semPasta:true});
  const antes = c.app.S.db;
  c.app.UI.baseRecusada = ()=>{};                 /* sem modal no teste */
  const val = c.app.avaliar("validarBase");
  const ruim = {...baseDeTeste(), itens:{}};
  if(val(ruim).valido) chk("deveria ser inválida", false);
  chk("a base aberta continua sendo a mesma", c.app.S.db===antes);
}

/* ============ 10. aberto/fechado com uma fonte de verdade ============== */
secao("10. ABERTO/FECHADO PELA CONFIG");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  igual("KPIs de partida", app.M.kpis(app.S.db.itens).aberto, 2);
  igual("a regra vem da config", app.R.abertoExcecoes(), app.S.db.config.statusAbertoExcecoes);
  chk("prefixo cobre o status derivado", app.R.aberto("2 - Not Blocking - Downgraded")===false);
  app.S.db.config.statusAbertoExcecoes = ["1 - Validated by ICN"];
  igual("mudar a config muda todos os indicadores", app.M.kpis(app.S.db.itens).aberto, 3);
  chk("e 'Not Blocking' passa a contar como aberto", app.R.aberto("2 - Not Blocking")===true);
  app.S.db.config.statusAbertoExcecoes = [];
  igual("lista vazia cai no padrão (não zera os painéis)", app.R.abertoExcecoes(), app.R.ABERTO_PADRAO);
  igual("com o padrão, os números voltam", app.M.kpis(app.S.db.itens).aberto, 2);
  delete app.S.db.config.statusAbertoExcecoes;
  igual("base antiga sem a chave também usa o padrão", app.M.kpis(app.S.db.itens).aberto, 2);
}

/* =================== 11. arquivamento de historico ===================== */
secao("11. ARQUIVAMENTO DE HISTÓRICO");
{
  const c = cenario();
  const {app} = c;
  const antesDatas = ["2026-01-08","2026-01-10","2026-01-16","2026-02-01"];
  const antes = antesDatas.map(d=>app.R.statusEm("A-001",d));
  const pv = app.Arquivamento.previa("2026-01-10");
  igual("prévia conta o que sairia", [pv.eventos, pv.itens, pv.restam], [1,1,2]);
  const r = await app.Arquivamento.executar("2026-01-10");
  clearTimeout(app.Pend.timerAuto);
  igual("arquivou o evento antigo", r.arquivados, 1);
  igual("e deixou um evento-marco no lugar", r.marcos, 1);
  igual("o histórico continua com 3 eventos", app.S.db.historico.length, 3);
  chk("o evento antigo saiu", !app.S.db.historico.some(h=>h.id==="h1"));
  chk("o marco tem origem 'arquivamento'", app.S.db.historico.some(h=>h.origem==="arquivamento"));
  const arq = c.pasta.arquivados();
  igual("gravou um arquivo em historico/", arq.length, 1);
  igual("com o evento inteiro dentro", JSON.parse(arq[0][1]).eventos.length, 1);
  igual("a reconstrução continua idêntica", antesDatas.map(d=>app.R.statusEm("A-001",d)), antes);
  igual("ficou registrado no log", app.S.db.logArquivamentos.length, 1);
  chk("e a base foi gravada", c.disco().historico.length===3);
}
{
  const c = cenario({falhas:{close:1}});           /* falha ao fechar o arquivo */
  const {app} = c;
  const e = await erroDe(()=>app.Arquivamento.executar("2026-01-10"));
  igual("falha ao gravar o arquivo é explícita", e?.message, "ARQUIVO_NAO_CONFIRMADO");
  igual("e o histórico continua inteiro na base", app.S.db.historico.length, 3);
  chk("nenhum evento foi perdido", app.S.db.historico.some(h=>h.id==="h1"));
  chk("nada foi registrado no log", !app.S.db.logArquivamentos);
}


/* ================= 12. colunas escolhidas por quem usa ================= */
secao("12. COLUNAS DA TABELA");
{
  const c = cenario({semPasta:true});
  const {app} = c, doc = app.ctx.document;
  igual("começa no conjunto padrão", app.Colunas.escolhidas(), app.COLUNAS_PADRAO);
  app.Colunas.guardar(["item","status","bigram"]);
  igual("guardar troca as colunas", app.Colunas.defs().map(x=>x.id), ["item","status","bigram"]);
  igual("e persiste no navegador", JSON.parse(app.ctx.localStorage.getItem("sm.colunas")),
        ["item","status","bigram"]);
  app.Render.itens();
  const html = doc.querySelector("#view").innerHTML;
  chk("a tabela desenha as colunas escolhidas", html.includes("Bigram"));
  chk("e deixa de fora as que saíram", !html.includes("Obs. do status"));
  app.Colunas.guardar(["nao-existe"]);
  igual("id inválido cai no padrão", app.Colunas.escolhidas(), app.COLUNAS_PADRAO);
  app.Colunas.guardar([]);
  igual("lista vazia também", app.Colunas.escolhidas(), app.COLUNAS_PADRAO);
}

/* ===================== 13. edicao em lote de itens ===================== */
secao("13. EDIÇÃO EM LOTE");
{
  const c = cenario({semPasta:true});
  const {app} = c, doc = app.ctx.document;
  app.S.selecao.add("A-001"); app.S.selecao.add("A-002");
  app.Render.itens();
  chk("a barra de lote aparece com a seleção",
      doc.querySelector("#view").innerHTML.includes("2 ") && !!doc.querySelector("#loteAplicar"));
  doc.querySelector("#loteStatus").value = "5 - Waiting Proof";
  doc.querySelector("#loteData").value  = "2026-03-01";
  doc.querySelector("#loteMotivo").value = "reunião de status";
  doc.querySelector("#loteAplicar").onclick();
  clearTimeout(app.Pend.timerAuto);
  igual("uma pendência por item selecionado", app.S.db.pendentes.length, 2);
  igual("com a data efetiva escolhida", app.S.db.pendentes[0].dataEfetiva, "2026-03-01");
  igual("e o motivo, que vai para o histórico", app.S.db.pendentes[0].motivo, "reunião de status");
  igual("os itens já mostram o status novo",
        app.S.db.itens.filter(i=>i.status==="5 - Waiting Proof").map(i=>i.item), ["A-001","A-002"]);
  igual("a seleção é limpa depois de aplicar", app.S.selecao.size, 0);
}
{
  const c = cenario({semPasta:true});
  const {app} = c, doc = app.ctx.document;
  app.S.selecao.add("A-003");                       /* já está em 4 - Under Analysis */
  app.Render.itens();
  doc.querySelector("#loteStatus").value = "4 - Under Analysis";
  doc.querySelector("#loteAplicar").onclick();
  clearTimeout(app.Pend.timerAuto);
  igual("quem já está no status não vira pendência", app.S.db.pendentes.length, 0);
}
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.selecao.add("A-001"); app.S.selecao.add("A-002");
  app.S.filtros.status = ["1 - Validated by ICN"];  /* deixa só A-002 visível */
  app.Render.itens();
  igual("seleção fora do filtro é descartada", [...app.S.selecao], ["A-002"]);
}

/* ================== 14. teclado na tabela de itens ===================== */
secao("14. TECLADO");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.rota = "itens";
  app.TecladoItens.mover(1);
  igual("primeira seta põe o cursor no primeiro item", app.S.cursor, "A-001");
  app.TecladoItens.mover(1);
  igual("e desce um a um", app.S.cursor, "A-002");
  app.TecladoItens.mover(-5);
  igual("não passa do começo", app.S.cursor, "A-001");
  app.TecladoItens.mover(99);
  igual("nem do fim", app.S.cursor, "A-004");
  app.TecladoItens.marcar();
  igual("espaço marca para o lote", [...app.S.selecao], ["A-004"]);
  app.TecladoItens.marcar();
  igual("e desmarca", app.S.selecao.size, 0);
  chk("seta funciona na tela de itens",
      app.TecladoItens.tecla({key:"ArrowDown", target:{tagName:"BODY"}, preventDefault(){}})===true);
  chk("mas não rouba o teclado de quem está digitando",
      app.TecladoItens.tecla({key:"ArrowDown", target:{tagName:"INPUT"}})===false);
  app.S.rota = "dashboard";
  chk("nem age fora da tela de itens",
      app.TecladoItens.tecla({key:"ArrowDown", target:{tagName:"BODY"}})===false);
  app.S.rota = "itens";
  app.UI.modal("teste","corpo");
  chk("nem com uma janela aberta",
      app.TecladoItens.tecla({key:"ArrowDown", target:{tagName:"BODY"}})===false);
  app.UI.fechar();
}
{
  const c = cenario({semPasta:true});
  const {app} = c, doc = app.ctx.document;
  app.UI.detalhe("A-002");
  igual("o detalhe sabe onde está na lista", app.S.selecionado, "A-002");
  app.UI.irrItem(1);
  igual("'próximo' anda sem fechar o detalhe", app.S.selecionado, "A-003");
  app.UI.irrItem(-1);
  igual("e volta", app.S.selecionado, "A-002");
  doc.querySelector("#dStatus").value = "5 - Waiting Proof";
  doc.querySelector("#dData").value = "2026-03-02";
  app.UI.salvarDetalhe("A-002");
  clearTimeout(app.Pend.timerAuto);
  igual("salvar o detalhe grava pelo mesmo motor de pendentes", app.S.db.pendentes.length, 1);
  igual("respeitando a data efetiva informada", app.S.db.pendentes[0].dataEfetiva, "2026-03-02");
}

/* ============ 15. presenca diz tambem o que cada um edita ============== */
secao("15. PRESENÇA POR ITEM");
{
  const c = cenario();
  const {app} = c;
  c.editar("A-001","generalObs","mexendo aqui");
  igual("anuncio o item que estou editando", app.Sync.meusItens(), ["A-001"]);
  const pres = await c.pasta.getDirectoryHandle("presenca",{create:true});
  const fh = await pres.getFileHandle("maria.json",{create:true});
  const w = await fh.createWritable();
  await w.write(JSON.stringify({nome:"Maria", em:new Date().toISOString(), itens:["A-002","A-003"]}));
  await w.close();
  await app.Sync.presenca();
  igual("vejo quem mais está na base", app.Sync.presentes.sort(), ["Maria","Teste"]);
  igual("e em qual item cada um está", app.Sync.quemEdita("A-002"), ["Maria"]);
  igual("item sem ninguém não marca nada", app.Sync.quemEdita("A-004"), []);
  const meu = JSON.parse(pres.arquivos.get("teste.json"));
  igual("o meu arquivo de presença leva os meus itens", meu.itens, ["A-001"]);
  chk("e o meu nome", meu.nome==="Teste");
}

/* ================== 16. Evidence Flow em tela propria ================== */
secao("16. TELA DE EVIDENCE FLOW");
{
  const c = cenario({semPasta:true});
  const {app} = c, doc = app.ctx.document;
  chk("a rota existe no menu", app.ROTAS.some(r=>r.id==="fluxo"));
  igual("e é um endereço válido", app.FiltroURL.doTexto("fluxo?b05=sim").rota, "fluxo");
  app.Render.fluxo();
  const f = doc.querySelector("#view").innerHTML;
  chk("a tela desenha os dois blocos", f.includes("B05") && f.includes("exceto"));
  app.Render.dashboard();
  const d = doc.querySelector("#view").innerHTML;
  chk("e o dashboard não os repete mais", !d.includes('"exceto" B05'));
  chk("mas continua com os KPIs", d.includes("KPI")||d.includes("kpis"));
}

console.log(falhas.length ? `\n${falhas.length} FALHA(S):\n  `+falhas.join("\n  ") : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);
