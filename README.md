"# upgradepath"

## Curated FPS extractor (offline)

To update the curated FPS table from the large benchmark dataset, run:

```bash
npm run extract:curated
```

By default this reads:

```
C:\Custom Programs\PC upgrade optimizer\data\GPUdataset.json
```

You can also pass a custom path:

```bash
npm run extract:curated -- "D:\path\to\GPUdataset.json"
```

This writes:

```
data/gpu_fps_curated.generated.json
```

If you want the app to use the new data, copy or rename the generated file to:

```
data/gpu_fps_curated.json
```
