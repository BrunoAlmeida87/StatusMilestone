# Testes

Testes de comportamento em Chromium real, via Playwright. Eles injetam a base na
página e exercitam a interface como um usuário faria — incluindo arraste de card
com mouse de verdade.

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

Os scripts esperam o Chromium do Playwright em
`/opt/pw-browsers/chromium-*/chrome-linux/chrome` e um `database.json` no caminho
indicado no topo de cada arquivo — ajuste os dois conforme a sua máquina.

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
