# Créditos

## Bibliotecas

Carregadas por CDN em tempo de execução, não versionadas:

- **[Three.js](https://threejs.org)** r128 — renderização
- **[cannon.js](https://github.com/schteppe/cannon.js)** 0.6.2 — física do jogador

## Modelos

Os modelos abaixo foram convertidos e embutidos no `index.html` pelo pipeline
descrito em [docs/asset-pipeline.md](docs/asset-pipeline.md). Os arquivos de
origem não estão no repositório.

- **Beretta M9A1 w/ Slide lock** — KaL-ABIZZARE, via
  [Sketchfab](https://sketchfab.com/3d-models/beretta-m9a1-w-slide-lock-00b62f6007c44267bb29673ee7cb24e6)
- **Hand and arm for first person perspective** — via Sketchfab
- **Sniper rifle** — via Sketchfab
- **tm_phoenix_v2** — modelo de terrorista do Counter-Strike, usado como
  personagem inimigo

> Verifique a licença de cada modelo antes de distribuir o jogo. Vários assets
> gratuitos do Sketchfab são CC-BY e exigem atribuição ao autor; o modelo do
> Counter-Strike é propriedade da Valve e não é livre para redistribuição
> comercial. Este projeto é de estudo.

## Feito em código

Sem asset externo:

- Toda a cidade — prédios, ruas, calçadas, semáforos, andaimes, trânsito
- As texturas de fachada, telhado, concreto e o mapa de ruas (canvas procedural)
- O céu, o ciclo de dia e noite, a chuva
- Todo o áudio, sintetizado com a Web Audio API
- O environment map que ilumina o view model
- O rifle M-40 original, antes de ser substituído pelo modelo scaneado
