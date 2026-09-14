# Decisões tomadas (respostas às Etapas 5)

Data: 2026-09-14 · Respondido por: Bruno Almeida

---

## 🔴 Decisões críticas

| # | Pergunta | **Decisão** | Consequência |
|---|---|---|---|
| **C1** | Semântica do `Previous Status` | **Vira histórico datado.** Confirmada a regra de snapshot; o campo `Previous Status` deixa de existir | `status_atual` + histórico de eventos com data/hora. O "anterior" passa a ser a função `status_em(item, data)`. **Elimina o trabalho manual do §2 por construção.** Habilita as Etapas 18/19/20 |
| **C2** | Conflitos entre os arquivos | **Marcar todos como conflito.** Nada sobrescrito | Os 40 conflitos (11 OriginalJx + 26 Updated Status Obs + 3 Bigram) entram numa fila de decisão na tela, com os dois valores lado a lado |
| **C3** | Item 3102 | **OriginalJx = J06, ActualJx = J08** | Painel "Shipyard Prerequisites (J08)" passa de **22/21 → 21/20**. Diferença documentada como correção intencional na Etapa 11 |
| **C4** | Os 7 itens J07 | **OriginalJx = J07, ActualJx = J08.** Arquivo 2 está certo | O Arquivo 1 achatou indevidamente para J08. `OriginalJx` passa a aceitar J06, J07, J08, J08 (J06) |
| **C4b** | Painel `J06+` | **Remover — é código morto** | Sai do dashboard. Espaço reaproveitado |
| **C5** | Baseline `??/??/2026` do Arq.2 | **Resíduo — descartar** | Fica preservado no arquivo bruto de migração, mas não vira marco nem indicador |
| **C6** | Escopo | **Fechado — 428 itens é tudo do J08** | Sem ingestão periódica. Base estável. Arquitetura bem mais simples |
| **C7** | Excel: fim ou convive | **Substitui, mas exporta para Excel** | Depois da migração o Excel deixa de ser editado. Preciso gerar de volta o arquivo no formato atual para terceiros |

### 🔑 Semântica de Jx esclarecida por C3/C4
`OriginalJx` = marco de **origem** do requisito (J06, J07, J08…).
`ActualJx` = marco em que está sendo **cruzado agora** = sempre **J08**.
→ O Arquivo 2 é a fonte correta para `OriginalJx`. A regra do Bloco 1 da `BD` (filtrar `OriginalJx = J08`) passa a excluir corretamente os itens de origem J06/J07.

---

## 🟡 Decisões importantes

| # | Pergunta | **Decisão** | Consequência |
|---|---|---|---|
| **I1** | Domínio de status | **Os 14, com ativos/inativos** | Os 14 ficam cadastrados; você liga/desliga cada um nas Configurações. Inativos aparecem só em dados históricos |
| **I2** | Transições | **Totalmente livre** | Nenhuma validação nem aviso. Qualquer card vai para qualquer coluna |
| **I3** | Kanban | **6 colunas por família** | `Pendente (6,8)` · `Em prova (5)` · `Em análise (4*)` · `Bloqueado (3,7)` · `Aceito c/ ressalva (2*)` · `Validado (1)`. Status exato no card; arrastar pergunta qual status dentro da família |
| **I4** | Usuários | **2 a 4 pessoas, não simultâneas** | Exige autor no histórico e proteção contra gravação concorrente |
| **I5** | Autoria | **Identificação simples, sem senha** | A pessoa escolhe o nome na 1ª vez; fica gravado no computador. Todo evento de histórico leva autor |
| **I6** | `Tests` | **Manter como texto** | Campo de texto longo, preservado do Arquivo 1 (93 itens). Sem entidade filha, sem indicador próprio |
| **I7** | `Bigram` | **Filtro multi-seleção por código** | Separo os 59 códigos atômicos; filtro "qualquer um dos selecionados" + indicador de pendências por código |
| **I8** | Campos editáveis | **Status + observações + NCR's + Tests** | Editáveis: `Actual Status`, `Updated Status Obs`, `General Obs`, `NCR's`, `Tests`. **Somente leitura:** classificação (InspType, Insp, OriginalJx, ActualJx) e descritivos (Description, Performance, Mode, Position AC, NºandDescription) |
| **I9** | Data do evento | **Hoje, mas posso corrigir** | Grava data/hora atual por padrão; permite informar data efetiva anterior. Guarda as duas: data do fato e data do registro |
| **I10** | Limpeza | **Limpar técnico + normalizar, guardando original** | Remove `_x000D_` e espaços duplos; normaliza domínios como `Mode`. Valor original preservado em campo `valor_origem` |
| **I11** | `99 - Several` | **É função vital legítima** | Sem alerta, sem reclassificação. Tratado como qualquer outra função vital |

---

## 🟢 Decisões opcionais

| # | Pergunta | **Decisão** |
|---|---|---|
| **O1** | Aging | **Marco zero na migração.** Todos os 428 itens recebem a data da migração como início. A tela deixa claro que o aging é "desde a implantação" |
| **O2** | Metas | **Não há metas formais.** Gráficos mostram evolução e tendência, sem linha de meta |
| **O3** | Idioma | **Bilíngue com botão PT/EN** |
| **O4** | Cores | **Paleta por severidade** (1 verde, 2 azul, 3/7 vermelho, 4 laranja, 5 amarelo-escuro, 6/8 cinza) **+ manter a convenção atual** de "mudou no ciclo" e setas ▲▼ |
| **O5** | Anexos | **Não precisa.** Observações são só texto. Base leve, backup trivial |
| **O6** | Relatório oficial | **É enviado, mas o layout pode melhorar.** Mesmos números e agrupamentos, apresentação modernizada |

---

## 🔧 Decisões de arquitetura

### Teste técnico realizado (Chromium real, não suposição)

Página aberta por duplo clique (`file://`):

| Teste | Resultado |
|---|---|
| `fetch('./database.json')` | ❌ bloqueado — `TypeError: Failed to fetch` |
| `XMLHttpRequest` do JSON | ❌ bloqueado — `NetworkError` |
| `window.isSecureContext` | ✅ `true` |
| `showDirectoryPicker` / `showSaveFilePicker` disponíveis em `file://` | ✅ **sim** |
| Chamada com gesto do usuário | ✅ aceita (`AbortError` por ser headless, **não** `SecurityError`) |
| Com a flag `--allow-file-access-from-files` | `fetch` passa a funcionar — **descartado**, enfraquece o navegador inteiro |

**Conclusão:** HTML puro não lê JSON de pasta por `fetch`, mas a **File System Access API funciona em `file://`** — permitindo ler **e gravar** direto numa pasta escolhida pelo usuário.

### Decisões

| # | Pergunta | **Decisão** | Consequência |
|---|---|---|---|
| **A1** | Arquitetura | **HTML standalone + pasta escolhida** | Duplo clique no HTML, nada instalado. Na 1ª vez seleciona a pasta da base; depois lê e grava `database.json` direto ali |
| **A1-ter** | Local da base | **Rede compartilhada — todos na mesma base** | É a Single Source of Truth real. **Exige controle de versão obrigatório:** antes de gravar, confere se alguém alterou; se sim, mostra conflito em vez de sobrescrever |
| **A1-quater** | Navegador | **Chrome** | API completa disponível. O sistema avisa na tela se for aberto em navegador sem suporte |
| **A2** | Consolidação | **10 min, configurável** | Autosave imediato → pending change → 10 min sem novo toque → histórico. Agrupa A→B→C em uma linha; descarta ida-e-volta (A→B→A não gera histórico) |
| **A3** | Descartar pendentes | **Sim, com confirmação e recuperável** | Mostra o que será desfeito, exige confirmação, e o descarte fica no log técnico por alguns dias para recuperação |

---

## ⚠️ Pontos em aberto que vou levantar na Etapa 6

1. **Cópia de segurança no navegador (IndexedDB).** Você escolheu "HTML standalone + pasta escolhida" sem a cópia extra. Como a base ficará **na rede**, uma queda de conexão no meio da gravação pode corromper o arquivo. **Vou propor somar essa proteção** — é barata e elimina o pior cenário. Decisão sua.
2. **Controle de concorrência na rede.** Com 2-4 pessoas e base compartilhada, preciso de trava/versionamento. Vou apresentar a mecânica na Etapa 6 para você aprovar.
3. **Reconciliação da Etapa 11 terá 1 diferença intencional:** por causa de C3, Shipyard Prerequisites vai de 22/21 para 21/20. Todos os outros números batem 100%.

---

## 🔴 Decisão final — precedência do SafetyMilestoneJ08

> **"Nessa questão de status o que vale é o arquivo SafetyMilestoneJ08."**
> **"Para todo o resto, considere a planilha J08 como a correta."**

### Correção de regra de negócio (informada pelo usuário)

> **"Missing Vacuum Test e B05 done não são excludentes. Você faz o B05 e aguarda o teste a vácuo."**

Eu havia criado um verificador que tratava `7 - Missing Vacuum Test or Sign` + observação de
conclusão como contradição. **Estava errado**: é a sequência normal do processo — executa-se o B05
e depois aguarda-se o teste a vácuo ou a assinatura.

A regra foi corrigida e o conceito virou um **parâmetro configurável**,
`config.statusPosExecucao`, editável na tela de Configurações:

```json
"statusPosExecucao": ["7 - Missing Vacuum Test or Sign"]
```

Nos status dessa lista, uma observação de conclusão **não** é sinalizada como incoerente.
Se outros status tiverem a mesma natureza, basta acrescentá-los ali — sem tocar no código.

### O que o campo `status` já cumpria

| Verificação | Resultado |
|---|---|
| `Actual Status` do Arq.1 ≡ `Actual Status` do Arq.2 | **428 / 428** |
| Origem do histórico (29/07, 09/09, 10/09) | **100% SafetyMilestoneJ08** |

Para o campo `status` a regra já valia integralmente. Não havia o que mudar.

### O que a regra mudou

| Campo | Decisão | Conflitos |
|---|---|---|
| `Updated Status Obs` | **SafetyMilestoneJ08 vence, sem exceção** | 26 resolvidos |
| `OriginalJx` | Arquivo 2 vence — decisão C3/C4 do usuário, que é mais específica e prevalece: o J08 achatou o marco de origem para J08, e o usuário confirmou que a origem é J06/J07 | 11 resolvidos |
| `Bigram` | **Deixado em aberto** — ver abaixo | 3 pendentes |

**Conflitos em aberto: 29 → 3.**

Efeito colateral positivo: os itens **624, 625, 628 e 629** ficaram com
`New intervention Ficha 339/340/341/342`, informação que só existe no SafetyMilestoneJ08 e que
seria perdida do campo por qualquer outra escolha.

### Por que `Bigram` ficou de fora

Ali o Arquivo 1 é um **subconjunto** do Arquivo 2, não uma versão diferente:

| Item | SafetyMilestoneJ08 | Resumo Fluxo |
|---|---|---|
| 809 | `HG` | `HG;HP` |
| 1027 | `DM` | `DA;DM;DN` |
| 3102 | `-` | `Several` |

Aplicar o J08 **apagaria códigos** (`HP`, `DA`, `DN`) em vez de corrigir um valor. Como isso é
perda de informação e não uma questão de status, os três seguem como conflito em aberto,
aguardando confirmação.

### Consequência medida

Itens em que a observação contradiz o status, pela regra já corrigida:
**36** (antes da decisão: 18). Os 20 novos são os que eu havia sinalizado no aviso anterior —
itens `1 - Validated by ICN` cuja observação no J08 é `Do B05 paper.` ou `Waiting B05`.

Isso pode significar duas coisas, e só quem acompanha o processo sabe qual:
1. são textos anteriores à validação que nunca foram atualizados naquela coluna; ou
2. é uma combinação legítima, como `Missing Vacuum Test` + `B05 done` — e nesse caso basta
   acrescentar o tratamento em `statusPosExecucao` e os 20 deixam de ser sinalizados.

**Nenhuma ação foi tomada sobre eles.** O relatório *Inconsistências status × observação* e o
verificador de integridade apenas os listam.

A precedência ficou codificada em `migracao/migrar.py` (`DECISOES_CONFLITO`), com a justificativa
gravada em cada conflito, de modo que qualquer nova migração reproduz exatamente este resultado.
Nenhum valor foi perdido: o texto descartado continua registrado em cada conflito e visível na tela.
