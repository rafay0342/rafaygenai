#!/usr/bin/env bash
# Download a minimal set of models used by this app's ComfyUI workflows.
#
# Usage:
#   COMFY_HOME="$HOME/ComfyUI" HF_TOKEN=hf_xxx ./scripts/download-comfy-models.sh
#
# Notes:
# - Requires curl (aria2c optional for faster multi-connection downloads).
# - Some models on Hugging Face may require that you've accepted their license.
# - Set HF_TOKEN if the model requires authentication; otherwise it's optional.

set -euo pipefail

COMFY_HOME=${COMFY_HOME:-"$HOME/ComfyUI"}
CHECKPOINT_DIR="$COMFY_HOME/models/checkpoints"
VAE_DIR="$COMFY_HOME/models/vae"
UPSCALE_DIR="$COMFY_HOME/models/upscale_models"
LORA_DIR="$COMFY_HOME/models/loras"

mkdir -p "$CHECKPOINT_DIR" "$VAE_DIR" "$UPSCALE_DIR" "$LORA_DIR"

hf_download() {
  local url="$1" dest="$2" label="$3"
  if [ -f "$dest" ]; then
    echo "✔ $label already present at $dest"
    return 0
  fi

  echo "⬇  Downloading $label"

  if command -v aria2c >/dev/null 2>&1; then
    aria2c --continue=true --max-connection-per-server=8 --min-split-size=5M \
      --header="Authorization: Bearer ${HF_TOKEN:-}" \
      --out "$(basename "$dest")" --dir "$(dirname "$dest")" "$url"
  else
    curl -L "$url" -H "Authorization: Bearer ${HF_TOKEN:-}" -o "$dest"
  fi
}

# Image checkpoint (SDXL) used by COMFYUI_IMAGE_WORKFLOW
hf_download \
  "https://huggingface.co/SG161222/RealVisXL_V4.0/resolve/main/RealVisXL_V4.0.safetensors" \
  "$CHECKPOINT_DIR/RealVisXL_V4.0.safetensors" \
  "RealVisXL_V4.0 (SDXL)"

# VAE referenced in the sample workflow
hf_download \
  "https://huggingface.co/latent-consistency/lcm-lora-sdxl/resolve/main/qwen_image_vae.safetensors" \
  "$VAE_DIR/qwen_image_vae.safetensors" \
  "Qwen image VAE"

# 4x upscale model used by video workflow
hf_download \
  "https://huggingface.co/uwg/upscaler/resolve/main/4x-UltraSharp.pth" \
  "$UPSCALE_DIR/4x-UltraSharp.pth" \
  "4x-UltraSharp Upscaler"

# SD1.5 checkpoint for the optional sd15 video workflow
hf_download \
  "https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors" \
  "$CHECKPOINT_DIR/v1-5-pruned-emaonly.safetensors" \
  "Stable Diffusion 1.5 (for sd15 video workflow)"

# Qwen Image Edit LoRA for image generations
hf_download \
  "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/loras/Qwen-Image-Edit-2509-Light-Migration.safetensors" \
  "$LORA_DIR/Qwen-Image-Edit-2509-Light-Migration.safetensors" \
  "Qwen Image Edit LoRA"

echo "Done. Place additional LoRAs/controls in $COMFY_HOME/models as needed."
