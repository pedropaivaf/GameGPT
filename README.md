# Meridiano

Um jogo de tiro em primeira pessoa que roda no navegador, num único arquivo HTML.
Três alvos em helipontos no alto de uma cidade, escoltas espalhadas pelos
telhados, um gancho para atravessar os vãos e trânsito circulando lá embaixo.

Feito para rodar a **144 FPS**: a cidade inteira sai em ~50 chamadas de desenho,
e o quadro custa menos de 1 ms de CPU.

```
git clone https://github.com/pedropaivaf/GameGPT.git
cd GameGPT
python devserver.py
```

Abra <http://127.0.0.1:8765/index.html>.

O `index.html` também abre direto pelo `file://`, sem servidor — só o registro de
telemetria em disco precisa do `devserver.py`. As duas únicas dependências
externas são Three.js e cannon.js, buscadas em CDN.

## Controles

| Tecla | Ação |
|---|---|
| `W` `A` `S` `D` / `Shift` | Andar / correr |
| Mouse / `Espaço` | Olhar / pular — no cabo, soltar com o impulso do balanço |
| `E` ou botão do meio | Lançar o gancho em qualquer superfície sólida |
| `Q` (segurar) | Guincho: recolhe o cabo e puxa enquanto você balança |
| `Ctrl` | Dar corda e alongar o arco do balanço |
| Botão esquerdo / direito | Disparar / segurar para mirar |
| `1` `2` / roda / `R` | Trocar arma / trocar arma / recarregar |
| `F3` | Painel de diagnóstico ao vivo |
| `F4` | Editor do view model (a tecla é configurável) |
| `F2` | Marcar "bugou aqui" no `debug.log` |
| `Esc` | Pausar |

## O que tem dentro

**Cidade** — quarteirões de 75 m com ruas, calçadas elevadas, semáforos e
arborização. Cerca de 700 prédios, todos sólidos e escaláveis. Rede de andaimes
com passarelas e escadas de degraus reais ligando os objetivos a pé.

**Trânsito** — centenas de veículos em faixas de mão dupla, com distância do
carro da frente e parada em semáforo. Pedestres circulam nas calçadas.

**Inimigos** — 96 hostis em esquadras nos telhados, com percepção graduada:
visão de curto alcance, alerta por tiro que acerta perto e por baixa de um
colega ao lado. Quatro deles patrulham de jetpack, com voo integrado à parte da
física do mundo.

**Gancho** — projétil real, corda com constraint elástica, guincho que vence a
gravidade e conserva momento angular ao encurtar o cabo, e um vault que te
coloca em cima do parapeito.

**Armas** — rifle M-40 e Beretta M9A1 suprimida, ambas com modelo de verdade,
recarga coreografada por keyframes e miras de ferro alinhadas ao eixo da câmera.

## Estrutura

```
index.html              o jogo inteiro: código, geometria e áudio
devserver.py            servidor local que também grava a telemetria
tests/                  suítes de regressão (Node) e de integração (Playwright)
tools/                  pipeline que converte FBX em payload embutido
docs/                   documentação técnica
```

## Testes

```
node --test tests/mission-regression.cjs tests/map-physics.cjs \
            tests/jetpack-physics.cjs tests/weapon-pose.cjs
```

Essas quatro rodam sem navegador: extraem as funções reais do `index.html` e as
executam contra a mesma geometria embutida que o jogo usa.

```
python devserver.py &
node tests/runtime-smoke.cjs
```

Essa sobe o jogo num Chromium de verdade e verifica boot, missão e view model.

Mais detalhes em [docs/testing.md](docs/testing.md).

## Documentação

- [Arquitetura](docs/architecture.md) — as decisões que sustentam os 144 FPS
- [Pipeline de assets](docs/asset-pipeline.md) — de FBX de 41 MB a payload embutido
- [Editor do view model](docs/viewmodel-tuning.md) — o overlay de ajuste (F4)
- [Testes](docs/testing.md) — o que cada suíte protege
- [Créditos](CREDITS.md) — modelos e bibliotecas de terceiros
