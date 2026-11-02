# Third-party components

All processing is local. No user image is sent to these distribution sites.

| Component | Version / source | License |
|---|---|---|
| Transformers.js | @huggingface/transformers 3.8.1, dist/transformers.min.js (renamed transformers.web.min.js) | Apache-2.0 |
| ONNX Runtime Web | 1.22.0-dev.20250409-89f8206ba4; WASM supplied in Transformers.js distribution | MIT |
| MediaPipe Tasks Vision | @mediapipe/tasks-vision 0.10.22-rc.20250304; vision_bundle.mjs and SIMD/non-SIMD WASM runtimes | Apache-2.0 |
| Selfie multiclass segmentation | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite | Apache-2.0 (MediaPipe model distribution) |
| Depth Anything V2 Small, ONNX q8 conversion | https://huggingface.co/onnx-community/depth-anything-v2-small ; base https://huggingface.co/depth-anything/Depth-Anything-V2-Small | Apache-2.0 |

Downloaded 2026-11-02. Exact bundled bytes are recorded in `assets/checksums.json`. These weights are not modified. Shader/editor code is separate from the model distributions. License texts are in `licenses/`; bundled JavaScript retains vendor license banners. The runtime has remote model loading disabled.

Source model classes: background, hair, body-skin, face-skin, clothes, other-accessories. Skin uses classes 2+3, subject uses 1-background. Models may produce classification/depth errors and the UI offers manual skin correction and depth preview.

## Face landmarks (0.3.0)

MediaPipe Face Landmarker float16 v1 task: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task . MediaPipe model distribution, Apache-2.0; license text included in licenses/MediaPipe-Apache-2.0.txt. Downloaded 2026-11-02.

Pixel Cake was reviewed for general architecture only. Its workspace declares UNLICENSED. No Pixel Cake implementation code or model weights are included. Portrait shaders, control mapping, skin smoothing and Lab statistics transfer were independently implemented.
