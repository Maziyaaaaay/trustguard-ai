# Backend local tools

Install the local Tesseract OCR engine on Apple Silicon macOS with:

```sh
bash backend/install-local-tools.sh
```

The installer keeps Micromamba and Tesseract under the ignored `.tools/`
directory at the repository root. The API detects this local Tesseract path
automatically; no API key or external OCR service is used. Python dependencies
are listed in `requirements.txt` and should be installed into `backend/.venv`.

FFmpeg is optional and enables audio extraction from uploaded videos. If it is
already on `PATH`, TrustGuard uses it automatically.
