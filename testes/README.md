# Testes

Duas camadas: testes de unidade do motor, que rodam em Node puro, e testes de
comportamento em Chromium real, via Playwright.

## Unidade (Node, sem navegador e sem base real)

```bash
node testes/unidade.mjs        # 218 verificações: persistência (arquivo inexistente,
                               # conflito de revisão, JSON corrompido, permissão negada,
                               # falha em createWritable/write/close), fila de gravação,
                               # edição durante a escrita, descarte de pendentes (tudo e
                               # uma só) e metadados derivados, cache do histórico,
                               # filtros na URL/localStorage, vistas salvas, "o que mudou
                               # desde a última visita", validação estrutural da base,
                               # regra aberto/fechado vinda da config, arquivamento de
                               # histórico, colunas escolhidas, edição em lote, teclado,
                               # presença por item e a tela de Evidence Flow
```

Não precisa instalar nada e não usa dado nenhum do projeto: `testes/app_em_node.mjs`
carrega os blocos `<script>` do próprio `docs/index.html` num contexto do Node com um
DOM mínimo, troca a pasta do usuário por uma pasta de mentira (que sabe falhar de
propósito, em cada ponto da File System Access API) e traz uma base sintética de
quatro itens. É o arquivo publicado que é testado, não uma cópia. Sai com código
diferente de zero quando alguma verificação falha.

O DOM de mentira imita o que importa: atribuir `innerHTML` passa a "criar" os
elementos com `id` que estão no texto, e `#ov` só existe enquanto há um modal
aberto. É isso que permite testar a ligação dos botões de uma tela recém-desenhada
(a barra de lote, por exemplo) sem abrir navegador.

## Comportamento (Chromium real, via Playwright)

Injetam a base na página e exercitam a interface como um usuário faria — incluindo
arraste de card com mouse de verdade. Precisam da **sua** base:

```bash
export SM_DATABASE=~/caminho/para/database.json   # obrigatório
export SM_CHROMIUM=/caminho/do/chrome             # opcional (padrão: o do Playwright)
```

```bash
pip install playwright
python3 testes/comportamento.py        # 65 verificações: carga, edição, pendentes,
                                       # consolidação, agrupamento, descarte, histórico,
                                       # filtros, exportação, temas, responsivo
python3 testes/kanban_e_graficos.py    # 55: arraste real, seletor de status no card,
                                       # ordenação alfanumérica, diagramas de fluxo (base sem
                                       # config.fluxo, quadro "outros status" dentro da moldura),
                                       # balão de texto completo, gráfico de função vital,
                                       # painéis recolhíveis, ordem da página, paleta de status
python3 testes/conflitos.py            # 10: tela de conflitos, lote, regra de coerência
python3 testes/sincronizacao.py        # 31: duas pessoas na mesma base — junção automática,
                                       # decisão campo a campo, gravação concorrente, presença
```

Os quatro scripts leem o caminho da base em `SM_DATABASE` e, se quiser apontar um
executável específico, `SM_CHROMIUM` — nenhum caminho absoluto fica no repositório.
Sem `SM_DATABASE` o script para com uma mensagem explicando o que falta.

A gravação em disco é substituída por um stub: os testes verificam a lógica e a
interface, não a API de arquivos do navegador (essa não é automatizável, pois o
seletor de pasta é um diálogo nativo do sistema).

## Reconciliação dos números

Independente da interface, `migracao/validar.py` confere 30 indicadores contra os
valores das duas planilhas originais, incluindo a reconstrução histórica de
29/07, 09/09 e 10/09 por event sourcing:

```bash
python3 migracao/validar.py caminho/para/database.json
```
