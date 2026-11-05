# On-device AI (models, pipelines, validation)

PhotogramBot downloads its ML models on demand — **none are bundled in the
APK**. Settings → On-device AI manages them (~17 MB total).

## Models

| Model | File | Source | Input | Output |
| --- | --- | --- | --- | --- |
| Face detection | `blaze_face_short_range.tflite` | MediaPipe (Apache-2.0) | 128×128 RGB, [-1,1] | regressors 896×16, scores 896×1 |
| Face embedding | `mobilefacenet.tflite` | MobileFaceNet (Ente FlutterFace family) | 112×112 RGB, [-1,1] | 192-d vector (L2-normalized) |
| Scene labels | `mobilenet_v3_small.tflite` | TF Hub LiteRT (Apache-2.0) | 224×224 RGB, [0,1] | 1001 logits |
| Labels | `imagenet_labels.txt` | TensorFlow | — | 1,000/1,001 lines |

The defaults can be replaced per model by a custom URL (stored in
`prefs.mlModelUrls`). Downloads land in
`documentDirectory/ml-models/<filename>`; deleting a model clears the cached
interpreter.

## Pipelines

- **Faces:** detect (BlazeFace) → crop with 25% padding → embed (MobileFaceNet)
  → store a Float32 BLOB in `face_embeddings` → cluster every stored face with
  cosine similarity ≥ 0.62 + union-find → `people` rows. The People screen reads
  `getPeopleClusters()`.
- **Scenes:** MobileNetV3 → top-6 labels above 0.08 → `scene:<label>` tags.
  Gemini alternative: one vision call per photo → `gemini:<label>` tags.
- **Preprocessing:** `expo-image-manipulator` resizes/crops; `jpeg-js` decodes
  the result to RGBA; `imageTensor.ts` builds the NHWC Float32 tensor.
- **Source image:** local original if present, else the cached channel
  preview/thumbnail.

## Validation status (important)

The **geometry and clustering are unit-tested** (`faceMath.test.mjs`,
`peopleCluster.test.mjs`), but the TFLite **tensor I/O is not device-verified**.
Before trusting the results on a build:

1. Download the models, open Maintenance → On-device AI.
2. Run **Build people index** on a small library; check the Diagnostics log for
   tensor-shape/embedding errors.
3. Compare a few clusters against the photos; adjust the 0.62 threshold if
   people are over/under-merged.
4. Run **Tag scenes (on-device)** on a known set (beach/dog/receipt) and check
   the `scene:` tags; if the labels are shifted, the model expects a different
   background offset (the code auto-detects 1,000 vs 1,001 labels).
5. If a model URL changes, replace it in Settings (custom URL) or update the
   registry in `src/lib/mlModels.ts`.

The pipelines fail soft: an unreadable image/model logs a diagnostic and the
photo is retried on a later pass; the app never crashes on an inference error.
