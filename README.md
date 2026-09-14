# StatusMilestone

Sistema local de acompanhamento do fluxo de evidências do marco **J08**, substituindo os dois
arquivos Excel (`SafetyMilestoneJ08.xlsx` e `Resumo_Fluxo_Evidencia.xlsb`) por **uma única base**.

**▶ Abrir o sistema:** https://brunoalmeida87.github.io/StatusMilestone/

> ⚠️ **Nenhum dado do projeto está neste repositório.** A base vive num `database.json` numa pasta
> sua (local ou de rede), escolhida na primeira abertura. O `.gitignore` bloqueia csv, xlsx, xlsb
> e qualquer `database*.json` para que isso não mude.

---

## Como usar

1. Abra o link acima no **Chrome** ou **Edge** (a gravação direta em pasta não existe no Firefox/Safari).
2. Clique em **Selecionar pasta da base** e escolha a pasta onde está — ou onde ficará — o `database.json`.
3. Autorize a gravação. A partir daí o sistema lê e grava sozinho naquela pasta.

Também funciona **sem internet**: baixe `docs/index.html` e abra por duplo clique.

## O que ele faz

| Tela | Conteúdo |
|---|---|
| **Dashboard** | KPIs, Evidence Flow (B05 / exceto B05), Shipyard Prerequisites, Functional Insp. Type, evolução, aging, pendências por tipo e por função vital |
| **Itens** | Tabela ordenável com busca, filtros combináveis e edição pelo detalhe |
| **Kanban** | 6 colunas por família de status, arrastar e soltar, colunas recolhíveis |
| **Histórico** | Compara **quaisquer duas datas** e reconstrói o estado em cada uma |
| **Relatórios** | 12 relatórios prontos, exportação em CSV / Excel / JSON / PDF |
| **Conflitos** | Fila de decisão das divergências entre os dois Excel — nada foi sobrescrito |
| **Configurações** | Parâmetros, status ativos, backup/restauração, integridade, log técnico |

## Como as alterações são salvas

```
edição → autosave (3 s) → alteração pendente → 10 min sem novo toque → histórico definitivo
```

O autosave protege o trabalho **sem** poluir o histórico. Dentro da janela, `A → B → C` vira um
único evento `A → C`, e `A → B → A` não gera evento nenhum. O botão **Salvar alterações agora**
consolida na hora. O tempo é configurável.

## Validação

O sistema reproduz **todos** os números dos dois dashboards originais:

| | Excel | Sistema |
|---|---|---|
| B05 total / em aberto | 166 / 12 | ✅ 166 / 12 |
| Exceto B05 total / em aberto | 262 / 59 | ✅ 262 / 59 |
| Functional Insp. total / em aberto | 240 / 38 | ✅ 240 / 38 |
| Shipyard Prerequisites (J08) | 22 / 21 | **21 / 20** ⚠️ |
| Total geral em aberto | 71 | ✅ 71 |
| Estado em 29/07 e 09/09 (reconstruído) | 74 e 80 | ✅ 74 e 80 |

⚠️ **A única diferença é intencional**: o item 3102 tem `OriginalJx = J06` (Arquivo 2), e não `J08`
como constava no Arquivo 1. Como o painel filtra por J08, ele sai da conta. Decisão registrada em
[`analise/02_DECISOES.md`](analise/02_DECISOES.md) (C3/C4).

Rode você mesmo: `python3 migracao/validar.py caminho/para/database.json`

## Estrutura

```
docs/index.html                  o sistema inteiro (publicado no GitHub Pages)
migracao/migrar.py               converte os dois Excel na base única
migracao/validar.py              reconciliação contra os números do Excel
analise/01_ANALISE_DOS_ARQUIVOS.md    engenharia reversa e qualidade dos dados
analise/02_DECISOES.md                decisões de negócio tomadas
analise/03_ARQUITETURA_E_MODELO.md    arquitetura, modelo de dados e telas
```

## Migrar novamente

```bash
python3 migracao/migrar.py --file1 arquivo1.csv --file2 arquivo2.csv --out database.json
python3 migracao/validar.py database.json
```

Os CSVs saem das abas `Report_Crossing_FV` dos dois arquivos originais (cabeçalho na linha 2).

## Requisitos

Chrome ou Edge para gravação automática em pasta. Em outros navegadores o sistema abre em modo
manual (abrir / baixar a base) e avisa na tela.
