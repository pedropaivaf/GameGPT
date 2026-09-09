# Pipeline de assets

Os modelos de origem são FBX com texturas PBR em 4K. O da Beretta sozinho tem
41 MB. Nada disso pode ser baixado antes de uma partida, e nada disso está no
repositório.

O que está versionado é o resultado: geometria reduzida e embutida como base64
dentro do `index.html`, que é onde ela realmente vive.

## Os números

| Modelo | Origem | Embutido |
|---|---|---|
| Beretta M9A1 | 41 MB FBX + 35 MB de texturas | 242 KB |
| Braços e mãos | 0,5 MB FBX + 69 MB de texturas | 328 KB |
| Rifle | — | 694 KB |
| Terrorista (skinned) | — | 577 KB |

## O caminho

```
FBX  →  extract.py  →  pack.py  →  emit.py  →  index.html
         geometria      quantiza     base64
```

**`tools/fbx.py`** é um leitor de FBX binário 7.x escrito do zero — só o
suficiente do formato para tirar geometria, nomes de objeto e o grafo de
conexões de um mesh estático. Sem dependência do SDK da Autodesk.

**`tools/extract.py`** triangula os polígonos, resolve normais e UVs (que podem
vir mapeadas por vértice de polígono ou por ponto de controle, diretas ou
indexadas) e aplica a transformação local de cada modelo.

**`tools/pack.py`** solda vértices duplicados, agrupa as peças pelo que anima
junto e pela pintura, e quantiza: posições em uint16 sobre uma caixa
compartilhada, normais em int16. São 12 bytes por vértice em vez de 24.

**`tools/emit.py`** escreve o resultado como uma string base64 dentro de um
arquivo `.js` pronto para colar.

## Por que a Beretta não tem textura

O modelo vem com base color, normal e roughness em 4K. Reduzidos para caber numa
página, os normal maps viravam granulado — detalhe de alta frequência assado de
um modelo high-poly não sobrevive ao downsample.

A arma é pintada em código: preto fosco no ferrolho e no quadro, aço claro nos
controles, e um poste frontal verde fluorescente. Isso combina com o resto do
jogo, que é todo geometria sem textura, e cortou o payload de 1 MB para 242 KB.

O que sobreviveu do scan é o que valia: a silhueta real, com 11 mil triângulos e
ferrolho, carregador, cão e gatilho como peças separadas que animam.

## Um detalhe que custou caro

Metalness médio do modelo: **0,93**. Quase tudo é metal, e metal não tem termo
difuso — sem nada para refletir, renderiza preto.

Por isso a cena do view model carrega o próprio environment map prefiltrado: um
gradiente de céu e chão com um lóbulo de sol, gerado por código. É o que
transforma o ferrolho de silhueta em aço.

## Reprocessar um modelo

Os diretórios de origem estão no `.gitignore`. Para rodar o pipeline de novo,
recoloque-os na raiz do projeto:

```
beretta-m9a1-w-slide-lock/           source/*.fbx  textures/*.png
hand-and-arm-for-first-person-perspective/
sniper-rifle/
tm-phoenix-v2-csgo-terrorist-characters/
```

Depois, a partir de `tools/`:

```
python extract.py     # confere o que saiu do FBX: peças, contagens, limites
python pack.py        # solda, quantiza e escreve beretta.json
python emit.py        # embrulha em .js pronto para embutir
```

`extract.py` e `pack.py` estão configurados para a Beretta — os nomes das peças
e o agrupamento por pintura estão no topo do `pack.py`. Para outro modelo,
ajuste `GROUPS` ali.

As origens dos modelos estão em [../CREDITS.md](../CREDITS.md).
