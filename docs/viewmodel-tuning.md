# Editor do view model

Posicionar uma arma em primeira pessoa editando números e recarregando é um
ciclo terrível. O jogo tem um editor embutido que dirige a pose ao vivo, com a
partida rodando por baixo.

Abra com **F4** (a tecla é configurável), ou pelo botão *Ajustar arma* na tela
inicial, ou em *Configurações → Visor e arma*.

## Como mexer

| | |
|---|---|
| Arrastar no visor | move a peça em X / Y |
| `Shift` + arrastar | profundidade — distância até a câmera |
| `Alt` + arrastar | rotaciona |
| Botão direito no visor | alterna entre a pose de mira e a de quadril |
| `1` / `2` | troca de arma; o painel acompanha |
| `Esc` | fecha e devolve o mouse ao jogo |

Tudo é salvo sozinho no navegador a cada mexida. Não existe botão de salvar
porque não é preciso — a linha no topo do painel pisca a cada gravação.

## O que dá para ajustar

O seletor de peça separa três níveis por braço, e essa separação é o ponto:

| Seção | Move |
|---|---|
| **Braço (todo)** | luva e antebraço juntos |
| **Luva** | só a mão — posição, giro e tamanho |
| **Antebraço** | só o antebraço — giro, deslocamento e tamanho |

Sem esses três níveis não havia como fechar um vão entre a mão e o antebraço:
mover "a mão" movia o braço inteiro junto, e a distância entre eles nunca mudava.

A luva e o antebraço giram **em torno da costura do punho**, então encaixar um
no outro é girar na junta, não arrastar o membro.

Outras seções:

- **Arma — quadril** e **Arma — mira**: posição e zoom em cada postura
- **Empunhadura (juntar mãos)**: aproxima as duas mãos simetricamente da linha
  central da arma, para os dedos fecharem atrás do cabo. Faixa útil em torno de
  0,006 — bem antes do máximo as mãos atravessam a arma
- **Mãos na mira** e **Antebraços na mira**: pose separada para quando se mira.
  Sem isso, uma pose serve as duas posturas e acertar uma estraga a outra.
  Ligar copia a pose atual, então nada salta
- **Escalas**: tamanho dos braços e da arma

## Estilos

Um estilo é uma cópia nomeada da pose, com um **escopo** dizendo quanto dela
recolocar:

- Tudo (as duas armas)
- Só esta arma
- Só a pose de mira
- Só a pose de quadril
- Só os braços

O escopo é o que os torna reaproveitáveis: uma pose de braço trabalhada na
pistola pode ser jogada no rifle, e uma distância de mira pode ser trocada sem
mexer no quadril que já estava certo.

## Levar a pose para outro lugar

*Configurações → Visor e arma* tem **Baixar .json** e **Abrir .json**, além de
copiar e colar. O formato é JSON válido com versão.

Para promover uma pose ao padrão do jogo — valendo em qualquer navegador, sem
depender do armazenamento local — cole os valores em `VIEW_TUNE_DEFAULTS`, no
`index.html`.

## Compatibilidade

O carregamento faz merge campo a campo contra os padrões. Uma pose salva por uma
versão anterior não consegue apagar um valor de que o rig depende, nem
contrabandear um número não-finito — um `NaN` ali propagava para a posição de
todo o view model e fazia arma e mãos sumirem.

Poses gravadas antes da versão 2 têm os quatro ângulos das mãos do rifle
repostos, porque foram assados de um padrão errado. O resto é preservado.
