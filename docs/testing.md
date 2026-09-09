# Testes

Cinco suítes, 19 asserções offline mais uma de integração. Nenhuma delas usa
mock do jogo: todas extraem as funções reais do `index.html` e as executam
contra a mesma geometria embutida que roda em produção.

```
node --test tests/mission-regression.cjs tests/map-physics.cjs \
            tests/jetpack-physics.cjs tests/weapon-pose.cjs
```

As suítes offline leem o `index.html` como texto, recortam as funções que
precisam e as avaliam num contexto `vm` com stubs mínimos. Isso significa que
**renomear uma função quebra o teste dela** — de propósito. O teste aponta para
a implementação, não para uma cópia que pode envelhecer em silêncio.

## `mission-regression.cjs`

Protege a condição de vitória. O bug original: eliminar os três alvos
prioritários encerrava a partida com dezenas de escoltas ainda vivas.

Cobre também acerto repetido em cadáver, que não pode contar duas vezes nem
atrasar a vitória.

## `map-physics.cjs`

Vidro quebrável e a rede de andaimes.

O teste dos andaimes é o mais interessante: faz busca em largura pelos pisos
registrados em `scaffoldStats`, onde dois se conectam se as superfícies estão a
menos de 28 cm de altura e se sobrepõem no plano. Exige que **todas** as entradas
de telhado sejam alcançáveis a partir da primeira, que todo degrau tenha altura
escalável, e que a rede não estoure o orçamento de colisores.

É a diferença entre "os andaimes parecem certos" e "dá para subir por eles".

## `jetpack-physics.cjs`

Voo, colisão varrida e morte no ar. Verifica que o empuxo levanta sob gravidade,
que a patrulha fica sobre o telhado, que uma parede fina para um voador rápido,
que o teto barra a subida, que perder o propulsor vira queda balística, e que o
corpo deixa **exatamente uma** marca de sangue no telhado onde de fato caiu.

Também cobre o `restart` e a previsão de tiro incluir velocidade vertical.

## `weapon-pose.cjs`

Enquadramento e integridade dos braços, em três proporções de tela (16:9, 21:9 e
retrato) e três valores de FOV.

Verifica que as miras ficam no centro da tela — se saírem, a arma aponta para
onde o tiro não vai —, que a arma cabe na horizontal, que os antebraços seguem
presos ao punho, e que as normais acompanham a geometria depois de deformada.

Dois limites aqui são **preferência de enquadramento**, não correção, e foram
recalibrados de propósito para a pose que ficou no jogo: quanto o cabo pode
descer na tela, e quanto do antebraço pode passar da câmera. Os que protegem a
mira continuam apertados.

## `runtime-smoke.cjs`

A única que precisa de navegador.

```
python devserver.py &
node tests/runtime-smoke.cjs
```

Sobe o `index.html` num Chromium de verdade, com shaders, modelos e física reais,
e confere boot, contagem de inimigos e sólidos, o fluxo da missão do começo ao
fim, e a pose do view model. Escreve capturas em `tests/artifacts/`.

## Dependências

`tests/vendor/` traz Three.js e os módulos que as suítes offline importam.
Estão versionados de propósito: fixam a versão contra a qual os testes rodam e
evitam que uma rede ruim quebre a suíte.
