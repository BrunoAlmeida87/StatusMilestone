# StatusMilestone — mapa para trabalhar neste repositório

Leia isto antes de abrir arquivos. O objetivo é ler **trechos**, nunca o arquivo inteiro.

## O que é

Painel de acompanhamento de itens de inspeção (marco J08). **Um único arquivo HTML
autocontido**, sem build, sem dependência remota, aberto direto do `file://` ou pelo
GitHub Pages. Os dados vivem num `database.json` numa pasta compartilhada, acessada
pela File System Access API (Chrome/Edge).

**Nenhum dado de projeto está versionado.** `.gitignore` bloqueia `*.csv`, `*.xlsx`,
`*.xlsb`, `*.xls`, `database*.json` e `/backups/`; o workflow do Pages falha o deploy
se algum deles aparecer em `docs/`.

## Mapa de `docs/index.html` (~3700 linhas, o sistema inteiro)

Para ler um módulo: `sed -n '394,676p' docs/index.html`.

| Linhas | Bloco | O que faz |
|---|---|---|
| 1–294 | `<style>` | tokens de cor em `:root`, tema claro/escuro, layout, tabela, kanban, modal |
| 295–338 | `T` / i18n | dicionários `pt` e `en`; `T("chave")` |
| 339–374 | utilitários | `esc`, `uid`, `corSegura`, `agora`, `hoje`, `diasEntre`, `toast`, `dl` |
| 375–392 | `IDB` | IndexedDB: handle da pasta + espelho da base (rede de recuperação) |
| 394–675 | **`Store`** | leitura/gravação, fila de escrita, **trava** (`travar`/`destravar`), conferência de revisão, **carimbo** (`conferirGravacao`), backups, arquivos de histórico |
| 677–701 | `Usuario` | nome em `localStorage` |
| 707–820 | **`R`** | regras de domínio: `aberto`, `statusEm`, `histStatus`, `marcoAnterior`, `mudouNoCiclo`, `corDe`, `familiaDe` |
| 822–866 | filtragem | `itensFiltrados`, `ordenar` |
| 867–1075 | **`Pend`** | pendências, `alterar`, `autosave`, `consolidar`, `varrer`, diário local (`diario`) |
| 1076–1136 | `Arquivamento` | move histórico antigo para `historico/*.json` deixando evento-marco |
| 1137–1356 | **`Sync`** | polling por mtime, `receber` (junção campo a campo), `decidir`, presença |
| 1363–1390 | `mensagemArmazenamento` | texto acionável para cada código de erro do `Store` |
| 1392–1715 | `M` / `G` | indicadores (KPIs, aging, comparações) e geradores de SVG |
| 1716–1940 | `Render` | navegação, dashboard, itens, kanban, fluxo, histórico, relatórios, config |
| 1941–2310 | `FiltroURL`, `Visita`, `Filtros`, `Colunas`, `Lote` | filtros como endereço, vistas salvas, colunas, edição em lote |
| 2312–2450 | `TecladoItens` | navegação por teclado na tabela |
| 2896–2996 | `validarBase`, `verificarIntegridade` | porta de entrada: nenhuma base inválida substitui a aberta |
| 2998–3493 | **`UI`** | modais, detalhe do item, conflitos, restauração, configurações |
| 3494–3585 | `Export` | CSV (com `seguro` contra formula injection), SpreadsheetML, impressão |
| 3586–3669 | `podarLogs`, `baseVazia`, `normalizar` | poda de logs técnicos e normalização de base carregada |

## Invariantes que não podem ser quebradas

1. **Nada de perda silenciosa.** Toda gravação passa por trava → conferência de
   revisão → `close()` → conferência de carimbo. Se o carimbo no arquivo não é o
   nosso, a gravação **não** é dada como salva e o diário fica de pé.
2. **O espelho no IndexedDB vem antes da pasta** em `Pend.autosave` — sem isso, o
   modo manual perde tudo.
3. **`validarBase` roda antes de qualquer adoção** de base (pasta, arquivo manual,
   espelho, backup, versão de outra pessoa).
4. **Arquivar grava o arquivo e confere antes** de tirar qualquer evento da base.
5. **A revisão nunca regride** — restaurar backup usa `Math.max`.
6. **Autocontido**: nenhum `src=`/`href=` remoto em `docs/index.html`.
7. **Todo valor vindo da base é escapado** (`esc`) ou sanitizado (`corSegura`) antes
   de virar HTML. Toda célula de CSV passa por `Export.seguro`.

## Pipeline de dados (fora do app)

```
extrair.py  →  dois CSV  →  migrar.py  →  database.json  →  validar.py
```

`migracao/migrar.py` é **a única porta de entrada de itens novos** — o app edita
itens existentes, não cria. Ele também semeia `marcos` (m1/m2/m3) e o histórico
inicial a partir das três datas de corte reais.

## Documentos

- `analise/02_DECISOES.md` — decisões de negócio (A*, C*, I*), citadas pelo código.
- `analise/03_ARQUITETURA_E_MODELO.md` — arquitetura, modelo de dados, telas.
- `analise/04_AUDITORIA.md` — auditoria: 14 erros corrigidos, riscos abertos, WCAG.

## Convenções

- Comentários de código em português **sem acentos**; texto de interface com acentos,
  sempre nos dois idiomas (`LANG==="pt" ? … : …`).
- Nomes de identificadores em português (`gravar`, `pendentes`, `carimbo`).
- Mensagens de erro do `Store` são códigos (`CONFLITO_REVISAO`, `GRAVACAO_PERDIDA`,
  `GRAVACAO_OCUPADA`, `BASE_MUDOU`, …) traduzidos em `mensagemArmazenamento`.
