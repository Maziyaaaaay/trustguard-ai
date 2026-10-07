# Local AI image classifier

Source: https://huggingface.co/onnx-community/ai-image-detect-distilled-ONNX
Upstream: https://huggingface.co/jacoballessio/ai-image-detect-distilled
Revision: `7f067e23521eeb6d6525221af82c613fb746aaff`
Artifact: `onnx/model_quantized.onnx` saved as `image_detector.onnx`.
SHA256: `2851ac1386acd399576a205efce6d9e10e4167363317b74fa8259065a9ee7540`
License declared by publisher: MIT. Preserved publisher model card alongside this file.

## Inference

EXIF orientation correction; RGB conversion; bilinear resize to 224x224;
normalize each channel with mean 0.5 and standard deviation 0.5.
NCHW float32 inputs. Published class mapping: 0=fake, 1=real.
Softmax score is not calibrated as probability. Provisional conservative thresholds:
>=80 likely AI-generated; <=20 likely photographic; otherwise inconclusive.
Not a fraud, identity or factual-truth detector. Metadata does not change its score.
No photo is sent to Hugging Face or an external detector. Model weights are bundled.
Location metadata remains internal. Neither GPS presence nor raw EXIF is returned in image API results. It does not automatically change the model score.
Image quality/recompression score remains separate. The primary image risk score uses the rounded AI class score and Live Guard bands: 0–29 low, 30–50 review, 51–100 high. These policy bands do not alter the classifier uncertainty thresholds or improve accuracy. Inconclusive classifier outputs receive a null final score and REVIEW status instead of a high-risk warning. This applies to all images, without sample-specific overrides.

## Evaluation limitations

Publisher reports 74% validation accuracy, not independently verified here.
Tested known real user photo 1-img-new.jpg: 57.2 AI class score, inconclusive.
EXIF supports Apple iPhone 13 Pro Max camera origin but can be spoofed.
This is an example of detector uncertainty, not a successful real/AI distinction.
A runtime failure returns unavailable, never defaults to real.
Representative labelled photographs and current generator outputs are needed before
making accuracy claims or using this as an automated decision system.
Audio and video still do not have pretrained AI classifiers in this pipeline.
