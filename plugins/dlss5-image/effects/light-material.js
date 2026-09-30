(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({ shadows: 45, lighting: 42, texture: 38, reflections: 32 });
  const MAX_PIXELS = 24_000_000;
  const MAX_SOURCE_LENGTH = 60 * 1024 * 1024;

  function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
  function smoothstep(low, high, value) {
    const t = clamp((value - low) / (high - low), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function settings(value) {
    const input = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => {
      const number = Number(input[key]);
      return [key, Number.isFinite(number) ? clamp(number, 0, 100) : fallback];
    }));
  }
  function luminance(data, index) {
    return (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
  }
  function processRows(output, original, fine, broad, width, start, end, values) {
    const shadows = values.shadows / 100;
    const lighting = values.lighting / 100;
    const texture = values.texture / 100;
    const reflections = values.reflections / 100;
    for (let y = start; y < end; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const alpha = original[i + 3];
        if (!alpha) continue;
        const lum = luminance(original, i);
        const local = luminance(broad, i);
        const fineLum = luminance(fine, i);
        const darkWeight = 1 - smoothstep(0.20, 0.68, lum);
        const highWeight = smoothstep(0.35, 0.85, lum);
        const brightDifference = Math.max(0, lum - local);
        // Reinforce existing illumination boundaries; do not draw synthetic shadows.
        const shadowDelta = shadows * darkWeight * (0.010 + clamp((lum - local) * 0.34, -0.055, 0.055));
        const lightDelta = lighting * (0.013 + highWeight * 0.027) * (1 - lum);
        // Only brighten highlights already brighter than their surroundings.
        const specular = highWeight * smoothstep(0.015, 0.12, brightDifference);
        const reflectionDelta = reflections * specular * 0.105 * (1 - lum);
        const flatProtection = smoothstep(0.007, 0.045, Math.abs(lum - fineLum));
        const detailWeight = texture * flatProtection * smoothstep(0.06, 0.22, lum) * (1 - smoothstep(0.90, 1, lum));
        const tone = (shadowDelta + lightDelta + reflectionDelta) * 255;
        for (let channel = 0; channel < 3; channel++) {
          const residual = clamp(original[i + channel] - fine[i + channel], -24, 24);
          const warmLight = channel === 0 ? lighting * highWeight * 1.8 : channel === 2 ? -lighting * highWeight * 0.8 : 0;
          output[i + channel] = clamp(original[i + channel] + tone + residual * detailWeight * 0.8 + warmLight, 0, 255);
        }
        output[i + 3] = alpha;
      }
    }
  }
  function createCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  function context(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建图片处理画布');
    return ctx;
  }
  function decode(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('无法读取增强结果图片，可能是素材地址不允许画布访问'));
      image.src = source;
    });
  }
  async function enhanceSource(source, value) {
    const image = await decode(source);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error('增强结果图片尺寸无效');
    if (width * height > MAX_PIXELS) throw new Error('光影材质模式暂支持最多 2400 万像素；请改用基础增强模式');
    const values = settings(value);
    const canvas = createCanvas(width, height);
    const ctx = context(canvas);
    ctx.drawImage(image, 0, 0);
    let original;
    try { original = ctx.getImageData(0, 0, width, height); }
    catch { throw new Error('当前素材不允许读取像素，请使用本地图片或基础增强模式'); }

    const fineCanvas = createCanvas(width, height);
    const fineCtx = context(fineCanvas);
    fineCtx.filter = 'blur(1.4px)';
    fineCtx.drawImage(canvas, 0, 0);
    fineCtx.filter = 'none';
    const fine = fineCtx.getImageData(0, 0, width, height).data;

    const small = createCanvas(Math.max(1, Math.ceil(width / 24)), Math.max(1, Math.ceil(height / 24)));
    const smallCtx = context(small);
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.imageSmoothingQuality = 'high';
    smallCtx.drawImage(canvas, 0, 0, small.width, small.height);
    const broadCanvas = createCanvas(width, height);
    const broadCtx = context(broadCanvas);
    broadCtx.imageSmoothingEnabled = true;
    broadCtx.imageSmoothingQuality = 'high';
    broadCtx.drawImage(small, 0, 0, width, height);
    const broad = broadCtx.getImageData(0, 0, width, height).data;

    const result = ctx.createImageData(width, height);
    for (let row = 0; row < height; row += 160) {
      processRows(result.data, original.data, fine, broad, width, row, Math.min(height, row + 160), values);
      if (row + 160 < height) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    ctx.putImageData(result, 0, 0);
    let mime = 'image/png';
    let dataUrl = canvas.toDataURL(mime);
    if (dataUrl.length > MAX_SOURCE_LENGTH) {
      mime = 'image/webp';
      dataUrl = canvas.toDataURL(mime, 0.94);
    }
    if (dataUrl.length > MAX_SOURCE_LENGTH) throw new Error('增强后的图片超过画布输出上限，请使用较小尺寸图片');
    return { source: dataUrl, mime, name: `光影材质增强-${Date.now()}.${mime === 'image/png' ? 'png' : 'webp'}`, width, height };
  }

  root.DlssLightMaterial = Object.freeze({ DEFAULTS, settings, processRows, enhanceSource });
})(globalThis);
