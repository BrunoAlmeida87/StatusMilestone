#!/usr/bin/env python3
"""Gera docs/visualizador.html a partir de docs/index.html.

O visualizador e a MESMA aplicacao com a escrita arrancada: mesmo motor de
dominio, mesmos graficos, mesma exportacao. Ele nao e uma copia mantida a mao
porque copia mantida a mao diverge -- em um mes o visualizador estaria contando
o Shipyard pelo campo errado enquanto o sistema conta pelo certo.

O que este script faz, em ordem:

  1. tira a marca e o titulo para "Visualizador";
  2. substitui os metodos de escrita do Store por uma recusa -- nao e so a
     interface que some, o caminho de codigo ate um writer deixa de existir;
  3. troca Pend, Sync, Lote, NovoItem e Arquivamento por cascas inertes, e
     arranca do Waiver os metodos que gravam -- ler e imprimir waiver fica,
     pedir e alterar nao;
  4. poe EDITAVEL em false -- e por essa constante que as telas sabem se
     devem oferecer o que altera a base -- e tira da interface o resto do que
     so servia para editar (item novo, selecao em lote, arrastar no kanban,
     salvar no detalhe, tela de Configuracoes);
  5. troca a abertura: em vez de pedir a pasta, le o database.json que estiver
     NA MESMA PASTA do arquivo .html.

Toda substituicao e ancorada num trecho exato do index.html e CONFERIDA: se uma
ancora deixar de existir porque o index mudou, o script para com erro em vez de
gerar um visualizador quebrado em silencio.

    python3 ferramentas/gerar_visualizador.py            # gera
    python3 ferramentas/gerar_visualizador.py --conferir # so confere que esta em dia
"""
import re
import sys
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ORIGEM = RAIZ / "docs" / "index.html"
DESTINO = RAIZ / "docs" / "visualizador.html"

_aplicadas = []


def troca(s, velho, novo, nome, vezes=1):
    """Substituicao ancorada. Erra alto se a ancora sumiu do index.html."""
    achadas = s.count(velho)
    if achadas != vezes:
        raise SystemExit(
            f"ERRO em '{nome}': a ancora aparece {achadas}x no index.html, "
            f"esperava {vezes}x.\n\nTrecho procurado:\n{velho[:400]}\n\n"
            "O index.html mudou. Ajuste ferramentas/gerar_visualizador.py."
        )
    _aplicadas.append(nome)
    return s.replace(velho, novo)


def troca_modulo(s, nome_modulo, novo, nome):
    """Troca um modulo de topo inteiro: de 'const X = {' ate o '};' na coluna 0."""
    ini = re.search(r"^const %s\s*=\s*\{" % re.escape(nome_modulo), s, re.M)
    if not ini:
        raise SystemExit(f"ERRO em '{nome}': modulo {nome_modulo} nao encontrado.")
    fim = re.search(r"^\};$", s[ini.start():], re.M)
    if not fim:
        raise SystemExit(f"ERRO em '{nome}': fim do modulo {nome_modulo} nao encontrado.")
    _aplicadas.append(nome)
    return s[:ini.start()] + novo + s[ini.start() + fim.end():]


def _bloco_modulo(s, nome_modulo, nome):
    """Onde comeca e onde acaba um modulo de topo, no texto."""
    ini = re.search(r"^const %s\s*=\s*\{" % re.escape(nome_modulo), s, re.M)
    if not ini:
        raise SystemExit(f"ERRO em '{nome}': modulo {nome_modulo} nao encontrado.")
    fim = re.search(r"^\};$", s[ini.start():], re.M)
    if not fim:
        raise SystemExit(f"ERRO em '{nome}': fim do modulo {nome_modulo} nao encontrado.")
    return ini.start(), ini.start() + fim.end()


def troca_metodo_em(s, nome_modulo, nome_metodo, novo, nome):
    """Troca um metodo DENTRO de um modulo.

    Diferente de troca_metodo, que procura no arquivo inteiro: 'painel' existe
    no Waiver e no Export, e trocar o primeiro que aparece arrancaria a janela
    de exportacao do visualizador sem ninguem notar.
    """
    a, b = _bloco_modulo(s, nome_modulo, nome)
    trecho = s[a:b]
    ini = re.search(r"^  (?:async )?%s\(" % re.escape(nome_metodo), trecho, re.M)
    if not ini:
        raise SystemExit(f"ERRO em '{nome}': {nome_modulo}.{nome_metodo} nao encontrado.")
    fim = re.search(r"^  \},$", trecho[ini.start():], re.M)
    if not fim:
        raise SystemExit(f"ERRO em '{nome}': fim de {nome_modulo}.{nome_metodo} nao encontrado.")
    _aplicadas.append(nome)
    return s[:a] + trecho[:ini.start()] + novo + trecho[ini.start() + fim.end():] + s[b:]


def troca_metodo(s, nome_metodo, novo, nome):
    """Troca um metodo do Store: de '  nome(' ate o '  },' na indentacao de 2."""
    ini = re.search(r"^  (?:async )?%s\(" % re.escape(nome_metodo), s, re.M)
    if not ini:
        raise SystemExit(f"ERRO em '{nome}': metodo {nome_metodo} nao encontrado.")
    fim = re.search(r"^  \},$", s[ini.start():], re.M)
    if not fim:
        raise SystemExit(f"ERRO em '{nome}': fim de {nome_metodo} nao encontrado.")
    _aplicadas.append(nome)
    return s[:ini.start()] + novo + s[ini.start() + fim.end():]


# ----------------------------------------------------------------------------
# As cascas inertes. Mantem a forma que as telas chamam, sem fazer nada.
# ----------------------------------------------------------------------------
CASCA_PEND = '''/* Casca inerte: o visualizador nao altera a base, entao nao ha pendencia,
   consolidacao nem autosave. Os metodos ficam porque as telas os chamam. */
const Pend = {
  diario:[], campoEditavel:[],
  alterar(){ toast(LANG==="pt"?"Esta é a tela de consulta — nada aqui altera a base"
                              :"This is the read-only viewer — nothing here changes the database","warn"); },
  registrar(){}, agendarAutosave(){}, async autosave(){}, varrer(){},
  consolidar(){}, consolidarTudo(){}, descartarUma(){ return false; },
  descartarTudo(){}, esquecerNoDiario(){}, desfazer(){}, iniciar(){},
};'''

CASCA_SYNC = '''/* Casca inerte: sem gravacao nao ha o que conciliar, e anunciar presenca
   exigiria escrever na pasta. O visualizador so le. */
const Sync = {
  ligado:false, presentes:[], editando:new Map(),
  segundos(){ return 0; }, iniciar(){}, parar(){}, async tick(){},
  receber(){ return "adotado"; }, reaplicar(){}, decidir(){},
  quemEdita(){ return []; }, meusItens(){ return []; },
  pintarEdicao(){}, async presenca(){}, sair(){}, slug(n){ return String(n||""); },
};'''

CASCA_LOTE = '''/* Casca inerte: a edicao em lote e edicao. */
const Lote = { barra(){ return ""; }, ligar(){} };'''


def main(conferir=False):
    s = ORIGEM.read_text(encoding="utf-8")
    extra = (RAIZ / "ferramentas" / "visualizador_shell.js").read_text(encoding="utf-8")

    # ---------------------------------------------------------------- 1. marca
    s = troca(s, "<title>StatusMilestone</title>",
              "<title>StatusMilestone — Visualizador</title>", "titulo")
    s = troca(s,
              '<div class="brand"><b>StatusMilestone</b>'
              '<span id="brandsub">J08 &middot; Fluxo de Evid&ecirc;ncias</span></div>',
              '<div class="brand"><b>StatusMilestone</b>'
              '<span id="brandsub">J08 &middot; Visualizador (somente leitura)</span></div>',
              "marca")

    # ------------------------------------------- 2. o Store perde a escrita
    recusa = ('    return Promise.reject(new Error("SOMENTE_LEITURA"));\n  },')
    for m in ["gravar", "_gravar", "_gravarTravado", "conferirGravacao", "backup",
              "_backup", "arquivarHistorico", "_arquivarHistorico",
              "limparBackupsAntigos", "restaurarBackup", "escreverTrava",
              "travar", "destravar", "enfileirar"]:
        s = troca_metodo(s, m, f"  {m}(){{\n{recusa}", f"store.{m}")

    # A pasta e aberta em modo de LEITURA: mesmo que algo tentasse escrever, o
    # navegador nao daria permissao para isso.
    s = troca(s, 'await showDirectoryPicker({mode:"readwrite", id:"statusmilestone"})',
              'await showDirectoryPicker({mode:"read", id:"statusmilestone"})',
              "picker em leitura")
    s = troca(s, 'if(await h.queryPermission({mode:"readwrite"}) === "granted")',
              'if(await h.queryPermission({mode:"read"}) === "granted")',
              "permissao guardada em leitura")
    s = troca(s, 'if(await h.requestPermission({mode:"readwrite"}) === "granted")',
              'if(await h.requestPermission({mode:"read"}) === "granted")',
              "pedido de permissao em leitura")

    # -------------------------------------------------- 3. modulos de edicao
    s = troca_modulo(s, "Pend", CASCA_PEND, "modulo Pend")
    s = troca_modulo(s, "Sync", CASCA_SYNC, "modulo Sync")
    s = troca_modulo(s, "Lote", CASCA_LOTE, "modulo Lote")
    s = troca_modulo(s, "NovoItem", "/* item novo: nao existe no visualizador */",
                     "modulo NovoItem")
    s = troca_modulo(s, "Arquivamento", "/* arquivamento: grava na pasta, nao existe aqui */",
                     "modulo Arquivamento")

    # O waiver continua inteiro para LER e IMPRIMIR - quem consulta precisa ver
    # que o item esta coberto por um pedido de dispensa, e poder imprimi-lo -,
    # mas o que grava sai.
    recusa_w = (
        '  {m}(){{ toast(LANG==="pt"'
        '?"Esta \u00e9 a tela de consulta \u2014 o waiver \u00e9 pedido no sistema"'
        '\n'
        '                        :"Read-only viewer \u2014 waivers are requested in the app","warn"); }},'
    )
    for m in ["painel", "guardar", "excluir", "aplicar", "salvarDaJanela"]:
        s = troca_metodo_em(s, "Waiver", m, recusa_w.format(m=m), f"waiver.{m}")

    # ------------------------------------------------- 4. interface de edicao
    # Uma constante decide, no arquivo inteiro, se as telas oferecem edicao.
    s = troca(s, "const EDITAVEL = true;", "const EDITAVEL = false;", "EDITAVEL em false")

    # Configuracoes sai do menu; entra "Sobre a base", que so mostra.
    s = troca(s, '  {id:"config",    ic:"⚙", t:"config"},\n',
              '  {id:"sobre",     ic:"ℹ", t:"sobre"},\n', "rota config")
    s = troca(s, '   config:"Configurações"', '   sobre:"Sobre a base"', "t.config pt")
    s = troca(s, '   config:"Settings"', '   sobre:"About"', "t.config en")

    # Botao de item novo no cabecalho dos Itens.
    s = troca(s,
              '    `<button class="btn" id="btnNovo" title="${LANG==="pt"?"Acrescentar um item à base":"Add an item to the database"}">'
              '+ ${LANG==="pt"?"Novo item":"New item"}</button>`+\n', "", "botao item novo")
    s = troca(s, '  $("#btnNovo").onclick=()=>NovoItem.painel();\n', "", "ligacao item novo")

    # Coluna de selecao da tabela: sem edicao em lote ela nao leva a lugar nenhum.
    s = troca(s,
              '      <th class="selcol"><input type="checkbox" id="selTodos" ${todosMarcados?"checked":""}\n'
              '        title="${LANG==="pt"?"Selecionar tudo que está filtrado":"Select everything filtered"}"></th>\n',
              "", "cabecalho da selecao")
    s = troca(s,
              '        <td class="selcol" data-r=""><input type="checkbox" data-sel="${esc(i.item)}" '
              '${S.selecao.has(i.item)?"checked":""}></td>\n', "", "celula da selecao")
    s = troca(s, '<colgroup><col style="width:34px">', "<colgroup>", "colgroup da selecao")
    s = troca(s, '`<tr><td colspan="${cols.length+1}">', '`<tr><td colspan="${cols.length}">',
              "colspan sem a selecao")

    # Barra de salvar / pendentes no topo.
    s = troca(s,
              '        <span id="pendBadge" class="pill" style="display:none;'
              'background:var(--chg);color:#4a3d00;border-color:var(--chg-line)"></span>\n',
              "", "cracha de pendentes")
    s = troca(s,
              '        <button class="btn" id="btnSaveNow" style="display:none" '
              'data-i="salvarAgora">Salvar altera&ccedil;&otilde;es agora</button>\n',
              "", "botao salvar agora")
    s = troca(s, '$("#btnSaveNow").onclick=()=>Pend.consolidarTudo();\n', "", "ligacao salvar agora")
    s = troca(s, '$("#pendBadge").onclick=()=>UI.painelPendentes();\n', "", "ligacao cracha")

    # Aviso de saida e Ctrl+S: nao ha nada por gravar.
    s = troca(s,
              'addEventListener("beforeunload",e=>{ Sync.sair(); if(S.sujo){ e.preventDefault(); e.returnValue=""; } });\n',
              "", "aviso de saida")
    s = troca(s,
              '  if((e.ctrlKey||e.metaKey)&&e.key==="s"){ e.preventDefault(); if(S.db) Pend.consolidarTudo(); }\n',
              "", "atalho ctrl+s")

    # Arrastar no kanban e o seletor de status do card.
    s = troca(s, "  Kanban.ligarArraste();\n", "", "arraste do kanban") \
        if "  Kanban.ligarArraste();\n" in s else s

    # Nome da pessoa: o visualizador nao registra autoria, entao nao pergunta.
    s = troca(s,
              '''  garantir(){
    let n = this.nome();
    while(!n){ n = (prompt(LANG==="pt"
      ? "Identifique-se (seu nome aparecerá no histórico das alterações):"
      : "Please identify yourself (your name is recorded in the change history):")||"").trim(); }
    localStorage.setItem("sm.autor", n); return n;
  },''',
              '''  /* O visualizador nao grava nada em nome de ninguem: nao pergunta o nome.
     O que a pessoa tiver posto no sistema continua valendo para o rodape dos
     relatorios que ela gerar daqui. */
  garantir(){ return this.nome(); },''',
              "sem pergunta de nome")

    # ---------------------------------------- 5. a abertura e o resto do shell
    s = troca(s, "\n(async function iniciar(){", "\n/* <<< abertura do visualizador >>> */\n(async function iniciarOriginal(){",
              "desativa a abertura original")
    # O fim do arquivo, nao o "</body></html>" que aparece dentro do template
    # do relatorio: o shell entra depois do ultimo </script>.
    fim = "\n</script>\n</body></html>"
    if not s.rstrip("\n").endswith(fim.strip("\n")):
        raise SystemExit("ERRO em 'shell do visualizador': o index.html nao termina "
                         "em </script></body></html> como esperado.")
    corte = s.rstrip("\n")[: -len("</body></html>")]
    s = corte + extra + "\n</body></html>\n"
    _aplicadas.append("shell do visualizador")

    if conferir:
        if not DESTINO.exists():
            raise SystemExit("ERRO: docs/visualizador.html nao existe. Rode sem --conferir.")
        if DESTINO.read_text(encoding="utf-8") != s:
            raise SystemExit(
                "ERRO: docs/visualizador.html esta desatualizado em relacao ao "
                "docs/index.html.\nRode: python3 ferramentas/gerar_visualizador.py")
        print(f"OK: visualizador em dia ({len(_aplicadas)} transformacoes conferidas).")
        return

    DESTINO.write_text(s, encoding="utf-8")
    print(f"docs/visualizador.html gerado ({len(s):,} bytes, "
          f"{len(_aplicadas)} transformacoes).")


if __name__ == "__main__":
    main(conferir="--conferir" in sys.argv)
