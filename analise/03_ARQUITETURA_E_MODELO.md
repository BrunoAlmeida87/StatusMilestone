# Etapas 6, 7 e 8 — Arquitetura, modelo de dados e organização visual

---

## Etapa 6 — Arquitetura

### A pergunta que decidiu tudo: HTML puro consegue gravar num JSON?

Testei em Chromium real, não por suposição:

| Teste (página aberta por duplo clique, `file://`) | Resultado |
|---|---|
| `fetch('./database.json')` | ❌ `TypeError: Failed to fetch` |
| `XMLHttpRequest` | ❌ `NetworkError` |
| `window.isSecureContext` | ✅ `true` |
| `showDirectoryPicker` / `showSaveFilePicker` existem em `file://` | ✅ **sim** |
| Chamada com gesto do usuário | ✅ aceita (`AbortError` por ser headless, **não** `SecurityError`) |

**Conclusão:** a rota "HTML lê um JSON de uma pasta" está bloqueada pelo navegador. Mas a
**File System Access API funciona em `file://`** — e ela lê **e grava**.

### Arquitetura escolhida

```
       Chrome / Edge
  ┌──────────────────────┐        1x por sessão: "Selecionar pasta"
  │   index.html         │  ───────────────────────────────────────►  ┌─────────────────┐
  │   (interface)        │                                            │  pasta na rede  │
  │                      │  ◄── lê/grava database.json ────────────►  │  database.json  │
  │   IndexedDB          │                                            │  backups/*.json │
  │   (cópia de socorro) │                                            └─────────────────┘
  └──────────────────────┘
```

- **Zero instalação.** Um arquivo HTML. Duplo clique, ou pelo link do GitHub Pages.
- **Dados 100% separados da interface.** O HTML não contém nenhum registro.
- **Funciona em pasta de rede**, atendendo às 2–4 pessoas.

### Comparação das alternativas

| Critério | **HTML + File System Access** (escolhido) | HTML + import/export manual | Servidor local + SQLite | HTML + IndexedDB |
|---|---|---|---|---|
| Instalação | nenhuma | nenhuma | executável na pasta | nenhuma |
| Grava sozinho | ✅ | ❌ (Downloads, manual) | ✅ | ✅ |
| Dados fora do código | ✅ arquivo visível | ✅ | ✅ | ❌ preso ao navegador |
| Pasta de rede | ✅ | ⚠️ manual | ✅ | ❌ |
| Backup | ✅ copiar a pasta | ⚠️ | ✅ | ❌ difícil |
| Concorrência | ⚠️ por versão + trava por convenção (implementado) | ❌ | ✅ trava real | ❌ |
| Navegadores | Chrome/Edge | todos | todos | todos |
| Complexidade | **baixa** | mínima | média | baixa |

### Limites honestos desta escolha

1. **Chrome e Edge apenas.** Firefox/Safari não têm a API. O sistema detecta e avisa, oferecendo o modo manual em vez de falhar em silêncio.
2. **Sem escrita atômica na rede.** A API não tem `rename`, `create:false` nem lock, então a exclusão mútua é por convenção: uma **trava com dono e prazo** (`database.lock.json`, 20 s) que é escrita e **relida** antes de gravar, mais o **controle de revisão** (o sistema relê o arquivo e compara `meta.revisao` com a que carregou) e um **carimbo por gravação** conferido depois do `close()`. Se outra pessoa gravou no meio, **nada é dado como salvo** e abre-se a junção campo a campo — ou a tela de conflito (recarregar / baixar minha versão / forçar com backup prévio). Não é serialização real: encolhe a janela e transforma o que sobra dela em conflito detectado, nunca em perda silenciosa.
3. **JSON tem limite prático.** Hoje: 428 itens + 484 eventos ≈ 1,5 MB, carrega instantaneamente. A projeção está na seção de desempenho abaixo.

### Por que JSON serve aqui (e quando deixará de servir)

| Volume | Tamanho | Carregamento | Veredito |
|---|---|---|---|
| Hoje: 428 itens, 484 eventos | ~1,5 MB | < 0,3 s | ✅ confortável |
| 428 itens, 5.000 eventos (≈3 anos de uso intenso) | ~4 MB | < 1 s | ✅ tranquilo |
| 428 itens, 20.000 eventos | ~14 MB | 2–4 s | ⚠️ aceitável, mas hora de arquivar |
| 2.000 itens, 50.000 eventos | ~40 MB | > 8 s | ❌ migrar para SQLite |

Como o escopo é **fechado em 428 itens** (sua decisão C6), o gargalo só pode vir do histórico.
O mecanismo de saída está implementado em Configurações: **arquivamento de histórico antigo** para
`historico/<arquivo>.json` (o arquivo é gravado e conferido **antes** de os eventos saírem da base),
deixando um **evento-marco por item** com o último status antes do corte — por isso a reconstrução a
partir do corte continua exata, e só as datas anteriores passam a viver apenas no arquivo. A mesma
tela mostra o tamanho do `database.json` e avisa acima de 8 MB (`config.mbAvisoTamanho`).

### Autosave, pendentes e consolidação

```
edição do usuário
   ↓  imediato
estado atualizado na memória + entrada em PENDENTES
   ↓  3 s (debounce)
AUTOSAVE: grava database.json  +  espelho em IndexedDB
   ↓  10 min sem novo toque  (ou botão "Salvar alterações agora")
CONSOLIDAÇÃO → HISTÓRICO DEFINITIVO
```

- O **autosave protege o trabalho** mas **não** cria histórico.
- Dentro da janela, alterações no mesmo campo são **agrupadas**: `A → B → C` vira um único evento `A → C`.
- **Ida-e-volta não gera nada**: `A → B → A` é descartado na consolidação.
- **Rede técnica de recuperação**: os pendentes ficam dentro do próprio `database.json` (já gravado pelo autosave) **e** espelhados em IndexedDB. Fechar o navegador, reiniciar o computador ou perder a rede não perde alteração. O espelho é gravado **antes** de qualquer tentativa de escrita na pasta e **não depende dela**: no modo manual (navegador sem a API, base aberta à mão, cópia local recuperada) a alteração continua protegida e o crachá de estado diz que nada foi para a pasta.
- **Observações são exceção**: gravam na hora e não passam por pendentes — são acréscimos, não substituições, então não há o que agrupar.

### Backup

- Automático **a cada abertura** da base e **antes de operações de risco** (restauração, gravação forçada).
- Manual pelo botão, e download avulso.
- Vão para a subpasta `backups/`, nomeados por data/hora, **retenção das 30 versões mais recentes**.
- Restauração pela tela de Configurações. O backup prévio é **da versão que está no disco** — que é a que a restauração apaga, e que pode ser de outra pessoa, não a que está em memória aqui. Se a revisão do disco mudou desde a carga, a tela diz quem gravou e pede uma segunda confirmação; a revisão gravada nunca regride.

---

## Etapa 7 — Modelo de dados

Arquivo único `database.json`, com seis coleções.

### `itens` — o registro central

| Campo | Tipo | Obrigatório | Edição | Regra |
|---|---|---|---|---|
| `item` | texto | ✅ **PK** | ❌ | único; guardado como texto para tolerar `1234-A` no futuro |
| `status` | texto | ✅ | ✅ | tem de existir em `config.status` |
| `inspType` | texto | ✅ | ❌ | define o universo dos indicadores |
| `isB05` | booleano | ✅ | derivado | `inspType === "B05"` |
| `originalJx` | texto | ✅ | ❌ | marco de **origem** (J06, J07, J08) |
| `actualJx` | texto | — | ❌ | marco de **cruzamento** — sempre J08 |
| `evidence` | texto | ✅ | ❌ | único; chave alternativa de conferência |
| `bigram` | lista de textos | — | ❌ | separado de `AC;MB` na migração |
| `insp`, `actualJxDescription`, `numAndDescription`, `performance`, `mode`, `description`, `hullPassageParts`, `positionAC`, `sbr` | texto | — | ❌ | descritivos |
| `modeOrigem` | texto | — | — | valor antes da normalização (I10) |
| `updatedStatusObs`, `generalObs`, `ncr`, `tests` | texto | — | ✅ | editáveis (I8) |
| `criadoEm` | data | ✅ | — | `2026-07-29` (baseline real do Arquivo 1) |
| `ultimaAlteracaoStatus` | data | ✅ | derivado | base do aging |
| `presenteEm` | enum | ✅ | — | `ambos` / `arquivo1` / `arquivo2` — procedência |

**Não existe campo `previousStatus`.** Ele virou a função `statusEm(item, data)` (decisão C1).

### `historico` — imutável, acumulativo

`id` · `item` → itens · `campo` · `valorAnterior` · `valorNovo` · `dataEfetiva` (data do fato) ·
`primeiraAlteracaoEm` · `consolidadoEm` (data do registro) · `autor` · `origem`
(`migracao` / `automatico` / `manual` / `conflito`) · `tipo` · `observacao`

Guardar **data do fato e data do registro separadas** é o que permite você lançar hoje algo que
aconteceu em 05/09 sem distorcer o gráfico de evolução (decisão I9).

### `pendentes` — temporário, some ao consolidar

`id` · `item` · `campo` · `valorOriginal` · `valorAtual` · `primeiraAlteracaoEm` ·
`ultimaAlteracaoEm` · `dataEfetiva` · `autor` · `motivo`

Chave lógica: **(item, campo)** — é o que garante o agrupamento.

### `observacoes` · `waivers` · `conflitos` · `marcos` · `config`

- **`observacoes`**: `id` · `item` · `texto` · `criadoEm` · `autor`. Acumulativas, nunca sobrescrevem.
- **`waivers`**: `id` · `numero` (série anual `W-2026-001`, tirada do **maior número já usado**, não do tamanho da lista — apagar um rascunho não pode devolver ao estoque um número que já circulou por e-mail) · `itens[]` · `assunto` · `para` · `texto` · `condicao` · `statusDestino` (para onde os itens vão **agora**) · `statusFinal` (onde devem parar se o waiver for aceito) · `situacao` (rascunho·enviado·aprovado·recusado·cancelado) · `origem` (`sistema` | `passivo`) · `dataDocumento` · `referencia` · `decisaoPor` · `decisaoObs` · `decisaoEm` · `aplicado` · `criadoEm` · `atualizadoEm` · `autor`. **O waiver não move status por um caminho próprio**: chama `Pend.alterar` como qualquer tela, com `Waiver <numero>` no motivo — a mudança aparece no histórico do item dizendo de onde veio. `origem:"passivo"` é o waiver que já existia em papel: entra com a data e a referência do documento original e **não** mexe no status, porque o item já está onde o papel o deixou.
- **`conflitos`**: `id` · `item` · `campo` · `valorArquivo1` · `valorArquivo2` · `valorAplicado` · `resolvido` · `resolvidoPor` · `resolvidoEm` · `justificativa`. Resolver gerava evento no histórico. **Os 40 estão decididos e a tela saiu** (ver Etapa 8); o array permanece na base, intacto, como registro do que cada arquivo dizia.
- **`marcos`**: `id` · `nome` · `data` · `tipo`. São as emissões de relatório (29/07, 09/09, 10/09). É contra eles que se calcula "mudou no ciclo" e as setas ▲▼.
- **`config`**: status (com `ativo`), famílias/colunas do Kanban, minutos de consolidação, limites de aging, `statusAbertoExcecoes` (a **única** fonte de "em aberto", casada por prefixo), tipos funcionais, `mbAvisoTamanho`, `vistas` (filtros salvos com nome, compartilhados por ficarem na base) e `caminhoPadrao` (onde a base mora na rede — fica aqui, e não no navegador, para valer para todo mundo que abrir aquele `database.json`).

### Relacionamentos

```
config ──(valida)──► itens.status
marcos ──(recorte)─► historico ──(N:1)──► itens ◄──(1:N)── observacoes
                                              ◄──(1:N)── pendentes
                                              ◄──(1:N)── conflitos
                                              ◄──(N:N)── waivers
```

### Validação estrutural antes do uso

`validarBase(db)` é uma função pura, separada da normalização: normalizar **conserta** o que dá
(campo ausente), validar apenas **olha**. Só é bloqueante o que torna a base inutilizável — raiz que
não é objeto, coleção que não é lista, item sem identificador, identificador repetido, `meta.revisao`
inválida. O resto (evento órfão, status fora do domínio, pendência órfã, data fora do padrão) é
**aviso**, para não trancar ninguém fora da própria base. Passa por ela tudo que pode virar base
ativa: o `database.json` da pasta, o arquivo aberto à mão, a cópia do IndexedDB, um backup restaurado
e a versão que chega de outra pessoa. Uma base recusada **nunca** substitui a que está aberta.

### Validações implementadas

Item duplicado · item sem identificador · status fora do domínio · item sem status ·
evento de histórico órfão · conflito não resolvido · status incoerente com a observação ·
estrutura do arquivo · JSON corrompido (com recuperação pela cópia local) ·
confirmação antes de operações destrutivas · histórico protegido contra sobrescrita.

---

## Etapa 7b — Trabalho simultâneo

A base é um arquivo só numa pasta compartilhada, então duas sessões podem gravar em cima uma da
outra. O controle tem cinco camadas:

0. **Trava com dono e prazo.** Antes de gravar, `Store.travar` lê `database.lock.json`: se houver
   uma trava viva de outra pessoa, desiste e tenta de novo; senão escreve a sua e **relê** para
   confirmar que ficou sendo a dela. Duas sessões que escrevem quase juntas leem depois das duas
   escritas, e no máximo uma se vê como dona. O prazo (20 s) evita que uma aba fechada no meio
   trave a pasta. Falha na trava nunca recusa uma gravação — ela é proteção a mais, não requisito.
1. **Revisão otimista** (já existia). `Store.gravar` relê o arquivo e compara `meta.revisao` antes
   de escrever. Se mudou, não escreve.
1b. **Carimbo por gravação.** Comparar revisão antes de escrever é um check-then-use: entre reler
   e fechar o arquivo cabe a gravação de outra pessoa. Cada gravação leva um `meta.carimbo` único
   e o arquivo é relido depois do `close()`; se o carimbo que ficou não é o nosso, a gravação não
   é dada como salva e entra na junção abaixo — com o trabalho inteiro ainda no diário.
2. **Diário local** (`Pend.diario`). Toda alteração feita aqui e ainda não gravada fica registrada
   como `{item, campo, de, para}` — ou `{t:"obs"}` para observações. É o que permite reaplicar o
   trabalho local sobre a versão de outra pessoa em vez de escolher entre um e outro.
3. **Junção por campo** (`Sync.receber`). Compara, campo a campo:

   | Valor no disco | Decisão |
   |---|---|
   | igual ao meu "de" (ninguém mais mexeu) | reaplica o meu |
   | igual ao meu "para" | nada a fazer |
   | **diferente dos dois** | conflito real → o usuário decide |

O polling lê só a data de modificação do arquivo (`Store.mtime`); o conteúdo só é aberto quando
ela muda. Enquanto houver uma janela aberta, o polling espera — nada muda debaixo do usuário.

A presença usa **um arquivo por pessoa** em `presenca/<nome>.json`, e não um campo compartilhado:
assim ninguém disputa escrita para dizer "estou aqui". Entradas com mais de 90 s são ignoradas.

Limite conhecido: alterações estruturais (configuração, resolução de conflito de migração,
restauração de backup) não são reaplicáveis automaticamente. Nesse caso o sistema pede decisão em
vez de escolher sozinho.

## Etapa 7c — A paleta de status é verificada, não escolhida a olho

As cores de status passam pelo validador de paleta (ΔE em OKLab): faixa de
luminosidade, piso de croma, separação para daltonismo (ΔE ≥ 8) e piso de visão
normal (ΔE ≥ 15), contra a superfície clara e a escura.

Duas cores da primeira versão reprovavam, e as duas vizinhas do vermelho:

| Status | Antes | Depois | ΔE vs `3 - Blocking` (normal) |
|---|---|---|---|
| 7 - Missing Vacuum | laranja `#eb6834` | ciano `#0891b2` | 7,1 → passa |
| 5 - Waiting Proof | rosa `#e87ba4` | magenta `#b83280` | 13,2 → 13,9 (claro) · 7,8 → 12,5 (escuro) |

As três aparecem na mesma barra empilhada de "função vital", que foi onde o
problema apareceu. Não existe laranja ou marrom que passe: a faixa entre o
vermelho e o amarelo do `2 - Not Blocking` já está ocupada.

**O que continua reprovando, e por quê.** No tema escuro, `1 - Validated`
(verde) × `2 - Not Blocking` (âmbar) dá ΔE 3,0 para protanopia, e os dois verdes
(`1 - Validated` × `6 - Waiting B05`) dão 10,1. São consequência da convenção de
severidade que o usuário pediu para manter (verde = validado, vermelho =
bloqueio, âmbar = ressalva) — para quem tem protanopia, verde e âmbar convergem,
e isso é física, não escolha. Varri alternativas e nenhuma passa sem quebrar a
convenção ou criar uma colisão nova.

O que torna isso aceitável é que **cor nunca é o único código**: todo status
aparece sempre com o nome escrito ao lado (legenda, pílula, título da caixa no
diagrama) e cada faixa da barra empilhada leva o seu número dentro.

## Etapa 8 — Organização visual

Menu final: **Dashboard · Itens · Kanban · Evidence Flow · Histórico · Relatórios · Configurações**.

A tela **Conflitos** existiu enquanto houve fila: era exigida pelo princípio de não sobrescrever
nada silenciosamente. Com os 40 conflitos de migração decididos, ela **saiu do menu** — os
registros continuam na base (`conflitos`), nada foi apagado, e o que era genuinamente independente
dela — a regra de coerência entre status e observação — ficou, alimentando o relatório
*Inconsistências* e a verificação de integridade.

### Dashboard
Cinco KPIs (total, em aberto com Δ vs. marco anterior, validados, % conclusão, alterados no ciclo)
→ os dois blocos do **Evidence Flow** (B05 / exceto B05) → **Shipyard Prerequisites** (filtrado por
**`ActualJx = J08`**: o marco que vale é o atual, não o de origem — um pré-requisito transferido de
J07 para J08 é do J08, e o que saiu para o J09 deixou de ser),
**Functional Insp. Type** com as setas ▲▼ do Excel, e a distribuição em rosca →
quatro gráficos: evolução no tempo, aging, pendências por tipo de inspeção e por função vital.

### Itens
Tabela densa e ordenável por qualquer coluna, com busca, filtros combináveis e coluna de aging
destacada em vermelho acima do limite. Clique na linha abre o detalhe. **A edição acontece no
detalhe, não inline** — inline convida ao erro num dado que alimenta indicador oficial.

### Kanban
Seis colunas por família de status (+ Cancelado, recolhida). Arrastar entre colunas pergunta o
status exato quando a família tem mais de um. **Usa exatamente o mesmo motor de pendentes da edição
normal** — nenhuma lógica paralela. Colunas recolhíveis; **Validado já vem recolhida**, porque são
355 dos 428 itens e ela engoliria a tela.

### Histórico
Escolha de duas datas (ou de um marco) e o sistema **reconstrói o estado** em cada uma:
em aberto no início e no fim, melhoraram, pioraram, sem alteração, novos, tabela status-a-status
com Δ, curva de evolução, ranking de transições e a lista de eventos consolidados.

### Relatórios
Onze relatórios prontos (em aberto, B05 em aberto, bloqueantes, alterados em 7/30 dias,
parados há 30/60 dias, alterados no ciclo, com observação, com NCR, **inconsistências status ×
observação**). Combinam-se com os filtros.

### Exportação
**Uma porta só** para sair da base, usada por Dashboard, Itens, Histórico e Relatórios: o mesmo
catálogo de 27 campos, a mesma escolha de colunas (guardada por pessoa, no navegador) e o mesmo
saneamento de texto alimentam cinco saídas.

- **CSV** com separador, codificação (UTF-8 com ou sem BOM) e tratamento de quebra de linha
  escolhidos. O saneamento é o ponto central: caracteres de controle saem, `\r` é normalizado,
  toda célula vai entre aspas e fórmula (`=`, `+`, `-`, `@`) é desarmada com apóstrofo. Eram as
  três causas do arquivo que chegava desalinhado ou truncado.
- **Relatório PDF / HTML**: um documento próprio, montado do zero — capa com o recorte, quem gerou
  e a revisão da base; resumo com KPIs, Evidence Flow, Shipyard e função vital; e o corpo em dois
  formatos, despachados por `Export.documento`. A impressão corre num `<iframe>` escondido, que não
  depende de o navegador liberar janela nova. **Não é mais `window.print()` da tela viva.**
  - **tabela** paginada em A4 (retrato ou paisagem) com `thead` repetido em toda página e
    `break-inside: avoid` por linha;
  - **quadro Kanban** (`docKanbanHTML`): o board em papel. `Export.AGRUPAR` define os agrupamentos
    possíveis das colunas (família do status, status, InspType, OriginalJx, ActualJx, função vital,
    Insp) e `colunasQuadro` faz a divisão, ordenando pelo domínio onde ele existe e alfabeticamente
    nos campos de texto livre. **As colunas escolhidas na janela viram os campos do cartão** — não
    há uma segunda lista de campos para manter em dia. Um quadro grande pode sair com **uma coluna
    por página**, que é a única forma de o cartão ficar legível em papel.

  Capa, resumo, folha de estilo e rodapé são os mesmos nos dois formatos (`capaHTML`,
  `resumoDocHTML`, `cssRelatorio`, `moldura`): o que muda é só o corpo.

  **Recorte** (`Export.recorte`): `somenteAberto` tira os validados, com `R.aberto` — a mesma regra
  dos painéis, lida da config. Aplicado na porta de `csv`, `excel`, `json` e `documento`, então os
  cinco formatos e a previsão de páginas enxergam a mesma lista, e o resumo, calculado dentro de
  cada um, acompanha.

  **Aparência** é dimensionada por uma variável só: `--q` na `.quadro`, com o resto em `em`. O
  `cssExtra` de quem exporta entra por último na folha de estilo, então vence o padrão sem
  `!important`.

  **`previsaoPaginas`** monta o documento num `<iframe>` com a largura útil da folha e lê a altura
  real — não estima a partir de um modelo de altura de cartão, porque estimativa errada é pior que
  número nenhum. **`ajustarParaCaber`** desce a escada `ESCADA` (do cartão mais legível ao mais
  apertado, e depois tudo de novo sem o resumo) medindo cada degrau, e para no primeiro que couber:
  o resultado é o cartão mais legível que ainda cabe, não o menor. Quando nada cabe, diz isso.
- **Excel** (SpreadsheetML, três abas: Resumo, Itens, Histórico) e **JSON** com o recorte, as
  colunas escolhidas e a revisão da base.

O resumo do Excel e a capa do relatório saem da **mesma** função (`Export.resumo`): um número só
poderia divergir entre os dois se o cálculo fosse duplicado.

### O visualizador
`docs/visualizador.html` é o mesmo sistema **sem a escrita**, para a pasta de transferência. Não é
uma cópia mantida à mão — cópia mantida à mão diverge, e em um mês o visualizador estaria contando o
Shipyard pelo campo errado enquanto o sistema conta pelo certo. Ele é **gerado** de
`docs/index.html` por `ferramentas/gerar_visualizador.py`, que:

1. troca `Pend`, `Sync` e `Lote` por cascas inertes, remove `NovoItem` e `Arquivamento` e arranca
   do `Waiver` só os métodos que gravam (`painel`, `guardar`, `aplicar`, `excluir`) — ler e
   imprimir waiver continua inteiro, porque quem consulta precisa saber que o item está coberto
   por um pedido de dispensa;
2. substitui os métodos de escrita do `Store` (`gravar`, `backup`, `travar`, `arquivarHistorico`…)
   por uma recusa `SOMENTE_LEITURA` — o caminho de código até um writer deixa de existir, não é só
   a interface que some — e abre a pasta com `showDirectoryPicker({mode:"read"})`;
3. põe `EDITAVEL` em `false` — uma constante só, num lugar só, pela qual cada tela sabe se deve
   oferecer o que altera a base (em vez de uma tela lembrar e outra esquecer) — e tira da
   interface o resto do que só servia para editar;
4. troca a abertura pela de `ferramentas/visualizador_shell.js`, que lê o `database.json` ao lado do
   arquivo (por `fetch` quando servido por http, pela pasta autorizada uma vez quando é `file://`).

**Toda substituição é ancorada num trecho exato do `index.html` e conferida**: se uma âncora sumir
porque o index mudou, o gerador para com erro em vez de produzir um visualizador quebrado em
silêncio, e `--conferir` (chamado pelos testes) falha se o arquivo gerado estiver desatualizado.

### Item novo
Um item pode nascer à mão (**Itens ▸ + Novo item**), não só pela migração. Formulário com todos os
campos, sugestão dos valores já existentes, código conferido enquanto se digita (repetido não
entra, nem com a caixa trocada) e status inicial forçado a ser um **em aberto**. O item entra pelo
mesmo caminho de qualquer edição — pendente, autosave, evento no histórico — e o diário ganha um
registro `item-novo`, rebasável: se outra pessoa gravar no meio, o item é reposto por cima da
versão dela. Se os dois criarem o mesmo código, abre a tela de decisão.

### Waiver
Um waiver é o pedido formal de aceitar um item como está. Cobre **um ou mais itens**, mora na base
(`waivers`) e sai em documento A4 retrato pronto para assinar. O documento reaproveita a moldura do
relatório (`Export.moldura`), então herda o CSS próprio de quem exporta e sai também como arquivo
HTML.

**A pergunta do status.** Escolher um status de tramitação diferente do que os itens têm de fato é
o momento de decidir se é para mudar — e a janela pergunta ali, com os números na frente (quantos
itens, em que status cada um está hoje), em vez de trazer uma caixa genérica sempre ligada.
Confirmando, ao salvar acontecem as duas coisas: `Pend.alterar` move quem está fora, e o texto do
waiver entra como **observação** no item, com cabeçalho `Waiver <nº> — status alterado de "A" para
"B"`. Só quem mudou de verdade ganha a observação: uma nota dizendo "alterado de X para X" é ruído.
A observação segue o caminho de qualquer observação — `{t:"obs"}` no diário, gravação imediata —
então é rebasável e sobrevive à gravação de outra pessoa no meio.

**O desenho do documento**, e por quê: faixa cheia no topo em vez de caixa vazada (dá peso e separa
identificação de conteúdo sem mais uma régua); um fio na cor da **situação** sob a faixa (aprovado
ou não se lê de longe, com a folha na mesa); pílulas com a **cor real do status na base**, a mesma
da tela (papel e tela falam a mesma língua); **três** etapas na tramitação — de onde está, para
onde vai agora, onde deve parar — porque duas escondiam justamente a informação que mais importa,
que o item não está onde o waiver supõe; barra lateral de cor própria por bloco de texto (quem
folheia acha a seção sem ler o título); marca d'água **contornada** em rascunho e cancelado, por
cima do conteúdo — atrás dos painéis brancos ela sumia, e um rascunho saía com cara de documento
válido. O `@page` do waiver usa margens próprias, menores que as do relatório: um waiver completo
(justificativa em quatro seções, condições, parecer e quatro itens) cabe em uma folha com folga de
milímetros, e o parecer viaja junto das assinaturas (`.wfecho`) para nunca deixar uma linha de
assinatura órfã na folha seguinte.

No diário de sincronização ele entra como `waiver` (upsert) ou `waiver-del`, carregando o
`atualizadoEm` **de onde se partiu**: é esse campo que distingue "a outra pessoa mexeu neste mesmo
waiver" (decisão do usuário) de "ela mexeu em outra coisa e este só precisa ser reposto" (junta
sozinho). Sem ele, a escolha seria entre perder texto em silêncio e perguntar à toa.

### Janelas: o clique que fechava sozinho
Fechar clicando fora só vale quando o clique **começa e termina no fundo**. O navegador entrega o
`click` ao ancestral comum do `mousedown` e do `mouseup`: arrastar para selecionar o texto de um
campo e soltar o botão fora da janela dava um clique no fundo — e a janela fechava levando o que
estava escrito. A regra ficou isolada em `UI.cliqueFechaFundo(ov, alvo)` para poder ser conferida
sem navegador; o comportamento com mouse de verdade tem teste em Chromium.

As janelas onde se escreve (`detalhe`, `NovoItem`, `Waiver`) são abertas com `confirmarSaida:true`:
qualquer `input`/`change` as marca como sujas e a saída **por iniciativa do usuário** (fundo, ✕,
Esc) pergunta antes de descartar. `UI.fechar()` continua sem perguntar nada, porque quem a chama é
o próprio sistema — `modal()` a chama ao abrir a janela seguinte.

### Convenções visuais
Cor por **severidade do status** (1 verde, 2 azul, 3/7 vermelho, 4 laranja, 5 âmbar, 6/8 cinza),
marca amarela em quem **mudou no ciclo** — agora derivada automaticamente, não pintada à mão —
e as setas ▲▼ com a semântica original: em contagem de pendência, **cair é bom e aparece em verde**.
Tema claro/escuro e interface PT/EN.
