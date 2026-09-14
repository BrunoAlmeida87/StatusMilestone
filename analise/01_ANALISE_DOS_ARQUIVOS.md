# Etapa 1–5 — Análise dos arquivos, engenharia reversa, comparação, qualidade e perguntas

Data da análise: 2026-09-14
Fontes: `SafetyMilestoneJ08.xlsx` (Arquivo 1) e `Resumo_Fluxo_Evidencia.xlsb` (Arquivo 2)

> Nenhum código de aplicação foi escrito. Este documento é o entregável das Etapas 1 a 5.

---

## 0. Resumo executivo (o que realmente encontrei)

1. **Os dois arquivos contêm a MESMA tabela base**, com o mesmo nome (`Report_Crossing_FV`),
   os **mesmos 428 itens**, sem duplicidade e sem órfãos. O join por `Item` é **perfeito (428/428)**.
2. **`Item` é uma chave válida** (inteiro, único, sem vazios nas linhas de dado).
   `Evidence` também é único (428/428) e serve como chave alternativa de conferência.
3. **A duplicidade não é de "registros", é de COLUNAS e de HISTÓRICO.**
   - O Arquivo 1 tem **3 gerações de status** congeladas em colunas (29/07 → 09/09 → 10/09).
   - O Arquivo 2 tem **1 baseline antigo** + o **status atual**, e é **mais rico em campos descritivos**.
4. **O Arquivo 1 perdeu dados**: todos os campos descritivos (SBR, ActualJx, ActualJxDescription,
   NºandDescription, Performance, Mode, Description, Insp, Position AC, HullPassageParts)
   só estão preenchidos para os **166 itens B05**. Os 262 itens não-B05 estão **vazios** nesses campos
   no Arquivo 1 — e **preenchidos** no Arquivo 2.
5. **O Arquivo 2 perdeu dados**: a coluna `Tests` está **100% vazia** no Arquivo 2 e tem
   **93 itens preenchidos** no Arquivo 1 (média de 12,4 testes por item, máx. 96).
6. **Consegui reproduzir 100% dos números dos dois dashboards** a partir dos dados brutos
   (ver §5 — Reconciliação). Isso valida que a lógica foi corretamente decifrada.
7. Encontrei **3 bugs reais** e **1 bloco morto** na planilha `BD` do Arquivo 1 (ver §6.4).
8. **Descobri a regra do `Previous Status`** — e ela **não é** o que o item 7 da sua solicitação supõe.
   Ver §7. Isso muda a proposta de automação.

---

## 1. ARQUIVO 1 — `SafetyMilestoneJ08.xlsx`

### 1.1 Estrutura

| Aba | Tipo | Conteúdo |
|---|---|---|
| `Report_Crossing_FV` | Dados | 430 linhas (428 com dado + 2 em branco no fim), 24 colunas, cabeçalho na **linha 2** |
| `BD` | Motor de cálculo | 3 blocos de `COUNTIFS`, nenhuma fórmula na aba de dados |
| `Resumo` | Dashboard | Apenas espelha células da `BD` — **nenhum cálculo próprio** |

Metadados: título em C1 = `ACOMPANHAMENTO - FLUXO DE EVIDÊNCIAS: [SBR4]`, carimbo em U1 =
`Emissão: 29/07/2026 14:51:26`. Autofiltro em `A2:X432`. Painel congelado em A55.
Zero fórmulas em `Report_Crossing_FV` → **é uma extração colada como valor**.
Um comentário de célula assinado *Julien Cazal*: `528 / 805`.

### 1.2 Colunas de `Report_Crossing_FV` (arquivo 1)

| # | Col | Campo | Preenchidos | Observação |
|---|---|---|---|---|
| 1 | A | SBR | 166 | constante `"SBR"`; só nos B05 |
| 2 | B | **Item** | 428 | inteiro, **único** |
| 3 | C | OriginalJx | 428 | J08 (262), J06 (150), J08 (J06) (16) |
| 4 | D | ActualJx | 166 | constante `J08` |
| 5 | E | ActualJxDescription | 166 | SETTING ON FLOAT (150), STATIC DIVE (16) |
| 6 | F | NºandDescription | 166 | constante `36 - Pressure hull integrity` |
| 7 | G | Bigram | 428 | **multivalorado** (`AC;MB`), até 6 valores |
| 8 | H | Performance | 166 | 1 valor único |
| 9 | I | Mode | 166 | constante `Local` |
| 10 | J | **Evidence** | 428 | **único** (chave alternativa) |
| 11 | K | HullPassageParts | 166 | = marcador de B05 |
| 12 | L | Description | 166 | |
| 13 | M | Insp | 166 | constante `B05` |
| 14 | N | **InspType** | 428 | B05 166, AIS 159, PTRH 43, STW 24, Shipyard prerequisites 22, HCT 11, HAT 2, SCT 1 |
| 15 | O | **Previous Status [09/09/2026]** | 428 | usado na `BD` como "Anterior" |
| 16 | P | **Actual Status [10/09/2026]** | 428 | usado na `BD` como "Atual" |
| 17 | Q | Updated Status Obs | 166 | só B05 |
| 18 | R | General Obs | 48 | |
| 19 | S | NCR's | 4 | |
| 20 | T | Position AC | 166 | 3 valores (posição vs linha d'água) |
| 21 | U | Tests | **93** | **lista multilinha de testes** — só existe aqui |
| 22 | V | *(vazia)* | 0 | separador visual |
| 23 | W | **Previous Status [29/07/2026]** | 428 | **geração anterior** |
| 24 | X | **Actual Status [09/09/2026]** | 428 | **geração anterior** |

### 1.3 Descoberta estrutural crítica: histórico por rotação de colunas

Verificado célula a célula: **coluna O ≡ coluna X em 428/428 linhas.**

Ou seja, o arquivo guarda o histórico assim:

```
          29/07/2026        09/09/2026        10/09/2026
             W        →   X ≡ O          →        P
        (Prev antigo)   (Actual antigo /      (Actual novo)
                         Prev novo)
```

**A regra real é:** a cada nova emissão do relatório, o `Actual Status` vigente é **copiado**
para `Previous Status`, um novo `Actual Status` é preenchido, e o **par antigo é preservado
à direita**. O par `Previous/Actual` **não é um par de edição** — é um **par de snapshot
entre duas datas de corte**. Isso é decisivo para a Etapa 7 (ver §7).

### 1.4 Marcação amarela = delta do ciclo (regra implícita, confirmada)

14 células da coluna P têm preenchimento amarelo (`FFFF00`).
Comparei com os itens em que `O ≠ P`: **são exatamente os mesmos 14 itens** (conjuntos idênticos).

→ **Regra implícita confirmada: amarelo = "mudou neste ciclo".**
São eles: 899, 1059, 1121, 1123, 1134, 1154, 1160, 1161, 1173, 1175, 1177, 1191, 1556, 3147.

Isso é feito **à mão** hoje e é exatamente o tipo de coisa que o sistema novo passa a derivar sozinho.

---

## 2. ENGENHARIA REVERSA — dashboard do Arquivo 1 (`BD` → `Resumo`)

A aba `Resumo` **não calcula nada**. Todas as suas células são do tipo `=BD!H7`, `=BD!I29`.
Ela apenas posiciona textos e aplica formatação condicional de cor (verde/vermelho) com base
em células auxiliares que carregam o sinal da variação. **Toda a inteligência está na `BD`.**

A `BD` tem **3 blocos independentes**, todos alimentados exclusivamente por
`Report_Crossing_FV` colunas **C (OriginalJx)**, **N (InspType)**, **O (Previous)** e **P (Actual)**.

### 2.1 Bloco 1 — SHIPYARD PREREQUISITES STATUS (`BD!B2:I24` → `Resumo!F3:N12` e `F17:N24`)

Filtro: `OriginalJx = "J08"` **E** `InspType = "Shipyard prerequisites"`.

```
Total     C4  = COUNTIFS(C:C, "J08"; N:N, "Shipyard prerequisites")                = 22
Remaining C5  = C4 - E7 - E8        (Total − Validated − Not Blocking)             = 21
Anterior  D(n)= COUNTIFS(O:O, <status>&"*"; C:C,"J08"; N:N,"Shipyard prerequisites")
Atual     E(n)= COUNTIFS(P:P, <status>&"*"; C:C,"J08"; N:N,"Shipyard prerequisites")
Diferença F(n)= E(n) - D(n)                    ← positivo = AUMENTOU
Rótulo    H(n)= <label> & ": " & TEXT(E;"00")            → "Validated: 01"
Seta      I(n)= "(" & SE(F<0;"▼"; SE(F>0;"▲+";"▬")) & ... → "(▲+01)"
```

Detalhe fino: a linha `4 - Under Analysis` usa `COUNTIFS(...) - $D$9`, porque o critério
`"4 - Under Analysis*"` (com curinga) também captura `4 - Under Analysis To Not Blocking`.
A subtração isola o "Under Analysis puro". **É correto, mas é frágil** — depende do curinga.

O segundo painel do mesmo bloco filtra `OriginalJx = "J06+"`. **Nenhum registro tem esse valor**
(os valores reais são `J08`, `J06`, `J08 (J06)`, e `J07` no Arquivo 2).
→ **Este painel inteiro é código morto: sempre exibe 0 de 0.**

### 2.2 Bloco 2 — FUNCTIONAL INSP. TYPE STATUS (`BD!B26:L37` → `Resumo!R3:Y11`)

Não filtra por `OriginalJx`. Agrupa por `InspType` em 9 categorias fixas
(AIS, HAT, HCT, PTRH, STW, SCT, SAT, MT3, Shipyard certificate).

Aqui a métrica **não é "quantos estão no status X"**, e sim **"quantos continuam em aberto"**:

```
Anterior D(n) = COUNTIFS(O:O,"<>1 - Validated by ICN"; O:O,"<>2 - Not Blocking*";
                         O:O,"<>2 - Not Available Jx"; N:N, <InspType>)
Atual    E(n) = idem sobre P:P
Diferença F(n)= D(n) - E(n)            ← ATENÇÃO: invertido em relação ao Bloco 1
Seta     I(n) = "(" & SE(F<0;"▲+"; SE(F>0;"▼-";"▬")) ...   ← também invertido
Total    K(n) = COUNTIFS(N:N, <InspType>)
Pendente L(n) = = E(n)
C26 Total     = SOMA(K29:K37) = 240
C27 Remaining = SOMA(L29:L37) = 38
```

A inversão é **intencional e semanticamente correta**: no Bloco 1 conta-se *status*
(subir é bom/ruim conforme o status); no Bloco 2 conta-se *pendência*, então
**reduzir é bom** e a seta verde `▲+` aparece quando o número cai.

**Definição canônica de "EM ABERTO" (usada em todo o sistema):**
> `Actual Status` **NÃO** é `1 - Validated by ICN`, **NÃO** começa com `2 - Not Blocking`
> e **NÃO** é `2 - Not Available Jx`.

### 2.3 Bloco 3 — B05 STATUS (`BD!B39:I52` → `Resumo!R14:Y27`)

Filtro: `InspType = "B05"` apenas (sem filtro de Jx).

```
Total     C40 = COUNTIFS(N:N,"B05")                            = 166
Remaining C41 = C40 - E43 - E44 - E45  (− Validated − Not Blocking − Not Available Jx) = 12
D/E/F/H/I : mesma mecânica do Bloco 1 (F = Atual − Anterior)
```

10 linhas de status: Validated, Not Blocking, Not Available Jx, Missing Vacuum Test or Sign,
Waiting B05, Under Analysis To Not Blocking, Under Analysis, Blocking, Waiting Proof,
Mouting not Completed.

---

## 3. ARQUIVO 2 — `Resumo_Fluxo_Evidencia.xlsb`

### 3.1 Estrutura

| Aba | Tipo | Conteúdo |
|---|---|---|
| `Report_Crossing_FV` | Dados | **428 itens**, 21 colunas, cabeçalho na linha 2 |
| `Dinamicas` | Motor | **4 tabelas dinâmicas** sobre a base |
| `Evidence Flow` | Dashboard | Diagrama de fluxo em células coloridas (2 blocos) |
| `FV` | Dashboard | 1 dinâmica + 1 gráfico de barras (Vital Function) |
| `INSP` | Dashboard | 1 dinâmica + 1 gráfico de barras (Insp Type) |

Carimbo: `Emissão: 30/07/2026 15:40:11` — **mas o conteúdo de status é de 10/09/2026**
(ver §4.2). Ou seja, **o carimbo de emissão está desatualizado e é enganoso**.

### 3.2 Colunas (arquivo 2)

Mesmas 21 primeiras colunas do Arquivo 1, com duas diferenças de cabeçalho:

- col 15 = `Previous Status ??/??/2026` ← **a data está literalmente como "??/??"**
- col 16 = `Actual Status` (sem data)
- col 21 = `Tests` → **totalmente vazia**

### 3.3 As 4 tabelas dinâmicas (`Dinamicas`)

| # | Local | Filtro | Linhas | Colunas | Valor | Total |
|---|---|---|---|---|---|---|
| 1 | B1:C10 "Flow evidences B05" | `Insp = B05` | Actual Status | — | Contagem de Item | **166** |
| 2 | M1:N10 "Flow Evidences Except B05" | `HullPassageParts = (vazio)` | Actual Status | — | Contagem de Item | **262** |
| 3 | U3:AB24 "Victal Function" | — | NºandDescription | Actual Status | Contagem | **428** |
| 4 | AN3:AU13 | — | InspType | Actual Status | Contagem | **428** |

**Observação importante:** "Except B05" é definido por `HullPassageParts` vazio — não por
`Evidence`. Hoje isso dá no mesmo (§4.4), mas são **duas regras diferentes** convivendo.

### 3.4 Dashboard `Evidence Flow`

Dois blocos simétricos, cada um desenhado como um fluxo de caixas coloridas:

**Bloco A — `EVIDENCES "ONLY" B05`** (Total 166, Remaining 12)

| Caixa | Qtd | % sobre 166 |
|---|---|---|
| 8 - Mounting not Completed | 0 | 0,0% |
| 5 - Waiting Proof | 0 | 0,0% |
| 4 - Under Analysis | 0 | 0,0% |
| 6 - Waiting B05 | 0 | 0,0% |
| 1 - Validated by ICN | 152 | 91,57% |
| 3 - Blocking | 7 | 4,22% |
| 7 - Missing vaccum test | 5 | 3,01% |
| 2 - Not Blocking | 2 | 1,20% |
| (variantes Downgraded / Not Available Jx) | 0 | 0,0% |

**Bloco B — `EVIDENCES "EXCEPT" B05`** (Total 262, Remaining 59)

| Caixa | Qtd | % sobre 262 |
|---|---|---|
| 1 - Validated by ICN | 203 | 77,48% |
| 5 - Waiting Proof | 43 | 16,41% |
| 4 - Under Analysis | 11 | 4,20% |
| 3 - Blocking | 5 | 1,91% |
| demais | 0 | 0,0% |

`Remaining` = Total − Validated − Not Blocking → 166−152−2 = **12** e 262−203−0 = **59**.
**Mesma definição de "em aberto" do Arquivo 1.** 12 + 59 = **71**.

### 3.5 Dashboards `FV` e `INSP`

Ambos usam uma dinâmica **filtrada apenas nos status em aberto** (3, 4, 5, 7) — total **71** —
e um gráfico de barras agrupadas por status.

- `FV`: linhas = `NºandDescription` (19 funções vitais). Maior ofensor: `99 - Several` (19),
  `36 - Pressure hull integrity` (14), `40 - Escape the disabled submarine` (6).
- `INSP`: linhas = `InspType`. Maior ofensor: `Shipyard prerequisites` (21), `STW` (15),
  `B05` (12), `HCT` (11), `AIS` (8).

### 3.6 Domínio completo de status (lista mestra em `Evidence Flow!AR62:AR76`)

```
0 - Canceled
1 - Validated by ICN
2 - Not Available Jx
2 - Not Blocking
2 - Not Blocking - Downgraded
3 - Blocking
4 - Under Analysis
4 - Under Analysis to Not Blocking
4 - Under Analysis To Downgraded
4 - Under Analysis To Not Available Jx
5 - Waiting Proof
6 - Waiting B05
7 - Missing Vacuum Test or Sign
8 - Mounting not Completed
```

**14 status.** Apenas 6 estão em uso no `Actual Status` hoje. O prefixo numérico é a
**família/severidade** — é um dado real, não decoração.

---

## 4. ETAPA 3 — COMPARAÇÃO DAS DUAS BASES

### 4.1 Relatório de migração (chave `Item`)

| Métrica | Resultado |
|---|---|
| Itens no Arquivo 1 | **428** (+2 linhas totalmente vazias, nºs 431 e 432) |
| Itens no Arquivo 2 | **428** |
| Itens **nos dois** | **428 (100%)** |
| Itens **só no Arquivo 1** | **0** |
| Itens **só no Arquivo 2** | **0** |
| Itens **duplicados** | **0** em ambos |
| Itens **sem `Item`** | 2 linhas no Arq.1 — são linhas vazias residuais, descartáveis |
| Itens **sem correspondência** | **0** |

**Veredito: `Item` é uma chave primária válida.** Faixa 528–3300, com 46 blocos
não-contíguos (numeração herdada do sistema de origem — lacunas são normais, não são perda).

### 4.2 Alinhamento temporal das colunas de status

| Comparação | Igualdade |
|---|---|
| Arq1 `Actual Status [10/09]` ≡ Arq2 `Actual Status` | **428 / 428 (100%)** |
| Arq1 `Previous Status [09/09]` ≡ Arq2 `Actual Status` | 414 / 428 |
| Arq1 `Actual Status [09/09]` ≡ Arq2 `Actual Status` | 414 / 428 |
| Arq1 `Previous Status [29/07]` ≡ Arq2 `Previous Status ??/??` | **4 / 428** |
| Arq1 `Previous Status [09/09]` ≡ Arq2 `Previous Status ??/??` | 7 / 428 |

**Conclusões:**
1. O **estado atual dos dois arquivos está sincronizado** (100%) — o trabalho manual foi feito
   corretamente até 10/09. O risco de divergência existe, mas **hoje não se materializou nos status**.
2. O `Previous Status` do Arquivo 2 é um **baseline muito mais antigo**, de outra época
   (dominado por `4 - Under Analysis` 189, `6 - Waiting B05` 154, `8 - Mounting not Completed` 67).
   **Não corresponde a nenhuma das gerações do Arquivo 1.** É provavelmente a foto da primeira emissão.
3. Portanto **os dois arquivos medem deltas contra réguas diferentes**:
   - Arq.1 mede: *"o que mudou entre 09/09 e 10/09"* (14 itens).
   - Arq.2 mede: *"o que mudou desde o início do projeto"* (todos).

   Essa é a **divergência conceitual real** entre os dois arquivos — não os dados, mas o *baseline*.

### 4.3 Campos: cobertura e conflitos

| Campo | Existe em | Preench. Arq1 | Preench. Arq2 | Conflitos | Diagnóstico |
|---|---|---|---|---|---|
| `Item` | ambos | 428 | 428 | 0 | chave OK (difere só no tipo: int vs float) |
| `Evidence` | ambos | 428 | 428 | **0** | idêntico, único |
| `InspType` | ambos | 428 | 428 | **0** | idêntico |
| `HullPassageParts` | ambos | 166 | 166 | **0** | idêntico |
| `Position AC` | ambos | 166 | 166 | **0** | idêntico |
| `OriginalJx` | ambos | 428 | 428 | **11** | ⚠ ver 4.3.1 |
| `Bigram` | ambos | 428 | 428 | **3** | ⚠ Arq2 mais completo |
| `Updated Status Obs` | ambos | 166 | 361 | **26** | ⚠ ver 4.3.2 |
| `SBR` | ambos | 166 | 428 | 0 | **Arq2 completa 262** |
| `ActualJx` | ambos | 166 | 428 | 0 | **Arq2 completa 262** |
| `ActualJxDescription` | ambos | 166 | 398 | 0 | **Arq2 completa 232** |
| `NºandDescription` | ambos | 166 | 428 | 0 | **Arq2 completa 262** |
| `Performance` | ambos | 166 | 426 | 0 | **Arq2 completa 260** |
| `Mode` | ambos | 166 | 420 | 0 | **Arq2 completa 254** |
| `Description` | ambos | 166 | 428 | 0 | **Arq2 completa 262** |
| `Insp` | ambos | 166 | 398 | 0 | **Arq2 completa 232** |
| `General Obs` | ambos | 48 | 51 | 0 | Arq2 completa 3 |
| `NCR's` | ambos | 4 | 6 | 0 | Arq2 completa 2 |
| `Tests` | ambos | **93** | **0** | 0 | **só o Arq1 tem** |
| `Previous Status [09/09]` | só Arq1 | 428 | — | — | snapshot |
| `Actual Status [10/09]` | só Arq1 | 428 | — | — | = Actual do Arq2 |
| `Previous Status [29/07]` | só Arq1 | 428 | — | — | snapshot antigo |
| `Actual Status [09/09]` | só Arq1 | 428 | — | — | snapshot antigo (≡ Previous[09/09]) |
| `Previous Status ??/??` | só Arq2 | — | 428 | — | baseline original |

**Regra descoberta (confirmada item a item):** no Arquivo 1, o conjunto de itens com
SBR / ActualJx / ActualJxDescription / NºandDescription / Performance / Mode /
HullPassageParts / Description / Insp / Position AC preenchidos é **exatamente** o conjunto
dos 166 itens B05. Os 262 não-B05 carregam só `Item`, `OriginalJx`, `Bigram`, `Evidence`,
`InspType` e os status.

> **Consequência para a migração: o Arquivo 2 é a fonte melhor para os campos descritivos;
> o Arquivo 1 é a única fonte para `Tests` e para o histórico de snapshots.
> Nenhum dos dois sozinho é completo. A base única PRECISA dos dois.**

#### 4.3.1 Conflitos de `OriginalJx` (11 itens)

| Item | Arq1 | Arq2 | InspType | Actual Status |
|---|---|---|---|---|
| 528 | J08 | **J06** | HCT | 5 - Waiting Proof |
| 802 | J08 | **J07** | HCT | 4 - Under Analysis |
| 804 | J08 | **J07** | STW | 1 - Validated by ICN |
| 809 | J08 | **J06** | HCT | 3 - Blocking |
| 815 | J08 | **J07** | STW | 3 - Blocking |
| 816 | J08 | **J07** | STW | 1 - Validated by ICN |
| 849 | J08 | **J07** | HCT | 5 - Waiting Proof |
| 851 | J08 | **J07** | HCT | 5 - Waiting Proof |
| 1027 | J08 | **J06** | STW | 3 - Blocking |
| 3136 | J08 | **J07** | HCT | 5 - Waiting Proof |
| 3102 | J08 | **J06** | Shipyard prerequisites | 4 - Under Analysis |

Padrão: o Arquivo 1 **achatou tudo para `J08`**; o Arquivo 2 preserva `J06` e `J07`.
O Arquivo 1 **não tem nenhum `J07`**, o Arquivo 2 tem 7.

**Impacto direto no indicador:** o item **3102** tem `InspType = Shipyard prerequisites`.
O Bloco 1 da `BD` filtra `OriginalJx = "J08"`. Se adotarmos o valor do Arquivo 2 (`J06`),
esse item **sai do painel** e o total cai de **22 → 21** e o Remaining de **21 → 20**.
→ **Este conflito muda um número do dashboard. Precisa de decisão sua.**

#### 4.3.2 Conflitos de `Updated Status Obs` (26 itens, todos B05)

Padrão muito claro:

| Arq1 diz | Arq2 diz | Qtd |
|---|---|---|
| `Do B05 paper.` | `B05 done, without pendencies.` | 14 |
| `Waiting B05` | `B05 done, without pendencies.` | 8 |
| `New intervention Ficha 339/340/341/342` | `B05 done, without pendencies.` | 4 |
| `Do B05 paper.` | `Waiver Accepted` | 1 (item 733) |

O Arquivo 1 parece **mais antigo** nesta coluna (fala em "fazer o B05" enquanto o status já é
`1 - Validated by ICN`). O Arquivo 2 está coerente com o status.

**Porém:** os textos `New intervention Ficha 339/340/341/342` (itens 624, 625, 628, 629)
**só existem no Arquivo 1** e parecem informação de negócio real que se perderia.
→ **Não dá para escolher "o Arquivo 2 vence" cegamente. Precisa de decisão sua.**

#### 4.3.3 Conflitos de `Bigram` (3 itens)

| Item | Arq1 | Arq2 |
|---|---|---|
| 809 | `HG` | `HG;HP` |
| 1027 | `DM` | `DA;DM;DN` |
| 3102 | `-` | `Several` |

Arquivo 2 é claramente mais completo. Conflito de baixo risco, mas **não vou sobrescrever sem seu aval**.

### 4.4 `Item` é chave — e a identificação B05 é consistente

Testei 4 sinais independentes de "é B05" nos 428 itens:
`Evidence` começa com "B05" / `InspType = B05` / `Insp = B05` / `HullPassageParts` preenchido.

Resultado: **apenas 2 combinações existem** — `(V,V,V,V)` em 166 itens e `(F,F,F,F)` em 262.
**Zero divergências.** A classificação B05 é 100% consistente por qualquer um dos 4 critérios.

---

## 5. ETAPA 11 ANTECIPADA — RECONCILIAÇÃO (feita agora, não no fim)

Recalculei **todos** os números dos dois dashboards a partir do CSV bruto, em Python,
aplicando as regras decifradas. Resultado:

### Arquivo 2 — `Evidence Flow`
| Indicador | Planilha | Recalculado | ✓ |
|---|---|---|---|
| B05 Total | 166 | 166 | ✓ |
| B05 Remaining | 12 | 12 | ✓ |
| B05 Validated / Not Blocking / Blocking / Missing Vacuum | 152 / 2 / 7 / 5 | 152 / 2 / 7 / 5 | ✓ |
| Except-B05 Total | 262 | 262 | ✓ |
| Except-B05 Remaining | 59 | 59 | ✓ |
| Except-B05 Validated / Waiting Proof / Under Analysis / Blocking | 203 / 43 / 11 / 5 | 203 / 43 / 11 / 5 | ✓ |

### Arquivo 1 — `BD` / `Resumo`
| Indicador | Planilha | Recalculado | ✓ |
|---|---|---|---|
| Shipyard Prereq (J08) Total | 22 | 22 | ✓ |
| Shipyard Prereq (J08) Remaining | 21 | 21 | ✓ |
| Functional Insp Total | 240 | 240 | ✓ |
| Functional Insp Remaining | 38 | 38 | ✓ |
| AIS anterior→atual | 15 → 8 (▼-07) | 15 → 8 | ✓ |
| PTRH anterior→atual | 2 → 1 (▼-01) | 2 → 1 | ✓ |
| HCT / STW / HAT / SCT em aberto | 11 / 15 / 2 / 1 | 11 / 15 / 2 / 1 | ✓ |
| B05 Total / Remaining | 166 / 12 | 166 / 12 | ✓ |
| J06+ Total / Remaining | 0 / 0 | 0 / 0 (bloco morto) | ✓ |

### Fechamento cruzado entre os dois arquivos
```
21 (Shipyard Prereq) + 38 (Functional) + 12 (B05)  =  71
12 (B05) + 59 (Except B05)                          =  71
428 itens − 355 Validated − 2 Not Blocking          =  71   ✓✓✓
22 (Shipyard) + 240 (Functional) + 166 (B05)        = 428   ✓
```

**Os dois dashboards são duas fatias da MESMA verdade e fecham exatamente.**
Isso é a melhor notícia da análise: a unificação é matematicamente segura.

---

## 6. ETAPA 4 — RELATÓRIO DE QUALIDADE DOS DADOS

### 6.1 Problemas estruturais
| # | Problema | Gravidade | Detalhe |
|---|---|---|---|
| 1 | 2 linhas vazias no fim do Arq.1 (431, 432) | baixa | lixo de planilha, descartáveis |
| 2 | `Item` como float no Arq.2 (`609.0`) | baixa | normalizar para inteiro na migração |
| 3 | `_x000D_` (CR literal) embutido em textos | média | 32+ ocorrências em `Updated Status Obs`; limpar |
| 4 | `Tests` é lista multilinha dentro de 1 célula | **alta** | média 12,4 / máx. 96 por item → é entidade 1:N, não campo texto |
| 5 | `Bigram` multivalorado com `;` | média | até 6 valores → entidade N:N |
| 6 | Carimbo "Emissão 30/07" no Arq.2 com dados de 10/09 | **alta** | metadado mentiroso; induz a erro |
| 7 | Cabeçalho `Previous Status ??/??/2026` | **alta** | a data do baseline **foi perdida** |

### 6.2 Sujeira de valores
| Campo | Problema |
|---|---|
| `Mode` | 10 variantes para ~4 conceitos: `Local/Remote` (93), `Local / Remote` (11), `Local/ Remote (DA, DM). Local (DN).` (7), `Local/ Remoto (DJ)` (2, **português**), `Mode: Local / Remote...` (1, prefixo duplicado), `-` (2), `Not applicable` (3), 8 vazios |
| `Performance` | texto sem espaços: `To blowinemergencyallballasttanks`, `To controltheshipplatformattitudes(trim).` — quebra busca |
| `Description` | idem: `LeaktestsofthevalvesDJ00002andDJ00004` |
| `Updated Status Obs` | erro de digitação `J08 - CTE **duli** signed`; duplicatas com/sem ponto final; 1 valor com aspas dentro de aspas |
| `Insp` | `Shipyard Certificate` (maiúsc. mista) vs `Shipyard certificate` no BD |
| `NºandDescription` | `99 - Several` é um balde genérico com **19 itens** e 12 `Performance` diferentes |

### 6.3 Lacunas
| Campo | Vazios (Arq.2) | Itens |
|---|---|---|
| `Insp` | 30 | 3102, 3136, 3138–3147, … (bloco 31xx) |
| `ActualJxDescription` | 30 | mesmo bloco |
| `Mode` | 8 | 3009, 3138–3141, 3144, 3160, 3300 |
| `Performance` | 2 | 3144, 3145 |
| `Updated Status Obs` | 67 | — |
| `Position AC` | 262 | só faz sentido para B05 (correto) |

→ O **bloco de itens 31xx** está sistematicamente incompleto. Parece ter sido adicionado
depois, por outro caminho. **Vale investigar com o dono do dado.**

### 6.4 Bugs encontrados nas fórmulas (Arquivo 1, aba `BD`)

| # | Célula | Bug | Impacto hoje | Impacto potencial |
|---|---|---|---|---|
| **B1** | `BD!B52` | Escrito `8 - Mou**t**ing not Completed` (falta o **n**). O critério vira `"8 - Mouting not Completed*"` e **nunca casa** com o valor real `8 - Mounting not Completed` | **0** (nenhum item nesse status hoje) | assim que 1 item voltar para esse status, ele some do painel B05 e o `Remaining` fica errado |
| **B2** | `BD!B14`, bloco `J06+` | Filtra `OriginalJx = "J06+"`, valor **inexistente** na base | painel sempre 0/0 | indicador morto ocupando espaço no `Resumo` |
| **B3** | `BD!C5` | `Remaining = C4 − E7 − E8` não subtrai `2 - Not Available Jx` (que o Bloco 3 subtrai) | 0 | inconsistência de definição entre blocos |
| **B4** | `BD!D10/E10` etc. | Depende de subtrair a linha "Under Analysis To" para compensar o curinga `*` | correto hoje | quebra se surgir outro status começando com `4 - Under Analysis` |
| **B5** | — | Bloco 1 filtra por `OriginalJx = J08`; Blocos 2 e 3 **não filtram** por Jx | — | os 3 painéis do `Resumo` medem universos diferentes sem avisar |

### 6.5 Incoerências status ⟷ observação (10 itens no Arq.2)
Itens `1 - Validated by ICN` cuja observação não indica conclusão:
657 (`BOC 324 closed…`), 662, 663, 707, 750 (`Registration correction for JXCer`),
890, 899 (`Corrected Pressure is not filled. There must be no blank fields.`),
1073, 1134 (`ICN sent the evidence for analysis.`), 3158 (`NCR-ICN-ESC-14-1129-2026`).

E no sentido inverso: item **623, 638, 646** estão em `7 - Missing Vacuum Test or Sign`
mas a observação (Arq.2) diz `B05 done, without pendencies.`; item **733** e **1102**
estão `3 - Blocking` com observação de conclusão.

→ **Não são erros necessariamente** — pode ser observação desatualizada. Mas o sistema novo
deve **detectar e listar** essas incoerências (é um dos relatórios que você pediu).

---

## 7. A REGRA DO `Previous Status` — por que sua proposta do item 7 precisa mudar

Você propôs: *ao alterar `Actual Status`, o sistema move o valor antigo para `Previous Status`.*

**Os dados dizem que essa NÃO é a regra atual, e adotá-la destruiria o indicador.**

O que os arquivos mostram:

- `Previous Status` **não é "o status anterior deste item"**. É **"o status de TODOS os itens na
  data de corte do relatório anterior"**. É uma **régua congelada**, comum a todos os 428 itens.
- Prova: no Arquivo 1, `Previous[09/09]` ≡ `Actual[09/09]` em **428/428**. A cópia foi feita
  **em bloco, uma vez**, no fechamento do ciclo — não item a item, a cada edição.
- Os 14 itens que mudaram entre 09/09 e 10/09 mantêm `Previous` = valor de 09/09.
  Os outros 414 também. É um snapshot, não um "anterior imediato".

**Se aplicássemos sua regra** (mover o anterior a cada edição), aconteceria isto: um item editado
3 vezes no mesmo ciclo passaria a ter `Previous` = penúltimo valor, e a diferença
`Atual − Anterior` **deixaria de significar "o que mudou desde o último relatório"**.
O indicador `(▲+01)` / `(▼-07)` do `Resumo` **perderia o sentido**.

**Minha recomendação (a decidir com você — §9, pergunta C1):**

> Abandonar `Previous Status` como **campo armazenado**. Passar a guardar:
> - `status_atual` (um único campo por item), e
> - um **histórico de eventos com data/hora**.
>
> Então `Previous Status` vira uma **função**: `status_em(item, data_de_corte)`.
> Com isso você reproduz o comparativo 09/09 vs 10/09 **e qualquer outro par de datas**
> (que é exatamente o que você pede na Etapa 18), sem trabalho manual e sem rotação de colunas.
>
> O trabalho manual que você quer eliminar (§2 do seu texto) **desaparece por construção**:
> não existe mais "atualizar o Previous Status", porque ele deixa de ser um campo.

A **exceção** a considerar: se o `Previous Status` do Arquivo 2 (baseline original) tiver valor
contratual/oficial próprio — isto é, se alguém precisar sempre comparar contra a foto inicial —
então isso vira um **marco nomeado** (ex.: "Baseline Inicial"), não um campo.

---

## 8. ETAPA 5 — PERGUNTAS

### 🔴 PERGUNTAS CRÍTICAS (bloqueiam o modelo de dados; não presumo nada aqui)

**C1. Semântica de `Previous Status`.**
Confirma o que descrevi em §7 — que `Previous Status` é a foto do relatório anterior (uma data de
corte comum a todos os itens), e não "o valor imediatamente anterior daquele item"?
E concorda em substituí-lo por `status_atual + histórico datado`, calculando o "anterior"
por data de corte? Se **não**, preciso saber qual é a regra real.

**C2. Quem manda em cada campo (regra de precedência da migração).**
Para os 26 conflitos de `Updated Status Obs`, 11 de `OriginalJx` e 3 de `Bigram`, qual é a
política?
&nbsp;&nbsp;(a) Arquivo 2 vence sempre (é o mais completo);
&nbsp;&nbsp;(b) Arquivo 1 vence sempre;
&nbsp;&nbsp;(c) **marcar todos como CONFLITO e você resolve um a um na tela** (é o que seu §5 pede — e o que eu recomendo);
&nbsp;&nbsp;(d) regra mista por campo (ex.: descritivos ← Arq.2, `Tests` ← Arq.1, observações ← conflito manual).

**C3. Item 3102 — o conflito que muda um número.**
`OriginalJx` = `J08` (Arq.1) ou `J06` (Arq.2)? É `Shipyard prerequisites`.
Se for `J06`, o painel "Shipyard Prerequisites (J08)" passa de **22/21** para **21/20**.
Qual é o valor correto?

**C4. Os 7 itens `J07` e o bloco `J06+` morto.**
O Arquivo 1 não tem nenhum `J07` (achatou para `J08`); o Arquivo 2 tem 7.
O `J07` deve existir como valor válido de `OriginalJx`? E o painel `J06+` (sempre 0) deve ser
removido, ou é um valor que passará a existir no futuro?

**C5. Baseline do `Previous Status ??/??/2026` (Arquivo 2).**
Qual é a **data real** desse baseline? Ele tem valor oficial (marco contratual) ou é apenas
resíduo da primeira extração? Devo preservá-lo como snapshot nomeado no histórico?

**C6. Qual é o universo oficial: 428 é tudo?**
O comentário na planilha diz `528 / 805`, e os itens vão de 528 a 3300 com lacunas.
Os 428 itens são o escopo **completo e fechado** do J08, ou é um recorte de um universo maior
(805?) que pode crescer? Isso define se o sistema precisa suportar **ingestão periódica de
novas extrações** — o que muda bastante a arquitetura.

**C7. O sistema substitui ou convive com o Excel?**
A nova base passa a ser a origem (você edita **só** no sistema e o Excel deixa de ser editado),
ou vai continuar chegando uma extração nova do sistema de origem que precisa ser **re-importada
e mesclada** periodicamente? Se for o segundo caso, preciso saber **quais campos o sistema de
origem manda** (e que o usuário não pode editar) e **quais são propriedade do seu sistema**.

### 🟡 PERGUNTAS IMPORTANTES

**I1. Domínio de status.** Confirmo os 14 status da lista mestra (§3.6) como domínio fechado?
Posso ordená-los pelo prefixo numérico (0…8) como severidade? `0 - Canceled` é um estado final?

**I2. Transições permitidas.** Existe fluxo obrigatório (ex.: `6 - Waiting B05` → `5 - Waiting Proof`
→ `4 - Under Analysis` → `1 - Validated`), ou qualquer status pode ir para qualquer outro?
Isso define se o Kanban bloqueia ou permite qualquer arraste.

**I3. Colunas do Kanban.** Com 14 status, um Kanban de 14 colunas é inutilizável.
Proponho agrupar pela família numérica em ~6 colunas:
`Pendente (6,8)` · `Em prova (5)` · `Em análise (4)` · `Bloqueado (3,7)` · `Aceito c/ ressalva (2)` · `Validado (1)` · `Cancelado (0)`.
Concorda? Ou prefere as colunas por status exato com rolagem horizontal?

**I4. Quem edita?** Quantas pessoas vão usar o sistema? **Ao mesmo tempo?**
Isso decide sozinho a questão JSON vs SQLite vs servidor local (seu §4). Se for **uma pessoa por vez**,
a solução simples funciona. Se forem 3+ simultâneas, JSON em arquivo é inviável.

**I5. Autoria.** Você quer rastrear **quem** fez cada alteração (campo Usuário no histórico)?
Se sim, é login com senha ou apenas "identifique-se" (nome escolhido na primeira vez)?

**I6. `Tests` (93 itens, até 96 testes cada).** Isso deve virar uma **entidade filha** (lista de
testes por item, com nº, código e situação tipo `[10 - GQ - PASTAS FINALIZADAS]`), permitindo
indicador "itens com testes pendentes"? Ou basta guardar como texto?

**I7. `Bigram`.** São sistemas/compartimentos do submarino? Devem virar **filtro multi-seleção**
(item aparece se tiver qualquer um dos selecionados)? Os 59 códigos atômicos têm uma tabela de
descrição em algum lugar?

**I8. Campos editáveis.** Além de `Actual Status`, quais destes você quer poder editar?
`Updated Status Obs`, `General Obs`, `NCR's`, `InspType`, `OriginalJx`, `Description`, `Tests`?
E quais devem ser **somente leitura** (vindos da extração)?

**I9. Data efetiva da mudança.** Quando você muda um status, a data que vale é a de **hoje**
(quando você digitou) ou você precisa poder informar **"isto aconteceu em 05/09"**?
Isso importa muito para o dashboard histórico (Etapa 18) ficar correto.

**I10. Limpeza de dados.** Posso normalizar `Mode` (unificar `Local/Remote`, `Local / Remote`,
`Local/ Remoto (DJ)`) e corrigir `duli`→`duly`, mantendo o valor original guardado?
Ou os textos devem ficar **exatamente** como estão porque alguém os confere contra o sistema de origem?

**I11. `99 - Several`.** 19 itens caem nesse balde com 12 `Performance` diferentes.
É um problema conhecido que vale sinalizar como "classificação pendente", ou é legítimo?

### 🟢 PERGUNTAS OPCIONAIS

**O1. Aging.** Não existe **nenhuma data por item** nos dois arquivos — nem de criação, nem de
última alteração. Isso significa que **"aging" e "tempo médio em cada status" são impossíveis
hoje** e só passam a existir **a partir do dia 1 do novo sistema**. Confirma que aceita isso?
(Posso usar a data da migração como marco zero para todos.)

**O2. Metas.** Existe prazo/meta por `InspType` ou por marco (ex.: "todos os B05 validados até X")?
Isso habilitaria indicador de tendência com linha de meta.

**O3. Idioma da interface.** Português, inglês, ou bilíngue? (Os dados estão em inglês, as
planilhas em português.)

**O4. Cores.** Quer manter a convenção de cor atual (amarelo = mudou no ciclo, verde/vermelho nas
setas ▲▼) ou posso propor uma paleta por severidade de status?

**O5. Anexos.** Observações precisam de anexo (foto, PDF do B05, NCR)? Isso muda o backup e o
tamanho da base.

**O6. Emissão de relatório oficial.** O `Resumo` atual é impresso/enviado para alguém?
Se sim, preciso reproduzir o layout exato em PDF (com as setas ▲+01 / ▼-07 e os marcadores ■).

---

## 9. SUGESTÕES DE MELHORIA (prévia — detalho na Etapa 6 após suas respostas)

1. **Trocar "rotação de colunas" por "histórico de eventos + marcos (milestones)".**
   Em vez de `Previous[29/07]`, `Actual[09/09]`, `Previous[09/09]`, `Actual[10/09]`…, guardar um
   histórico datado e criar **marcos nomeados** (`Emissão 29/07`, `Emissão 09/09`, `Emissão 10/09`).
   Qualquer comparação "data A vs data B" vira uma consulta — e o `Resumo` atual vira
   um caso particular ("marco anterior vs hoje"). **Resolve as Etapas 18, 19 e 20 de uma vez.**

2. **Derivar o "amarelo" automaticamente** em vez de pintar à mão.

3. **Unificar a definição de "em aberto"** em **uma** configuração
   (`status_abertos = tudo que não é 1, 2-*`), usada por todos os indicadores.
   Hoje ela está escrita 30+ vezes em `COUNTIFS` diferentes — e já divergiu (bug B3).

4. **Corrigir o bug `Mouting`** e remover o bloco morto `J06+` (ou ativá-lo corretamente).

5. **Promover `Tests` e `Bigram` a entidades próprias**, em vez de texto concatenado.

6. **Guardar `Item` como texto** na base, mesmo sendo numérico hoje — evita o problema
   `609` vs `609.0` e protege contra o dia em que aparecer um item `1234-A`.

7. **Painel de conflitos permanente**, não só na migração: sempre que uma nova extração chegar
   e divergir do que está no sistema, o conflito entra numa fila de decisão em vez de sobrescrever.

8. **Registrar a procedência de cada campo** (`origem: arquivo1 | arquivo2 | editado_no_sistema`).
   Assim, meses depois, ainda dá para saber de onde veio cada valor.

---

## 10. Próximo passo

Aguardo suas respostas, **principalmente às 7 perguntas críticas (C1–C7)**.
Com elas em mãos, entrego as Etapas 6, 7 e 8 (arquitetura comparada, modelo de dados detalhado e
proposta visual). **Só começo a programar depois da sua aprovação explícita da arquitetura.**

### Anexos gerados
- `analise/dados_extraidos/file1_SafetyMilestoneJ08_Report_Crossing_FV.csv` — 428 itens × 24 colunas
- `analise/dados_extraidos/file2_ResumoFluxoEvidencia_Report_Crossing_FV.csv` — 428 itens × 21 colunas
- `analise/dados_extraidos/*.py` — scripts de extração, comparação, reconciliação e qualidade (reproduzíveis)
