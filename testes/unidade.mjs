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

console.log(falhas.length ? `\n${falhas.length} FALHA(S):\n  `+falhas.join("\n  ") : "\nTudo certo.");
process.exit(falhas.length ? 1 : 0);
