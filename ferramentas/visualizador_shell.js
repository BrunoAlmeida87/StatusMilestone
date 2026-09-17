<script>
"use strict";
/* ===================== o visualizador: so leitura =====================
   Este bloco substitui a abertura do sistema. Ele e injetado por
   ferramentas/gerar_visualizador.py no fim do arquivo gerado - nunca edite
   docs/visualizador.html a mao: ele e reescrito a cada geracao.            */

/* ------------------------- detalhe somente leitura -------------------- */
/* A janela do item perde os campos editaveis e os botoes de salvar. Continua
   com historico e observacoes, que e o que interessa a quem consulta. */
UI.salvarDetalhe = function(){};
UI.detalhe = function(itemId){
  const i = S.db?.itens.find(x=>x.item===itemId); if(!i) return;
  S.selecionado = itemId; S.cursor = itemId;
  const vizinhos = ordenar(itensFiltrados()).map(x=>x.item);
  const pos = vizinhos.indexOf(itemId);
  const hist = (S.db.historico||[]).filter(h=>h.item===itemId)
                .sort((a,b)=>b.dataEfetiva.localeCompare(a.dataEfetiva));
  const obs = (S.db.observacoes||[]).filter(o=>o.item===itemId)
                .sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));
  const cor = R.corDe(i.status);
  const aba = (id,txt)=>`<button data-t="${id}">${esc(txt)}</button>`;
  const linha = (k,v)=>`<dt>${esc(k)}</dt><dd>${v}</dd>`;

  UI.modal(`${LANG==="pt"?"Item":"Item"} ${itemId}`
    + (pos>=0 && vizinhos.length>1? `  (${pos+1}/${vizinhos.length})` : ""), `
    <div class="tabs">${aba("d",T("detalhes"))}${aba("h",T("historico"))}${aba("o",T("observacoes"))}</div>
    <div id="tp-d">
      <div class="rowflex" style="gap:10px;margin-bottom:12px">
        <span class="pill" style="background:${cor}18;color:${cor};border-color:${cor}55;font-size:13px">
          <i class="dot" style="background:${cor}"></i>${esc(i.status)}</span>
        <span class="muted">${LANG==="pt"?"há":"for"} ${R.diasSemAtualizacao(i)} ${LANG==="pt"?"dias":"days"}</span>
      </div>
      <dl class="kv">
        ${[["Evidence",esc(i.evidence)],["InspType",esc(i.inspType)],["Insp",esc(i.insp)],
           ["OriginalJx",esc(i.originalJx)],["ActualJx",esc(i.actualJx)],
           ["ActualJxDescription",esc(i.actualJxDescription)],
           ["Nº and Description",esc(i.numAndDescription)],["Description",esc(i.description)],
           ["Updated Status Obs",esc(i.updatedStatusObs)],["General Obs",esc(i.generalObs)],
           ["NCR's",esc(i.ncr)],["Tests",esc(i.tests)],["Performance",esc(i.performance)],
           ["Mode",esc(i.mode)],["Position AC",esc(i.positionAC)],
           ["HullPassageParts",esc(i.hullPassageParts)],
           ["Bigram",(i.bigram||[]).map(b=>`<span class="tag">${esc(b)}</span>`).join(" ")],
           ["SBR",esc(i.sbr)],
           [LANG==="pt"?"Criado em":"Created",esc(fmtD(i.criadoEm))],
           [LANG==="pt"?"Última mudança de status":"Last status change",esc(fmtD(i.ultimaAlteracaoStatus))],
        ].filter(([,v])=>v!=="" && v!=null).map(([k,v])=>linha(k,v)).join("")}
      </dl>
    </div>
    <div id="tp-h" hidden>${hist.length? `<table><thead><tr><th>${T("data")}</th><th>${T("campo")}</th>
      <th>${T("anterior")}</th><th>${T("novo")}</th><th>${T("autor")}</th></tr></thead><tbody>
      ${hist.map(h=>`<tr><td class="num">${fmtD(h.dataEfetiva)}</td><td>${esc(h.campo)}</td>
        <td>${h.valorAnterior?esc(h.valorAnterior):"—"}</td><td><b>${esc(h.valorNovo)}</b></td>
        <td>${esc(h.autor||"")}</td></tr>`).join("")}</tbody></table>`
      :`<div class="empty">${LANG==="pt"?"Sem histórico":"No history"}</div>`}</div>
    <div id="tp-o" hidden>${obs.map(o=>`<div class="panel pad" style="margin-bottom:8px">
        <div class="rowflex" style="justify-content:space-between;font-size:11px;color:var(--fg-3)">
          <b>${esc(o.autor||"")}</b><span>${fmtDT(o.criadoEm)}</span></div>
        <div style="margin-top:5px;white-space:pre-wrap">${esc(o.texto)}</div></div>`).join("")
        ||`<div class="empty">${LANG==="pt"?"Nenhuma observação":"No notes"}</div>`}</div>`,
    [...(vizinhos.length>1? [
      {txt:"‹ "+(LANG==="pt"?"Anterior":"Previous"),cls:"btn",fn:()=>UI.irrItem(-1)},
      {txt:(LANG==="pt"?"Próximo":"Next")+" ›",cls:"btn",fn:()=>UI.irrItem(1)}] : []),
     {txt:T("fechar"),cls:"btn pri",fn:()=>UI.fechar()}]);

  $$(".tabs button").forEach((b,k)=>{ if(!k) b.classList.add("on");
    b.onclick=()=>{ $$(".tabs button").forEach(x=>x.classList.remove("on")); b.classList.add("on");
      ["d","h","o"].forEach(t=>{ const el=$("#tp-"+t); if(el) el.hidden = t!==b.dataset.t; }); };});
};
/* Mover card no kanban e edicao. */
UI.moverPara = function(){ Pend.alterar(); };
UI.escolherStatus = function(){ Pend.alterar(); };

/* ------------------------- "Sobre a base" ----------------------------- */
/* No lugar de Configuracoes: o que a pessoa que consulta precisa saber e de
   quando e a informacao que esta vendo, e nada aqui muda a base. */
Render.sobre = function(){
  $("#pageTitle").textContent = T("sobre");
  $("#headerExtra").innerHTML = "";
  const m = S.db.meta || {}, c = S.db.config || {};
  const mb = R.tamanhoBase()/1048576;
  const ultimo = (S.db.historico||[]).map(h=>h.dataEfetiva).sort().pop();
  $("#view").innerHTML = `
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))">
    <div class="panel"><h3>${LANG==="pt"?"Esta base":"This database"}</h3><div class="pad">
      <dl class="kv">
        <dt>${LANG==="pt"?"Itens":"Items"}</dt><dd class="mono">${S.db.itens.length}</dd>
        <dt>${LANG==="pt"?"Em aberto":"Open"}</dt><dd class="mono">${
          S.db.itens.filter(i=>R.aberto(i.status)).length}</dd>
        <dt>${LANG==="pt"?"Revisão":"Revision"}</dt><dd class="mono">${esc(String(m.revisao ?? "—"))}</dd>
        <dt>${LANG==="pt"?"Gravada em":"Saved at"}</dt><dd>${esc(fmtDT(m.atualizadoEm))}</dd>
        <dt>${LANG==="pt"?"Por":"By"}</dt><dd>${esc(m.ultimoAutor||"—")}</dd>
        <dt>${LANG==="pt"?"Última mudança de status":"Last status change"}</dt>
          <dd>${ultimo? esc(fmtD(ultimo)) : "—"}</dd>
        <dt>${LANG==="pt"?"Eventos no histórico":"History events"}</dt><dd class="mono">${S.db.historico.length}</dd>
        <dt>${LANG==="pt"?"Tamanho":"Size"}</dt><dd class="mono">${mb.toFixed(2)} MB</dd>
        <dt>${LANG==="pt"?"Arquivo":"File"}</dt><dd class="mono" style="overflow-wrap:anywhere">${esc(Visualizador.origem||"—")}</dd>
      </dl>
      <div class="rowflex" style="margin-top:12px">
        <button class="btn pri" id="vRecarregar">${LANG==="pt"?"Recarregar a base":"Reload the database"}</button>
      </div>
    </div></div>

    <div class="panel"><h3>${LANG==="pt"?"O que esta tela é":"What this page is"}</h3><div class="pad">
      <p class="muted" style="line-height:1.8">${LANG==="pt"
        ? `Esta é a versão <b>somente leitura</b> do StatusMilestone. Ela abre o <b>database.json</b> que
           estiver na mesma pasta que este arquivo e mostra o estado atual: painéis, itens, quadro,
           fluxo de evidências, histórico e relatórios — tudo pode ser exportado.
           <b>Nada do que se faça aqui altera a base</b>: os comandos de gravação não existem neste
           arquivo, e a pasta é aberta em modo de leitura.<br><br>
           Para <b>registrar</b> uma mudança de status, use o sistema completo.`
        : `This is the <b>read-only</b> build of StatusMilestone. It opens the <b>database.json</b> sitting
           in the same folder as this file and shows the current state: panels, items, board, evidence
           flow, history and reports — all exportable.
           <b>Nothing done here changes the database</b>: the write routines are not in this file, and the
           folder is opened in read mode.<br><br>
           To <b>record</b> a status change, use the full system.`}</p>
    </div></div>

    <div class="panel"><h3>${LANG==="pt"?"Status e regra de “em aberto”":"Statuses and the “open” rule"}</h3>
      <div class="pad" style="max-height:340px;overflow:auto">
      ${(c.status||[]).map(st=>`<div class="rowflex" style="gap:8px;padding:3px 0;border-bottom:1px solid var(--line-2)">
        <i class="dot" style="background:${R.corDe(st.codigo)}"></i>
        <span style="flex:1;font-size:12px">${esc(st.codigo)}</span>
        <span class="tag">${R.aberto(st.codigo)? (LANG==="pt"?"em aberto":"open") : (LANG==="pt"?"fechado":"closed")}</span>
        <span class="muted mono" style="font-size:10.5px">${S.db.itens.filter(i=>i.status===st.codigo).length}</span>
      </div>`).join("")}</div></div>
  </div>`;
  const b=$("#vRecarregar"); if(b) b.onclick=()=>Visualizador.recarregar();
};
Render.config = Render.sobre;

/* ------------------------- a abertura ---------------------------------- */
const Visualizador = {
  origem:"",

  /* Caminho 1: buscar o database.json ao lado do arquivo. Funciona quando a
     pagina e servida por http(s) - intranet, GitHub Pages, um "python3 -m
     http.server" na pasta. Em file:// o proprio navegador recusa a leitura de
     um arquivo vizinho (e regra de seguranca dele, nao limitacao daqui), e ai
     vale o caminho 2. */
  async pelaURL(){
    if(!location.protocol.startsWith("http")) return null;
    const url = new URL("database.json", location.href).href;
    const r = await fetch(url, {cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const db = await r.json();
    this.origem = url;
    return db;
  },

  /* Caminho 2: a pasta autorizada uma vez fica guardada no navegador e volta
     sozinha nas proximas aberturas - e o que faz o duplo-clique funcionar sem
     perguntar nada a partir da segunda vez. */
  async pelaPasta({pedir=false}={}){
    if(!Store.suportado) return null;
    let ok = !!Store.dirHandle;
    if(!ok) ok = await Store.restaurarHandle();
    if(!ok && Store.dirHandlePendente) ok = await Store.pedirPermissaoSalva();
    if(!ok && pedir){ await Store.escolherPasta(); ok = !!Store.dirHandle; }
    if(!ok) return null;
    const db = await Store.lerArquivo();
    this.origem = (Store.dirHandle?.name || "") + "/database.json";
    return db;
  },

  aceitar(db){
    const val = validarBase(db);
    if(!val.valido){ UI.baseRecusada("database.json", val, JSON.stringify(db,null,1)); return false; }
    S.db = db;
    normalizar(S.db);
    Caminho.sincronizarDaBase();
    S.novidades = null;
    marcarEstado(LANG==="pt"?"base carregada (somente leitura)":"database loaded (read-only)","info");
    return true;
  },

  async abrir({pedir=false, silencioso=false}={}){
    let db=null, erro=null;
    try{ db = await this.pelaURL(); }catch(e){ erro = e; }
    if(!db){ try{ db = await this.pelaPasta({pedir}); }catch(e){ erro = erro||e; } }
    if(!db) return this.telaAbertura(erro);
    if(!this.aceitar(db)) return;
    irPara(S.rotaInicial || "dashboard"); S.rotaInicial = null;
    if(!silencioso) toast(`${S.db.itens.length} ${LANG==="pt"?"itens carregados":"items loaded"}`,"ok");
  },

  async recarregar(){
    try{
      const db = await this.pelaURL().catch(()=>null) || await this.pelaPasta();
      if(!db) return toast(LANG==="pt"?"Não consegui reler a base":"Could not re-read the database","bad");
      if(!this.aceitar(db)) return;
      R.invalidarHist(); Render.atual();
      toast(LANG==="pt"?"Base recarregada":"Database reloaded","ok");
    }catch(e){ toast(mensagemArmazenamento(e),"bad"); }
  },

  /* So aparece quando o carregamento automatico nao deu - e diz por que. */
  telaAbertura(erro){
    $("#pageTitle").textContent = "StatusMilestone";
    $("#headerExtra").innerHTML = "";
    const arquivo = location.protocol === "file:";
    $("#view").innerHTML = `<div class="panel pad" style="max-width:660px;margin:36px auto">
      <h3 style="border:0;padding:0;text-transform:none;font-size:17px;letter-spacing:-.02em;color:var(--fg)">
        ${LANG==="pt"?"Escolha a pasta da base, uma vez":"Pick the database folder, once"}</h3>
      <p class="muted" style="margin:10px 0 16px;line-height:1.8">${LANG==="pt"
        ? `Este visualizador lê o <b>database.json</b> que estiver na <b>mesma pasta</b> que ele.
           ${arquivo? `Como o arquivo foi aberto por duplo clique (<code>file://</code>), o navegador não
           deixa a página ler o arquivo vizinho sozinha — é uma trava de segurança dele. Autorize a pasta
           uma vez no botão abaixo: <b>da próxima vez ela volta sozinha</b> e a base abre direto.`
           : `Não encontrei o arquivo ao lado desta página. Autorize a pasta onde ele está:`}`
        : `This viewer reads the <b>database.json</b> in its <b>own folder</b>.
           ${arquivo? `Because the file was opened by double-click (<code>file://</code>), the browser will
           not let the page read its neighbour on its own — that is their security rule. Authorize the
           folder once with the button below: <b>next time it comes back on its own</b>.`
           : `I could not find the file next to this page. Authorize the folder it is in:`}`}</p>
      ${Store.suportado
        ? `<button class="btn pri" id="vPasta">📁 ${LANG==="pt"?"Selecionar pasta da base":"Select database folder"}</button>
           <button class="btn" id="vArquivo">${LANG==="pt"?"Abrir database.json":"Open database.json"}</button>`
        : `<div class="panel pad" style="background:var(--panel-2);border-color:var(--warn)">
             <b style="color:var(--warn)">${LANG==="pt"?"Navegador sem seleção de pasta":"Browser without folder picking"}</b>
             <p class="muted" style="margin:8px 0 0">${LANG==="pt"
               ? "Neste navegador só dá para abrir o arquivo à mão. No Chrome ou no Edge, a pasta é lembrada e a base abre sozinha."
               : "In this browser you can only open the file by hand. In Chrome or Edge the folder is remembered and the database opens on its own."}</p></div>
           <div class="rowflex" style="margin-top:12px">
             <button class="btn pri" id="vArquivo">${LANG==="pt"?"Abrir database.json":"Open database.json"}</button></div>`}
      ${erro?`<p class="muted" style="font-size:11px;margin-top:14px">${LANG==="pt"?"Detalhe":"Detail"}: ${esc(String(erro.message||erro))}</p>`:""}
      <div class="sep"></div>
      <p class="muted" style="font-size:11.5px;line-height:1.7">${LANG==="pt"
        ? "Esta tela <b>só lê</b>. Para registrar alterações, use o sistema completo."
        : "This page is <b>read-only</b>. To record changes, use the full system."}</p>
    </div>`;
    const bp=$("#vPasta"); if(bp) bp.onclick=()=>this.abrir({pedir:true});
    const ba=$("#vArquivo"); if(ba) ba.onclick=()=>this.abrirArquivo();
  },

  abrirArquivo(){
    const inp=document.createElement("input"); inp.type="file"; inp.accept=".json";
    inp.onchange=async()=>{
      const f=inp.files[0]; if(!f) return;
      let db;
      try{ db = JSON.parse(await f.text()); }
      catch(e){ return toast((LANG==="pt"?"JSON inválido: ":"Invalid JSON: ")+e.message,"bad"); }
      this.origem = f.name;
      if(!this.aceitar(db)) return;
      irPara("dashboard");
      toast(`${S.db.itens.length} ${LANG==="pt"?"itens carregados":"items loaded"}`,"ok");
    };
    inp.click();
  },
};
/* O cracha de pendentes e o botao de salvar sairam do cabecalho: a versao
   original mexeria em elementos que nao existem mais neste arquivo. */
Render.badgePendentes = function(){};

/* Sem base carregada, a tela "sem base" do sistema falaria em gravar. */
Render.semBase = function(motivo){ Visualizador.telaAbertura(motivo? new Error(motivo) : null); };

(async function iniciarVisualizador(){
  aplicarTema();
  document.documentElement.lang = LANG==="pt"?"pt-BR":"en";
  Filtros.restaurar();
  Render.nav();
  await Visualizador.abrir();
})();
</script>
