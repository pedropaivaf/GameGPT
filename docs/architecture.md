# Arquitetura

O jogo é um arquivo só. Tudo — geometria, áudio, texturas procedurais, os
modelos convertidos — vive dentro do `index.html`, dentro de uma única função
`bootGame()`. Não há sistema de módulos e não há build step: o arquivo que você
edita é o arquivo que roda.

Isso é uma escolha, não uma limitação aceita. Scripts clássicos funcionam a
partir de `file://`; módulos ES não. Manter tudo num arquivo significa que o
jogo pode ser mandado por e-mail e aberto com dois cliques.

O custo é que o arquivo tem 2 MB e não se navega por ele com um índice. As
seções são marcadas por comentários de cabeçalho (`// --- Nome ---`), e é assim
que se acha as coisas.

## O orçamento de quadro

O alvo é 144 FPS, ou seja 6,9 ms por quadro. As decisões abaixo existem quase
todas por causa disso.

Medições atuais numa cena típica: **~50 chamadas de desenho**, 650 mil
triângulos, **0,4 ms** de CPU por quadro (mediana) para simular e submeter.

## Hash espacial

Toda consulta de colisão passa por uma grade uniforme no plano do chão
(células de 72 m). Antes, cada consulta percorria a lista inteira de sólidos.

Isso importa porque a varredura do gancho roda **dentro do passo fixo de física,
a 120 Hz**. O custo dela precisa ser plano conforme a cidade cresce, senão
adicionar prédios reduz o frame rate.

Sólidos não são meshes. São registros simples — uma caixa e uma etiqueta de
superfície:

```js
{userData:{bounds, surface, stamp, body}}
```

Isso é o que permite colidir contra geometria mesclada: a cidade inteira é um
punhado de meshes gigantes, mas cada prédio ainda tem seu próprio volume de
colisão registrado.

## Colisores em streaming

São ~2000 sólidos. O Cannon nunca vê mais que a vizinhança de 3×3 células ao
redor do jogador — cerca de 25 corpos. Os demais existem como objetos JS
soltos até você chegar perto.

`refreshColliders()` roda quando o jogador cruza uma fronteira de célula. Com
células de 72 m e velocidade máxima de 78 m/s, sempre há folga de sobra.

## Geometria mesclada

A cidade é construída num acumulador e despejada em uma malha por material.
~700 prédios mais toda a tralha de telhado saem em poucas chamadas de desenho.

As UVs são geradas por face a partir das dimensões em metros, então a fileira de
janelas tem o mesmo tamanho real numa torre de 160 m e num prédio de 20 m.

## Inimigos instanciados por osso

A versão antiga tinha um `THREE.Group` por soldado — cada um custava dezenas de
chamadas de desenho. Hoje o rig é montado uma vez e assado em geometrias por
osso; todos os hostis da cidade são instâncias dessas.

As matrizes de mundo dos ossos são compostas à mão a cada quadro. A detecção de
acerto é analítica contra a esfera da cabeça e a cápsula do tronco que essas
matrizes produzem — nada depende do grafo de cena, e por isso um tiro em alguém
fora da tela funciona igual.

## Balística analítica

Balas não usam `THREE.Raycaster`. Cada passo é um segmento testado por slab
contra o hash espacial, mais testes de esfera contra os hostis. É mais rápido e
funciona contra a geometria mesclada, onde não existe mesh por prédio.

Penetração usa a espessura real atravessada, comparada com limites por material
e por munição.

## Voo dos jetpacks

Quatro escoltas voam. Elas **não são corpos do Cannon** — a simulação do mundo
só carrega o jogador. Cada uma integra o próprio movimento: gravidade, um servo
de altitude que só empurra para cima, arrasto, e uma varredura de caixa contra o
mesmo hash espacial.

O servo é a parte que importa: como o propulsor só empurra para cima, uma
descida é uma queda de verdade, não empuxo reverso.

Levar um tiro no ar corta o empuxo e o corpo termina a queda. É por isso que a
marca de sangue espera o pouso — pintá-la no telhado no instante do disparo
deixaria a mancha no lugar errado.

## Grafo dos andaimes

A rede de andaimes precisa ser percorrível de verdade, não decorativa. Cada
degrau é um colisor real com altura abaixo do que a cápsula do jogador sobe.

`scaffoldStats` registra os pisos, os degraus e as entradas, e é isso que
permite **verificar a continuidade da rota por teste** em vez de olhar e achar
que está bom. O teste faz uma busca em largura pelos pisos: dois se conectam se
as superfícies estão a menos de 28 cm de altura uma da outra e se sobrepõem no
plano. Todas as entradas precisam ser alcançáveis a partir da primeira.

## O gancho

Três coisas o definem:

**Alcance.** A busca é um raycast analítico sobre o hash espacial, então acerta
geometria mesclada. Antes só um punhado de prédios era registrado como sólido, e
o gancho não mordia em quase lugar nenhum.

**A corda.** Não é um clamp de velocidade — isso matava o balanço no fundo de
cada arco. É uma constraint suave: a velocidade de afastamento é removida com
uma folga, e o excesso é corrigido por um termo de bias.

**O guincho.** Segurar `Q` encurta o cabo sob tensão e reescala a velocidade
tangencial pela razão de raios — conservação de momento angular. Puxar no meio
do balanço acelera o arco, e soltar preserva tudo isso. A aceleração do motor
supera a gravidade, então dá para subir um cabo do qual você está pendurado.

## View model

Renderizado por uma segunda câmera numa segunda cena, para a arma nunca entrar
na parede. O campo de visão dela é um ajuste separado do mundo.

Toda posição e ângulo que decide a pose vive em `viewTune`, não espalhado pelos
construtores. É isso que permite o editor da tecla `F4` dirigir tudo ao vivo e
persistir o resultado. Veja [viewmodel-tuning.md](viewmodel-tuning.md).

Uma armadilha que vale registrar: a mão é rolada ~77° para empunhar a arma.
Girar o antebraço com um ângulo de Euler local **não** o gira em termos de tela —
isso cruzava os dois braços. A pose de mira aponta o cotovelo por uma direção no
espaço da arma e desfaz a rotação da mão.

## Áudio

Sintetizado em tempo de execução com a Web Audio API. Nenhum arquivo de som é
baixado. Barramentos separados para disparos, ambiente e foley.
