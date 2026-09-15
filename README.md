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
| **Dashboard** | KPIs, Shipyard Prerequisites, B05 Status, Functional Insp. Type, evolução, aging, pendências por tipo e por função vital, e os dois Evidence Flow (B05 / exceto B05) no fim. Todo painel recolhe ao clicar no cabeçalho |
| **Itens** | Tabela ordenável com busca, filtros combináveis e edição pelo detalhe. Célula cortada mostra o conteúdo inteiro ao passar o mouse; o botão **Texto completo** desliga o corte |
| **Kanban** | 6 colunas por família de status, **horizontal ou vertical**, arrastar e soltar, colunas recolhíveis |
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

## Duas ou mais pessoas ao mesmo tempo

A base continua sendo **um único `database.json`** na pasta compartilhada. Cada sessão confere a
data do arquivo a cada poucos segundos (configurável) e, quando alguém grava, traz a versão nova
e **reaplica por cima o que ainda não tinha sido gravado aqui**.

| Situação | O que acontece |
|---|---|
| Ninguém tocou no mesmo dado | Junta sozinho, sem interromper ninguém |
| Campos diferentes do mesmo item | Junta sozinho |
| **Mesmo campo do mesmo item** | Abre a tela de decisão com os dois valores lado a lado — nada é sobrescrito em silêncio |
| Configuração / conflito de migração / restauração | Pede decisão (não dá para reaplicar sozinho) |

O valor descartado numa decisão vira o "anterior" do evento de histórico, então a troca fica
rastreável. O crachá no topo (**"N na base"**) mostra quantas pessoas estão com a base aberta —
cada uma escreve o próprio arquivo em `presenca/`, sem disputa de escrita.

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

O comportamento simultâneo tem suíte própria: `SM_DATABASE=... python3 testes/sincronizacao.py`
(31 verificações). O motor de gravação, o descarte de pendentes e o histórico têm testes de
unidade que rodam sem navegador e sem base real: `node testes/unidade.mjs` (91 verificações).

## Estrutura

```
docs/index.html                    o sistema inteiro (publicado no GitHub Pages)
docs/.nojekyll                     impede o Jekyll de processar a pasta

migracao/extrair.py                Excel -> CSV
migracao/migrar.py                 CSV -> database.json
migracao/validar.py                reconciliacao contra os numeros das planilhas

testes/unidade.mjs                 testes de unidade do motor (Node puro, base sintetica)
testes/*.py                        testes de comportamento em Chromium real
analise/01_ANALISE_DOS_ARQUIVOS.md engenharia reversa e qualidade dos dados
analise/02_DECISOES.md             decisoes de negocio tomadas
analise/03_ARQUITETURA_E_MODELO.md arquitetura, modelo de dados e telas
```

Nenhum dado do projeto é versionado. O `.gitignore` bloqueia csv, xlsx, xlsb e
qualquer `database*.json`, e o workflow do Pages falha o deploy se algum deles
aparecer em `docs/`.

## Refazer a base do zero

```bash
pip install openpyxl pyxlsb

python3 migracao/extrair.py --xlsx SafetyMilestoneJ08.xlsx \
                            --xlsb Resumo_Fluxo_Evidencia.xlsb --out-dir .
python3 migracao/migrar.py  --file1 file1_SafetyMilestoneJ08.csv \
                            --file2 file2_ResumoFluxoEvidencia.csv --out database.json
python3 migracao/validar.py database.json
```

As decisões de conflito ficam em `DECISOES_CONFLITO`, dentro de `migracao/migrar.py`:
o pipeline é determinístico e reproduz a mesma base a cada execução.

## Requisitos

Chrome ou Edge para gravação automática em pasta. Em outros navegadores o sistema abre em modo
manual (abrir / baixar a base) e avisa na tela.
