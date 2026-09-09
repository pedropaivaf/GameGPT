# Pipeline de assets

Converte um FBX com texturas em um payload base64 pequeno o bastante para viver
dentro do `index.html`. Escrito para a Beretta; adaptar para outro modelo é
mexer em `GROUPS`, no topo do `pack.py`.

Requer `numpy` e `pillow`, e os diretórios de modelo na raiz do projeto (não
versionados — veja [../docs/asset-pipeline.md](../docs/asset-pipeline.md)).

| Arquivo | O que faz |
|---|---|
| `fbx.py` | Leitor de FBX binário 7.x, escrito do zero. Sem SDK da Autodesk |
| `extract.py` | Triangula, resolve normais e UVs, aplica as transformações |
| `pack.py` | Solda vértices, agrupa por animação e pintura, quantiza para 16 bits |
| `emit.py` | Embrulha o resultado como string base64 num `.js` |
| `textures.py` | Reduz e empacota os mapas PBR (não usado pela Beretta atual) |

```
python extract.py     # inspeciona: peças, contagens, limites
python pack.py        # escreve out/beretta.json
python emit.py        # escreve o .js pronto para embutir
```

A saída vai para `out/`, que é ignorada pelo git.

Rodar `extract.py` sozinho é a forma mais rápida de entender um FBX novo: ele
lista cada peça com material, contagem de triângulos e caixa delimitadora, que é
o que se precisa para decidir o agrupamento.
