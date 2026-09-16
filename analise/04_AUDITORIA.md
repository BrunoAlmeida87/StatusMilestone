# Auditoria profunda — StatusMilestone

Data: 2026-09-16 · Escopo: `docs/index.html`, `migracao/*.py`, `testes/*`, `README.md`,
`analise/01..03`, `.github/workflows/pages.yml`.

Método: leitura integral do código publicado; execução da suíte de unidade; construção de
bases sintéticas de borda (base sem `config.status`, item sem status, valor com HTML, cor
adulterada, relógio adiantado, histórico de 20 000 e 50 000 eventos, duas sessões gravando
sobre o mesmo arquivo); medição de tempo com `console.time` equivalente.

**Não se afirma aqui que “não existem erros”.** Cada conclusão está classificada.

---

## 0. O que foi executado

| Suíte | Resultado |
|---|---|
| `node testes/unidade.mjs` (antes) | 218/218 ✅ |
| `node testes/unidade.mjs` (depois das correções) | **266/266** ✅ (48 verificações novas) |
| `testes/comportamento.py`, `kanban_e_graficos.py`, `conflitos.py`, `sincronizacao.py` | **não executadas** — exigem `playwright` (ausente) e `SM_DATABASE` (a base real não vive no repositório, por decisão) |
| `migracao/validar.py` | **não executada** — exige um `database.json` real |

---

## 1. Erros comprovados

Todos reproduzidos por teste antes da correção e cobertos por regressão em
`testes/unidade.mjs` §17.

### E1 · Modo sem pasta perde todo o trabalho, em silêncio — **CRÍTICO (perda de dados)**
- **Arquivo/linhas:** `docs/index.html` — `Pend.autosave`, guarda de entrada.
- **Cenário:** abrir em Firefox/Safari (“Abrir database.json”) ou usar
  **Recuperar cópia local**; editar qualquer item; fechar o navegador.
- **Impacto:** `autosave` saía **antes** até do espelho no IndexedDB. Nada ia para o disco,
  nada ia para a cópia de socorro, e o crachá de estado ficava parado em `alterado...`.
  Toda a sessão de trabalho desaparecia.
- **Evidência:** `S.db.pendentes.length === 1`, `S.sujo === true`, `IDB.set("espelho")`
  chamado **0** vez.
- **Correção:** o espelho passa a ser gravado sempre (não depende da pasta) e o estado passa
  a dizer `sem pasta — só cópia local`.
- **Regressão:** §17 “sem pasta, a alteração ainda vai para a cópia local”.

### E2 · Restaurar backup apaga o trabalho de outra pessoa sem guardá-lo — **CRÍTICO (perda de dados)**
- **Arquivo/linhas:** `docs/index.html` — `UI.restaurar`.
- **Cenário:** A carrega a base (revisão 7). B grava a revisão 99 com um evento novo.
  A restaura um backup.
- **Impacto:** `Store.gravar(…,{forcar:true})` sem reler o disco. O backup
  `pre-restauracao` era da **memória de A**, não do que seria apagado: o trabalho de B
  sumia do disco **e** de todos os backups. Além disso `b.meta.revisao = S.db.meta.revisao`
  fazia a revisão **regredir** (99 → 8), e as outras sessões deixavam de reconhecer a base
  nova como mais recente.
- **Evidência:** evento `hX` de Maria ausente do disco e de **todos** os backups.
- **Correção:** relê o disco, faz backup **da versão do disco**, avisa nominalmente quando a
  revisão mudou e exige nova confirmação; a revisão só anda para a frente (`Math.max`).
- **Regressão:** §17 “restaurar guarda a versão do DISCO antes de apagá-la” e “a revisão gravada não regride”.

### E3 · `normalizar()` estoura em base válida sem `config.status` — **ALTO**
- **Arquivo/linhas:** `docs/index.html` — `normalizar`, laço `RECOR`.
- **Cenário:** `{"meta":{"revisao":1},"itens":[{"item":"X","status":"3 - Blocking"}]}` —
  passa em `validarBase` (por desenho: config não é obrigatória).
- **Impacto:** `for(const d of c.status)` rodava **antes** de `c.status ??= []`
  → `TypeError: c.status is not iterable`. Na abertura a base era recusada; dentro de
  `Sync.receber` a exceção escapava de `tick()`/`autosave()` como rejeição não tratada.
- **Correção:** as listas são garantidas antes de qualquer laço sobre elas.
- **Regressão:** §17 “base sem config.status passa na validação” / “e normalizar não estoura”.

### E4 · A sincronização morre calada após um conflito não-rebasável — **ALTO**
- **Arquivo/linhas:** `docs/index.html` — `Pend.autosave` (ramo `CONFLITO_REVISAO`),
  `Sync.decidir`, `UI.modal`/`UI.fechar`.
- **Cenário:** alterar Configurações (alteração não reaplicável) enquanto outra pessoa grava.
- **Impacto:** `Sync.receber` abria a tela de decisão e punha `Sync.ligado=false`; a linha
  seguinte abria `UI.conflitoGravacao`, que **fecha o modal anterior**. Os botões que
  devolviam `ligado=true` desapareciam. Resultado medido: `ligado` ficava `false` pelo resto
  da sessão — inclusive depois de `Sync.iniciar()` — e a sessão parava de ver o disco.
- **Evidência:** `Store.revisaoCarregada` continuava 7 com o disco em 43.
- **Correção:** deixa de empilhar as duas telas (a do Sync é mais útil: junta campo a campo)
  e `UI.modal` ganha `aoFechar`, que devolve o polling **sempre** que a janela sai — pelo ✕,
  pelo clique fora ou porque outra janela tomou o lugar.
- **Regressão:** §17 “fechar a tela devolve o polling”, “a pergunta volta em vez de sumir”,
  “depois de decidido, a sessão volta a enxergar o disco”.

### E5 · XSS na aba “Dados” do detalhe — **ALTO (segurança)**
- **Arquivo/linhas:** `docs/index.html` — `UI.detalhe`, `<div id="tp-x">`.
- **Cenário:** item cujo `description` (ou qualquer descritivo) contenha `<span`.
- **Impacto:** `${k==="Bigram"||String(v).includes("<span") ? v : esc(v)}` decidia escapar
  **pelo conteúdo do dado**. Qualquer valor com essa sequência entrava cru no DOM.
  `<span></span><img src=x onerror=…>` executava. Como a página guarda o *handle* da pasta,
  o script alcança a base inteira.
- **Evidência:** `<img src=x onerror=alert(1)>` presente cru no HTML do modal.
- **Correção:** cada valor é escapado na construção da lista; só as duas entradas que
  realmente são HTML (Bigram e o sufixo de `Mode`) continuam montadas como marcação.
- **Regressão:** §17b “a aba Dados não devolve HTML cru” / “mas mostra o texto ao usuário”.

### E6 · XSS pelas cores de `config.status` / `config.familias` — **ALTO (segurança)**
- **Arquivo/linhas:** `docs/index.html` — `R.corDe`, coluna de status, `linhaStatus`,
  `cardHTML`, `Render.kanban`, `Render.config`, `G.barras`, `G.barrasEmpilhadas`,
  `G.donut`, `G.fluxo`.
- **Cenário:** `config.status[n].cor = '#fff"><img src=x onerror=…><i style="'`.
- **Impacto:** a cor era interpolada crua dentro de `style="…"` e `fill="…"` em praticamente
  todo painel. Fecha o atributo e injeta HTML. O `database.json` fica numa **pasta de rede
  compartilhada** — não é um vetor hipotético.
- **Evidência:** `<img src=x onerror=alert(1)>` na tabela de itens, no Kanban e no dashboard.
- **Correção:** `corSegura()` — só passa o que é reconhecível como cor (`#hex`, palavra-chave,
  `var(--x)`, `rgb/rgba/hsl/hsla`); o resto vira cinza neutro. Aplicado no ponto único
  `R.corDe` (mais `R.corFamilia` para as cores de família) — nenhuma cor volta a ser lida
  direto de `f.cor`.
- **Regressão:** §17b “a tabela de itens não aceita cor injetada”, “o kanban também não”,
  “nem os gráficos do dashboard”, “cor legítima continua passando”.

### E7 · CSV formula injection — **MÉDIO-ALTO (segurança)**
- **Arquivo/linhas:** `docs/index.html` — `Export.csv`, `Export.historico`.
- **Cenário:** `updatedStatusObs` = `=HYPERLINK("http://mau","clique")`; exportar CSV; abrir no Excel.
- **Impacto:** aspas duplas não protegem: Excel e LibreOffice executam célula iniciada por
  `=` `+` `-` `@` (e tab/CR). O texto vem de planilhas de terceiros e de campos editáveis.
- **Evidência:** a célula saía como `"=HYPERLINK(…)"`, sem desarme.
- **Correção:** `Export.seguro()` prefixa `'` nesses casos — desarma e o texto continua visível.
- **Regressão:** §17b “CSV desarma fórmula no campo do item” / “e também no CSV do histórico”.
- **Nota:** a exportação Excel (SpreadsheetML) já era segura — `<Data ss:Type="String">` é texto literal.

### E8 · `validarBase` é O(H²) e roda a cada gravação alheia — **MÉDIO (desempenho)**
- **Arquivo/linhas:** `docs/index.html` — `validarBase` (varredura de ids repetidos).
- **Cenário:** base com histórico grande; outra pessoa grava.
- **Impacto:** `indexOf` dentro de `filter`. `validarBase` roda na abertura **e** em todo
  `Sync.receber`, isto é, potencialmente a cada poucos segundos com 2–4 pessoas.
- **Evidência medida:**

  | Eventos | Antes | Depois |
  |---|---|---|
  | 5 000 | 21 ms | 2 ms |
  | 20 000 | 356 ms | 6 ms |
  | 50 000 | **2 091 ms** | **26 ms** |

- **Correção:** `duplicados()` — uma passada com `Set`, para itens e para eventos.
- **Regressão:** §17c “20.000 eventos validam em menos de 120 ms” + “id repetido continua sendo detectado”.

### E9 · Relatório “Bloqueantes” estoura com item sem status — **MÉDIO**
- **Arquivo/linhas:** `docs/index.html` — `RELATORIOS`, entrada `bloq`.
- **Cenário:** base com item sem `status` (é **aviso**, não impedimento — a base abre).
- **Impacto:** `i.status.startsWith(…)` → `TypeError`, tela de Relatórios em branco.
- **Correção:** `String(i.status ?? "")`.
- **Regressão:** §17c “o relatório Bloqueantes não estoura”.

### E10 · Item some do gráfico de aging com data no futuro — **BAIXO**
- **Arquivo/linhas:** `docs/index.html` — `M.aging`.
- **Cenário:** relógio de outra máquina adiantado grava `dataEfetiva` = amanhã — plausível
  numa pasta de rede com várias máquinas.
- **Impacto:** `diasSemAtualizacao` negativo não cai em faixa nenhuma; a soma das barras
  passa a ser menor que o total de itens em aberto, sem nenhum aviso.
- **Evidência:** 2 itens em aberto, soma das faixas = 1.
- **Correção:** piso em 0.
- **Regressão:** §17c “nenhum item em aberto some das faixas de aging”.

### E11 · Colisão de nome de arquivo na presença — **BAIXO**
- **Arquivo/linhas:** `docs/index.html` — `Sync.slug`.
- **Cenário:** “José Silva” e “Jose Silva”; ou “Ana-B” e “Ana B”; ou dois nomes em alfabeto
  não latino (ambos viravam `anonimo`).
- **Impacto:** duas pessoas escrevem o **mesmo** `presenca/<slug>.json` — exatamente a disputa
  de escrita que o desenho de “um arquivo por pessoa” existe para evitar. O crachá “N na base”
  conta errado e as marcas ✎ de uma sobrescrevem as da outra.
- **Correção:** sufixo estável derivado do nome inteiro.
- **Regressão:** §17c, cinco verificações.

### E13 · Arquivar durante a gravação de outra pessoa destrói eventos — **CRÍTICO (perda de dados)**

> Este achado estava classificado como “risco provável R6” na primeira rodada — **classificação
> errada minha**: eu o descartei por leitura, sem construir o caso. Ao testá-lo, reproduziu.

- **Arquivo/linhas:** `docs/index.html` — `Arquivamento.executar`.
- **Cenário:** A arquiva eventos anteriores a uma data. Entre gravar o arquivo em `historico/`
  (um `await`) e tirar os eventos da base, o polling traz a versão de B, que contém um evento
  **anterior ao corte** que A nunca viu.
- **Impacto:** `S.db` passa a ser a versão de B, mas o arquivo em `historico/` já foi escrito
  com os eventos de **A**. O filtro do corte então remove da base de B eventos que **não estão
  no arquivo**. Ficam destruídos: nem na base, nem em `historico/`. É o oposto exato da
  promessa do arquivamento (“nada é apagado”).
- **Evidência:** evento `hMARIA` — `na base: false`, `no arquivo: false`.
- **Correção:** duas defesas. (1) a sessão se declara ocupada (`S.salvando`) durante a operação,
  e `Sync.tick` já respeita isso — a corrida deixa de acontecer; (2) como garantia, a base é
  conferida **por identidade** antes de perder qualquer evento, e a operação é recusada com
  `BASE_MUDOU` se ela tiver trocado por qualquer outro caminho (restaurar backup, recuperar
  cópia local). O arquivo já gravado em `historico/` nunca atrapalha — só fica órfão, e a
  mensagem diz isso.
- **Regressão:** §17d, oito verificações — as duas defesas em separado, mais o caminho normal.

### E12 · Logs técnicos nunca podados (diverge da decisão A3) — **BAIXO/MÉDIO**
- **Arquivo/linhas:** `docs/index.html` — `Pend.descartarUma`, `Pend.descartarTudo`,
  `UI.conflitoGravacao`.
- **Divergência:** `analise/02_DECISOES.md` (A3) diz “o descarte fica no log técnico **por
  alguns dias** para recuperação”. Não havia poda alguma: `logDescartes` e `logSobrescritas`
  cresciam para sempre **dentro do `database.json`**, e cada descarte carrega um
  `structuredClone` das pendências desfeitas.
- **Correção:** `podarLogs()` em `normalizar` — janela `config.diasLogTecnico` (padrão 30 dias)
  e teto de 500 entradas. `logArquivamentos` **não** é podado: é o índice de onde cada
  arquivo de histórico foi parar e vale para sempre.
- **Regressão:** §17c, três verificações.

---

## 2. Riscos prováveis (não corrigidos nesta rodada)

| # | Risco | Onde | Por que não foi mexido |
|---|---|---|---|
| R1 | **`meta.revisao` não é atômico.** Entre reler o arquivo e `close()` há uma janela real de TOCTOU: duas sessões podem passar na conferência e a segunda apaga a primeira. | `Store._gravar` | É a limitação assumida em `03_ARQUITETURA` (§“sem trava de arquivo na rede”). Fechar de verdade exige lock file com `create:false` + retentativa, ou sair do JSON único. A janela é de milissegundos e o backup por abertura mitiga. |
| R2 | `Sync.tick` grava `ultimoMtime` **antes** de ler o conteúdo; uma falha de leitura transitória descarta a notificação para sempre. | `Sync.tick` | A gravação seguinte ainda bate no controle de revisão, então não vira perda — só atraso. |
| R3 | `Store.mtime` em pasta de rede costuma ter granularidade de 1–2 s: duas gravações no mesmo segundo podem não acordar o polling. | `Store.mtime` | Mesma mitigação de R2. |
| R4 | `statusEm` compara texto: um `dataEfetiva` em ISO completo (`2026-03-01T08:00Z`) devolve o estado do **dia anterior**, e `validarBase` aceita sem aviso (a regex só exige o prefixo `AAAA-MM-DD`). | `R.statusEm`, `validarBase` | O app só grava data pura; só atinge base editada à mão. Corrigir bem exige normalizar na entrada **e** decidir o que fazer com bases antigas. |
| R5 | Consolidação feita em memória é revertida se o disco mudar antes do autosave de 3 s. | `Pend.varrer` × `Sync.adotar` | Auto-recupera: a pendência volta do disco intacta e `varrer` reconsolida. Só desloca `consolidadoEm`. Medido e confirmado benigno. |
| R7 | Retenção de 30 backups pode cobrir **menos de um dia**: há backup a cada abertura, e são 2–4 pessoas. Uma corrupção percebida na manhã seguinte pode não ter backup limpo. | `Store.limparBackupsAntigos` | É política, não defeito. Sugestão: reter por data além de por contagem. |
| R8 | `tick()` ignora revisão **menor** que a carregada. Depois de uma restauração ou sobrescrita forçada por outra pessoa, esta sessão nunca vê a mudança. | `Sync.tick` | Mitigado pela correção E2 (a revisão deixou de regredir na restauração), mas o ramo continua existindo para sobrescrita forçada. |
| R9 | `beforeunload` chama `Sync.sair()` assíncrono; o arquivo de presença costuma ficar órfão. | arranque | Mitigado pelo TTL de 90 s. |

---

## 3. Limitações arquiteturais (por desenho, documentadas)

1. **Sem trava de arquivo.** Concorrência otimista por revisão + junção campo a campo.
2. **Reconstrução anterior ao corte de arquivamento não existe dentro do app** — as datas
   passam a viver só em `historico/*.json`. Consequência colateral: depois de arquivar,
   `M.comparar` numa data anterior ao corte classifica os itens como **“novos”**, porque
   `statusEm` devolve `null`. A tela não distingue “item não existia” de “não sei”.
3. **Tabela sem virtualização** e JSON único: o desenho assume os 428 itens da decisão C6.
   Medido: 2 000 itens / 50 000 eventos ainda renderiza (dashboard 186 ms, itens 37 ms), mas
   `Export.excel` vai a 537 ms e o arquivo a ~15 MB.
4. **Chrome/Edge apenas** para gravação automática.
5. **Privacidade:** o nome do autor fica em `localStorage`, em `presenca/*.json` e em todo
   evento do histórico; não há autenticação (decisão I5). Quem tem a pasta tem tudo. Nenhum
   dado sai da máquina — não há telemetria, nem rede, nem recurso externo na página
   (verificado: nenhum `src=`/`href=` remoto em `docs/index.html`).

---

## 4. Hipóteses não verificadas

| # | Hipótese |
|---|---|
| H1 | As quatro suítes Playwright não puderam rodar aqui (sem `playwright`, sem `SM_DATABASE`). O que elas cobrem — arraste real, temas, responsivo — **não foi verificado nesta auditoria**. |
| H2 | O README anuncia 65/55/10/31 verificações para as suítes Python; a contagem estática de chamadas `chk(` dá 61/57/11/32. Podem divergir por laços — não confirmado sem execução. |
| H3 | `migracao/validar.py` **reimplementa** a regra de “em aberto” em Python e **não lê** `config.statusAbertoExcecoes`. Hoje o resultado coincide; se alguém mudar a regra na tela, o validador passa a conferir contra outra definição. |
| H4 | `validar.py` ordena o histórico só por `dataEfetiva`, sem o desempate de `R.cmpEventos` (`consolidadoEm`, depois `id`). Com dois eventos do mesmo item no mesmo dia, app e validador podem reconstruir estados diferentes. |
| H5 | O workflow do Pages ainda dispara em `claude/excel-consolidation-tracking-l9o3l4` (ramo que não existe mais) e sua guarda não cobre `*.xls` nem `*.json` genérico. Não testado. |

---

## 5. Auditoria WCAG 2.2 AA

Nenhum destes foi corrigido — são mudanças de interface, fora do escopo de “corrigir os
problemas comprovados que podem causar perda de dados”. Ficam listados como melhorias.

| # | Critério | Situação |
|---|---|---|
| W1 | **2.1.1 Teclado (A)** | Cabeçalhos de ordenação (`th`), pílulas de filtro (`.chip`), cabeçalho de painel recolhível (`h3[data-dobra]`), cabeçalho de coluna do Kanban (`.colh`) e o crachá “N pendentes” recebem `onclick` sem `tabindex`, `role` ou tratamento de Enter/Espaço. **Reprova.** O arquivo inteiro tem exatamente 1 `role` e 1 `aria-live`. |
| W2 | **2.4.3 Ordem de foco / 4.1.2 (A)** | O modal não tem `role="dialog"`, `aria-modal`, foco inicial, armadilha de foco nem devolução do foco ao fechar. **Reprova.** |
| W3 | **4.1.3 Mensagens de estado (AA)** | `#saveState` tem `role="status" aria-live="polite"` ✅. O `#toast` não tem — toda confirmação de gravação, descarte e conflito passa despercebida por leitor de tela. **Reprova.** |
| W4 | **1.3.1 / 2.4.1 (A)** | Não há `<h1>` (a hierarquia começa em `<h2>`) nem link de pular para o conteúdo. **Reprova (menor).** |
| W5 | **1.4.3 Contraste (AA)** | Medido: `.muted` (`--fg-3 #8b93a3`) sobre branco = **3,09:1** (2,88:1 sobre `--panel-2`); `--warn #d99400` = **2,57:1**; `--accent` 4,42:1; `--ok` 3,35:1. No tema escuro tudo passa. Cores de status **usadas como texto** no tema claro: `2 - Not Blocking` 2,17:1, `6 - Waiting B05` 2,82:1, `7 - Missing Vacuum` 3,68:1, `2 - Not Available Jx` 3,83:1, `3 - Blocking` 3,95:1. **Reprova no tema claro.** |
| W6 | **1.1.1 / 1.3.1** | Os SVGs de gráfico não têm nome acessível (`role="img"` + `aria-label`); os `<title>` internos só servem de tooltip. A tabela não usa `aria-sort`. **Reprova.** |
| W7 | **1.4.13 Conteúdo em hover/focus (AA)** | O balão `#tip` tem `pointer-events:none` (não é *hoverable*) e só abre por mouse, nunca por foco. É dispensável com Esc ✅. **Reprova parcialmente.** |
| W8 | **2.5.7 Movimentos de arrasto (AA, novo na 2.2)** | **Passa.** O Kanban oferece o botão de status no card como alternativa ao arraste — explicitamente desenhado para isso. |
| W9 | **2.5.8 Tamanho do alvo (AA, novo na 2.2)** | `.btn.sm` (`padding:4px 10px`, fonte 11,5 px) e `.chip` ficam na fronteira dos 24×24 px. **Limítrofe.** |
| W10 | **1.4.11 Contraste de não-texto (AA)** | O anel de foco de campos é `box-shadow 0 0 0 2px var(--accent-soft)` — `#e8f0fb` sobre branco não alcança 3:1. Botões dependem do anel padrão do navegador. **Reprova (menor).** |
| W11 | **2.3.3 / prefers-reduced-motion** | Tratado para o ponto pulsante ✅. |
| W12 | **1.4.10 Reflow (AA)** | Tratado: a tabela vira cartões abaixo de 700 px ✅. |

---

## 6. Segurança e privacidade — resumo

| Vetor | Situação |
|---|---|
| XSS por valor de item | **Era explorável** (E5) — corrigido. |
| XSS por cor de configuração | **Era explorável** (E6) — corrigido. |
| XSS pelo restante do HTML | `esc()` é aplicado de forma consistente nos demais pontos auditados (filtros, histórico, conflitos, pendentes, presença, log técnico, vistas salvas). |
| CSV formula injection | **Era explorável** (E7) — corrigido. |
| Excel (SpreadsheetML) | Seguro: `<Data ss:Type="String">`. |
| Filtros via URL (`#hash`) | Um link de terceiro só escolhe rota e filtros; os valores voltam ao DOM escapados. Rota inválida cai no dashboard. Sem risco identificado. |
| Recursos externos | Nenhum. A página é autocontida — funciona em `file://` sem rede. |
| Telemetria | Nenhuma. |
| Segredos no repositório | Nenhum. `.gitignore` e a guarda do workflow bloqueiam csv/xlsx/xlsb/`database*.json` em `docs/`. |
| Autenticação | Não existe, por decisão I5. Quem alcança a pasta lê e escreve tudo. |

---

## 7. Comparação documentação × código × comportamento

| Afirmação | Situação |
|---|---|
| “os pendentes ficam no `database.json` **e** espelhados em IndexedDB… perder a rede não perde alteração” (`03_ARQUITETURA`) | **Era falso no modo sem pasta** (E1). Verdadeiro depois da correção. |
| “Restauração pela tela de Configurações, **sempre com backup do estado atual antes**” | Era backup do estado **em memória**, não do que seria apagado (E2). Corrigido. |
| “o descarte fica no log técnico **por alguns dias**” (A3) | Não havia poda (E12). Corrigido, com janela configurável. |
| “`config.statusAbertoExcecoes` é a **única** fonte de ‘em aberto’” | Verdadeiro no app. **Falso em `migracao/validar.py`**, que reimplementa a regra (H3). |
| “Uma base recusada **nunca** substitui a que está aberta” | Verdadeiro — `validarBase` roda antes em todos os caminhos (pasta, arquivo manual, espelho, backup, versão de outra pessoa). |
| “a reconstrução **a partir do corte** continua exata” | Verdadeiro (coberto pela §11 da suíte). Datas anteriores viram “novos” em `M.comparar` — ver limitação 2. |
| “218 verificações” | Agora **258**. README atualizado. |
| Números do Excel (166/12, 262/59, 240/38, 71, 74/80) | **Não reconferidos** — exigem a base real (H1). |

---

## 8. Correções aplicadas nesta rodada

E1 → E13, todas com teste de regressão escrito **antes** da correção e suíte completa
executada depois: **266/266**.

**Nota de método.** E13 estava classificado como risco provável (R6) na primeira rodada e só
virou erro comprovado quando o caso foi construído. A lição vale para o resto desta lista: a
fronteira entre “erro comprovado” e “risco provável” aqui é, em boa parte, **a fronteira do
que o arreio em Node alcança** — e não a da gravidade real. R1 (atomicidade de `meta.revisao`)
é o candidato mais óbvio a mudar de lado se alguém construir o caso.

Não corrigidos de propósito: R1–R9 (riscos), as limitações da §3 e toda a §5 (WCAG) — são
mudanças de arquitetura ou de interface, maiores que o escopo “corrigir os problemas
comprovados, começando pelos que podem causar perda de dados”.
