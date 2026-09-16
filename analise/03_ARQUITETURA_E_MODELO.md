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
| Concorrência | ⚠️ por versão (implementado) | ❌ | ✅ trava real | ❌ |
| Navegadores | Chrome/Edge | todos | todos | todos |
| Complexidade | **baixa** | mínima | média | baixa |

### Limites honestos desta escolha

1. **Chrome e Edge apenas.** Firefox/Safari não têm a API. O sistema detecta e avisa, oferecendo o modo manual em vez de falhar em silêncio.
2. **Sem trava de arquivo na rede.** Resolvido por **controle de revisão**: antes de gravar, o sistema relê o arquivo e compara `meta.revisao` com a que carregou. Se outra pessoa gravou no meio, **nada é escrito** e abre-se a tela de conflito (recarregar / baixar minha versão / forçar com backup prévio).
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

### `observacoes` · `conflitos` · `marcos` · `config`

- **`observacoes`**: `id` · `item` · `texto` · `criadoEm` · `autor`. Acumulativas, nunca sobrescrevem.
- **`conflitos`**: `id` · `item` · `campo` · `valorArquivo1` · `valorArquivo2` · `valorAplicado` · `resolvido` · `resolvidoPor` · `resolvidoEm` · `justificativa`. Resolver gera evento no histórico.
- **`marcos`**: `id` · `nome` · `data` · `tipo`. São as emissões de relatório (29/07, 09/09, 10/09). É contra eles que se calcula "mudou no ciclo" e as setas ▲▼.
- **`config`**: status (com `ativo`), famílias/colunas do Kanban, minutos de consolidação, limites de aging, `statusAbertoExcecoes` (a **única** fonte de "em aberto", casada por prefixo), tipos funcionais, `mbAvisoTamanho` e `vistas` (filtros salvos com nome, compartilhados por ficarem na base).

### Relacionamentos

```
config ──(valida)──► itens.status
marcos ──(recorte)─► historico ──(N:1)──► itens ◄──(1:N)── observacoes
                                              ◄──(1:N)── pendentes
                                              ◄──(1:N)── conflitos
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
outra. O controle tem três camadas:

1. **Revisão otimista** (já existia). `Store.gravar` relê o arquivo e compara `meta.revisao` antes
   de escrever. Se mudou, não escreve.
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

Menu final: **Dashboard · Itens · Kanban · Histórico · Relatórios · Conflitos · Configurações**.
A única adição à sua proposta é **Conflitos**, exigida pelo princípio de não sobrescrever nada
silenciosamente — ela some sozinha quando a fila zera.

### Dashboard
Cinco KPIs (total, em aberto com Δ vs. marco anterior, validados, % conclusão, alterados no ciclo)
→ os dois blocos do **Evidence Flow** (B05 / exceto B05) → **Shipyard Prerequisites**,
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
Doze relatórios prontos (em aberto, B05 em aberto, bloqueantes, alterados em 7/30 dias,
parados há 30/60 dias, alterados no ciclo, com observação, com NCR, **inconsistências status × observação**,
itens com conflito). Combinam-se com os filtros. Exportam em CSV, **Excel** (arquivo com três abas:
Resumo, Itens, Histórico), JSON e impressão/PDF.

### Convenções visuais
Cor por **severidade do status** (1 verde, 2 azul, 3/7 vermelho, 4 laranja, 5 âmbar, 6/8 cinza),
marca amarela em quem **mudou no ciclo** — agora derivada automaticamente, não pintada à mão —
e as setas ▲▼ com a semântica original: em contagem de pendência, **cair é bom e aparece em verde**.
Tema claro/escuro e interface PT/EN.
