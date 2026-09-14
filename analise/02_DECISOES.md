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
