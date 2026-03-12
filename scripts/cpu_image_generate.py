#!/usr/bin/env python3
import argparse
import json
import os
import time
from pathlib import Path

import torch
from diffusers import DPMSolverMultistepScheduler, StableDiffusionPipeline
from PIL import Image, ImageFilter


def parse_args():
    parser = argparse.ArgumentParser(description="CPU image generation via diffusers")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--model", default="stabilityai/stable-diffusion-2-base")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--steps", type=int, default=14)
    parser.add_argument("--guidance", type=float, default=7.5)
    parser.add_argument("--seed", type=int, default=1234567)
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def ensure_multiple_of_8(value: int) -> int:
    if value < 64:
        value = 64
    return value - (value % 8)


def maybe_set_threads(threads: int):
    if threads and threads > 0:
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(max(1, threads // 2))


def build_pipeline(model_id: str):
    local_files_only = os.getenv("CPU_IMAGE_LOCAL_FILES_ONLY", "false").lower() in ("1", "true", "yes")
    pipe = StableDiffusionPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float32,
        local_files_only=local_files_only,
        safety_checker=None,
        requires_safety_checker=False,
    )
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
        pipe.scheduler.config,
        use_karras_sigmas=True,
    )
    pipe = pipe.to("cpu")
    pipe.enable_attention_slicing("auto")
    try:
        pipe.enable_vae_slicing()
    except Exception:
        pass
    pipe.set_progress_bar_config(disable=True)
    return pipe


def enhance_image(image: Image.Image, target_w: int, target_h: int) -> Image.Image:
    if image.size != (target_w, target_h):
        image = image.resize((target_w, target_h), Image.Resampling.LANCZOS)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.4, percent=110, threshold=2))
    return image


def main():
    args = parse_args()
    maybe_set_threads(args.threads)

    width = ensure_multiple_of_8(args.width)
    height = ensure_multiple_of_8(args.height)
    steps = max(2, min(args.steps, 40))
    guidance = max(2.5, min(args.guidance, 12.0))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # CPU speed path: generate at lower latent resolution, upscale to target UHD.
    speed_scale = float(os.getenv("CPU_IMAGE_SPEED_SCALE", "0.14"))
    speed_scale = max(0.08, min(speed_scale, 1.0))
    latent_w = ensure_multiple_of_8(int(width * speed_scale))
    latent_h = ensure_multiple_of_8(int(height * speed_scale))

    negative_prompt = os.getenv(
        "CPU_IMAGE_NEGATIVE_PROMPT",
        "low quality, blurry, distorted, extra limbs, artifacts, watermark, text",
    )

    start = time.time()
    pipe = build_pipeline(args.model)
    generator = torch.Generator(device="cpu").manual_seed(args.seed)
    result = pipe(
        prompt=args.prompt.strip(),
        negative_prompt=negative_prompt,
        width=latent_w,
        height=latent_h,
        num_inference_steps=steps,
        guidance_scale=guidance,
        generator=generator,
    )
    image = result.images[0]
    image = enhance_image(image, width, height)
    image.save(output_path, format="PNG", optimize=True)
    elapsed = round(time.time() - start, 2)

    print(
        json.dumps(
            {
                "ok": True,
                "output": str(output_path),
                "width": width,
                "height": height,
                "steps": steps,
                "elapsedSeconds": elapsed,
            }
        )
    )


if __name__ == "__main__":
    main()
