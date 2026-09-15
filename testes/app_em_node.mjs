/* Carrega o proprio docs/index.html dentro do Node, sem navegador e sem build.
   Os blocos <script> da pagina publicada sao executados num contexto vm com um
   DOM minimo de mentira: e o codigo que vai para o GitHub Pages que e testado,
   nao uma copia. Assim nao existe caminho absoluto, Chromium fixo nem base real. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APP = path.join(RAIZ, "docs", "index.html");

/* --------------------------- DOM de mentira ---------------------------- */
function elemento(){
  const el = {
    nodeType:1, tagName:"DIV", id:"", className:"", innerHTML:"", outerHTML:"", textContent:"",
    value:"", checked:false, href:"", download:"", type:"", accept:"", files:[],
    style:new Proxy({},{get:(o,k)=>o[k]??"", set:(o,k,v)=>(o[k]=v,true)}),
    dataset:{}, children:[], parentElement:null, parentNode:null, offsetWidth:800, offsetHeight:600,
    scrollTop:0, scrollLeft:0, clientWidth:800, clientHeight:600,
    classList:{add(){},remove(){},toggle(){},contains(){return false}},
    append(){}, appendChild(x){return x}, prepend(){}, remove(){}, removeChild(x){return x},
    insertAdjacentHTML(){}, setAttribute(){}, removeAttribute(){}, getAttribute(){return null},
    hasAttribute(){return false}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true},
    querySelector(){return elemento()}, querySelectorAll(){return []}, closest(){return null},
    getBoundingClientRect(){return {x:0,y:0,top:0,left:0,right:0,bottom:0,width:0,height:0}},
    focus(){}, blur(){}, click(){}, scrollIntoView(){}, getContext(){return null}, cloneNode(){return elemento()},
  };
  /* qualquer propriedade nao prevista vira leitura vazia em vez de estourar */
  return new Proxy(el,{ get:(o,k)=> k in o ? o[k] : undefined, set:(o,k,v)=>(o[k]=v,true) });
}

function criarContexto(){
  const armazem = new Map();
  const doc = {
    documentElement:elemento(), body:elemento(), head:elemento(), title:"",
    createElement:()=>elemento(), createElementNS:()=>elemento(), createTextNode:()=>elemento(),
    createDocumentFragment:()=>elemento(),
    querySelector:()=>elemento(), querySelectorAll:()=>[], getElementById:()=>elemento(),
    getElementsByClassName:()=>[], addEventListener(){}, removeEventListener(){},
    execCommand(){return true}, hasFocus(){return true},
  };
  const ctx = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams, Blob, performance, Intl,
    document:doc, navigator:{userAgent:"node", language:"pt-BR", clipboard:{writeText:async()=>{}}},
    location:{href:"file:///index.html", hash:"", reload(){}},
    history:{ replaceState(_a,_b,url){ ctx.location.hash = String(url||"").replace(/^[^#]*/,""); },
              pushState(){}, back(){}, forward(){} },
    localStorage:{ getItem:k=>armazem.has(k)?armazem.get(k):null, setItem:(k,v)=>armazem.set(k,String(v)),
                   removeItem:k=>armazem.delete(k), clear:()=>armazem.clear() },
    /* IndexedDB sempre indisponivel: o app ja trata isso (IDB.get/set devolvem null),
       e o espelho nao e o alvo destes testes. */
    indexedDB:{ open(){ const r={}; setTimeout(()=>r.onerror&&r.onerror(),0); return r; } },
    addEventListener(){}, removeEventListener(){}, matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
    requestAnimationFrame:fn=>setTimeout(()=>fn(Date.now()),0), cancelAnimationFrame:clearTimeout,
    getComputedStyle:()=>({getPropertyValue:()=>""}),
    confirm:()=>true, prompt:()=>"Teste", alert(){}, print(){}, open(){return null},
    devicePixelRatio:1, innerWidth:1400, innerHeight:900, scrollTo(){},
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  return ctx;
}

/* Executa os blocos <script> inline da pagina, na ordem, num escopo compartilhado. */
export function carregarApp({autor="Teste", confirmar=()=>true}={}){
  const html = fs.readFileSync(APP,"utf8");
  const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  if(!blocos.length) throw new Error("nenhum bloco <script> encontrado em docs/index.html");
  const ctx = criarContexto();
  ctx.confirm = confirmar;
  ctx.localStorage.setItem("sm.autor", autor);
  vm.createContext(ctx);
  blocos.forEach((codigo,i)=>vm.runInContext(codigo, ctx, {filename:`docs/index.html <script ${i+1}>`}));
  /* os modulos sao declarados com const, que no escopo lexico global de um script
     classico nao vira propriedade de globalThis: buscamos as referencias aqui. */
  const nomes = ["IDB","Store","Usuario","S","R","Pend","Sync","M","G","Render","UI","Export","hoje","agora","T","Filtros","FiltroURL","Visita","ROTAS"];
  const app = vm.runInContext(`({${nomes.join(",")}})`, ctx);
  app.ctx = ctx;
  app.avaliar = codigo => vm.runInContext(codigo, ctx);
  app.normalizar = ctx.normalizar;
  app.baseVazia = ctx.baseVazia;
  return app;
}

/* ------------------- pasta de mentira (File System Access) --------------
   Reproduz o pouco da API que o Store usa: getFileHandle / getDirectoryHandle /
   createWritable / write / close / abort. Serve para injetar falhas (permissao,
   JSON invalido, erro no writer) e para contar quantos writers ficam abertos ao
   mesmo tempo - que e como se verifica que as gravacoes estao serializadas.
   `falhas` aceita true (sempre falha) ou um numero (falha N vezes).           */
export function pastaFalsa({database=null, falhas={}}={}){
  const raiz = {writersAbertos:0, maxWriters:0, escritas:[], falhas:{...falhas}, seq:0};
  const erro = (nome,msg)=>{ const e=new Error(msg); e.name=nome; return e; };
  const consumir = chave=>{
    const v = raiz.falhas[chave];
    if(!v) return false;
    if(typeof v==="number"){ raiz.falhas[chave] = v-1; return v>0; }
    return true;
  };
  const respirar = ()=>new Promise(r=>setTimeout(r,5));   /* da chance de interleaving */

  function criarDir(nome){
    const arquivos = new Map(), mtimes = new Map(), subs = new Map();
    const dir = {
      kind:"directory", name:nome, arquivos, mtimes, subs,
      async getDirectoryHandle(n,{create=false}={}){
        if(!subs.has(n)){
          if(!create) throw erro("NotFoundError",`pasta ${n} não existe`);
          if(consumir("criarPastaBackups")) throw erro("NotAllowedError","sem permissão na subpasta");
          subs.set(n, criarDir(n));
        }
        return subs.get(n);
      },
      async getFileHandle(n,{create=false}={}){
        if(!arquivos.has(n)){
          if(!create) throw erro("NotFoundError",`${n} não existe`);
          arquivos.set(n,""); mtimes.set(n, ++raiz.seq);
        }
        return {
          kind:"file", name:n,
          async getFile(){
            if(consumir("permissaoLeitura")) throw erro("NotAllowedError","sem permissão de leitura");
            if(consumir("falhaLeitura"))     throw erro("NotReadableError","falha de leitura");
            const texto = arquivos.get(n);
            return { lastModified: mtimes.get(n) ?? 0, size: texto.length, text: async()=>texto };
          },
          async createWritable(){
            if(consumir("createWritable")) throw erro("NotAllowedError","não foi possível abrir para escrita");
            raiz.writersAbertos++;
            raiz.maxWriters = Math.max(raiz.maxWriters, raiz.writersAbertos);
            let buffer = "", aberto = true;
            const soltar = ()=>{ if(aberto){ aberto=false; raiz.writersAbertos--; } };
            return {
              async write(t){ await respirar();
                if(consumir("write")){ soltar(); throw erro("NotAllowedError","falha ao escrever"); }
                buffer = t; },
              async close(){ await respirar();
                if(consumir("close")){ soltar(); throw erro("AbortError","falha ao fechar"); }
                arquivos.set(n, buffer); mtimes.set(n, ++raiz.seq);
                raiz.escritas.push({pasta:nome, arquivo:n}); soltar(); },
              async abort(){ soltar(); },
            };
          },
        };
      },
      async *entries(){ for(const [n] of arquivos) yield [n, {kind:"file",
        async getFile(){ return {size:arquivos.get(n).length, lastModified:mtimes.get(n)??0}; }}]; },
      async removeEntry(n){ arquivos.delete(n); },
      async queryPermission(){ return "granted"; },
      async requestPermission(){ return "granted"; },
    };
    return dir;
  }
  const dir = criarDir("base");
  if(database!=null){ dir.arquivos.set("database.json", database); dir.mtimes.set("database.json", ++raiz.seq); }
  dir.estado = raiz;
  dir.conteudo = ()=>dir.arquivos.get("database.json");
  dir.backups  = ()=>[...(dir.subs.get("backups")?.arquivos.keys() ?? [])];
  return dir;
}

/* Base sintetica e anonima: quatro itens, tres eventos, nenhum dado de projeto. */
export function baseDeTeste(){
  return {
    schemaVersion:1,
    meta:{criadoEm:"2026-01-05T08:00:00.000Z", atualizadoEm:"2026-01-20T09:00:00.000Z",
          revisao:7, ultimoAutor:"Ana", appVersion:"1.0.0", origem:"fixture"},
    config:{idioma:"pt", minutosConsolidacao:10, diasSemAtualizacao:30, diasAlertaAging:60, segundosSync:7,
      status:[{codigo:"1 - Validated by ICN",familia:"validado",ativo:true,ordem:1},
              {codigo:"2 - Not Blocking",familia:"ressalva",ativo:true,ordem:2},
              {codigo:"2 - Not Blocking - Downgraded",familia:"ressalva",ativo:false,ordem:3},
              {codigo:"3 - Blocking",familia:"bloqueado",ativo:true,ordem:5},
              {codigo:"4 - Under Analysis",familia:"analise",ativo:true,ordem:6},
              {codigo:"5 - Waiting Proof",familia:"prova",ativo:true,ordem:10}],
      familias:[], statusAbertoExcecoes:["1 - Validated by ICN","2 - Not Blocking","2 - Not Available Jx"],
      inspTypesFuncionais:["FUN"]},
    marcos:[{id:"m1",nome:"Marco 1",data:"2026-01-10",tipo:"relatorio"},
            {id:"m2",nome:"Marco 2",data:"2026-02-10",tipo:"relatorio"}],
    itens:[
      {item:"A-001", status:"3 - Blocking",            inspType:"B05", isB05:true,  originalJx:"J08", actualJx:"J08",
       evidence:"EV-001", numAndDescription:"10 - Função A", criadoEm:"2026-01-05",
       ultimaAlteracaoStatus:"2026-01-15", atualizadoEm:"2026-01-15T10:00:00.000Z", bigram:["AA"]},
      {item:"A-002", status:"1 - Validated by ICN",    inspType:"FUN", isB05:false, originalJx:"J08", actualJx:"J08",
       evidence:"EV-002", numAndDescription:"20 - Função B", criadoEm:"2026-01-05",
       ultimaAlteracaoStatus:"2026-01-18", atualizadoEm:"2026-01-18T10:00:00.000Z", bigram:["BB"]},
      {item:"A-003", status:"4 - Under Analysis",      inspType:"FUN", isB05:false, originalJx:"J08", actualJx:"J08",
       evidence:"EV-003", numAndDescription:"20 - Função B", criadoEm:"2026-01-05",
       ultimaAlteracaoStatus:"2026-01-12", atualizadoEm:"2026-01-12T10:00:00.000Z", bigram:["AA","BB"]},
      {item:"A-004", status:"2 - Not Blocking - Downgraded", inspType:"B05", isB05:true, originalJx:"J08", actualJx:"J08",
       evidence:"EV-004", numAndDescription:"30 - Função C", criadoEm:"2026-01-05",
       ultimaAlteracaoStatus:"2026-01-20", atualizadoEm:"2026-01-20T10:00:00.000Z", bigram:["CC"]},
    ],
    historico:[
      {id:"h1", item:"A-001", campo:"status", valorAnterior:"5 - Waiting Proof", valorNovo:"4 - Under Analysis",
       dataEfetiva:"2026-01-08", primeiraAlteracaoEm:"2026-01-08T09:00:00.000Z",
       consolidadoEm:"2026-01-08T09:10:00.000Z", autor:"Ana", origem:"manual", tipo:"status", observacao:""},
      {id:"h2", item:"A-001", campo:"status", valorAnterior:"4 - Under Analysis", valorNovo:"3 - Blocking",
       dataEfetiva:"2026-01-15", primeiraAlteracaoEm:"2026-01-15T09:00:00.000Z",
       consolidadoEm:"2026-01-15T09:10:00.000Z", autor:"Ana", origem:"manual", tipo:"status", observacao:""},
      {id:"h3", item:"A-002", campo:"status", valorAnterior:"4 - Under Analysis", valorNovo:"1 - Validated by ICN",
       dataEfetiva:"2026-01-18", primeiraAlteracaoEm:"2026-01-18T09:00:00.000Z",
       consolidadoEm:"2026-01-18T09:10:00.000Z", autor:"Bia", origem:"manual", tipo:"status", observacao:""},
    ],
    pendentes:[], observacoes:[], conflitos:[],
  };
}
