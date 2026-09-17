/* Testes de unidade do motor do StatusMilestone, sem navegador e sem base real.
   O proprio docs/index.html e carregado no Node (testes/app_em_node.mjs) e a
   pasta do usuario e substituida por uma pasta de mentira que sabe falhar de
   proposito. Cobrem persistencia, concorrencia, descarte de pendentes e cache
   do historico.

       python3 -m http.server   # nao e preciso nada disso
       node testes/unidade.mjs  # a partir da raiz do repositorio
*/
import { carregarApp, pastaFalsa, baseDeTeste, VISUALIZADOR } from "./app_em_node.mjs";

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
  const meu = JSON.parse(pres.arquivos.get(app.Sync.slug("Teste")+".json"));
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

/* =================== 17. achados da auditoria ==========================
   Cada bloco reproduz um defeito comprovado na auditoria antes da correcao.  */
secao("17. AUDITORIA — PERDA DE DADOS E ROBUSTEZ");
{
  /* A1. Sem pasta escolhida (modo manual / copia local recuperada) a edicao
     continua possivel, mas o autosave saia antes ate do espelho: fechar o
     navegador perdia tudo, sem aviso nenhum. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const espelhos = [];
  app.IDB.set = async (k,v)=>{ if(k==="espelho") espelhos.push(v); return null; };
  c.editar("A-001","status","5 - Waiting Proof");
  await app.Pend.autosave();
  chk("sem pasta, a alteração ainda vai para a cópia local", espelhos.length===1);
  chk("e o estado diz que não foi gravada na pasta",
      c.estado.some(t=>/cópia local|local copy/i.test(t)), JSON.stringify(c.estado));
  chk("a base continua marcada como suja", app.S.sujo===true);
}
{
  /* A2. normalizar() percorria config.status antes de garantir que ela existe:
     uma base estruturalmente valida sem esse campo estourava na abertura. */
  const app = carregarApp();
  const db = baseDeTeste(); delete db.config.status;
  chk("base sem config.status passa na validação", app.avaliar("validarBase")(db).valido);
  let erro=null; try{ app.normalizar(db); }catch(e){ erro=e; }
  chk("e normalizar não estoura", erro===null, erro?String(erro.message):"");
  chk("config.status vira lista vazia preenchida pelos dados", Array.isArray(db.config.status));
  const minima = {meta:{revisao:1}, itens:[{item:"X", status:"3 - Blocking"}]};
  let erro2=null; try{ app.normalizar(minima); }catch(e){ erro2=e; }
  chk("base mínima (só meta e itens) também abre", erro2===null, erro2?String(erro2.message):"");
  igual("e o status usado entra no domínio",
        (minima.config.status||[]).map(s=>s.codigo), ["3 - Blocking"]);
}
{
  /* A3. Restaurar backup gravava com {forcar:true} sem reler o disco: o
     trabalho que outra pessoa tinha gravado no meio sumia, e o backup
     "pre-restauracao" era da NOSSA memoria, nao do que ia ser apagado. */
  const c = cenario();
  const {app, pasta} = c;
  const nome = await app.Store.backup(app.S.db, "teste");
  const outro = JSON.parse(pasta.conteudo());
  outro.meta.revisao = 99; outro.meta.ultimoAutor = "Maria";
  outro.itens[2].status = "1 - Validated by ICN";
  outro.historico.push({id:"hX", item:"A-003", campo:"status", valorAnterior:"4 - Under Analysis",
    valorNovo:"1 - Validated by ICN", dataEfetiva:"2026-02-01", consolidadoEm:"2026-02-01T10:00:00Z",
    primeiraAlteracaoEm:"2026-02-01T10:00:00Z", autor:"Maria", origem:"manual", tipo:"status", observacao:""});
  pasta.arquivos.set("database.json", JSON.stringify(outro,null,1));
  await app.UI.restaurar(nome);
  const bdir = pasta.subs.get("backups");
  const guardados = [...bdir.arquivos.values()].map(t=>JSON.parse(t));
  chk("restaurar guarda a versão do DISCO antes de apagá-la",
      guardados.some(b=>(b.historico||[]).some(h=>h.id==="hX")));
  chk("a revisão gravada não regride", (JSON.parse(pasta.conteudo()).meta.revisao ?? 0) > 99);
}
{
  /* A4. Conflito nao-rebasavel durante o autosave abria a tela do Sync (que
     poe ligado=false) e logo em cima a de gravacao, que nao tem como devolver
     o ligado: o polling morria calado pelo resto da sessao. */
  const c = cenario();
  const {app, pasta} = c;
  const outro = JSON.parse(pasta.conteudo());
  outro.meta.revisao = 42; outro.meta.ultimoAutor = "Maria";
  pasta.arquivos.set("database.json", JSON.stringify(outro,null,1));
  app.S.db.config.minutosConsolidacao = 5;
  app.Pend.registrar({t:"outro", o:"config"});
  await app.Pend.autosave();
  const ov = app.ctx.document.querySelector("#ov");
  chk("o conflito abre uma tela de decisão", !!ov);
  chk("e é a do Sync, que junta campo a campo — não a de gravação por cima dela",
      /mudou enquanto|changed while/.test(ov?.innerHTML||""));
  app.UI.fechar();
  chk("fechar a tela devolve o polling", app.Sync.ligado===true);
  /* Enquanto a alteração local não-rebasável não for decidida, o sistema tem de
     continuar perguntando em vez de adotar o disco por conta própria. */
  pasta.arquivos.set("database.json", JSON.stringify({...outro, meta:{...outro.meta, revisao:43}},null,1));
  pasta.mtimes.set("database.json", 5000);
  await app.Sync.tick();
  igual("com a decisão pendente, a base local é preservada", app.Store.revisaoCarregada, 7);
  chk("e a pergunta volta em vez de sumir", !!app.ctx.document.querySelector("#ov"));
  /* Decidida (aqui: abrindo mão da alteração local), o polling volta a fluir. */
  app.UI.fechar(); app.Pend.diario = [];
  pasta.mtimes.set("database.json", 5001);
  await app.Sync.tick();
  igual("depois de decidido, a sessão volta a enxergar o disco", app.Store.revisaoCarregada, 43);
}
secao("17b. AUDITORIA — INJEÇÃO E SANEAMENTO");
{
  /* A5. A aba "Dados" do detalhe imprimia o valor CRU sempre que ele contivesse
     a sequencia "<span" - qualquer campo descritivo virava HTML executavel. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = '<span></span><img src=x onerror=alert(1)>';
  app.UI.detalhe("A-001");
  const html = app.ctx.document.querySelector("#ov").innerHTML;
  chk("a aba Dados não devolve HTML cru", !html.includes("<img src=x onerror=alert(1)>"));
  chk("mas mostra o texto ao usuário", html.includes("&lt;img src=x onerror=alert(1)&gt;"));
}
{
  /* A6. A cor de config.status ia crua para dentro de atributos style/fill em
     todo painel que pinta status: bastava adulterar o database.json. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.config.status[3].cor = '#fff"><img src=x onerror=alert(1)><i style="';
  app.S.db.config.familias[0].cor = '#fff"><img src=x onerror=alert(2)><i style="';
  app.Render.itens();
  const itens = app.ctx.document.querySelector("#view").innerHTML;
  chk("a tabela de itens não aceita cor injetada", !itens.includes("<img src=x onerror=alert(1)>"));
  app.Render.kanban();
  const kb = app.ctx.document.querySelector("#view").innerHTML;
  chk("o kanban também não", !kb.includes("onerror=alert(1)") && !kb.includes("onerror=alert(2)"));
  app.Render.dashboard();
  const dash = app.ctx.document.querySelector("#view").innerHTML;
  chk("nem os gráficos do dashboard", !dash.includes("onerror=alert(1)"));
  chk("cor legítima continua passando", app.R.corDe("1 - Validated by ICN").startsWith("#")
      || app.R.corDe("1 - Validated by ICN").startsWith("var("));
}
{
  /* A7. CSV: Excel e Calc executam a celula que comeca por = + - @, mesmo
     entre aspas. O valor tem de sair desarmado e ainda legivel. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = '=HYPERLINK("http://mau","clique")';
  let capturado = null;
  app.ctx.URL = {createObjectURL:()=>"blob:x", revokeObjectURL(){}};
  app.ctx.Blob = class { constructor(p){ capturado = p.join(""); } };
  app.Export.csv(app.S.db.itens);
  chk("CSV desarma fórmula no campo do item", capturado.includes(`"'=HYPERLINK`));
  app.Export.historico([{item:"A-001", campo:"status", valorAnterior:"", valorNovo:"@SUM(1+1)",
    dataEfetiva:"2026-01-01", consolidadoEm:"", autor:"", origem:"", observacao:""}]);
  chk("e também no CSV do histórico", capturado.includes(`"'@SUM(1+1)"`));
}
secao("17c. AUDITORIA — BASES DEFEITUOSAS E ESCALA");
{
  /* A8. Item sem status e apenas um AVISO da validacao - a base abre. As telas
     precisam aguentar, e o relatorio "Bloqueantes" estourava. */
  const c = cenario({semPasta:true});
  const {app} = c;
  delete app.S.db.itens[2].status;
  chk("item sem status é aviso, não impedimento", app.avaliar("validarBase")(app.S.db).valido);
  app.S.relSel = "bloq";
  let e1=null; try{ app.Render.relatorios(); }catch(e){ e1=e; }
  chk("o relatório Bloqueantes não estoura", e1===null, e1?String(e1.message):"");
  let e2=null; try{ app.R.statusAtivos(); }catch(e){ e2=e; }
  chk("nem a lista de status ativos", e2===null, e2?String(e2.message):"");
  let e3=null; try{ app.Render.itens(); app.Render.kanban(); app.Render.dashboard(); }catch(e){ e3=e; }
  chk("nem as telas principais", e3===null, e3?String(e3.message):"");
}
{
  /* A9. validarBase varria ids repetidos com indexOf dentro de filter (O(n2)).
     Ela roda a cada carga E a cada vez que outra pessoa grava. */
  const app = carregarApp();
  const db = baseDeTeste();
  for(let k=0;k<20000;k++) db.historico.push({id:"g"+k, item:"A-001", campo:"status",
    valorAnterior:"3 - Blocking", valorNovo:"3 - Blocking", dataEfetiva:"2026-02-01",
    consolidadoEm:"2026-02-01T00:00:00Z", primeiraAlteracaoEm:"2026-02-01T00:00:00Z",
    autor:"X", origem:"manual", tipo:"status", observacao:""});
  const t0 = Date.now(); const v = app.avaliar("validarBase")(db); const ms = Date.now()-t0;
  chk("20.000 eventos validam em menos de 120 ms", ms < 120, ms+" ms");
  chk("e o resultado continua correto", v.valido && v.avisos.length===0);
  db.historico.push({...db.historico[10]});
  chk("id repetido continua sendo detectado",
      app.avaliar("validarBase")(db).avisos.some(a=>/repetid|duplicate/i.test(a)));
}
{
  /* A10. Relógios diferentes entre maquinas na pasta de rede produzem
     ultimaAlteracaoStatus no futuro; o item sumia do gráfico de aging. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].ultimaAlteracaoStatus = "2099-01-01";
  const abertos = app.S.db.itens.filter(i=>app.R.aberto(i.status)).length;
  const soma = app.M.aging(app.S.db.itens).reduce((s,f)=>s+f.n,0);
  igual("nenhum item em aberto some das faixas de aging", soma, abertos);
}
{
  /* A11. presenca/<slug>.json: dois nomes diferentes davam o mesmo arquivo, e
     nomes sem letras latinas viravam todos "anonimo" - um sobrescrevia o outro. */
  const c = cenario({semPasta:true});
  const {app} = c;
  chk("acentuação não colide com o nome sem acento",
      app.Sync.slug("José Silva") !== app.Sync.slug("Jose Silva"));
  chk("nem pontuação diferente", app.Sync.slug("Ana-B") !== app.Sync.slug("Ana B"));
  chk("nomes fora do alfabeto latino não colapsam num só",
      app.Sync.slug("李雷") !== app.Sync.slug("张伟"));
  chk("o mesmo nome dá sempre o mesmo arquivo",
      app.Sync.slug("José Silva") === app.Sync.slug("José Silva"));
  chk("e continua um nome de arquivo seguro", /^[a-z0-9-]+$/.test(app.Sync.slug("José Silva")));
}
{
  /* A12. Decisao A3: o descarte fica no log "por alguns dias", nao para sempre.
     Sem poda o log so engorda o database.json. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const velho = new Date(Date.now()-400*864e5).toISOString();
  app.S.db.logDescartes = [{em:velho, autor:"Ana", itens:[]},
                           {em:new Date().toISOString(), autor:"Ana", itens:[]}];
  app.S.db.logSobrescritas = [{em:velho, autor:"Ana", resultado:"sobrescrito"}];
  app.S.db.logArquivamentos = [{em:velho, autor:"Ana", corte:"2026-01-01", arquivo:"h.json"}];
  app.normalizar(app.S.db);
  igual("descarte antigo sai do log", app.S.db.logDescartes.length, 1);
  igual("sobrescrita antiga também", app.S.db.logSobrescritas.length, 0);
  igual("mas o índice dos arquivamentos nunca é podado", app.S.db.logArquivamentos.length, 1);
}

secao("17d. AUDITORIA — ARQUIVAMENTO SOB CONCORRÊNCIA");
{
  /* A13. Arquivar tem um await no meio (gravar o arquivo em historico/). Se o
     polling trocasse S.db nesse intervalo, os eventos antigos da versao NOVA
     saiam da base pelo filtro do corte sem nunca terem entrado no arquivo que
     ja tinha sido gravado - destruidos, nem na base nem em historico/. E o
     contrario exato da promessa do arquivamento ("nada e apagado"). */
  const c = cenario();
  const {app, pasta} = c;
  const outro = JSON.parse(pasta.conteudo());
  outro.meta.revisao = 99; outro.meta.ultimoAutor = "Maria";
  outro.historico.push({id:"hMARIA", item:"A-003", campo:"status",
    valorAnterior:"5 - Waiting Proof", valorNovo:"4 - Under Analysis",
    dataEfetiva:"2026-01-09", consolidadoEm:"2026-01-09T10:00:00Z",
    primeiraAlteracaoEm:"2026-01-09T10:00:00Z", autor:"Maria", origem:"manual",
    tipo:"status", observacao:""});

  const originalArquivar = app.Store.arquivarHistorico.bind(app.Store);
  app.Store.arquivarHistorico = async (nome, dados) => {
    const r = await originalArquivar(nome, dados);
    pasta.arquivos.set("database.json", JSON.stringify(outro,null,1));
    pasta.mtimes.set("database.json", 9999);
    await app.Sync.tick();            /* a base troca debaixo do arquivamento */
    return r;
  };

  let erro = null;
  try{ await app.Arquivamento.executar("2026-01-10"); }catch(e){ erro = e; }
  clearTimeout(app.Pend.timerAuto);

  const disco = JSON.parse(pasta.conteudo());
  const naBase = (disco.historico||[]).some(h=>h.id==="hMARIA");
  const noArquivo = pasta.arquivados().some(([,txt]) =>
    (JSON.parse(txt).eventos||[]).some(e=>e.id==="hMARIA"));
  chk("o evento da outra pessoa continua existindo (na base ou no arquivo)",
      naBase || noArquivo, `base=${naBase} arquivo=${noArquivo}`);
  chk("a sessão ocupada não deixa o polling trocar a base no meio",
      erro === null, erro ? String(erro.message) : "");
}
{
  /* A13b. Segunda defesa, para quando a base e trocada por um caminho que nao
     olha S.salvando (restaurar backup, recuperar copia local): a conferencia
     por identidade impede que eventos saiam da base sem estarem no arquivo. */
  const c = cenario();
  const {app} = c;
  const intruso = structuredClone(app.S.db);
  intruso.historico.push({id:"hINTRUSO", item:"A-003", campo:"status",
    valorAnterior:"5 - Waiting Proof", valorNovo:"4 - Under Analysis",
    dataEfetiva:"2026-01-09", consolidadoEm:"2026-01-09T10:00:00Z",
    primeiraAlteracaoEm:"2026-01-09T10:00:00Z", autor:"Maria", origem:"manual",
    tipo:"status", observacao:""});
  const originalArquivar = app.Store.arquivarHistorico.bind(app.Store);
  app.Store.arquivarHistorico = async (nome, dados) => {
    const r = await originalArquivar(nome, dados);
    app.S.db = intruso;                 /* outra base entra em cena no meio */
    return r;
  };
  let erro = null;
  try{ await app.Arquivamento.executar("2026-01-10"); }catch(e){ erro = e; }
  clearTimeout(app.Pend.timerAuto);
  chk("a troca de base é recusada em vez de destruir evento",
      erro !== null && /BASE_MUDOU/.test(String(erro.message)), erro?String(erro.message):"sem erro");
  chk("e nenhum evento foi tirado da base",
      app.S.db.historico.some(h=>h.id==="hINTRUSO") && app.S.db.historico.length===4,
      String(app.S.db.historico.length));
  chk("a mensagem de erro é acionável, não um stack trace",
      /arquivar de novo|archiving again/.test(app.avaliar("mensagemArmazenamento")(erro)));
}
{
  /* O caminho normal (ninguem mexeu no meio) tem de continuar funcionando. */
  const c = cenario();
  const {app} = c;
  const r = await app.Arquivamento.executar("2026-01-10");
  clearTimeout(app.Pend.timerAuto);
  igual("sem concorrência, o arquivamento segue normal", r.arquivados, 1);
  igual("com o evento-marco no lugar", r.marcos, 1);
  chk("e o polling volta ligado depois", app.Sync.ligado===true);
}

/* ============ 18. corrida na gravacao: meta.revisao nao e atomico ========= */
secao("18. CORRIDA NA GRAVACAO");

const travaDe = (autor, segundosAtras=0) => JSON.stringify(
  {dono:"outra-sessao", autor, em:new Date(Date.now()-segundosAtras*1000).toISOString()});

{
  /* A18. Com a trava de outra sessao viva, gravar por cima e exatamente o que
     nao pode acontecer: a conferencia por revisao e um check-then-use e, entre
     reler o arquivo e fechar o writer, cabe a gravacao inteira da outra pessoa.
     O que se perdia ali nao ficava em lugar nenhum - nem no disco, nem em
     backups/ - e nem o polling via, porque a revisao terminava igual a nossa. */
  const c = cenario();
  const {app, pasta, estado} = c;
  pasta.arquivos.set("database.lock.json", travaDe("Bia"));
  pasta.mtimes.set("database.lock.json", 1);
  const antes = pasta.conteudo();

  c.editar("A-001","ncr","NCR-NOSSA");
  const erro = await erroDe(()=>app.Store.gravar(app.S.db));
  chk("a sessão recua diante da trava de outra pessoa",
      erro !== null && /GRAVACAO_OCUPADA/.test(String(erro.message)),
      erro ? String(erro.message) : "gravou por cima");
  chk("e não encosta no database.json", pasta.conteudo() === antes);
  chk("a mensagem diz que nada se perdeu",
      /nada se perdeu|nothing was lost/.test(app.avaliar("mensagemArmazenamento")(erro)));

  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  chk("o autosave espera a vez em vez de dar erro na cara do usuário",
      estado.some(t=>/esperando a vez|waiting for the folder/.test(t)), estado.join(" | "));
  chk("e o diário continua de pé para a próxima tentativa",
      app.Pend.diario.length === 1 && app.S.sujo === true,
      `${app.Pend.diario.length} sujo=${app.S.sujo}`);
}
{
  /* A18a2. Contencao normal e passageira: a outra sessao solta a trava assim que
     fecha o arquivo. Desistir na primeira tentativa transformaria isso num aviso
     a cada 3 segundos - o Store tem de insistir sozinho antes de reclamar. */
  const c = cenario();
  const {app, pasta} = c;
  pasta.arquivos.set("database.lock.json", travaDe("Bia"));
  pasta.mtimes.set("database.lock.json", 1);
  let tentativas = 0;
  const lerTrava = app.Store.lerTrava.bind(app.Store);
  app.Store.lerTrava = async () => {
    /* a Bia solta a trava antes da terceira tentativa */
    if(++tentativas === 3) pasta.arquivos.set("database.lock.json", "{}");
    return lerTrava();
  };
  c.editar("A-001","ncr","NCR-NOSSA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  igual("a trava liberada no meio das tentativas deixa a gravação passar",
        c.disco().meta.revisao, 8);
  igual("e o diário é limpo", app.Pend.diario.length, 0);
}
{
  /* A18b. Uma aba fechada no meio da gravacao deixa a trava para tras. Se ela
     valesse para sempre, a pasta ficaria inutilizavel: o prazo e o que impede. */
  const c = cenario();
  const {app, pasta} = c;
  pasta.arquivos.set("database.lock.json", travaDe("Bia", app.Store.SEGUNDOS_TRAVA + 5));
  pasta.mtimes.set("database.lock.json", 1);
  c.editar("A-001","ncr","NCR-NOSSA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  igual("trava vencida não bloqueia ninguém", c.disco().meta.revisao, 8);
  igual("e a trava fica livre no fim",
        JSON.parse(pasta.arquivos.get("database.lock.json")).dono ?? null, null);
}
{
  /* A18c. O resto da corrida, que trava nenhuma fecha: o close da outra pessoa
     cai entre o nosso close e a nossa releitura. Cada gravacao leva um carimbo
     unico justamente para isso - reler e nao achar o nosso carimbo e a prova de
     que o arquivo nao e o que gravamos. */
  const c = cenario();
  const {app, pasta} = c;
  const outro = JSON.parse(pasta.conteudo());
  outro.meta.revisao = 9; outro.meta.ultimoAutor = "Bia"; outro.meta.carimbo = "da-bia";
  outro.itens.find(i=>i.item==="A-002").ncr = "NCR-DA-BIA";

  const conferir = app.Store.conferirGravacao.bind(app.Store);
  app.Store.conferirGravacao = async carimbo => {
    pasta.arquivos.set("database.json", JSON.stringify(outro,null,1));
    return conferir(carimbo);
  };
  app.S.db.itens.find(i=>i.item==="A-001").ncr = "NCR-NOSSA";

  const erro = await erroDe(()=>app.Store.gravar(app.S.db));
  chk("gravação que não se confirma não é dada como salva",
      erro !== null && /GRAVACAO_PERDIDA/.test(String(erro.message)),
      erro ? String(erro.message) : "devolveu sucesso");
  chk("a revisão carregada não avança sobre o que não se confirmou",
      app.Store.revisaoCarregada === 7, String(app.Store.revisaoCarregada));
  chk("o erro traz a versão do disco, para dar para juntar", !!erro?.disco);
  chk("a mensagem fala em gravação simultânea",
      /ao mesmo tempo|at the same time/.test(app.avaliar("mensagemArmazenamento")(erro)));
}
{
  /* A18d. Ponta a ponta: para quem esta usando, isso tem de virar fusao, nao
     falha. As duas alteracoes - a da outra pessoa e a nossa - no disco. */
  const c = cenario();
  const {app, pasta} = c;
  const outro = JSON.parse(pasta.conteudo());
  outro.meta.revisao = 9; outro.meta.ultimoAutor = "Bia"; outro.meta.carimbo = "da-bia";
  outro.itens.find(i=>i.item==="A-002").ncr = "NCR-DA-BIA";
  const conferir = app.Store.conferirGravacao.bind(app.Store);
  let umaVez = false;
  app.Store.conferirGravacao = async carimbo => {
    if(!umaVez){ umaVez = true; pasta.arquivos.set("database.json", JSON.stringify(outro,null,1)); }
    return conferir(carimbo);
  };

  c.editar("A-001","ncr","NCR-NOSSA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);

  const disco = c.disco();
  chk("a alteração da outra pessoa sobrevive ao nosso autosave",
      disco.itens.find(i=>i.item==="A-002").ncr === "NCR-DA-BIA", String(disco.itens.find(i=>i.item==="A-002").ncr));
  chk("e a nossa também chega ao disco",
      disco.itens.find(i=>i.item==="A-001").ncr === "NCR-NOSSA", String(disco.itens.find(i=>i.item==="A-001").ncr));
  chk("a revisão anda para a frente das duas", (disco.meta.revisao ?? 0) >= 10, String(disco.meta.revisao));
  igual("e o diário fica limpo no fim", app.Pend.diario.length, 0);
}
{
  /* A18e. Gravou e nao deu para reler: tambem nao da para dizer "salvo". */
  const c = cenario();
  const {app} = c;
  c.editar("A-001","ncr","NCR-NOSSA");
  const pendentes = app.Pend.diario.length;
  const lerOriginal = app.Store.lerTexto.bind(app.Store);
  app.Store.lerTexto = async (nome="database.json") => {
    if(nome === "database.json" && lerOriginal.jaLeu) throw Object.assign(new Error("sumiu"),{name:"NotReadableError"});
    if(nome === "database.json") lerOriginal.jaLeu = true;
    return lerOriginal(nome);
  };
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  chk("há o que preservar no diário", pendentes === 1, String(pendentes));
  chk("gravação não confirmada não limpa o diário",
      app.Pend.diario.length === pendentes && app.S.sujo === true,
      `${app.Pend.diario.length}/${pendentes} sujo=${app.S.sujo}`);
}
{
  /* A18f. A trava e protecao a mais, nunca motivo para recusar uma gravacao:
     se a pasta nao deixa grava-la, segue sem ela - com a conferencia de revisao
     antes e a de carimbo depois, que e mais do que existia. */
  const c = cenario();
  const {app} = c;
  app.Store.escreverTrava = async ()=>{ throw Object.assign(new Error("sem permissão"),{name:"NotAllowedError"}); };
  c.editar("A-001","ncr","NCR-NOSSA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  igual("trava quebrada não impede de salvar", c.disco().meta.revisao, 8);
  igual("e o diário é limpo normalmente", app.Pend.diario.length, 0);
}
{
  /* Caminho normal: carimbo no arquivo, trava devolvida, diario limpo. */
  const c = cenario();
  const {app, pasta} = c;
  c.editar("A-001","ncr","NCR-NOSSA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  const disco = c.disco();
  igual("sem corrida, a gravação continua normal", disco.meta.revisao, 8);
  chk("com o carimbo da gravação no arquivo",
      typeof disco.meta.carimbo === "string" && disco.meta.carimbo.length > 0,
      JSON.stringify(disco.meta.carimbo));
  chk("a base em memória carrega o mesmo carimbo do disco",
      app.S.db.meta.carimbo === disco.meta.carimbo);
  igual("a trava é devolvida no fim",
        JSON.parse(pasta.arquivos.get("database.lock.json")).dono ?? null, null);
  igual("e o diário foi limpo", app.Pend.diario.length, 0);

  const carimboAntes = disco.meta.carimbo;
  c.editar("A-001","ncr","NCR-OUTRA");
  await app.Pend.autosave();
  clearTimeout(app.Pend.timerAuto);
  chk("cada gravação leva um carimbo novo", c.disco().meta.carimbo !== carimboAntes);
}

/* ============ 18. EXPORTACAO, ITEM NOVO, SHIPYARD E CAMINHO ============ */
secao("18. EXPORTACAO: CSV QUE NAO SE DESALINHA");

/* Captura o que dl() mandaria para o disco, sem tocar em disco nenhum. */
function comCaptura(app){
  const saidas = [];
  app.ctx.URL = {createObjectURL:()=>"blob:x", revokeObjectURL(){}};
  app.ctx.Blob = class { constructor(p){ saidas.push(p.join("")); } };
  return saidas;
}
/* Leitor de CSV honesto o bastante para o que se quer provar: respeita aspas,
   aspas duplicadas e CRLF fora de aspas. Se o gerador desalinhar, isto acusa. */
function lerCSV(txt, sep=";"){
  if(txt.charCodeAt(0)===0xFEFF) txt = txt.slice(1);
  const linhas=[]; let campo="", linha=[], dentro=false;
  for(let k=0;k<txt.length;k++){
    const c=txt[k];
    if(dentro){
      if(c==='"'){ if(txt[k+1]==='"'){ campo+='"'; k++; } else dentro=false; }
      else campo+=c;
    }else if(c==='"'){ dentro=true; }
    else if(c===sep){ linha.push(campo); campo=""; }
    else if(c==="\r"){ /* espera o \n */ }
    else if(c==="\n"){ linha.push(campo); linhas.push(linha); linha=[]; campo=""; }
    else campo+=c;
  }
  if(campo!=="" || linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas;
}

{
  /* Uma celula com quebra de linha, um NUL vindo de planilha velha e um \r
     solto: era daqui que saia o "arquivo mal formatado". */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = "linha 1\r\nlinha 2\u0000\rlinha 3";
  app.S.db.itens[0].updatedStatusObs = 'ele disse "pronto"; e assinou';
  const saidas = comCaptura(app);

  app.Export.csv(app.S.db.itens, {cols:["item","description","updatedStatusObs","status"]});
  const csv = saidas.at(-1);
  const linhas = lerCSV(csv);
  igual("uma linha por item, mais o cabeçalho", linhas.length, app.S.db.itens.length+1);
  igual("toda linha tem o mesmo número de colunas",
        [...new Set(linhas.map(l=>l.length))], [4]);
  chk("a quebra de linha da célula virou separador visível",
      linhas[1][1] === "linha 1 \u00b7 linha 2 \u00b7 linha 3", JSON.stringify(linhas[1][1]));
  chk("o caractere de controle não chegou ao arquivo", !csv.includes("\u0000"));
  igual("aspas dentro do texto sobrevivem à ida e volta",
        linhas[1][2], 'ele disse "pronto"; e assinou');
  chk("o arquivo começa por BOM, para o Excel ler o acento", csv.charCodeAt(0)===0xFEFF);
  chk("e termina em quebra de linha", csv.endsWith("\r\n"));
}
{
  /* A defesa contra formula continua de pe - era a garantia do teste A7. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = '=HYPERLINK("http://mau","clique")';
  const saidas = comCaptura(app);
  app.Export.csv(app.S.db.itens, {cols:["item","description"]});
  chk("CSV desarma fórmula no campo do item", saidas.at(-1).includes(`"'=HYPERLINK`));
  app.Export.historico([{item:"A-001", campo:"status", valorAnterior:"", valorNovo:"@SUM(1+1)",
    dataEfetiva:"2026-01-01", consolidadoEm:"", autor:"", origem:"", observacao:""}]);
  chk("e também no CSV do histórico", saidas.at(-1).includes(`"'@SUM(1+1)"`));
}
{
  /* Separador e BOM sao escolha de quem exporta, e a escolha tem de valer. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const saidas = comCaptura(app);
  app.Export.csv(app.S.db.itens, {cols:["item","status"], sep:",", bom:false});
  const csv = saidas.at(-1);
  chk("sem BOM quando se pede UTF-8 puro", csv.charCodeAt(0)!==0xFEFF);
  igual("a vírgula separa e as colunas continuam alinhadas",
        [...new Set(lerCSV(csv,",").map(l=>l.length))], [2]);
}
{
  /* Escolher as colunas e escolher mesmo: nem uma a mais, nem fora de ordem. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const saidas = comCaptura(app);
  app.Export.csv(app.S.db.itens, {cols:["status","item"]});
  igual("o cabeçalho sai na ordem escolhida",
        lerCSV(saidas.at(-1))[0], ["Actual Status","Item"]);
  app.Export.csv(app.S.db.itens, {cols:["item","naoExiste","aging"]});
  igual("coluna inexistente é ignorada em vez de virar coluna vazia",
        lerCSV(saidas.at(-1))[0].length, 2);
}
{
  /* Nome de arquivo com caractere que o Windows recusa. */
  const {app} = cenario({semPasta:true});
  const n = app.nomeArquivo('Bloqueantes: B05/"J08" *', "csv");
  chk("nome de arquivo sem caractere proibido", !/[\\/:*?"<>|]/.test(n), n);
  chk("e com a extensão pedida", n.endsWith(".csv"), n);
}

secao("18b. RELATORIO PDF: DOCUMENTO, NAO FOTO DA TELA");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  const doc = app.Export.docHTML(app.S.db.itens, "Todos em aberto",
    {...app.Export.opcoes(), cols:["item","status","description"]});
  chk("é um documento HTML completo", doc.startsWith("<!doctype html") && doc.includes("</html>"));
  chk("com regra de página A4", /@page[^}]*A4/.test(doc));
  chk("o cabeçalho da tabela repete em toda página", doc.includes("display:table-header-group"));
  chk("e a linha não parte ao meio entre páginas", doc.includes("page-break-inside:avoid"));
  chk("traz a capa com quem gerou e quando", doc.includes("StatusMilestone") && doc.includes("</header>"));
  chk("traz o resumo pedido", doc.includes("Shipyard Prerequisites"));
  for(const i of app.S.db.itens)
    chk(`o item ${i.item} está no relatório`, doc.includes(i.item));
  chk("nenhuma coluna não pedida entrou",
      !doc.includes("HullPassageParts") && !doc.includes("Bigram"));

  const semResumo = app.Export.docHTML(app.S.db.itens, "x",
    {...app.Export.opcoes(), cols:["item"], resumo:false});
  chk("sem resumo quando se desmarca a opção", !semResumo.includes("Shipyard Prerequisites"));

  const retrato = app.Export.docHTML([], "x", {...app.Export.opcoes(), cols:["item"], orientacao:"retrato"});
  chk("retrato quando se pede retrato", /@page[^}]*A4 portrait/.test(retrato));
  chk("lista vazia não estoura o relatório", retrato.includes("Nenhum item"));
}
{
  /* O relatorio nunca pode virar porta de injecao: o texto do item e dado. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = '<script>roubar()<\/script>';
  const doc = app.Export.docHTML(app.S.db.itens, "t", {...app.Export.opcoes(), cols:["item","description"]});
  chk("o texto do item é escapado no relatório",
      !doc.includes("<script>roubar()") && doc.includes("&lt;script&gt;"));
}

secao("18c. SHIPYARD PREREQUISITES: J08 ATUAL, NAO O DE ORIGEM");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  /* Tres pre-requisitos: um so no J08 atual (veio do J07), um so no de origem
     (ja saiu para o J09) e um nos dois. O painel tem de contar o atual. */
  app.S.db.itens.push(
    {item:"S-1", status:"3 - Blocking", inspType:"Shipyard prerequisites",
     originalJx:"J07", actualJx:"J08", criadoEm:"2026-01-05", bigram:[]},
    {item:"S-2", status:"3 - Blocking", inspType:"Shipyard prerequisites",
     originalJx:"J08", actualJx:"J09", criadoEm:"2026-01-05", bigram:[]},
    {item:"S-3", status:"1 - Validated by ICN", inspType:"Shipyard prerequisites",
     originalJx:"J08", actualJx:"J08", criadoEm:"2026-01-05", bigram:[]});
  app.normalizar(app.S.db);
  const sy = app.M.shipyard(app.S.db.itens);
  igual("conta os que ESTÃO no J08 hoje", sy.itens.map(i=>i.item).sort(), ["S-1","S-3"]);
  chk("o transferido para o J09 fica de fora", !sy.itens.some(i=>i.item==="S-2"));
  chk("o que veio do J07 entra", sy.itens.some(i=>i.item==="S-1"));
  igual("o total segue a mesma regra", sy.total, 2);
  igual("e o em aberto também", sy.aberto, 1);
}

secao("18d. ITEM NOVO A MAO");
{
  const c = cenario();
  const {app} = c;
  app.ctx.localStorage.setItem("sm.autor","Bruno");
  const antes = app.S.db.itens.length;
  app.NovoItem.painel();
  app.$("#n-item").value = "  Z-900 ";
  app.$("#n-status").value = "3 - Blocking";
  app.$("#n-inspType").value = "B05";
  app.$("#n-bigram").value = "AA; BB";
  app.$("#n-criadoEm").value = "2026-02-01";
  app.NovoItem.criar({});
  clearTimeout(app.Pend.timerAuto);

  const novo = app.S.db.itens.find(i=>i.item==="Z-900");
  chk("o item entra na base", !!novo);
  igual("um item a mais, não dois", app.S.db.itens.length, antes+1);
  igual("o código é guardado sem espaço à toa", novo?.item, "Z-900");
  igual("o Bigram vira lista", novo?.bigram, ["AA","BB"]);
  igual("a data de criação é a informada", novo?.criadoEm, "2026-02-01");
  igual("e o aging parte dela", novo?.ultimaAlteracaoStatus, "2026-02-01");
  chk("nasce com um evento no histórico",
      app.S.db.historico.some(h=>h.item==="Z-900" && h.valorAnterior==="" && h.autor==="Bruno"));
  chk("o nascimento entra no diário, para sobreviver a uma gravação alheia",
      app.Pend.diario.some(e=>e.t==="item-novo" && e.obj.item==="Z-900"));
  chk("e a base fica suja, pedindo gravação", app.S.sujo===true);
  igual("a reconstrução histórica já o conhece",
        app.R.statusEm("Z-900","2026-02-05"), "3 - Blocking");
  chk("antes de existir, não tem status", !app.R.statusEm("Z-900","2026-01-01"));
}
{
  /* Codigo repetido nao pode entrar: duas linhas quase iguais e uma base que
     ninguem mais confere. */
  const c = cenario();
  const {app} = c;
  const avisos = [];
  app.ctx.toast = (m,k)=>avisos.push([m,k]);
  const antes = app.S.db.itens.length;
  app.NovoItem.painel();
  app.$("#n-item").value = "a-001";          /* A-001 ja existe, so muda a caixa */
  app.NovoItem.criar({});
  igual("código repetido não cria item", app.S.db.itens.length, antes);
  chk("e o motivo é dito", avisos.some(([m,k])=>k==="bad" && /A-001/.test(m)), JSON.stringify(avisos));

  app.$("#n-item").value = "   ";
  app.NovoItem.criar({});
  igual("código em branco também não cria", app.S.db.itens.length, antes);
  chk("existente() ignora caixa e espaço", app.NovoItem.existente(" A-002 ")?.item === "A-002");
  chk("e não inventa o que não existe", app.NovoItem.existente("NAO-EXISTE")===null);
}
{
  /* O item criado aqui nao pode sumir quando outra pessoa grava no meio. */
  const c = cenario();
  const {app} = c;
  app.ctx.localStorage.setItem("sm.autor","Bruno");
  app.NovoItem.painel();
  app.$("#n-item").value = "Z-901";
  app.NovoItem.criar({});
  clearTimeout(app.Pend.timerAuto);

  const deles = JSON.parse(JSON.stringify(c.db));
  deles.meta.revisao = 30; deles.meta.ultimoAutor = "Ana";
  deles.itens = deles.itens.filter(i=>i.item!=="Z-901");
  deles.itens[0].ncr = "NCR-DA-ANA";
  const r = app.Sync.receber(deles);
  igual("junta sozinho, sem pedir decisão", r, "juntado");
  chk("o item criado aqui sobrevive à gravação da outra pessoa",
      app.S.db.itens.some(i=>i.item==="Z-901"));
  chk("e o trabalho dela também chega",
      app.S.db.itens.find(i=>i.item==="A-001")?.ncr === "NCR-DA-ANA");
}
{
  /* Os dois criaram o mesmo codigo: isso e decisao, nao merge silencioso. */
  const c = cenario();
  const {app} = c;
  app.NovoItem.painel();
  app.$("#n-item").value = "Z-902";
  app.$("#n-status").value = "3 - Blocking";
  app.NovoItem.criar({});
  clearTimeout(app.Pend.timerAuto);

  /* c.db E a base em memoria: o Z-902 recem-criado ja esta la dentro. A versao
     "dela" tem de sair sem ele antes de ganhar o dela, senao o que se testa e
     uma base com id repetido, que a validacao recusa antes de chegar aqui. */
  const deles = JSON.parse(JSON.stringify(c.db));
  deles.meta.revisao = 31; deles.meta.ultimoAutor = "Ana";
  deles.itens = deles.itens.filter(i=>i.item!=="Z-902");
  deles.itens.push({item:"Z-902", status:"1 - Validated by ICN", inspType:"", isB05:false,
                    originalJx:"", actualJx:"", criadoEm:"2026-02-01", bigram:[]});
  const r = app.Sync.receber(deles);
  igual("mesmo código dos dois lados vira decisão", r, "decidir");
  chk("a janela de decisão está aberta", !!app.$("#ov"));
  app.UI.fechar();
}

secao("18e. CAMINHO PADRAO DA BASE");
{
  const c = cenario();
  const {app} = c;
  igual("o caminho de fábrica é o da pasta de rede do J08",
        app.Caminho.FABRICA, "G:\\DOP\\GTO\\3_INTERNO\\01_SAFE_TO_DIVE\\11_STATUS MILESTONE J08");
  igual("a normalização o coloca numa base que não o tinha",
        app.S.db.config.caminhoPadrao, app.Caminho.FABRICA);
  igual("a última pasta do caminho é o que se espera encontrar",
        app.Caminho.ultimaPasta(), "11_STATUS MILESTONE J08");

  app.Caminho.definir("Z:\\outro\\lugar");
  igual("dá para mudar", app.Caminho.padrao(), "Z:\\outro\\lugar");
  igual("e a mudança vai para a base, valendo para a equipe",
        app.S.db.config.caminhoPadrao, "Z:\\outro\\lugar");
  chk("a alteração pede gravação",
      app.Pend.diario.some(e=>e.t==="outro" && e.o==="caminho"));
  clearTimeout(app.Pend.timerAuto);

  app.Caminho.definir(app.Caminho.FABRICA);
  igual("e dá para voltar ao padrão", app.Caminho.padrao(), app.Caminho.FABRICA);
  clearTimeout(app.Pend.timerAuto);

  /* A pasta escolhida e conferida contra o caminho: abrir a errada e gravar
     nela e o engano que so aparece semanas depois. */
  const avisos = [];
  app.ctx.toast = (m,k)=>avisos.push(k);
  app.Store.dirHandle = {name:"11_STATUS MILESTONE J08"};
  chk("pasta com o nome esperado passa calada", app.Caminho.conferir()===true && !avisos.length);
  app.Store.dirHandle = {name:"Downloads"};
  chk("pasta diferente avisa", app.Caminho.conferir()===false && avisos.includes("warn"));
}

secao("18f. A ABA CONFLITOS SAIU, OS DADOS FICARAM");
{
  const c = cenario();
  const {app} = c;
  chk("não há mais rota de conflitos", !app.ROTAS.some(r=>r.id==="conflitos"));
  chk("nem tela para desenhá-la", app.Render.conflitos===undefined);
  chk("o array continua na base, nada foi apagado", Array.isArray(app.S.db.conflitos));
  /* Quem tiver o link antigo no favorito nao pode cair numa tela em branco. */
  app.S.rota = "conflitos";
  let erro=null; try{ app.Render.atual(); }catch(e){ erro=e; }
  chk("um link antigo para #conflitos cai no dashboard, sem estourar", erro===null,
      erro? String(erro.message):"");
}

secao("18g. AS TELAS CONTINUAM DE PE E OS BOTOES LIGADOS");
{
  /* Redesenhar uma tela e reconectar os botoes dela: o DOM de mentira cria os
     elementos com id que aparecem no innerHTML, entao da para provar aqui que
     nenhum botao novo ficou solto. */
  /* cenario() silencia Render.atual/semBase para os testes de gravacao; aqui e
     justamente o desenho que se quer provar, entao a app vem sem essa mordaca. */
  const app = carregarApp();
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Sync.parar();
  const desenhar = rota => { app.S.rota = rota; app.Render.nav(); app.Render[rota](); };
  for(const rota of ["dashboard","itens","kanban","fluxo","historico","relatorios","config"]){
    let e=null; try{ desenhar(rota); }catch(x){ e=x; }
    chk(`a tela ${rota} desenha`, e===null, e? String(e.message):"");
  }
  let e=null; try{ app.Render.semBase(); }catch(x){ e=x; }
  chk("e a tela de abertura também", e===null, e? String(e.message):"");
  chk("o caminho padrão aparece na abertura, com botão de copiar",
      typeof app.$("#cmCopiar")?.onclick === "function");

  desenhar("itens");
  chk("botão de item novo ligado",  typeof app.$("#btnNovo")?.onclick==="function");
  chk("botão de exportar ligado",   typeof app.$("#btnExpTab")?.onclick==="function");
  desenhar("relatorios");
  chk("exportar/relatório ligado",  typeof app.$("#eExp")?.onclick==="function");
  chk("atalho de PDF ligado",       typeof app.$("#ePdf")?.onclick==="function");
  chk("atalho de CSV ligado",       typeof app.$("#eCsv")?.onclick==="function");
  desenhar("config");
  chk("salvar o caminho padrão ligado", typeof app.$("#cmSalvar")?.onclick==="function");
  chk("restaurar o padrão ligado",      typeof app.$("#cmReset")?.onclick==="function");

  app.Export.painel(app.S.db.itens,"Itens");
  chk("a janela de exportação abre", !!app.$("#ov"));
  chk("com os atalhos de seleção ligados",
      typeof app.$("#xTodas")?.onclick==="function" &&
      typeof app.$("#xNenhuma")?.onclick==="function" &&
      typeof app.$("#xPadrao")?.onclick==="function" &&
      typeof app.$("#xDaTabela")?.onclick==="function");
  app.UI.fechar();
  app.NovoItem.painel();
  chk("o formulário de item novo abre", !!app.$("#n-item"));
  app.UI.fechar();
}

secao("19. RELATORIO EM QUADRO (KANBAN)");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  const o = {...app.Export.opcoes(), layout:"kanban",
             cols:["item","status","inspType","description"]};
  const doc = app.Export.documento(app.S.db.itens, "Quadro", o);

  chk("o despachante entrega o quadro, nao a tabela",
      doc.includes('class="quadro"') && !doc.includes('<table class="itens"'));
  chk("e continua sendo um documento completo, com pagina A4",
      doc.startsWith("<!doctype html") && /@page[^}]*A4/.test(doc));
  chk("a capa diz que o formato e o quadro", /quadro por/i.test(doc));
  chk("o cartao nao parte ao meio entre paginas",
      /\.cartao[^}]*break-inside:avoid/.test(doc));

  /* Uma coluna por familia do status, cada item no seu lugar. */
  const cols = app.Export.colunasQuadro(app.S.db.itens, o);
  const porFamilia = {};
  for(const i of app.S.db.itens) (porFamilia[app.R.familiaDe(i.status)] ??= []).push(i.item);
  for(const [fam, itens] of Object.entries(porFamilia)){
    const col = cols.find(x=>x.chave===fam);
    igual(`a coluna ${fam} tem os itens certos`,
          col?.itens.map(i=>i.item).sort(), itens.sort());
  }
  const soma = cols.reduce((n,x)=>n+x.itens.length, 0);
  igual("nenhum item some nem aparece duas vezes", soma, app.S.db.itens.length);
  for(const i of app.S.db.itens) chk(`o item ${i.item} esta no quadro`, doc.includes(i.item));

  chk("as colunas vazias do dominio aparecem quando pedidas",
      cols.length >= app.R.familias().length,
      `${cols.length} colunas para ${app.R.familias().length} familias`);
  const semVazias = app.Export.colunasQuadro(app.S.db.itens, {...o, kanbanVazias:false});
  chk("e somem quando nao sao pedidas", semVazias.every(x=>x.itens.length>0));
  chk("desligar as vazias nao perde item",
      semVazias.reduce((n,x)=>n+x.itens.length,0) === app.S.db.itens.length);
}
{
  /* O agrupamento e escolha de quem exporta, e tem de valer. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const base = {...app.Export.opcoes(), layout:"kanban", cols:["item","status"], kanbanVazias:false};

  const porTipo = app.Export.colunasQuadro(app.S.db.itens, {...base, kanbanAgrupar:"inspType"});
  igual("agrupado por InspType, uma coluna por tipo presente",
        porTipo.map(x=>x.chave).sort(),
        [...new Set(app.S.db.itens.map(i=>i.inspType))].sort());

  const porStatus = app.Export.colunasQuadro(app.S.db.itens, {...base, kanbanAgrupar:"status"});
  igual("agrupado por status, uma coluna por status presente",
        porStatus.map(x=>x.chave).sort(),
        [...new Set(app.S.db.itens.map(i=>i.status))].sort());
  chk("as colunas de status saem na ordem de severidade, nao alfabetica",
      porStatus.every((x,k)=>k===0 || app.R.ordemDe(porStatus[k-1].chave) <= app.R.ordemDe(x.chave)),
      porStatus.map(x=>x.chave).join(" | "));

  /* Agrupamento desconhecido nao pode derrubar a exportacao. */
  let erro=null;
  try{ app.Export.documento(app.S.db.itens,"x",{...base, kanbanAgrupar:"naoExiste"}); }
  catch(e){ erro=e; }
  chk("agrupamento invalido cai no padrao em vez de estourar", erro===null,
      erro? String(erro.message):"");
}
{
  /* Os filtros da tela sao o recorte do quadro: quem exporta manda a lista ja
     filtrada, e o quadro nao pode trazer nada alem dela. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.filtros.status = ["3 - Blocking"];
  const filtrados = app.itensFiltrados? app.itensFiltrados() : null;
  const lista = app.S.db.itens.filter(i=>i.status==="3 - Blocking");
  const o = {...app.Export.opcoes(), layout:"kanban", cols:["item","status"], kanbanVazias:false};
  const cols = app.Export.colunasQuadro(lista, o);
  igual("so o que passou no filtro entra no quadro",
        cols.flatMap(x=>x.itens.map(i=>i.item)).sort(), lista.map(i=>i.item).sort());
  const doc = app.Export.documento(lista, "Bloqueantes", o);
  const fora = app.S.db.itens.filter(i=>i.status!=="3 - Blocking");
  for(const i of fora)
    chk(`o item ${i.item}, fora do filtro, nao aparece`, !doc.includes(">"+i.item+"<"));
  app.S.filtros = app.avaliar("filtrosVazios()");
}
{
  /* Uma coluna por pagina: e o que torna legivel um quadro grande em papel. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const o = {...app.Export.opcoes(), layout:"kanban", cols:["item","status"], kanbanQuebra:"pagina"};
  const doc = app.Export.documento(app.S.db.itens, "Quadro", o);
  chk("cada coluna vira uma secao com quebra de pagina",
      doc.includes('class="porpagina"') && /break-after:page/.test(doc));
  const secoes = (doc.match(/class="porpagina"/g)||[]).length;
  igual("uma secao por coluna", secoes,
        app.Export.colunasQuadro(app.S.db.itens, o).length);

  const umQuadro = app.Export.documento(app.S.db.itens, "Quadro", {...o, kanbanQuebra:"quadro"});
  chk("e no modo quadro nao ha quebra forcada", !umQuadro.includes('class="porpagina"'));
}
{
  /* O texto do item e dado, nunca marcacao - vale no quadro como na tabela. */
  const c = cenario({semPasta:true});
  const {app} = c;
  app.S.db.itens[0].description = '<img src=x onerror=roubar()>';
  const doc = app.Export.documento(app.S.db.itens, "x",
    {...app.Export.opcoes(), layout:"kanban", cols:["item","description"]});
  chk("o texto do item e escapado no quadro",
      !doc.includes("<img src=x") && doc.includes("&lt;img"));
}
{
  /* Lista vazia e recorte sem resultado nenhum: nao pode estourar. */
  const c = cenario({semPasta:true});
  const {app} = c;
  let erro=null, doc="";
  try{ doc = app.Export.documento([], "Nada",
    {...app.Export.opcoes(), layout:"kanban", cols:["item"], kanbanVazias:false}); }
  catch(e){ erro=e; }
  chk("quadro sem itens nao estoura", erro===null, erro? String(erro.message):"");
  chk("e diz que nao ha nada no recorte", doc.includes("Nenhum item"));
}
{
  /* O botao do kanban abre a janela ja no formato quadro. */
  const app = carregarApp();
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Sync.parar();
  app.S.rota = "kanban"; app.Render.nav(); app.Render.kanban();
  chk("o kanban tem botao de exportar o quadro", typeof app.$("#kbExp")?.onclick === "function");
  app.$("#kbExp").onclick();
  chk("a janela de exportacao abre", !!app.$("#ov"));
  igual("ja com o formato quadro escolhido", app.Export.opcoes().layout, "kanban");
  app.UI.fechar();
}

secao("20. VISUALIZADOR: O MESMO MOTOR, SEM A ESCRITA");

/* O visualizador e gerado a partir do index. Carrega-lo com o mesmo aparato e
   o que garante que ele nao ficou para tras nem quebrou na geracao. */
function visualizador(){
  const app = carregarApp({arquivo:VISUALIZADOR});
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  return app;
}
{
  const app = visualizador();
  chk("o arquivo carrega inteiro, sem erro de script", !!app.S.db);
  chk("traz o mesmo motor de dominio", typeof app.R.aberto === "function"
      && typeof app.M.shipyard === "function");
  chk("e a mesma exportacao", typeof app.Export.documento === "function");
  igual("inclusive o Shipyard pelo ActualJx",
        app.M.shipyard(app.S.db.itens).total,
        app.S.db.itens.filter(i=>i.inspType==="Shipyard prerequisites" && i.actualJx==="J08").length);
}
{
  /* O que importa: nao existe caminho de codigo daqui ate um writer. */
  const app = visualizador();
  const pasta = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Store.dirHandle = pasta;

  const recusou = async fn => { try{ await fn(); return false; }catch(e){ return e.message==="SOMENTE_LEITURA"; } };
  for(const m of ["gravar","backup","restaurarBackup","travar","destravar","arquivarHistorico"])
    chk(`Store.${m} recusa`, await recusou(()=>app.Store[m](app.S.db)));

  /* A pasta de mentira conta cada writer aberto: zero e a prova de que nao
     houve tentativa de escrita, nao so de que ela falhou. */
  igual("nenhum writer foi aberto na pasta", pasta.estado.maxWriters, 0);
  igual("e nada foi escrito", pasta.estado.escritas.length, 0);
  igual("o database.json na pasta continua o mesmo",
        JSON.parse(pasta.conteudo()).meta.revisao, 7);
  igual("nenhum backup foi criado", pasta.backups(), []);
}
{
  /* Uma tentativa de edicao nao pode mudar o item nem sujar a base. */
  const app = visualizador();
  const antes = app.S.db.itens[0].status;
  const avisos = [];
  app.ctx.toast = (m,k)=>avisos.push(k);
  app.Pend.alterar("A-001","status","1 - Validated by ICN");
  igual("editar nao muda o item", app.S.db.itens[0].status, antes);
  igual("e nao cria pendencia", app.S.db.pendentes.length, 0);
  igual("nem suja a base", app.S.sujo, false);
  chk("e a pessoa e avisada de que ali nao se altera", avisos.includes("warn"));
  igual("o diario fica vazio", app.Pend.diario.length, 0);
}
{
  /* A interface nao oferece o que nao da para fazer. */
  const app = visualizador();
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  chk("nao ha rota de Configuracoes", !app.ROTAS.some(r=>r.id==="config"));
  chk("ha 'Sobre a base' no lugar", app.ROTAS.some(r=>r.id==="sobre"));
  chk("o modulo de item novo nao existe", app.NovoItem===undefined);
  chk("nem o de arquivamento", app.Arquivamento===undefined);

  const desenhar = rota => { app.S.rota=rota; app.Render.nav(); app.Render[rota](); };
  for(const rota of ["dashboard","itens","kanban","fluxo","historico","relatorios","sobre"]){
    let e=null; try{ desenhar(rota); }catch(x){ e=x; }
    chk(`a tela ${rota} desenha`, e===null, e? String(e.message):"");
  }
  desenhar("itens");
  chk("sem botao de item novo", !app.$("#btnNovo")?.onclick);
  chk("mas com o de exportar", typeof app.$("#btnExpTab")?.onclick === "function");
  chk("a barra de edicao em lote nao aparece", app.Lote.barra([])==="");
  desenhar("kanban");
  chk("o kanban continua exportando o quadro", typeof app.$("#kbExp")?.onclick === "function");
}
{
  /* O detalhe mostra, nao edita. */
  const app = visualizador();
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.S.rota="itens"; app.Render.nav(); app.Render.itens();
  app.UI.detalhe("A-001");
  chk("a janela do item abre", !!app.$("#ov"));
  chk("sem seletor de status", !app.$("#dStatus")?.id);
  chk("sem campo de observacao editavel", !app.$("#dObs")?.id);
  chk("e sem caixa para escrever observacao nova", !app.$("#oTxt")?.id);
  const html = app.ctx.document.querySelector("#ov").innerHTML;
  chk("mostra o status do item", html.includes("3 - Blocking"));
  chk("e tem as abas de historico e observacoes",
      html.includes('data-t="h"') && html.includes('data-t="o"'));
  app.UI.fechar();
}
{
  /* A exportacao e o motivo de o visualizador existir: tem de sair inteira. */
  const app = visualizador();
  const saidas = [];
  app.ctx.URL = {createObjectURL:()=>"blob:x", revokeObjectURL(){}};
  app.ctx.Blob = class { constructor(p){ saidas.push(p.join("")); } };

  app.Export.csv(app.S.db.itens, {cols:["item","status"]});
  chk("o CSV sai", saidas.at(-1).includes("Actual Status"));
  const doc = app.Export.documento(app.S.db.itens,"Quadro",
    {...app.Export.opcoes(), layout:"kanban", cols:["item","status"]});
  chk("e o relatorio em quadro tambem", doc.includes('class="quadro"'));
  chk("com a capa dizendo de onde veio", doc.includes("StatusMilestone"));
}
{
  /* O nome so serve ao rodape do relatorio; o visualizador nao pergunta. */
  const app = carregarApp({arquivo:VISUALIZADOR, autor:""});
  app.ctx.prompt = ()=>{ throw new Error("PERGUNTOU O NOME"); };
  let e=null; try{ app.Usuario.garantir(); }catch(x){ e=x; }
  chk("nao pergunta o nome de ninguem", e===null, e? String(e.message):"");
  igual("e aceita nao ter nome", app.Usuario.garantir(), "");
}
{
  /* O visualizador e GERADO: se o index mudar e ninguem regerar, ele passa a
     mentir sobre o estado da base. O teste falha antes que isso saia do repo. */
  const { execFileSync } = await import("node:child_process");
  let saida="", erro=null;
  try{ saida = execFileSync("python3",
        ["ferramentas/gerar_visualizador.py","--conferir"],{encoding:"utf8"}); }
  catch(e){ erro = e; }
  chk("docs/visualizador.html esta em dia com docs/index.html", erro===null,
      erro? String(erro.stdout||erro.message).split("\n")[0] : saida.trim());
}

secao("21. APARENCIA DO QUADRO: DENSIDADE, ESCALA E CSS PROPRIO");
{
  const c = cenario({semPasta:true});
  const {app} = c;
  const base = {...app.Export.opcoes(), layout:"kanban", cols:["item","status","inspType","description"]};
  const doc = d => app.Export.documento(app.S.db.itens, "Q", {...base, ...d});

  /* Cada densidade muda o CSS, e a etiqueta e a unica que esconde os campos -
     e dela que sai o quadro de uma pagina so. */
  const completo = doc({kanbanDensidade:"completo"});
  const compacto = doc({kanbanDensidade:"compacto"});
  const etiqueta = doc({kanbanDensidade:"etiqueta"});
  chk("completo mantem os rotulos dos campos", !/\.cartao \.campo b \{ display:none/.test(completo));
  chk("compacto esconde os rotulos", /\.cartao \.campo b \{ display:none/.test(compacto));
  chk("etiqueta esconde o campo inteiro", /\.cartao \.campo \{ display:none/.test(etiqueta));
  chk("e poe as etiquetas lado a lado", /\.cartoes \{ flex-direction:row/.test(etiqueta));
  chk("mas o codigo do item continua em todas",
      [completo,compacto,etiqueta].every(d=>d.includes("A-001")));

  /* A escala e uma variavel so: o resto esta em em e acompanha. */
  const m = d => (d.match(/--q:([\d.]+)px/)||[])[1];
  igual("escala 100 da o tamanho base", m(doc({kanbanEscala:100})), "11.00");
  igual("escala 70 encolhe proporcionalmente", m(doc({kanbanEscala:70})), "7.70");
  igual("escala 140 aumenta", m(doc({kanbanEscala:140})), "15.40");
  igual("valor fora da faixa e preso no limite", m(doc({kanbanEscala:5})), "6.60");
  igual("e o limite de cima tambem", m(doc({kanbanEscala:9999})), "15.40");

  /* Colunas: automatico nao fixa a contagem, um numero fixa. */
  chk("automatico deixa as colunas se acomodarem",
      /grid-template-columns:repeat\(auto-fit/.test(doc({kanbanColunas:"auto"})));
  chk("um numero fixa a contagem",
      /grid-template-columns:repeat\(3, minmax/.test(doc({kanbanColunas:3})));
  chk("numero absurdo e preso no limite",
      /grid-template-columns:repeat\(10, minmax/.test(doc({kanbanColunas:99})));
}
{
  /* O CSS de quem exporta tem de entrar DEPOIS do nosso: e o que faz ele
     vencer sem precisar de !important. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const o = {...app.Export.opcoes(), layout:"kanban", cols:["item","status"],
             cssExtra:".cartao { border-left-width:6px }"};
  const doc = app.Export.documento(app.S.db.itens, "Q", o);
  chk("o CSS proprio sai no documento", doc.includes("border-left-width:6px"));
  chk("e depois do estilo padrao",
      doc.indexOf("border-left-width:6px") > doc.lastIndexOf(".cartao .id {"));
  chk("com um comentario dizendo de onde veio", /ajustes de quem exportou/.test(doc));

  /* Vale para a tabela tambem - e a mesma moldura. */
  const tab = app.Export.documento(app.S.db.itens, "T",
    {...o, layout:"tabela", cssExtra:"td { font-size:7px }"});
  chk("o CSS proprio tambem vale na tabela", tab.includes("td { font-size:7px }"));

  /* Fechar a tag <style> seria a unica saida dali: nao pode passar. */
  const mau = app.Export.documento(app.S.db.itens, "Q",
    {...o, cssExtra:"</style><script>roubar()<\/script>"});
  chk("nao da para fechar o <style> pelo CSS proprio",
      !/<\/style><script>roubar/.test(mau));
  chk("o documento continua com um <style> so",
      (mau.match(/<style>/g)||[]).length === 1);
  const vazio = app.Export.documento(app.S.db.itens, "Q", {...o, cssExtra:""});
  chk("sem CSS proprio nao sobra comentario a toa", !/ajustes de quem exportou/.test(vazio));
  igual("texto gigante e cortado", app.Export.cssDoUsuario("a".repeat(30000)).length, 20000);
}
{
  /* Os controles novos existem e estao ligados. */
  const app = carregarApp();
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Sync.parar();
  app.Export.guardarOpcoes({...app.Export.opcoes(), layout:"kanban"});
  app.Export.painel(app.S.db.itens, "Itens");
  for(const id of ["xKdens","xKescala","xKcols","xCss","xKdica"])
    chk(`o controle ${id} esta na janela`, !!app.$("#"+id)?.id);
  chk("o cursor de tamanho atualiza o valor ao lado",
      typeof app.$("#xKescala")?.oninput === "function");
  chk("e ha o botao que mede as paginas", typeof app.$("#xPrever")?.onclick === "function");
  /* O resultado vai ao lado do botao: substituir o bloco inteiro apagava o
     proprio botao, e so dava para prever uma vez. */
  chk("com um lugar proprio para o resultado, que nao apaga o botao",
      !!app.$("#xKdicaR")?.id);
  app.UI.fechar();
}
{
  /* Os PADROES e a LEITURA da janela sao um caminho proprio: passar as opcoes
     direto para Export.documento, como fazem os testes acima, nao exercita
     nenhum dos dois. Foi por isso que uma edicao perdida nos padroes passou
     despercebida ate o navegador. */
  const app = carregarApp();
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Sync.parar();
  app.ctx.localStorage.removeItem("sm.exportOpc");

  const padrao = app.Export.opcoes();
  igual("o padrao do cartao e o compacto", padrao.kanbanDensidade, "compacto");
  igual("o da escala e 100", padrao.kanbanEscala, 100);
  igual("o das colunas e automatico", padrao.kanbanColunas, "auto");
  igual("e o CSS proprio nasce vazio", padrao.cssExtra, "");

  /* Mexer nos controles e SAIR pelo botao: e esse caminho (lerOpcoes +
     guardarOpcoes) que nenhum outro teste percorria. */
  let saida = null;
  app.ctx.URL = {createObjectURL:()=>"blob:x", revokeObjectURL(){}};
  app.ctx.Blob = class { constructor(p){ saida = p.join(""); } };
  app.Export.painel(app.S.db.itens, "Itens");
  app.$("#xLayout").value  = "kanban";
  app.$("#xKdens").value   = "etiqueta";
  app.$("#xKescala").value = "70";
  app.$("#xKcols").value   = "3";
  app.$("#xKquebra").value = "pagina";
  app.$("#xAgrupar").value = "inspType";
  app.$("#xCss").value     = ".cartao { border-left-width:6px }";
  /* os botoes do rodape da janela, na ordem: CSV, Excel, JSON, HTML, PDF */
  app.$("#mb3").onclick();

  const g = app.Export.opcoes();
  igual("a densidade escolhida foi guardada", g.kanbanDensidade, "etiqueta");
  igual("a escala tambem", g.kanbanEscala, 70);
  igual("as colunas tambem", g.kanbanColunas, 3);
  igual("o agrupamento tambem", g.kanbanAgrupar, "inspType");
  igual("a quebra tambem", g.kanbanQuebra, "pagina");
  igual("o CSS proprio tambem", g.cssExtra, ".cartao { border-left-width:6px }");
  igual("e o formato", g.layout, "kanban");
  chk("o documento gerado usa a escala escolhida", /--q:7\.70px/.test(saida||""));
  chk("sai como quadro, nao tabela", (saida||"").includes('class="quadro"'));
  chk("e leva o CSS proprio", (saida||"").includes("border-left-width:6px"));

}

secao("22. SOMENTE EM ABERTO E O AJUSTE PARA CABER");
{
  /* O recorte e da EXPORTACAO: tem de valer igual nos cinco formatos, senao o
     CSV e o relatorio contam coisas diferentes. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const abertos = app.S.db.itens.filter(i=>app.R.aberto(i.status)).map(i=>i.item).sort();
  const fechados = app.S.db.itens.filter(i=>!app.R.aberto(i.status));
  chk("a base de teste tem dos dois", abertos.length>0 && fechados.length>0,
      `${abertos.length} abertos, ${fechados.length} fechados`);

  igual("recorte() usa a mesma regra dos paineis",
        app.Export.recorte(app.S.db.itens,{somenteAberto:true}).map(i=>i.item).sort(), abertos);
  igual("e desligado nao mexe na lista",
        app.Export.recorte(app.S.db.itens,{somenteAberto:false}).length, app.S.db.itens.length);

  const saidas = [];
  app.ctx.URL = {createObjectURL:()=>"blob:x", revokeObjectURL(){}};
  app.ctx.Blob = class { constructor(p){ saidas.push(p.join("")); } };
  const o = {cols:["item","status"], somenteAberto:true};

  app.Export.csv(app.S.db.itens, o);
  const linhasCSV = saidas.at(-1).trim().split("\r\n").length - 1;
  igual("o CSV traz so os em aberto", linhasCSV, abertos.length);

  app.Export.json(app.S.db.itens, o);
  igual("o JSON tambem", JSON.parse(saidas.at(-1)).total, abertos.length);

  app.Export.excel(app.S.db.itens, "x", o);
  for(const i of fechados)
    chk(`o Excel nao traz o validado ${i.item}`, !saidas.at(-1).includes(">"+i.item+"<"));

  const doc = app.Export.documento(app.S.db.itens, "P", {...app.Export.opcoes(), ...o, layout:"kanban"});
  for(const i of fechados)
    chk(`o quadro nao traz o validado ${i.item}`, !doc.includes(">"+i.item+"<"));
  for(const it of abertos) chk(`o quadro traz o pendente ${it}`, doc.includes(it));
  chk("e a capa diz que o recorte e so o que esta em aberto", /somente em aberto/.test(doc));

  /* O resumo e calculado DENTRO de cada formato: tem de enxergar o recorte. */
  chk("o resumo conta o recorte, nao a base inteira",
      doc.includes(`(${abertos.length})`) || doc.includes(`\u00b7 ${abertos.length} `),
      `esperava ${abertos.length} itens`);
}
{
  /* A escada de ajuste: para no PRIMEIRO degrau que couber, entao entrega o
     cartao mais legivel possivel, nao o menor. A medicao de verdade exige
     navegador (iframe), entao aqui ela e trocada por uma regua de mentira e o
     que se testa e a DECISAO. */
  const c = cenario({semPasta:true});
  const {app} = c;
  const pedidos = [];
  /* regua: completo=4 paginas, compacto=2, etiqueta=1, e a escala reduz junto */
  app.Export.previsaoPaginas = async (lista, titulo, o)=>{
    pedidos.push({d:o.kanbanDensidade, e:o.kanbanEscala, resumo:o.resumo});
    const base = {completo:4, compacto:2, etiqueta:1}[o.kanbanDensidade];
    const paginas = Math.max(1, Math.ceil(base * (o.kanbanEscala/100) + (o.resumo?1:0)));
    return {paginas, cortaNaLargura:false};
  };
  const r = await app.Export.ajustarParaCaber(app.S.db.itens, "P",
    {cols:["item","status"], resumo:true});
  chk("encontrou um arranjo que cabe", !r.naoCoube, JSON.stringify(r.melhor||{}));
  igual("e cabe mesmo em uma pagina", r.paginas, 1);
  igual("com o resumo desligado, porque com ele nao cabia", r.semResumo, true);
  chk("tentou os mais legiveis antes", pedidos[0].d==="completo" && pedidos[0].e===100);
  chk("e so desligou o resumo depois de esgotar a escada com ele",
      pedidos.filter(p=>p.resumo).length === app.Export.ESCADA.length,
      `${pedidos.filter(p=>p.resumo).length} com resumo`);
  chk("o rotulo do degrau e legivel para quem le a tela",
      /^(Completo|Compacto|Etiqueta) \d+%$/.test(app.Export.rotuloDegrau(r.degrau)),
      app.Export.rotuloDegrau(r.degrau));

  /* Quando o cartao completo ja cabe, e ele que deve sair - nao a etiqueta. */
  app.Export.previsaoPaginas = async ()=>({paginas:1, cortaNaLargura:false});
  const facil = await app.Export.ajustarParaCaber(app.S.db.itens, "P", {cols:["item"], resumo:true});
  igual("cabendo de primeira, fica o cartao completo", facil.degrau.kanbanDensidade, "completo");
  igual("no tamanho cheio", facil.degrau.kanbanEscala, 100);
  igual("e sem precisar tirar o resumo", facil.semResumo, false);

  /* Nada cabe: dizer isso, e nao entregar um quadro cortado como se coubesse. */
  app.Export.previsaoPaginas = async ()=>({paginas:9, cortaNaLargura:false});
  const nao = await app.Export.ajustarParaCaber(app.S.db.itens, "P", {cols:["item"]});
  chk("quando nada cabe, avisa em vez de fingir", nao.naoCoube===true);
  igual("e diz quantas paginas o melhor caso daria", nao.melhor.paginas, 9);

  /* Um arranjo que corta na largura nao conta como "coube". */
  app.Export.previsaoPaginas = async ()=>({paginas:1, cortaNaLargura:true});
  const corta = await app.Export.ajustarParaCaber(app.S.db.itens, "P", {cols:["item"]});
  chk("cortar na largura nao vale como caber", corta.naoCoube===true);
}
{
  /* Os controles novos existem e estao ligados. */
  const app = carregarApp();
  app.ctx.toast = ()=>{}; app.ctx.marcarEstado = ()=>{};
  app.S.db = baseDeTeste(); app.normalizar(app.S.db);
  app.Store.dirHandle = pastaFalsa({database:JSON.stringify(app.S.db)});
  app.Sync.parar();
  app.ctx.localStorage.removeItem("sm.exportOpc");
  igual("por padrao a exportacao leva a base inteira",
        app.Export.opcoes().somenteAberto, false);
  app.Export.painel(app.S.db.itens, "Itens");
  chk("a caixa de 'somente em aberto' esta na janela", !!app.$("#xAberto")?.id);
  chk("e o botao de ajustar para caber", typeof app.$("#xCaber")?.onclick === "function");
  app.$("#xAberto").checked = true;
  app.$("#mb2").onclick();                       /* JSON, que nao depende do iframe */
  igual("marcar a caixa fica guardado", app.Export.opcoes().somenteAberto, true);
}

console.log(falhas.length ? `\n${falhas.length} FALHA(S):\n  `+falhas.join("\n  ") : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);
