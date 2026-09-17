# StatusMilestone

Sistema local de acompanhamento do fluxo de evidências do marco **J08**, substituindo os dois
arquivos Excel (`SafetyMilestoneJ08.xlsx` e `Resumo_Fluxo_Evidencia.xlsb`) por **uma única base**.

**▶ Abrir o sistema:** https://brunoalmeida87.github.io/StatusMilestone/
**▶ Só consultar (somente leitura):** https://brunoalmeida87.github.io/StatusMilestone/visualizador.html

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
| **Dashboard** | KPIs, Shipyard Prerequisites (**ActualJx = J08**), B05 Status, Functional Insp. Type, evolução, aging, pendências por tipo e por função vital, e os dois Evidence Flow (B05 / exceto B05) no fim. Todo painel recolhe ao clicar no cabeçalho |
| **Itens** | Tabela ordenável com busca, filtros combináveis, **botão de item novo** e edição pelo detalhe. **Colunas à escolha de cada um**, **seleção múltipla para aplicar o mesmo status em lote** e navegação por teclado (↑↓ anda, Enter abre, espaço marca). Célula cortada mostra o conteúdo inteiro ao passar o mouse; o botão **Texto completo** desliga o corte. No celular a tabela vira uma pilha de cartões |
| **Kanban** | 6 colunas por família de status, **horizontal ou vertical**, arrastar e soltar, colunas recolhíveis, e **exportar o quadro** como relatório |
| **Evidence Flow** | Os dois diagramas de fluxo (B05 / exceto B05), em tela própria |
| **Histórico** | Compara **quaisquer duas datas** e reconstrói o estado em cada uma |
| **Relatórios** | 11 relatórios prontos e a **janela de exportação**: escolha as colunas e saia em CSV, Excel, JSON, HTML ou **relatório PDF** |
| **Configurações** | Parâmetros, status ativos, **regra de "em aberto"**, backup/restauração, **tamanho da base e arquivamento de histórico**, integridade, log técnico (descartes e sobrescritas ficam 30 dias, configurável; o índice dos arquivamentos fica para sempre) |

Os filtros são o endereço da tela: aparecem como pílulas com **✕** ao lado da busca, sobrevivem
ao F5, viajam no fim da URL (dá para mandar o link de "estes 12 itens" para outra pessoa) e podem
virar **vistas salvas** com nome — que ficam no `database.json` e valem para todo mundo. Na
abertura, uma faixa no Dashboard resume **o que mudou desde a sua última visita**, com atalho para
o histórico do período.

## Exportação e relatórios

Toda tela que lista itens (Dashboard, Itens, Histórico, Relatórios) tem **um único botão de
exportar**, que abre a mesma janela:

- **as colunas são suas** — 27 campos para marcar, incluindo derivados (família do status, em
  aberto, aging, observações). A escolha fica guardada no seu navegador, com atalhos para *Todas*,
  *Padrão* e *Iguais às da tabela*;
- **CSV que abre certo** — separador (`;`, `,` ou tabulação), UTF-8 com ou sem BOM, e o que fazer
  com quebra de linha dentro da célula. O gerador tira caracteres de controle, normaliza `\r`,
  fecha toda célula entre aspas e desarma fórmula (`=`, `+`, `-`, `@`) — as três causas do arquivo
  que chegava desalinhado ou truncado;
- **relatório PDF de verdade** — um documento montado do zero: capa com o recorte, quem gerou e a
  revisão da base; resumo com KPIs, Evidence Flow, Shipyard e função vital; e o corpo em **dois
  formatos**. Não é mais a tela impressa. O mesmo documento sai como **HTML** para anexar num e-mail:
  - **tabela** paginada em A4 (retrato ou paisagem), com o cabeçalho repetido em toda página e linha
    que não parte ao meio;
  - **quadro Kanban** — o board em papel. As colunas agrupam por família do status, status, InspType,
    OriginalJx, ActualJx, função vital ou Insp; as colunas marcadas viram os campos do cartão (o
    **Item** é o título, o **Actual Status** a pílula colorida). O botão **↓ Exportar quadro** no
    Kanban já abre a janela nesse formato. Para caber no papel:

    | Cartão | O que mostra | 428 itens dão |
    |---|---|---|
    | Completo | rótulo e valor de cada campo | ~36 páginas |
    | Compacto (padrão) | os valores, sem os rótulos | ~27 páginas |
    | **Etiqueta** | só o código, colorido pelo status | **3 páginas — 1 a 70%** |

    Some-se a isso o **tamanho do cartão** (60–140%), as **colunas por página**, mostrar ou não as
    colunas vazias e imprimir num quadro só ou **uma coluna por página**. O botão **Quantas páginas
    vai dar?** monta o documento num quadro escondido e **mede** a altura — não é estimativa: nos
    testes o número bate com a contagem real do PDF;
- **Excel** em três abas (Resumo, Itens, Histórico) e **JSON** com o recorte e as colunas escolhidas.

**Mudar o desenho do relatório** sem mexer no sistema: a janela tem uma caixa de **CSS próprio** que
entra por último na folha de estilo, então vence o padrão sem precisar de `!important`. Os seletores
do quadro são `.quadro` (a grade), `.coluna`, `.coluna > .topo`, `.cartoes`, `.cartao`,
`.cartao .id`, `.cartao .campo` e `.pill`. Quase tudo está em `em` a partir da variável `--q` da
`.quadro` — mexer nela encolhe o cartão inteiro. O que se escreve ali fica guardado, vale para as
próximas exportações e **sai dentro do arquivo HTML**, que dá para abrir e continuar editando.

## O visualizador (pasta de transferência)

`docs/visualizador.html` é o **mesmo sistema sem a escrita**, para quem só precisa consultar o
status. Ponha o arquivo na pasta onde está o `database.json` e mande o caminho para quem precisar:

- **abre a base sozinho**, lendo o `database.json` que estiver na mesma pasta que ele;
- **não pergunta o nome de ninguém** e não tem item novo, edição em lote, arrastar no Kanban,
  salvar no detalhe nem tela de Configurações — no lugar dela há **Sobre a base**, que diz de
  quando é a informação (revisão, quem gravou, quando) e tem um botão de recarregar;
- **mantém** Dashboard, Itens, Kanban, Evidence Flow, Histórico, Relatórios e **a exportação
  inteira** — CSV, Excel, JSON, HTML e os dois relatórios, tabela e quadro;
- **não consegue gravar**: as rotinas de escrita não estão nesse arquivo (chamá-las devolve
  `SOMENTE_LEITURA`) e a pasta é aberta em modo de leitura. Os testes provam isso medindo que
  nenhum writer é aberto e que o `database.json` continua byte a byte o que era.

> Sobre o duplo clique: nenhum navegador deixa uma página em `file://` ler o arquivo vizinho — é
> trava de segurança deles. Na primeira abertura o visualizador pede a pasta **uma vez**; a partir
> daí ela volta sozinha e a base abre direto. Se a pasta for servida por http (intranet, ou o
> próprio GitHub Pages), ele lê sem pedir nada.

Ele é **gerado**, nunca editado à mão — `python3 ferramentas/gerar_visualizador.py`. Assim não
diverge do sistema: se o `index.html` mudar e ninguém regerar, `node testes/unidade.mjs` falha.

## Acrescentar um item à mão

**Itens ▸ + Novo item** abre um formulário com todos os campos da base (os de valor repetido
sugerem o que já existe). O código é conferido enquanto se digita — código repetido não entra, nem
com a caixa trocada. O item nasce com um evento no histórico com o seu nome e entra pelo mesmo
caminho de qualquer edição: pendente, autosave, e sobrevive à gravação de outra pessoa no meio.
Se os dois criarem o mesmo código, a tela de decisão aparece em vez de alguém perder o item.

## Onde a base fica

O caminho padrão é **`G:\DOP\GTO\3_INTERNO\01_SAFE_TO_DIVE\11_STATUS MILESTONE J08`** e pode
ser mudado em **Configurações ▸ Pasta da base** — a mudança fica guardada no próprio
`database.json`, então vale para todo mundo que abrir aquela base.

Nenhum navegador deixa um site abrir o seletor de pasta já dentro de um caminho (é trava de
segurança deles, não limitação daqui). Então o caminho aparece na tela de abertura com um botão
**Copiar**: cola-se na barra de endereço da janela do Windows (`Ctrl+L`) e chega-se lá num Enter.
Da segunda vez em diante a pasta volta sozinha, sem perguntar nada. Se a pasta escolhida não
terminar com o nome do caminho padrão, o sistema avisa — abrir a base errada é o engano que só
aparece semanas depois.

## Como as alterações são salvas

```
edição → autosave (3 s) → alteração pendente → 10 min sem novo toque → histórico definitivo
```

O autosave protege o trabalho **sem** poluir o histórico. Dentro da janela, `A → B → C` vira um
único evento `A → C`, e `A → B → A` não gera evento nenhum. O botão **Salvar alterações agora**
consolida na hora. O tempo é configurável. O crachá **"N pendentes"** abre a lista, e cada linha
pode ser descartada sozinha — descartar devolve o item ao estado anterior por inteiro, inclusive
o aging e a data de atualização.

No detalhe de um item, **‹ ›** (ou `Alt`+setas) pula para o item anterior/seguinte da lista filtrada
sem fechar a janela, e `Ctrl+Enter` salva e avança — revisar 71 itens vira um fluxo contínuo.

## Duas ou mais pessoas ao mesmo tempo

A base continua sendo **um único `database.json`** na pasta compartilhada. Cada sessão confere a
data do arquivo a cada poucos segundos (configurável) e, quando alguém grava, traz a versão nova
e **reaplica por cima o que ainda não tinha sido gravado aqui**.

Para gravar, a sessão pega uma trava na pasta (um `database.lock.json` com dono e prazo de 20 s),
confere a revisão do arquivo e, depois de fechá-lo, relê para confirmar que o que ficou lá é o
que ela gravou. Se outra pessoa gravou no mesmo instante, a gravação **não** é dada como salva:
as duas versões são juntadas e gravadas de novo. Nada disso torna a escrita atômica — a pasta
compartilhada não permite — mas nenhuma gravação some em silêncio.

| Situação | O que acontece |
|---|---|
| Ninguém tocou no mesmo dado | Junta sozinho, sem interromper ninguém |
| Campos diferentes do mesmo item | Junta sozinho |
| **Mesmo campo do mesmo item** | Abre a tela de decisão com os dois valores lado a lado — nada é sobrescrito em silêncio |
| Configuração / conflito de migração / restauração | Pede decisão (não dá para reaplicar sozinho) |

O valor descartado numa decisão vira o "anterior" do evento de histórico, então a troca fica
rastreável. O crachá no topo (**"N na base"**) mostra quantas pessoas estão com a base aberta —
cada uma escreve o próprio arquivo em `presenca/`, sem disputa de escrita. Cada arquivo também diz
**em quais itens a pessoa está mexendo**, e a tabela marca esses itens com **✎**: a colisão aparece
antes de acontecer, em vez de só ser resolvida depois.

## Quando a base crescer

Configurações mostra o tamanho do `database.json` e avisa acima de 8 MB (configurável). O
**arquivamento** move os eventos anteriores a uma data para a subpasta `historico/` — nada é
apagado — e deixa na base um evento-marco por item com o último status antes do corte, de modo que
a reconstrução **a partir do corte** continua exata. Datas anteriores passam a viver só no arquivo
gerado.

## Validação

O sistema reproduz **todos** os números dos dois dashboards originais:

| | Excel | Sistema |
|---|---|---|
| B05 total / em aberto | 166 / 12 | ✅ 166 / 12 |
| Exceto B05 total / em aberto | 262 / 59 | ✅ 262 / 59 |
| Functional Insp. total / em aberto | 240 / 38 | ✅ 240 / 38 |
| Shipyard Prerequisites (ActualJx = J08) | 22 / 21 | ver nota ⚠️ |
| Total geral em aberto | 71 | ✅ 71 |
| Estado em 29/07 e 09/09 (reconstruído) | 74 e 80 | ✅ 74 e 80 |

⚠️ **O painel passou a contar pelo marco atual (`ActualJx`), não pelo de origem.** Um
pré-requisito que nasceu em J07 e foi transferido para o J08 é um pré-requisito do J08; o que saiu
do J08 para o J09 deixou de ser. Era essa a regra do Excel, e a divergência de 21/20 que a versão
anterior registrava (item 3102, com `OriginalJx = J06` no Arquivo 2 — ver
[`analise/02_DECISOES.md`](analise/02_DECISOES.md), C3/C4) vinha de filtrar pelo campo errado.
`migracao/validar.py` agora confere os 22/21 por `ActualJx` e imprime a conta por `OriginalJx` ao
lado, para comparação — **rode-o na sua base para confirmar o fechamento**.

Rode você mesmo: `python3 migracao/validar.py caminho/para/database.json`

O comportamento simultâneo tem suíte própria: `SM_DATABASE=... python3 testes/sincronizacao.py`
(31 verificações). O motor de gravação, a validação da base, o descarte de pendentes, o histórico,
o arquivamento, os filtros, as colunas, o lote e o teclado têm testes de unidade que rodam sem
navegador e sem base real: `node testes/unidade.mjs` (503 verificações, das quais 75 são as
regressões da auditoria em [`analise/04_AUDITORIA.md`](analise/04_AUDITORIA.md)). A exportação, o
relatório PDF e o item novo têm suíte própria em Chromium (`SM_DATABASE=... python3
testes/exportacao.py`), e o visualizador tem a sua, servido de uma pasta com o `database.json` ao
lado, como vai viver na rede (`SM_DATABASE=... python3 testes/visualizador.py`).

## Estrutura

```
docs/index.html                    o sistema inteiro (publicado no GitHub Pages)
docs/visualizador.html             o mesmo sistema sem a escrita (GERADO, nao editar a mao)
docs/.nojekyll                     impede o Jekyll de processar a pasta

ferramentas/gerar_visualizador.py  gera o visualizador a partir do index.html
ferramentas/visualizador_shell.js  a abertura e as telas proprias do visualizador

migracao/extrair.py                Excel -> CSV
migracao/migrar.py                 CSV -> database.json
migracao/validar.py                reconciliacao contra os numeros das planilhas

testes/unidade.mjs                 testes de unidade do motor (Node puro, base sintetica)
testes/*.py                        testes de comportamento em Chromium real
analise/01_ANALISE_DOS_ARQUIVOS.md engenharia reversa e qualidade dos dados
analise/02_DECISOES.md             decisoes de negocio tomadas
analise/03_ARQUITETURA_E_MODELO.md arquitetura, modelo de dados e telas
analise/04_AUDITORIA.md            auditoria: erros, riscos, limites, WCAG e o que foi corrigido
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
manual (abrir / baixar a base) e avisa na tela — nesse modo o crachá de estado diz **"sem pasta —
só cópia local"** e cada alteração continua indo para a cópia de socorro no navegador, de onde dá
para recuperá-la em **Configurações**; o que ele não faz é gravar sozinho na pasta.
