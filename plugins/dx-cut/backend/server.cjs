"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// plugins/dx-cut/source/backend/server.ts
var import_node_readline = require("node:readline");
var import_promises4 = require("node:fs/promises");
var import_node_path4 = require("node:path");
var import_node_crypto3 = require("node:crypto");
var import_node_child_process4 = require("node:child_process");
var import_node_util = require("node:util");

// plugins/dx-cut/source/electron/media.ts
var import_node_child_process = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_promises2 = require("node:fs/promises");
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto = require("node:crypto");
var import_canvas = require("./vendor/canvas/index.js");

// plugins/dx-cut/source/electron/mediaTools.ts
var import_node_fs = require("node:fs");
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"), 1);
var bundledDirectory;
async function resolveMediaTool(name, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const override = env[name === "ffmpeg" ? "REACUT_FFMPEG" : "REACUT_FFPROBE"];
  const executable = platform === "win32" ? `${name}.exe` : name;
  const candidates = override ? [override] : options.bundledDirectory ? [import_node_path.default.join(options.bundledDirectory, executable)] : (env.PATH ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean).map((directory) => import_node_path.default.join(directory, executable)).concat(platform === "win32" ? [] : [
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`
  ]);
  for (const candidate of candidates) {
    try {
      if (!(await (0, import_promises.stat)(candidate)).isFile()) continue;
      await (0, import_promises.access)(candidate, platform === "win32" ? import_node_fs.constants.F_OK : import_node_fs.constants.X_OK);
      return candidate;
    } catch {
    }
  }
  if (override) throw new Error(`\u6240\u9009 ${name} \u4E0D\u53EF\u7528\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u91CD\u65B0\u9009\u62E9\u53EF\u6267\u884C\u6587\u4EF6\u3002`);
  if (options.bundledDirectory)
    throw new Error(`\u5185\u7F6E ${name} \u7F3A\u5931\u6216\u4E0D\u53EF\u6267\u884C\uFF0C\u8BF7\u91CD\u65B0\u5B89\u88C5\u5B8C\u6574\u5E94\u7528\u3002`);
  throw new Error(`\u627E\u4E0D\u5230 ${name}\u3002\u5F00\u53D1\u73AF\u5883\u8BF7\u5B89\u88C5 FFmpeg\uFF0C\u6216\u5728\u8BBE\u7F6E\u4E2D\u9009\u62E9\u53EF\u6267\u884C\u6587\u4EF6\u3002`);
}
function findMediaTool(name) {
  return resolveMediaTool(name, { bundledDirectory });
}

// plugins/dx-cut/source/electron/media.ts
var mediaShuttingDown = false;
var mediaTasks = /* @__PURE__ */ new Map();
var proxyTemporaries = /* @__PURE__ */ new Set();
function registerBundledFont(fontPath) {
  try {
    return Boolean(import_canvas.GlobalFonts.registerFromPath(fontPath, "Noto Sans SC"));
  } catch {
    return false;
  }
}
var developmentFont = import_node_path2.default.resolve(
  process.cwd(),
  "public/fonts/NotoSansSC.ttf"
);
if ((0, import_node_fs2.existsSync)(developmentFont)) registerBundledFont(developmentFont);
function mediaURL(file) {
  const root2 = process.env.HIOS_DXCUT_ROOT;
  if (!root2) throw new Error("HIOS \u5A92\u4F53\u76EE\u5F55\u672A\u521D\u59CB\u5316");
  const rel = import_node_path2.default.relative(root2, import_node_path2.default.resolve(file));
  if (!rel || rel.startsWith("..") || import_node_path2.default.isAbsolute(rel)) throw new Error("\u5A92\u4F53\u8D44\u6E90\u8D8A\u754C");
  return "hios-asset://local/asset-files/dx-cut/" + rel.split(/[\\/]/).map(encodeURIComponent).join("/");
}
function systemFontFamilies() {
  return [...new Set(import_canvas.GlobalFonts.families.map((font) => font.family))].sort(
    (a, b) => a.localeCompare(b)
  );
}
async function runMediaTool(name, args, timeout = 6e4, limit = 16 * 1024 * 1024, options = {}) {
  options.signal?.throwIfAborted();
  if (mediaShuttingDown) throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  const executable = await findMediaTool(name);
  options.signal?.throwIfAborted();
  if (mediaShuttingDown) throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  const localArgs = name === "ffprobe" ? ["-protocol_whitelist", "file,pipe", ...args] : args.flatMap(
    (argument) => argument === "-i" ? ["-protocol_whitelist", "file,pipe", argument] : [argument]
  );
  return new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process.spawn)(executable, localArgs, {
      shell: false,
      windowsHide: true
    });
    const abort = () => {
      failure = new Error("\u5DF2\u53D6\u6D88\u5904\u7406");
      child.kill("SIGKILL");
    };
    let finish;
    mediaTasks.set(
      child,
      new Promise((done) => {
        finish = done;
      })
    );
    const output = [];
    let bytes = 0;
    let diagnostic = "";
    let failure;
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => {
      failure = new Error(`${name} \u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u5A92\u4F53\u662F\u5426\u635F\u574F\u3002`);
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (data) => {
      options.onOutput?.(data.toString());
      bytes += data.length;
      if (bytes > limit) {
        failure = new Error(`${name} \u8F93\u51FA\u8D85\u8FC7\u5B89\u5168\u9650\u5236\u3002`);
        child.kill("SIGKILL");
      } else output.push(data);
    });
    child.stderr.on("data", (data) => {
      diagnostic = (diagnostic + String(data)).slice(-12e3);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      mediaTasks.delete(child);
      finish();
      if (failure || code !== 0)
        reject(
          failure ?? new Error(`${name} \u6267\u884C\u5931\u8D25\uFF1A${diagnostic.trim() || code}`)
        );
      else resolve2(Buffer.concat(output));
    });
  });
}
async function probeFile(file, signal) {
  return JSON.parse(
    (await runMediaTool("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      file
    ], 6e4, 16 * 1024 * 1024, { signal })).toString()
  );
}
function frameRate(raw) {
  if (!raw) return 0;
  const [a, b = "1"] = raw.split("/");
  const fps = Number(a) / Number(b);
  return Number.isFinite(fps) ? fps : 0;
}
function needsPreviewProxy(file, asset, probe) {
  const extension = import_node_path2.default.extname(file).toLowerCase();
  if (asset.kind === "image")
    return [".heic", ".heif", ".tif", ".tiff"].includes(extension);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const audioSupported = !audio || [
    "aac",
    "mp3",
    "opus",
    "vorbis",
    "flac",
    "pcm_s16le",
    "pcm_s24le",
    "pcm_f32le",
    "pcm_u8"
  ].includes(audio.codec_name ?? "");
  if (asset.kind === "audio")
    return !audioSupported || ![
      ".mp3",
      ".m4a",
      ".aac",
      ".wav",
      ".flac",
      ".ogg",
      ".oga",
      ".opus",
      ".webm"
    ].includes(extension);
  const unsupportedH264Pixels = video?.codec_name === "h264" && video.pix_fmt && !["yuv420p", "yuvj420p"].includes(video.pix_fmt);
  return Boolean(unsupportedH264Pixels) || !audioSupported || !["h264", "vp8", "vp9", "av1", "theora"].includes(
    video?.codec_name ?? ""
  ) || ![".mp4", ".m4v", ".webm", ".ogv", ".ogg"].includes(extension);
}
async function previewProxy(file, asset, probe, cacheDir, hash, signal) {
  if (!needsPreviewProxy(file, asset, probe)) return;
  const extension = asset.kind === "image" ? "png" : asset.kind === "audio" ? "m4a" : "mp4";
  const destination = import_node_path2.default.join(cacheDir, `${hash}-preview-v1.${extension}`);
  try {
    await (0, import_promises2.access)(destination);
    return mediaURL(destination);
  } catch {
  }
  const temporary = import_node_path2.default.join(cacheDir, `${hash}-${(0, import_node_crypto.randomUUID)()}.${extension}`);
  proxyTemporaries.add(temporary);
  try {
    const args = ["-v", "error", "-y", "-i", file];
    if (asset.kind === "image") args.push("-frames:v", "1", temporary);
    else if (asset.kind === "audio")
      args.push(
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        temporary
      );
    else {
      args.push(
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        temporary
      );
    }
    await runMediaTool("ffmpeg", args, 15 * 6e4, 16 * 1024 * 1024, { signal });
    await (0, import_promises2.rename)(temporary, destination);
    return mediaURL(destination);
  } finally {
    await (0, import_promises2.rm)(temporary, { force: true }).catch(() => {
    });
    proxyTemporaries.delete(temporary);
  }
}
async function importAssets(paths, cacheDir, signal) {
  await (0, import_promises2.mkdir)(cacheDir, { recursive: true });
  const assets = [];
  for (const supplied of paths) {
    signal?.throwIfAborted();
    const file = import_node_path2.default.resolve(supplied);
    const metadata = await (0, import_promises2.stat)(file);
    if (!metadata.isFile()) throw new Error(`\u65E0\u6CD5\u5BFC\u5165\u76EE\u5F55\uFF1A${file}`);
    const probe = await probeFile(file, signal);
    const video = probe.streams.find((s) => s.codec_type === "video");
    const audio = probe.streams.find((s) => s.codec_type === "audio");
    if (!video && !audio)
      throw new Error(`\u6CA1\u6709\u53EF\u7F16\u8F91\u7684\u97F3\u89C6\u9891\u6D41\uFF1A${import_node_path2.default.basename(file)}`);
    const image = Boolean(
      video && (/\b(image2|png_pipe|jpeg_pipe|webp_pipe|bmp_pipe|tiff_pipe)\b/.test(
        probe.format.format_name ?? ""
      ) || /\.(png|jpe?g|webp|bmp|tiff?|heic|heif|avif)$/i.test(file))
    );
    const duration = image ? 0 : Math.max(
      Number(probe.format.duration) || 0,
      Number(video?.duration) || 0,
      Number(audio?.duration) || 0
    );
    if (!image && duration <= 0)
      throw new Error(`\u65E0\u6CD5\u8BFB\u53D6\u5A92\u4F53\u65F6\u957F\uFF1A${import_node_path2.default.basename(file)}`);
    const rotation = video?.side_data_list?.find((s) => s.rotation !== void 0)?.rotation ?? Number(video?.tags?.rotate ?? 0);
    const rotated = Math.abs(rotation % 180) === 90;
    const [sarNumerator, sarDenominator] = (video?.sample_aspect_ratio ?? "1:1").split(":").map(Number);
    const sar = sarNumerator > 0 && sarDenominator > 0 ? sarNumerator / sarDenominator : 1;
    const displayWidth = Math.round((video?.width ?? 0) * sar);
    const displayHeight = video?.height ?? 0;
    const asset = {
      id: (0, import_node_crypto.randomUUID)(),
      name: import_node_path2.default.basename(file),
      path: file,
      url: mediaURL(file),
      kind: image ? "image" : video ? "video" : "audio",
      duration,
      width: rotated ? displayHeight : displayWidth,
      height: rotated ? displayWidth : displayHeight,
      fps: image ? 0 : frameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
      hasAudio: Boolean(audio)
    };
    const hash = (0, import_node_crypto.createHash)("sha256").update(`${file}:${metadata.size}:${metadata.mtimeMs}`).digest("hex").slice(0, 24);
    try {
      asset.previewUrl = await previewProxy(file, asset, probe, cacheDir, hash, signal);
    } catch (error) {
      signal?.throwIfAborted();
      asset.previewError = `\u65E0\u6CD5\u751F\u6210\u672C\u5730\u9884\u89C8\u4EE3\u7406\uFF1A${error instanceof Error ? error.message : String(error)}`;
    }
    if (video) {
      const thumbnail = import_node_path2.default.join(cacheDir, `${hash}.jpg`);
      try {
        await (0, import_promises2.access)(thumbnail);
      } catch {
        try {
          await runMediaTool("ffmpeg", [
            "-v",
            "error",
            "-y",
            ...image ? [] : ["-ss", String(Math.min(0.1, duration / 2))],
            "-i",
            file,
            "-frames:v",
            "1",
            "-vf",
            "scale=w=ceil(iw*sar/2)*2:h=ih,setsar=1,scale=320:180:force_original_aspect_ratio=decrease",
            "-q:v",
            "3",
            thumbnail
          ], 6e4, 16 * 1024 * 1024, { signal });
        } catch {
        }
      }
      try {
        await (0, import_promises2.access)(thumbnail);
        asset.thumbnail = mediaURL(thumbnail);
      } catch {
      }
    }
    if (audio) {
      try {
        const waveformRate = Math.max(
          1,
          Math.min(200, Math.floor(2e6 / duration))
        );
        const pcm = await runMediaTool(
          "ffmpeg",
          [
            "-v",
            "error",
            "-i",
            file,
            "-t",
            String(duration),
            "-vn",
            "-af",
            "aformat=channel_layouts=stereo,aeval=(abs(val(0))+abs(val(1)))/2:c=mono",
            "-ar",
            String(waveformRate),
            "-f",
            "f32le",
            "pipe:1"
          ],
          6e4,
          16 * 1024 * 1024,
          { signal }
        );
        const samples = Math.floor(pcm.length / 4);
        const bins = Math.min(160, samples);
        asset.waveform = Array.from({ length: bins }, (_, bin) => {
          const from = Math.floor(bin * samples / bins);
          const to = Math.floor((bin + 1) * samples / bins);
          let power = 0;
          for (let i = from; i < to; i++) power += pcm.readFloatLE(i * 4) ** 2;
          return Math.sqrt(power / Math.max(1, to - from));
        });
        const peak = Math.max(...asset.waveform, 1e-3);
        asset.waveform = asset.waveform.map(
          (value) => Math.min(1, value / peak)
        );
      } catch {
      }
    }
    signal?.throwIfAborted();
    assets.push(asset);
  }
  return assets;
}

// plugins/dx-cut/source/backend/video-encoder.ts
var import_node_child_process2 = require("node:child_process");
var ENCODERS = { cpu: "libx264", nvidia: "h264_nvenc", intel: "h264_qsv", amd: "h264_amf" };
function encoderArgs(encoder) {
  if (encoder === ENCODERS.nvidia) return ["-c:v", encoder, "-preset", "p4", "-rc", "vbr", "-cq", "20", "-b:v", "0"];
  if (encoder === ENCODERS.intel) return ["-c:v", encoder, "-global_quality", "20"];
  if (encoder === ENCODERS.amd) return ["-c:v", encoder, "-quality", "balanced", "-rc", "cqp", "-qp_i", "20", "-qp_p", "20"];
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"];
}
function probeEncoder(ffmpeg, encoder, signal) {
  if (signal?.aborted) return Promise.reject(new Error("\u5BFC\u51FA\u4EFB\u52A1\u5DF2\u53D6\u6D88"));
  return new Promise((resolve2, reject) => {
    (0, import_node_child_process2.execFile)(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=640x360:r=24", "-frames:v", "2", ...encoderArgs(encoder), "-pix_fmt", "yuv420p", "-f", "null", "-"],
      { windowsHide: true, timeout: 15e3, maxBuffer: 128 * 1024, signal },
      (error) => {
        if (signal?.aborted) reject(new Error("\u5BFC\u51FA\u4EFB\u52A1\u5DF2\u53D6\u6D88"));
        else resolve2(!error);
      }
    );
  });
}
async function selectVideoEncoder(ffmpeg, preference, signal, probe = probeEncoder) {
  if (preference === "cpu") return { encoder: ENCODERS.cpu, fallback: false };
  const candidates = preference === "auto" ? ["nvidia", "intel", "amd"] : [preference];
  for (const candidate of candidates) if (await probe(ffmpeg, ENCODERS[candidate], signal)) return { encoder: ENCODERS[candidate], fallback: false };
  return { encoder: ENCODERS.cpu, fallback: true };
}

// plugins/dx-cut/source/electron/export.ts
var import_node_child_process3 = require("node:child_process");
var import_node_crypto2 = require("node:crypto");
var import_promises3 = require("node:fs/promises");
var import_node_os = require("node:os");
var import_node_path3 = __toESM(require("node:path"), 1);
var import_canvas2 = require("./vendor/canvas/index.js");

// plugins/dx-cut/source/src/core/model.ts
var projectDuration = (project) => project.clips.reduce(
  (end, clip) => Math.max(end, clip.start + clip.duration),
  0
);
function fadeWindow(clip, kind) {
  return kind === "video" ? clip.videoFadeWindow ?? {
    offset: 0,
    duration: clip.duration,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut
  } : clip.audioFadeWindow ?? {
    offset: 0,
    duration: clip.duration,
    fadeIn: clip.audioFadeIn,
    fadeOut: clip.audioFadeOut
  };
}
function validateProject(input2) {
  const fail = (name) => {
    throw new Error(`\u9879\u76EE ${name} \u65E0\u6548`);
  };
  const object = (value, name) => {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
      fail(name);
    return value;
  };
  const str = (value, name, max = 4096, empty = false) => {
    if (typeof value !== "string" || value.length > max || !empty && !value.length || value.includes("\0"))
      fail(name);
    return value;
  };
  const num = (value, name, low = -1e9, high = 1e9) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high)
      fail(name);
    return value;
  };
  const bool = (value, name) => {
    if (typeof value !== "boolean") fail(name);
  };
  const list = (value, name, max) => {
    if (!Array.isArray(value) || value.length > max) fail(name);
    return value;
  };
  const choice = (value, choices, name) => {
    if (typeof value !== "string" || !choices.includes(value)) fail(name);
  };
  const color2 = (value, name) => {
    str(value, name, 32);
    if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(value) && !/^(black|white|red|green|blue|transparent)$/i.test(value))
      fail(name);
  };
  const p = object(input2, "\u5185\u5BB9");
  if (p.version !== 1) fail("\u7248\u672C\uFF08\u4EC5\u652F\u6301\u7248\u672C 1\uFF09");
  str(p.id, "ID", 256);
  str(p.name, "\u540D\u79F0", 4096, true);
  for (const field of ["width", "height"])
    if (!Number.isInteger(num(p[field], field, 16, 7680))) fail(field);
  if (![24, 25, 30, 50, 60].includes(num(p.fps, "\u5E27\u7387"))) fail("\u5E27\u7387");
  color2(p.background, "\u80CC\u666F\u989C\u8272");
  for (const field of ["createdAt", "updatedAt"])
    if (!Number.isFinite(Date.parse(str(p[field], field, 64)))) fail(field);
  const rawAssets = list(p.assets, "\u7D20\u6750\u5217\u8868", 1e4), rawTracks = list(p.tracks, "\u8F68\u9053\u5217\u8868", 1e3), rawClips = list(p.clips, "\u7247\u6BB5\u5217\u8868", 1e4);
  const ids = /* @__PURE__ */ new Set();
  const recordId = (item, label) => {
    const value = str(item.id, `${label} ID`, 256);
    if (ids.has(value)) fail("\u91CD\u590D ID");
    ids.add(value);
    return value;
  };
  const assets = /* @__PURE__ */ new Map(), tracks = /* @__PURE__ */ new Map();
  for (const raw of rawAssets) {
    const a = object(raw, "\u7D20\u6750");
    assets.set(recordId(a, "\u7D20\u6750"), a);
    str(a.name, "\u7D20\u6750\u540D\u79F0", 4096, true);
    str(a.path, "\u7D20\u6750\u8DEF\u5F84", 32768);
    str(a.url, "\u7D20\u6750 URL", 32768);
    choice(a.kind, ["video", "audio", "image"], "\u7D20\u6750\u7C7B\u578B");
    num(a.duration, "\u7D20\u6750\u65F6\u957F", 0, 86400 * 8);
    for (const field of ["width", "height"])
      num(a[field], `\u7D20\u6750 ${field}`, 0, 1e5);
    num(a.fps, "\u7D20\u6750\u5E27\u7387", 0, 1e3);
    bool(a.hasAudio, "\u7D20\u6750\u97F3\u9891\u6807\u8BB0");
    if (a.missing !== void 0) bool(a.missing, "\u7D20\u6750\u4E22\u5931\u6807\u8BB0");
    if (a.thumbnail !== void 0) str(a.thumbnail, "\u7D20\u6750\u7F29\u7565\u56FE", 32768);
    if (a.previewUrl !== void 0) str(a.previewUrl, "\u7D20\u6750\u9884\u89C8 URL", 32768);
    if (a.previewError !== void 0)
      str(a.previewError, "\u7D20\u6750\u9884\u89C8\u9519\u8BEF", 4096, true);
    if (a.waveform !== void 0)
      for (const v of list(a.waveform, "\u97F3\u9891\u6CE2\u5F62", 1e5))
        num(v, "\u97F3\u9891\u6CE2\u5F62\u503C", 0, 1);
  }
  for (const raw of rawTracks) {
    const t = object(raw, "\u8F68\u9053");
    tracks.set(recordId(t, "\u8F68\u9053"), t);
    str(t.name, "\u8F68\u9053\u540D\u79F0", 4096, true);
    choice(t.kind, ["video", "audio", "image", "text"], "\u8F68\u9053\u7C7B\u578B");
    for (const field of ["muted", "hidden", "locked"])
      bool(t[field], `\u8F68\u9053 ${field}`);
  }
  for (const raw of rawClips) {
    const c = object(raw, "\u7247\u6BB5");
    recordId(c, "\u7247\u6BB5");
    str(c.name, "\u7247\u6BB5\u540D\u79F0", 4096, true);
    if (c.linkId !== void 0) str(c.linkId, "\u753B\u58F0\u5173\u8054 ID", 256);
    const track = tracks.get(str(c.trackId, "\u7247\u6BB5\u8F68\u9053 ID", 256));
    if (!track) fail("\u7247\u6BB5\u8F68\u9053\u5F15\u7528");
    const asset = c.assetId === void 0 ? void 0 : assets.get(str(c.assetId, "\u7247\u6BB5\u7D20\u6750 ID", 256));
    if (c.assetId !== void 0 && !asset) fail("\u7247\u6BB5\u7D20\u6750\u5F15\u7528");
    const start = num(c.start, "\u7247\u6BB5\u8D77\u70B9", 0, 86400), duration = num(c.duration, "\u7247\u6BB5\u65F6\u957F", Number.MIN_VALUE, 86400), sourceIn = num(c.sourceIn, "\u6E90\u7D20\u6750\u8D77\u70B9", 0, 86400 * 8), speed = num(c.speed, "\u901F\u5EA6", 0.1, 8);
    if (start + duration > 86400) fail("\u65F6\u95F4\u7EBF\u65F6\u957F\uFF08\u6700\u957F 24 \u5C0F\u65F6\uFF09");
    num(c.volume, "\u97F3\u91CF", 0, 4);
    bool(c.muted, "\u7247\u6BB5\u9759\u97F3");
    for (const field of [
      "fadeIn",
      "fadeOut",
      "audioFadeIn",
      "audioFadeOut"
    ])
      num(c[field], field, 0, duration);
    for (const field of ["videoFadeWindow", "audioFadeWindow"])
      if (c[field] !== void 0) {
        const w = object(c[field], field);
        num(w.offset, `${field} \u504F\u79FB`, -86400 * 80, 86400 * 80);
        const full = num(
          w.duration,
          `${field} \u539F\u59CB\u65F6\u957F`,
          Number.MIN_VALUE,
          86400 * 80
        );
        num(w.fadeIn, `${field} \u6DE1\u5165`, 0, full);
        num(w.fadeOut, `${field} \u6DE1\u51FA`, 0, full);
      }
    const transform = object(c.transform, "\u53D8\u6362");
    for (const field of ["x", "y", "rotation"])
      num(transform[field], field);
    num(transform.scale, "\u7F29\u653E", 1e-6, 10);
    num(transform.opacity, "\u900F\u660E\u5EA6", 0, 1);
    bool(transform.flipX, "\u6C34\u5E73\u7FFB\u8F6C");
    bool(transform.flipY, "\u5782\u76F4\u7FFB\u8F6C");
    if (c.crop !== void 0) {
      const crop = object(c.crop, "\u88C1\u526A");
      const x = num(crop.x, "\u88C1\u526A X", 0, 1), y = num(crop.y, "\u88C1\u526A Y", 0, 1), width = num(crop.width, "\u88C1\u526A\u5BBD\u5EA6", 0.01, 1), height = num(crop.height, "\u88C1\u526A\u9AD8\u5EA6", 0.01, 1);
      if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) fail("\u88C1\u526A\u8D85\u51FA\u7D20\u6750");
    }
    if (c.chromaKey !== void 0) {
      const chroma = object(c.chromaKey, "\u8272\u5EA6\u62A0\u50CF");
      bool(chroma.enabled, "\u8272\u5EA6\u62A0\u50CF\u5F00\u5173");
      str(chroma.color, "\u62A0\u50CF\u989C\u8272", 9);
      if (!/^#[\da-f]{6}$/i.test(chroma.color)) fail("\u62A0\u50CF\u989C\u8272");
      num(chroma.similarity, "\u62A0\u50CF\u76F8\u4F3C\u5EA6", 0.01, 1);
      num(chroma.blend, "\u62A0\u50CF\u8FC7\u6E21", 0, 1);
    }
    if (c.mask !== void 0) {
      const mask = object(c.mask, "\u5F62\u72B6\u8499\u7248");
      choice(mask.shape, ["rectangle", "ellipse"], "\u8499\u7248\u5F62\u72B6");
      num(mask.width, "\u8499\u7248\u5BBD\u5EA6", 0.01, 1);
      num(mask.height, "\u8499\u7248\u9AD8\u5EA6", 0.01, 1);
      num(mask.feather, "\u8499\u7248\u7FBD\u5316", 0, 0.5);
      bool(mask.invert, "\u8499\u7248\u53CD\u8F6C");
    }
    const adjustments = object(c.adjustments, "\u989C\u8272\u8C03\u6574");
    num(adjustments.brightness, "\u4EAE\u5EA6", -1, 1);
    num(adjustments.contrast, "\u5BF9\u6BD4\u5EA6", 0, 3);
    num(adjustments.saturation, "\u9971\u548C\u5EA6", 0, 3);
    num(adjustments.temperature, "\u8272\u6E29", -1, 1);
    num(adjustments.blur, "\u6A21\u7CCA", 0, 100);
    if (c.text !== void 0) {
      if (asset || track.kind !== "text") fail("\u6587\u5B57\u7247\u6BB5\u5F15\u7528");
      const text = object(c.text, "\u6587\u5B57\u6837\u5F0F");
      str(text.text, "\u6587\u5B57\u5185\u5BB9", 2e4, true);
      num(text.fontSize, "\u5B57\u53F7", 1, 1e3);
      str(text.fontFamily, "\u5B57\u4F53", 256);
      color2(text.color, "\u6587\u5B57\u989C\u8272");
      color2(text.background, "\u6587\u5B57\u80CC\u666F");
      color2(text.stroke, "\u6587\u5B57\u63CF\u8FB9");
      num(text.strokeWidth, "\u63CF\u8FB9\u5BBD\u5EA6", 0, 100);
      choice(text.align, ["left", "center", "right"], "\u6587\u5B57\u5BF9\u9F50");
      bool(text.bold, "\u7C97\u4F53");
    } else {
      if (!asset || track.kind === "text" || !(track.kind === asset.kind || track.kind === "video" && asset.kind === "image"))
        fail("\u7247\u6BB5\u8F68\u9053\u4E0E\u7D20\u6750\u7C7B\u578B");
      if (asset.kind !== "image" && sourceIn + duration * speed > asset.duration + 0.08)
        fail("\u7247\u6BB5\u8D85\u51FA\u6E90\u7D20\u6750\u65F6\u957F");
    }
    const keyIds = /* @__PURE__ */ new Set();
    for (const rawKey of list(c.keyframes, "\u5173\u952E\u5E27\u5217\u8868", 400)) {
      const k = object(rawKey, "\u5173\u952E\u5E27"), keyId = str(k.id, "\u5173\u952E\u5E27 ID", 256);
      if (keyIds.has(keyId)) fail("\u91CD\u590D\u5173\u952E\u5E27 ID");
      keyIds.add(keyId);
      if (k.easingWindow !== void 0) {
        const w = object(k.easingWindow, "\u5173\u952E\u5E27\u63D2\u503C\u7A97\u53E3");
        num(w.start, "\u63D2\u503C\u7A97\u53E3\u8D77\u70B9", 0, 1);
        num(w.end, "\u63D2\u503C\u7A97\u53E3\u7EC8\u70B9", 0, 1);
        if (w.start >= w.end || k.easing !== "easeInOut")
          fail("\u5173\u952E\u5E27\u63D2\u503C\u7A97\u53E3");
      }
      num(k.time, "\u5173\u952E\u5E27\u65F6\u95F4", 0, duration);
      choice(
        k.property,
        ["x", "y", "scale", "rotation", "opacity", "volume"],
        "\u5173\u952E\u5E27\u5C5E\u6027"
      );
      choice(k.easing, ["linear", "easeInOut"], "\u5173\u952E\u5E27\u63D2\u503C");
      const low = k.property === "scale" ? 1e-6 : ["opacity", "volume"].includes(k.property) ? 0 : -1e9;
      const high = k.property === "scale" ? 10 : k.property === "opacity" ? 1 : k.property === "volume" ? 4 : 1e9;
      num(k.value, "\u5173\u952E\u5E27\u503C", low, high);
    }
  }
  return structuredClone(input2);
}

// plugins/dx-cut/source/src/core/exportRange.ts
function resolveExportRange(project, options) {
  const total = projectDuration(project), range = options.range;
  if (range === void 0) return { start: 0, end: total, duration: total };
  if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some((key) => key !== "start" && key !== "end") || typeof range.start !== "number" || typeof range.end !== "number" || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end > total + 1e-8 || range.end - range.start < 1 / options.fps - 1e-8)
    throw new Error("\u5BFC\u51FA\u533A\u95F4\u5FC5\u987B\u4F4D\u4E8E\u65F6\u95F4\u7EBF\u5185\uFF0C\u4E14\u81F3\u5C11\u5305\u542B\u4E00\u5E27");
  return { start: range.start, end: Math.min(total, range.end), duration: Math.min(total, range.end) - range.start };
}

// plugins/dx-cut/source/src/core/color.ts
var decimal = (value) => Number(value.toFixed(12)).toString();
var quantize = (expression) => `floor(clip(${expression},0,255)+0.5)`;
function colorAdjustmentFilters(adjustments) {
  const { brightness, contrast, saturation, temperature } = adjustments;
  const filters = [];
  if (brightness !== 0 || contrast !== 1) {
    const bright = quantize(`val+${decimal(brightness * 255)}`);
    const expression = quantize(`(${bright}-127.5)*${decimal(contrast)}+127.5`);
    filters.push(
      `lutrgb=r='${expression}':g='${expression}':b='${expression}'`
    );
  }
  if (saturation !== 1) {
    const weights = [0.2126, 0.7152, 0.0722];
    const matrix = weights.flatMap(
      (_, row) => weights.map(
        (weight, column) => weight * (1 - saturation) + (row === column ? saturation : 0)
      )
    );
    if (matrix.every((coefficient) => coefficient >= -2 && coefficient <= 2)) {
      const names2 = ["rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb"];
      filters.push(
        `colorchannelmixer=${matrix.map((coefficient, index) => `${names2[index]}=${decimal(coefficient)}`).join(":")}`
      );
      if (temperature !== 0)
        filters.push(
          `lutrgb=r='${quantize(`val+${decimal(temperature * 35)}`)}':b='${quantize(`val-${decimal(temperature * 35)}`)}'`
        );
      return filters;
    }
    const names = ["rr", "rg", "rb", "gr", "gg", "gb", "br", "bg", "bb"];
    const restore = `floor(clip(val*${decimal(saturation)},0,maxval)+0.5)`;
    filters.push(
      "format=gbrap16le",
      `colorchannelmixer=${matrix.map((coefficient, index) => `${names[index]}=${decimal(coefficient / saturation)}`).join(":")}`,
      `lutrgb=r='${restore}':g='${restore}':b='${restore}':a='floor(val*256/257)'`,
      "format=rgba"
    );
    if (temperature !== 0)
      filters.push(
        `lutrgb=r='${quantize(`val+${decimal(temperature * 35)}`)}':b='${quantize(`val-${decimal(temperature * 35)}`)}'`
      );
  } else if (temperature !== 0)
    filters.push(
      `lutrgb=r='${quantize(`val+${decimal(temperature * 35)}`)}':b='${quantize(`val-${decimal(temperature * 35)}`)}'`
    );
  return filters;
}

// plugins/dx-cut/source/src/core/visual.ts
var clamp = (value) => Math.max(0, Math.min(1, value));
var byte = (value) => Math.round(Math.max(0, Math.min(255, value)));
function getCropPixels(asset, crop) {
  const width = Math.max(1, Math.round(asset.width));
  const height = Math.max(1, Math.round(asset.height));
  if (!crop) return { x: 0, y: 0, width, height };
  const x = Math.min(width - 1, Math.max(0, Math.floor(crop.x * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(crop.y * height)));
  return {
    x,
    y,
    width: Math.min(width - x, Math.max(1, Math.floor(crop.width * width))),
    height: Math.min(height - y, Math.max(1, Math.floor(crop.height * height)))
  };
}
function maskOpacity(x, y, width, height, mask) {
  const rx = Math.max(Number.EPSILON, width * mask.width / 2);
  const ry = Math.max(Number.EPSILON, height * mask.height / 2);
  const dx = Math.abs(x + 0.5 - width / 2);
  const dy = Math.abs(y + 0.5 - height / 2);
  let distance;
  if (mask.shape === "ellipse")
    distance = (Math.hypot(dx / rx, dy / ry) - 1) * Math.min(rx, ry);
  else {
    const qx = dx - rx;
    const qy = dy - ry;
    distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  }
  const feather = mask.feather * Math.min(width, height);
  const inside = feather > 0 ? clamp(0.5 - distance / feather) : distance <= 0 ? 1 : 0;
  return mask.invert ? 1 - inside : inside;
}
function applyShapeMask(data, width, height, mask) {
  if (!mask) return;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const alpha = (y * width + x) * 4 + 3;
      const maskByte = byte(255 * maskOpacity(x, y, width, height, mask));
      data[alpha] = Math.floor(data[alpha] * maskByte / 255);
    }
}

// plugins/dx-cut/source/electron/export.ts
var jobs = /* @__PURE__ */ new Map();
var exportsShuttingDown = false;
var finite = (value, name) => {
  if (!Number.isFinite(value)) throw new Error(`${name} \u5FC5\u987B\u662F\u6709\u9650\u6570\u503C\u3002`);
  return value;
};
var number = (value) => Number(value.toFixed(6)).toString();
var color = (value) => {
  if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(value)) return `0x${value.slice(1)}`;
  if (/^(black|white|red|green|blue|transparent)$/i.test(value))
    return value === "transparent" ? "black@0" : value;
  throw new Error(`\u4E0D\u652F\u6301\u7684\u989C\u8272 ${value}\uFF0C\u8BF7\u4F7F\u7528 #RRGGBB \u6216 #RRGGBBAA\u3002`);
};
function keyframeExpression(clip, property, fallback, clock = "t") {
  const points = clip.keyframes.filter((k) => k.property === property).sort((a, b) => a.time - b.time);
  if (!points.length) return number(fallback);
  const unique = points.filter(
    (p, i) => i === points.length - 1 || points[i + 1].time !== p.time
  );
  let expression = number(unique[unique.length - 1].value);
  for (let i = unique.length - 2; i >= 0; i--) {
    const left = unique[i];
    const right = unique[i + 1];
    let progress = `((${clock}-${number(left.time)})/${number(right.time - left.time)})`;
    if (right.easing === "easeInOut") {
      const start = right.easingWindow?.start ?? 0;
      const end = right.easingWindow?.end ?? 1;
      const delta = end - start;
      const coefficients = [
        6 * start * (1 - start),
        3 * delta * (1 - 2 * start),
        -2 * delta * delta
      ];
      const precision = (value) => Number(value.toPrecision(15)).toString();
      progress = `(${progress}*(${precision(coefficients[0])}+${precision(coefficients[1])}*${progress}+${precision(coefficients[2])}*${progress}*${progress})/${precision(coefficients.reduce((sum, value) => sum + value, 0))})`;
    }
    const interpolation = `(${number(left.value)}+(${number(right.value - left.value)})*${progress})`;
    expression = `if(lt(${clock},${number(right.time)}),${interpolation},${expression})`;
  }
  return `if(lt(${clock},${number(unique[0].time)}),${number(unique[0].value)},${expression})`;
}
function tempoFilters(speed) {
  const filters = [];
  let remaining = speed;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 1e-6)
    filters.push(`atempo=${number(remaining)}`);
  return filters;
}
function validate(project, options) {
  if (!project.clips.length) throw new Error("\u65F6\u95F4\u7EBF\u4E3A\u7A7A\uFF0C\u8BF7\u6DFB\u52A0\u7D20\u6750\u518D\u5BFC\u51FA\u3002");
  if (!["mp4", "mov"].includes(options.format))
    throw new Error("\u5BFC\u51FA\u683C\u5F0F\u5FC5\u987B\u4E3A MP4 \u6216 MOV\u3002");
  if (!["draft", "standard", "high"].includes(options.quality))
    throw new Error("\u672A\u77E5\u5BFC\u51FA\u8D28\u91CF\u3002");
  for (const [value, name] of [
    [options.width, "\u5BBD\u5EA6"],
    [options.height, "\u9AD8\u5EA6"]
  ]) {
    finite(value, name);
    if (value < 2 || value > 8192 || value % 2 || !Number.isInteger(value))
      throw new Error(`${name} \u5FC5\u987B\u4E3A 2\u20138192 \u8303\u56F4\u5185\u7684\u5076\u6570\u3002`);
  }
  if (!Number.isFinite(options.fps) || options.fps < 1 || options.fps > 120)
    throw new Error("\u5E27\u7387\u5FC5\u987B\u4E3A 1\u2013120\u3002");
  if (!Number.isFinite(project.width) || !Number.isFinite(project.height) || project.width <= 0 || project.height <= 0)
    throw new Error("\u5DE5\u7A0B\u753B\u5E03\u5C3A\u5BF8\u65E0\u6548\u3002");
  if (!import_node_path3.default.isAbsolute(options.path))
    throw new Error("\u5BFC\u51FA\u4F4D\u7F6E\u5FC5\u987B\u4E3A\u7EDD\u5BF9\u8DEF\u5F84\u3002");
  if (project.assets.some(
    (asset) => import_node_path3.default.resolve(asset.path) === import_node_path3.default.resolve(options.path)
  ))
    throw new Error("\u5BFC\u51FA\u6587\u4EF6\u4E0D\u80FD\u8986\u76D6\u5DE5\u7A0B\u7684\u6E90\u7D20\u6750\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u4F4D\u7F6E\u3002");
  color(project.background);
  const range = resolveExportRange(project, options);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const tracks = new Map(project.tracks.map((t) => [t.id, t]));
  for (const clip of project.clips) {
    if (!tracks.has(clip.trackId))
      throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u8F68\u9053\u4E0D\u5B58\u5728\u3002`);
    for (const name of [
      "start",
      "duration",
      "sourceIn",
      "speed",
      "volume",
      "fadeIn",
      "fadeOut",
      "audioFadeIn",
      "audioFadeOut"
    ])
      finite(clip[name], `${clip.name} ${name}`);
    if (clip.start < 0 || clip.duration <= 0 || clip.sourceIn < 0 || clip.speed < 0.05 || clip.speed > 32 || clip.volume < 0 || clip.volume > 4)
      throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u65F6\u95F4\u3001\u901F\u5EA6\u6216\u97F3\u91CF\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002`);
    for (const name of [
      "fadeIn",
      "fadeOut",
      "audioFadeIn",
      "audioFadeOut"
    ])
      if (clip[name] < 0 || clip[name] > clip.duration)
        throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u6DE1\u5165\u6DE1\u51FA\u65F6\u957F\u8D85\u51FA\u7247\u6BB5\u3002`);
    for (const [name, value] of Object.entries(clip.transform))
      if (typeof value === "number") finite(value, `${clip.name} ${name}`);
    if (clip.transform.scale <= 0 || clip.transform.scale > 10 || clip.transform.opacity < 0 || clip.transform.opacity > 1)
      throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u7F29\u653E\u6216\u900F\u660E\u5EA6\u65E0\u6548\u3002`);
    for (const [name, value] of Object.entries(clip.adjustments))
      finite(value, `${clip.name} ${name}`);
    const a = clip.adjustments;
    if (a.brightness < -1 || a.brightness > 1 || a.contrast < 0 || a.contrast > 3 || a.saturation < 0 || a.saturation > 3 || Math.abs(a.temperature) > 1 || a.blur < 0 || a.blur > 100)
      throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u989C\u8272\u8C03\u6574\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002`);
    if (clip.crop) {
      const c = clip.crop;
      if (![c.x, c.y, c.width, c.height].every(Number.isFinite) || c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0 || c.x + c.width > 1 + 1e-9 || c.y + c.height > 1 + 1e-9)
        throw new Error("\u88C1\u526A\u533A\u57DF\u5FC5\u987B\u4F4D\u4E8E\u6E90\u753B\u9762\u5185\u3002");
    }
    if (clip.chromaKey) {
      const key = clip.chromaKey;
      if (typeof key.enabled !== "boolean" || !/^#[\da-f]{6}$/i.test(key.color) || !Number.isFinite(key.similarity) || key.similarity < 0.01 || key.similarity > 1 || !Number.isFinite(key.blend) || key.blend < 0 || key.blend > 1)
        throw new Error("\u8272\u5EA6\u62A0\u50CF\u53C2\u6570\u65E0\u6548\u3002");
    }
    if (clip.mask) {
      const mask = clip.mask;
      if (!["rectangle", "ellipse"].includes(mask.shape) || ![mask.width, mask.height, mask.feather].every(Number.isFinite) || mask.width <= 0 || mask.width > 1 || mask.height <= 0 || mask.height > 1 || mask.feather < 0 || mask.feather > 1 || typeof mask.invert !== "boolean")
        throw new Error("\u8499\u7248\u53C2\u6570\u65E0\u6548\u3002");
    }
    if (clip.text) {
      if (!Number.isFinite(clip.text.fontSize) || clip.text.fontSize < 1 || clip.text.fontSize > 1e3 || clip.text.text.length > 2e4)
        throw new Error("\u6587\u5B57\u5B57\u53F7\u6216\u957F\u5EA6\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002");
      if (!Number.isFinite(clip.text.strokeWidth) || clip.text.strokeWidth < 0 || clip.text.strokeWidth > 100)
        throw new Error("\u6587\u5B57\u63CF\u8FB9\u5BBD\u5EA6\u65E0\u6548\u3002");
      color(clip.text.color);
      color(clip.text.stroke);
      if (clip.text.background !== "transparent") color(clip.text.background);
    } else {
      const asset = assets.get(clip.assetId ?? "");
      if (!asset) throw new Error(`\u7247\u6BB5 ${clip.name} \u627E\u4E0D\u5230\u6E90\u7D20\u6750\u3002`);
      if (asset.missing && clip.start < range.end && clip.start + clip.duration > range.start) throw new Error(`\u7D20\u6750\u4E22\u5931\uFF1A${asset.name}`);
      if (asset.kind !== "image" && clip.sourceIn + clip.duration * clip.speed > asset.duration + 0.08)
        throw new Error(`\u7247\u6BB5 ${clip.name} \u8D85\u51FA\u6E90\u7D20\u6750\u65F6\u957F\uFF0C\u8BF7\u7F29\u77ED\u7247\u6BB5\u3002`);
    }
    if (clip.keyframes.length > 400)
      throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u5173\u952E\u5E27\u8D85\u8FC7 400 \u4E2A\u3002`);
    for (const key of clip.keyframes) {
      finite(key.time, "\u5173\u952E\u5E27\u65F6\u95F4");
      finite(key.value, "\u5173\u952E\u5E27\u6570\u503C");
      if (!["x", "y", "scale", "rotation", "opacity", "volume"].includes(
        key.property
      ) || !["linear", "easeInOut"].includes(key.easing))
        throw new Error("\u672A\u77E5\u5173\u952E\u5E27\u5C5E\u6027\u6216\u63D2\u503C\u65B9\u5F0F\u3002");
      if (key.easingWindow && (!Number.isFinite(key.easingWindow.start) || !Number.isFinite(key.easingWindow.end) || key.easingWindow.start < 0 || key.easingWindow.end > 1 || key.easingWindow.end <= key.easingWindow.start))
        throw new Error("\u5173\u952E\u5E27\u66F2\u7EBF\u7A97\u53E3\u65E0\u6548\u3002");
      if (key.time < 0 || key.time > clip.duration || key.property === "scale" && (key.value <= 0 || key.value > 10) || key.property === "opacity" && (key.value < 0 || key.value > 1) || key.property === "volume" && (key.value < 0 || key.value > 4))
        throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u5173\u952E\u5E27\u8D85\u51FA\u652F\u6301\u8303\u56F4\u3002`);
    }
    for (const window of [clip.videoFadeWindow, clip.audioFadeWindow])
      if (window) {
        if (![
          window.offset,
          window.duration,
          window.fadeIn,
          window.fadeOut
        ].every(Number.isFinite) || Math.abs(window.offset) > 86400 || window.duration <= 0 || window.duration > 86400 || window.fadeIn < 0 || window.fadeOut < 0 || window.fadeIn > window.duration || window.fadeOut > window.duration)
          throw new Error(`\u7247\u6BB5 ${clip.name} \u7684\u6DE1\u5165\u6DE1\u51FA\u7A97\u53E3\u65E0\u6548\u3002`);
      }
  }
  const duration = Math.max(...project.clips.map((c) => c.start + c.duration));
  if (duration > 24 * 3600) throw new Error("\u5355\u6B21\u5BFC\u51FA\u6700\u957F\u652F\u6301 24 \u5C0F\u65F6\u3002");
  return duration;
}
async function renderText(clip, directory) {
  const style = clip.text;
  const family = style.fontFamily.replace(/["'\\;\n\r]/g, "").trim() || "sans-serif";
  const font = `${style.bold ? "bold " : ""}${style.fontSize}px "${family}", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Arial Unicode MS", sans-serif`;
  const measurement = (0, import_canvas2.createCanvas)(1, 1).getContext("2d");
  measurement.font = font;
  measurement.fontVariationSettings = `"wght" ${style.bold ? 700 : 400}`;
  const lines = style.text.split("\n");
  const padding = Math.ceil(style.fontSize * 0.25 + style.strokeWidth);
  const width = Math.max(
    2,
    Math.ceil(
      Math.max(...lines.map((line) => measurement.measureText(line).width), 1)
    ) + padding * 2
  );
  const lineHeight = style.fontSize * 1.3;
  const height = Math.max(
    2,
    Math.ceil(lineHeight * lines.length + padding * 2)
  );
  if (width > 8192 || height > 8192 || width * height > 32e6)
    throw new Error("\u6587\u5B57\u56FE\u5C42\u8FC7\u5927\uFF0C\u8BF7\u51CF\u5C11\u5B57\u53F7\u6216\u6587\u5B57\u957F\u5EA6\u3002");
  const canvas = (0, import_canvas2.createCanvas)(width, height);
  const context = canvas.getContext("2d");
  if (style.background !== "transparent") {
    context.fillStyle = style.background;
    context.fillRect(0, 0, width, height);
  }
  context.font = font;
  context.textAlign = style.align;
  context.textBaseline = "middle";
  context.fillStyle = style.color;
  context.fontVariationSettings = `"wght" ${style.bold ? 700 : 400}`;
  context.strokeStyle = style.stroke;
  context.lineWidth = style.strokeWidth * 2;
  context.lineJoin = "round";
  const x = style.align === "left" ? padding : style.align === "right" ? width - padding : width / 2;
  lines.forEach((line, index) => {
    const y = padding + lineHeight * (index + 0.5);
    if (style.strokeWidth > 0) context.strokeText(line, x, y);
    context.fillText(line, x, y);
  });
  const file = import_node_path3.default.join(
    directory,
    `${clip.id.replace(/[^\w-]/g, "")}-${(0, import_node_crypto2.randomUUID)()}.png`
  );
  await (0, import_promises3.writeFile)(file, canvas.toBuffer("image/png"));
  return { file, width, height };
}
async function renderMask(width, height, mask, directory) {
  if (width * height > 64e6)
    throw new Error("\u8499\u7248\u7D20\u6750\u5C3A\u5BF8\u8FC7\u5927\uFF0C\u8BF7\u4F7F\u7528\u8F83\u5C0F\u7684\u6E90\u7D20\u6750\u3002");
  const canvas = (0, import_canvas2.createCanvas)(width, height);
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(width, height);
  pixels.data.fill(255);
  applyShapeMask(pixels.data, width, height, mask);
  context.putImageData(pixels, 0, 0);
  const file = import_node_path3.default.join(directory, `mask-${(0, import_node_crypto2.randomUUID)()}.png`);
  await (0, import_promises3.writeFile)(file, canvas.toBuffer("image/png"));
  return file;
}
async function createExportArguments(project, options, directory, output) {
  const duration = validate(project, options);
  const range = resolveExportRange(project, options);
  const args = [
    "-hide_banner",
    "-y",
    "-nostdin",
    "-filter_complex_threads",
    "1"
  ];
  const graph = [
    `color=c=${color(project.background)}:s=${options.width}x${options.height}:r=${number(options.fps)}:d=${number(duration)},format=rgba[base0]`
  ];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const rx = options.width / project.width;
  const ry = options.height / project.height;
  const audios = [];
  let input2 = 0;
  let layer = 0;
  for (const track of [...project.tracks].reverse()) {
    for (const clip of project.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start)) {
      if (clip.start >= range.end || clip.start + clip.duration <= range.start) continue;
      const asset = assets.get(clip.assetId ?? "");
      const text = clip.text ? await renderText(clip, directory) : void 0;
      const visual = Boolean(
        text || asset?.kind === "image" || asset?.kind === "video"
      );
      const audible = !track.muted && !clip.muted && asset?.hasAudio;
      if ((!visual || track.hidden) && !audible) continue;
      const file = text?.file ?? asset.path;
      await (0, import_promises3.access)(file);
      const still = Boolean(text || asset?.kind === "image");
      const keepSeekPredecessor = !still && asset?.kind === "video" && !track.hidden && clip.sourceIn > 0;
      args.push(
        ...still ? ["-loop", "1", "-framerate", number(options.fps)] : clip.sourceIn > 0 ? [
          "-ss",
          number(clip.sourceIn),
          ...keepSeekPredecessor ? ["-noaccurate_seek"] : []
        ] : [],
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        file
      );
      const index = input2++;
      if (visual && !track.hidden) {
        const filters = [
          keepSeekPredecessor ? `trim=end=${number(clip.duration * clip.speed)}` : `trim=start=0:duration=${number(still ? clip.duration : clip.duration * clip.speed)}`,
          `setpts=${keepSeekPredecessor ? "PTS" : "(PTS-STARTPTS)"}/${still ? "1" : number(clip.speed)}`,
          // A frame becomes eligible only at its source PTS. Rounding its new
          // output tick up preserves the preceding frame between source PTSs,
          // matching browser seeking instead of selecting a future frame.
          `fps=${number(options.fps)}:round=up${keepSeekPredecessor ? ":start_time=0" : ""}`,
          "format=rgba"
        ];
        const sourceWidth = text?.width ?? asset.width;
        const sourceHeight = text?.height ?? asset.height;
        if (!sourceWidth || !sourceHeight)
          throw new Error(`\u65E0\u6CD5\u786E\u5B9A\u7D20\u6750 ${clip.name} \u7684\u5C3A\u5BF8\u3002`);
        const crop = getCropPixels(
          { width: sourceWidth, height: sourceHeight },
          clip.crop
        );
        const width = crop.width;
        const height = crop.height;
        let visualSource = `${index}:v:0`;
        if (clip.crop || clip.mask || clip.chromaKey?.enabled) {
          filters.push(`scale=${sourceWidth}:${sourceHeight}`, "setsar=1");
          if (clip.crop)
            filters.push(
              `crop=w=${width}:h=${height}:x=${crop.x}:y=${crop.y}:exact=1`
            );
          graph.push(`[${visualSource}]${filters.join(",")}[original${layer}]`);
          filters.length = 0;
          visualSource = `original${layer}`;
        }
        if (clip.chromaKey?.enabled) {
          const key = clip.chromaKey;
          graph.push(
            `[${visualSource}]split=3[keyrgb${layer}][keyold${layer}][keysource${layer}]`
          );
          graph.push(`[keyold${layer}]alphaextract[keyoldalpha${layer}]`);
          graph.push(
            `[keysource${layer}]colorkey=${color(key.color)}:${number(key.similarity)}:${number(key.blend)},alphaextract[keyalpha${layer}]`
          );
          graph.push(
            `[keyoldalpha${layer}][keyalpha${layer}]blend=all_mode=multiply:shortest=1[keycombined${layer}]`
          );
          graph.push(
            `[keyrgb${layer}][keycombined${layer}]alphamerge=shortest=1[keyed${layer}]`
          );
          visualSource = `keyed${layer}`;
        }
        if (clip.mask) {
          const mask = await renderMask(width, height, clip.mask, directory);
          const maskInput = input2++;
          args.push(
            "-loop",
            "1",
            "-framerate",
            number(options.fps),
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            mask
          );
          graph.push(
            `[${maskInput}:v:0]trim=duration=${number(clip.duration)},setpts=PTS-STARTPTS,format=rgba,alphaextract[shapealpha${layer}]`
          );
          graph.push(
            `[${visualSource}]split=2[maskrgb${layer}][maskold${layer}]`
          );
          graph.push(`[maskold${layer}]alphaextract[maskoldalpha${layer}]`);
          graph.push(
            `[maskoldalpha${layer}][shapealpha${layer}]blend=all_mode=multiply:shortest=1[maskcombined${layer}]`
          );
          graph.push(
            `[maskrgb${layer}][maskcombined${layer}]alphamerge=shortest=1[masked${layer}]`
          );
          visualSource = `masked${layer}`;
        }
        const a = clip.adjustments;
        filters.push(...colorAdjustmentFilters(a));
        const contain = text ? rx : Math.min(options.width / width, options.height / height);
        const scale = keyframeExpression(clip, "scale", clip.transform.scale);
        const animatedScale = clip.keyframes.some((key) => key.property === "scale");
        if (animatedScale) filters.push("format=gbrap");
        filters.push(
          `scale=w='max(2,trunc(${number(width * contain)}*(${scale})/2)*2)':h='max(2,trunc(${number(height * contain)}*(${scale})/2)*2)':eval=frame`,
          ...animatedScale ? ["format=rgba"] : [],
          "setsar=1"
        );
        if (a.blur > 0)
          filters.push(
            "premultiply=inplace=1",
            `gblur=sigma=${number(a.blur * rx)}`,
            "unpremultiply=inplace=1"
          );
        if (clip.transform.flipX) filters.push("hflip");
        if (clip.transform.flipY) filters.push("vflip");
        const rotation = keyframeExpression(
          clip,
          "rotation",
          clip.transform.rotation
        );
        if (rotation !== "0")
          filters.push(
            `rotate=angle='(${rotation})*PI/180':ow='hypot(iw,ih)':oh='hypot(iw,ih)':c=black@0`
          );
        const opacity = keyframeExpression(
          clip,
          "opacity",
          clip.transform.opacity,
          "T"
        );
        if (clip.keyframes.some((k) => k.property === "opacity")) {
          graph.push(
            `[${visualSource}]${filters.join(",")},split=2[opacityrgb${layer}][opacitysource${layer}]`
          );
          filters.length = 0;
          graph.push(
            `[opacitysource${layer}]alphaextract,geq=lum='floor(lum(X,Y)*(${opacity})+0.5)'[opacityalpha${layer}]`
          );
          graph.push(
            `[opacityrgb${layer}][opacityalpha${layer}]alphamerge=shortest=1[opaque${layer}]`
          );
          visualSource = `opaque${layer}`;
        } else if (clip.transform.opacity !== 1)
          filters.push(
            `colorchannelmixer=aa=${number(clip.transform.opacity)}`
          );
        const fade = fadeWindow(clip, "video");
        const fadeOffset = fade.fadeIn > 0 || fade.fadeOut > 0 ? Math.max(0, fade.offset) : 0;
        const fadeDelay = Math.max(0, -fade.offset);
        if (fadeOffset > 0) filters.push(`setpts=PTS+${number(fadeOffset)}/TB`);
        if (fade.fadeIn > 0)
          filters.push(
            `fade=t=in:st=${number(fadeDelay)}:d=${number(fade.fadeIn)}:alpha=1`
          );
        if (fade.fadeOut > 0)
          filters.push(
            `fade=t=out:st=${number(fade.duration - fade.fadeOut + fadeDelay)}:d=${number(fade.fadeOut)}:alpha=1`
          );
        filters.push(`setpts=PTS+${number(clip.start - fadeOffset)}/TB`);
        graph.push(`[${visualSource}]${filters.join(",")}[layer${layer}]`);
        const x = keyframeExpression(
          clip,
          "x",
          clip.transform.x,
          `(t-${number(clip.start)})`
        );
        const y = keyframeExpression(
          clip,
          "y",
          clip.transform.y,
          `(t-${number(clip.start)})`
        );
        graph.push(
          `[base${layer}][layer${layer}]overlay=x='(W-w)/2+(${x})*${number(rx)}':y='(H-h)/2+(${y})*${number(ry)}':eval=frame:eof_action=pass:repeatlast=0:enable='gte(t,${number(clip.start)})*lt(t,${number(clip.start + clip.duration)})':format=auto[base${layer + 1}]`
        );
        layer++;
      }
      if (audible) {
        const filters = [
          `atrim=start=0:duration=${number(clip.duration * clip.speed)}`,
          "asetpts=PTS-STARTPTS",
          ...tempoFilters(clip.speed),
          "aresample=48000",
          "aformat=sample_fmts=fltp:channel_layouts=stereo",
          `atrim=duration=${number(clip.duration)}`
        ];
        const volume = keyframeExpression(clip, "volume", clip.volume);
        filters.push(`volume='${volume}':eval=frame`);
        const fade = fadeWindow(clip, "audio");
        const fadeOffset = fade.fadeIn > 0 || fade.fadeOut > 0 ? Math.max(0, fade.offset) : 0;
        const fadeDelay = Math.max(0, -fade.offset);
        if (fadeOffset > 0)
          filters.push(`asetpts=PTS+${number(fadeOffset)}/TB`);
        if (fade.fadeIn > 0)
          filters.push(
            `afade=t=in:st=${number(fadeDelay)}:d=${number(fade.fadeIn)}`
          );
        if (fade.fadeOut > 0)
          filters.push(
            `afade=t=out:st=${number(fade.duration - fade.fadeOut + fadeDelay)}:d=${number(fade.fadeOut)}`
          );
        if (fadeOffset > 0)
          filters.push(`asetpts=PTS-${number(fadeOffset)}/TB`);
        filters.push(`adelay=${Math.round(clip.start * 1e3)}:all=1`);
        graph.push(`[${index}:a:0]${filters.join(",")}[audio${audios.length}]`);
        audios.push(`[audio${audios.length}]`);
      }
    }
  }
  graph.push(`[base${layer}]${options.range ? `trim=start=${number(range.start)}:end=${number(range.end)},setpts=PTS-STARTPTS,` : ""}format=yuv420p[vout]`);
  if (audios.length)
    graph.push(
      `${audios.join("")}amix=inputs=${audios.length}:duration=longest:dropout_transition=0:normalize=0,apad,atrim=duration=${number(duration)},alimiter=limit=1:level=false${options.range ? `,atrim=start=${number(range.start)}:end=${number(range.end)},asetpts=PTS-STARTPTS` : ""}[aout]`
    );
  args.push("-filter_complex", graph.join(";"), "-map", "[vout]");
  if (audios.length)
    args.push(
      "-map",
      "[aout]",
      "-c:a",
      "aac",
      "-b:a",
      options.quality === "draft" ? "128k" : "192k"
    );
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    options.quality === "draft" ? "ultrafast" : options.quality === "high" ? "slow" : "medium",
    "-crf",
    options.quality === "draft" ? "28" : options.quality === "high" ? "17" : "22",
    "-pix_fmt",
    "yuv420p",
    "-r",
    number(options.fps),
    "-t",
    number(range.duration),
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    "-f",
    options.format,
    output
  );
  return args;
}
async function startExport(project, options, onProgress) {
  if (exportsShuttingDown) throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  validate(project, options);
  const duration = resolveExportRange(project, options).duration;
  const executable = await findMediaTool("ffmpeg");
  if (exportsShuttingDown) throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  const outputIdentity = await (0, import_promises3.realpath)(options.path).catch(
    () => import_node_path3.default.resolve(options.path)
  );
  const sourceIdentities = await Promise.all(
    project.assets.map(
      (asset) => (0, import_promises3.realpath)(asset.path).catch(() => import_node_path3.default.resolve(asset.path))
    )
  );
  if (sourceIdentities.includes(outputIdentity))
    throw new Error("\u5BFC\u51FA\u6587\u4EF6\u4E0D\u80FD\u8986\u76D6\u5DE5\u7A0B\u7684\u6E90\u7D20\u6750\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u4F4D\u7F6E\u3002");
  await (0, import_promises3.mkdir)(import_node_path3.default.dirname(options.path), { recursive: true });
  if (exportsShuttingDown) throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  const jobId = (0, import_node_crypto2.randomUUID)();
  const directory = await (0, import_promises3.mkdtemp)(import_node_path3.default.join((0, import_node_os.tmpdir)(), "reacut-export-"));
  if (exportsShuttingDown) {
    await (0, import_promises3.rm)(directory, { recursive: true, force: true });
    throw new Error("\u5E94\u7528\u6B63\u5728\u5173\u95ED\u3002");
  }
  let finish;
  const finished = new Promise((resolve2) => {
    finish = resolve2;
  });
  const job = {
    id: jobId,
    cancelled: false,
    committing: false,
    directory,
    temporaryOutput: import_node_path3.default.join(
      import_node_path3.default.dirname(options.path),
      `.reacut-${jobId}.${options.format}`
    ),
    finished
  };
  jobs.set(jobId, job);
  const emit = (status, progress, message) => {
    try {
      onProgress({
        jobId,
        status,
        progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
        message,
        ...status === "complete" ? { path: options.path } : {}
      });
    } catch {
    }
  };
  emit("preparing", 0);
  void (async () => {
    try {
      let args = await createExportArguments(
        project,
        options,
        directory,
        job.temporaryOutput
      );
      if (job.cancelled) {
        emit("cancelled", 0);
        return;
      }
      emit("rendering", 0);
      if (job.cancelled) {
        emit("cancelled", 0);
        return;
      }
      const selected = await selectVideoEncoder(executable, options.encoder || "auto");
      if (job.cancelled) {
        emit("cancelled", 0);
        return;
      }
      const cpuArgs = [...args];
      if (selected.encoder !== "libx264") {
        const at = args.indexOf("-c:v"), end = args.indexOf("-pix_fmt", at);
        const hardware = encoderArgs(selected.encoder);
        for (const flag of ["-cq", "-global_quality", "-qp_i", "-qp_p"]) {
          const index = hardware.indexOf(flag);
          if (index >= 0) hardware[index + 1] = options.quality === "draft" ? "28" : options.quality === "high" ? "17" : "22";
        }
        args = [...args.slice(0, at), ...hardware, ...args.slice(end)];
      }
      emit("rendering", 0, "\u7F16\u7801\u5668\uFF1A" + selected.encoder);
      const encode = () => new Promise((resolve2, reject) => {
        const child = (0, import_node_child_process3.spawn)(executable, args, {
          shell: false,
          windowsHide: true
        });
        job.child = child;
        let output = "";
        let diagnostic = "";
        child.stdout.on("data", (data) => {
          output += String(data);
          const lines = output.split("\n");
          output = lines.pop() ?? "";
          for (const line of lines)
            if (line.startsWith("out_time_us="))
              emit(
                "rendering",
                Math.min(0.99, Number(line.slice(12)) / 1e6 / duration)
              );
        });
        child.stderr.on("data", (data) => {
          diagnostic = (diagnostic + String(data)).slice(-12e3);
        });
        child.once("error", reject);
        child.once("close", (code) => {
          if (job.cancelled) resolve2();
          else if (code === 0) resolve2();
          else
            reject(new Error(`FFmpeg \u5BFC\u51FA\u5931\u8D25\uFF1A${diagnostic.trim() || code}`));
        });
      });
      try {
        await encode();
      } catch (error) {
        if (job.cancelled || selected.encoder === "libx264") throw error;
        args = cpuArgs;
        emit("rendering", 0, "\u786C\u4EF6\u7F16\u7801\u5931\u8D25\uFF0C\u56DE\u9000 CPU");
        await encode();
      }
      if (job.cancelled) {
        emit("cancelled", 0);
        return;
      }
      job.committing = true;
      await (0, import_promises3.rename)(job.temporaryOutput, options.path);
      emit("complete", 1);
    } catch (error) {
      emit(
        job.cancelled ? "cancelled" : "error",
        0,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      await (0, import_promises3.rm)(job.temporaryOutput, { force: true }).catch(() => {
      });
      await (0, import_promises3.rm)(directory, { recursive: true, force: true }).catch(() => {
      });
      jobs.delete(jobId);
      finish();
    }
  })();
  return { jobId };
}
async function cancelExport(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.committing) return;
  job.cancelled = true;
  if (job.child) {
    job.child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (job.child && job.child.exitCode === null && job.child.signalCode === null)
        job.child.kill("SIGKILL");
    }, 2e3);
    timer.unref();
  }
}
async function cancelAllExports() {
  exportsShuttingDown = true;
  await Promise.all(
    [...jobs.values()].map(async (job) => {
      await cancelExport(job.id);
      await job.finished;
    })
  );
}

// plugins/dx-cut/source/backend/server.ts
var root = "";
var configured = false;
var jobs2 = /* @__PURE__ */ new Map();
var starting = /* @__PURE__ */ new Set();
var writes = /* @__PURE__ */ new Map();
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process4.execFile);
var strips = /* @__PURE__ */ new Map();
var stripQueue = Promise.resolve();
var safeId = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw Error("\u5DE5\u7A0B\u6807\u8BC6\u65E0\u6548");
  return value;
};
function mediaUrl(file) {
  const rel = (0, import_node_path4.relative)(root, (0, import_node_path4.resolve)(file));
  if (!rel || rel.startsWith("..") || (0, import_node_path4.resolve)(root, rel) !== (0, import_node_path4.resolve)(file)) throw Error("\u8D44\u6E90\u8D8A\u754C");
  return `hios-asset://local/asset-files/dx-cut/${rel.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
}
async function verifyProject(raw) {
  const project = validateProject(raw);
  safeId(project.id);
  const mediaRoot = await (0, import_promises4.realpath)((0, import_node_path4.join)(root, "media"));
  for (const asset of project.assets) {
    const actual = await (0, import_promises4.realpath)(asset.path);
    const rel = (0, import_node_path4.relative)(mediaRoot, actual);
    if (!rel || rel.startsWith("..") || (0, import_node_path4.resolve)(mediaRoot, rel) !== actual) throw Error("\u5DE5\u7A0B\u5F15\u7528\u4E86\u672A\u5BFC\u5165\u7684\u7D20\u6750");
    asset.path = actual;
    asset.url = mediaUrl(actual);
  }
  return project;
}
async function execute(action, args, scope) {
  if (action === "configure") {
    const next = (0, import_node_path4.resolve)(args.root);
    if (root && root !== next) throw Error("\u5F15\u64CE\u6570\u636E\u76EE\u5F55\u5DF2\u9501\u5B9A\uFF0C\u8BF7\u91CD\u8FDE");
    if (configured && root === next && process.env.REACUT_FFMPEG === args.ffmpeg && process.env.REACUT_FFPROBE === args.ffprobe) return { ready: true };
    root = next;
    process.env.HIOS_DXCUT_ROOT = root;
    process.env.REACUT_FFMPEG = args.ffmpeg;
    process.env.REACUT_FFPROBE = args.ffprobe;
    for (const folder of ["media", "cache", "projects", "exports"]) await (0, import_promises4.mkdir)((0, import_node_path4.join)(root, folder), { recursive: true });
    if (args.font) registerBundledFont(args.font);
    configured = true;
    return { ready: true };
  }
  if (!root) throw Error("\u5F15\u64CE\u672A\u521D\u59CB\u5316");
  if (action === "system") return { version: "0.1.0", platform: process.platform, ffmpeg: true, ffmpegPath: process.env.REACUT_FFMPEG, ffprobePath: process.env.REACUT_FFPROBE };
  if (action === "fonts") return systemFontFamilies();
  if (action === "import") {
    const files = [];
    for (const source of args.paths) {
      const file = (0, import_node_path4.join)(root, "media", `${(0, import_node_crypto3.randomUUID)()}${(0, import_node_path4.extname)(source).slice(0, 12)}`);
      await (0, import_promises4.copyFile)(source, file);
      files.push(file);
    }
    const assets = await importAssets(files, (0, import_node_path4.join)(root, "cache"));
    assets.forEach((asset, index) => asset.name = (0, import_node_path4.basename)(args.paths[index]));
    return assets;
  }
  if (action === "filmstrip") {
    if (typeof args.path !== "string") throw Error("\u7D20\u6750\u8DEF\u5F84\u65E0\u6548");
    const file = await (0, import_promises4.realpath)(args.path), mediaRoot = await (0, import_promises4.realpath)((0, import_node_path4.join)(root, "media"));
    const rel = (0, import_node_path4.relative)(mediaRoot, file);
    if (!rel || rel.startsWith("..") || (0, import_node_path4.resolve)(mediaRoot, rel) !== file) throw Error("\u7D20\u6750\u4E0D\u5728\u526A\u8F91\u5DE5\u7A0B\u76EE\u5F55\u5185");
    const start = Number(args.sourceIn), duration = Number(args.duration), count = Number(args.count);
    if (!Number.isFinite(start) || start < 0 || start > 28800 || !Number.isFinite(duration) || duration <= 0 || duration > 28800 || !Number.isInteger(count) || count < 1 || count > 24) throw Error("\u7F29\u7565\u5E27\u53C2\u6570\u65E0\u6548");
    const info = await (0, import_promises4.stat)(file);
    const key = (0, import_node_crypto3.createHash)("sha256").update(`${file}:${info.size}:${info.mtimeMs}:${start.toFixed(3)}:${duration.toFixed(3)}:${count}`).digest("hex");
    const output = (0, import_node_path4.join)(root, "cache", `strip-${key}.jpg`);
    const existing = strips.get(key);
    if (existing) return existing;
    const generate = stripQueue.catch(() => {
    }).then(async () => {
      try {
        await (0, import_promises4.access)(output);
        return { url: mediaUrl(output), count };
      } catch {
      }
      const temporary = (0, import_node_path4.join)(root, "cache", `strip-${key}-${(0, import_node_crypto3.randomUUID)()}.jpg`);
      try {
        const filter = `fps=${count / duration}:round=down,scale=120:68:force_original_aspect_ratio=decrease,pad=120:68:(ow-iw)/2:(oh-ih)/2:black,setsar=1,tile=${count}x1`;
        await execFileAsync(String(process.env.REACUT_FFMPEG), ["-v", "error", "-y", "-ss", String(start), "-i", file, "-vf", filter, "-frames:v", "1", "-q:v", "4", temporary], { timeout: 12e4, windowsHide: true, maxBuffer: 1024 * 1024 });
        await (0, import_promises4.rename)(temporary, output);
        return { url: mediaUrl(output), count };
      } finally {
        await (0, import_promises4.unlink)(temporary).catch(() => {
        });
      }
    });
    stripQueue = generate;
    strips.set(key, generate);
    try {
      return await generate;
    } finally {
      strips.delete(key);
    }
  }
  if (action === "save") {
    const project = await verifyProject(args.project);
    const file = (0, import_node_path4.join)(root, "projects", safeId(project.id) + ".json");
    const task = (writes.get(file) || Promise.resolve()).catch(() => {
    }).then(async () => {
      let revision = 0;
      try {
        const old = JSON.parse(await (0, import_promises4.readFile)(file, "utf8"));
        revision = Number(old.revision || 0);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (Number(args.revision || 0) !== revision) throw Error("\u5DE5\u7A0B\u5DF2\u5728\u53E6\u4E00\u7F16\u8F91\u5668\u4E2D\u4FEE\u6539\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u540E\u518D\u4FDD\u5B58");
      const temporary = file + "." + (0, import_node_crypto3.randomUUID)() + ".tmp";
      await (0, import_promises4.writeFile)(temporary, JSON.stringify({ project, revision: revision + 1 }));
      await (0, import_promises4.rename)(temporary, file);
      return { projectId: project.id, revision: revision + 1 };
    });
    writes.set(file, task);
    try {
      return await task;
    } finally {
      if (writes.get(file) === task) writes.delete(file);
    }
  }
  if (action === "open") {
    const id = safeId(args.projectId);
    const file = (0, import_node_path4.join)(root, "projects", id + ".json");
    if (writes.has(file)) await writes.get(file);
    const saved = JSON.parse(await (0, import_promises4.readFile)(file, "utf8"));
    const project = await verifyProject(saved.project || saved);
    return { project, path: id, revision: Number(saved.revision || 0) };
  }
  if (action === "list") {
    const rows = [];
    for (const name of await (0, import_promises4.readdir)((0, import_node_path4.join)(root, "projects"))) if (name.endsWith(".json")) {
      try {
        const saved = JSON.parse(await (0, import_promises4.readFile)((0, import_node_path4.join)(root, "projects", name), "utf8")), p = saved.project || saved;
        rows.push({ path: p.id, name: p.name, updatedAt: p.updatedAt });
      } catch {
      }
    }
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  if (action === "export") {
    if (starting.has(scope) || [...jobs2.values()].some((j) => j.scope === scope && !["complete", "error", "cancelled"].includes(j.progress.status))) throw Error("\u5F53\u524D\u7F16\u8F91\u5668\u5DF2\u6709\u5BFC\u51FA\u4EFB\u52A1");
    starting.add(scope);
    try {
      const project = await verifyProject(args.project);
      const format = args.options?.format === "mov" ? "mov" : "mp4";
      const path4 = (0, import_node_path4.join)(root, "exports", `${(0, import_node_crypto3.randomUUID)()}.${format}`);
      const result = await startExport(project, { ...args.options, format, path: path4, encoder: args.encoder }, (progress) => {
        jobs2.set(progress.jobId, { scope, progress: { ...progress, ...progress.path ? { path: mediaUrl(progress.path) } : {} } });
      });
      return result;
    } finally {
      starting.delete(scope);
    }
  }
  if (action === "poll" || action === "cancel") {
    const job = jobs2.get(args.jobId);
    if (!job || job.scope !== scope) throw Error("\u5BFC\u51FA\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u7F16\u8F91\u5668");
    if (action === "cancel") {
      await cancelExport(args.jobId);
      return { cancelled: true };
    }
    return job.progress;
  }
  throw Error(`\u6B64\u7248\u672C\u5C1A\u4E0D\u652F\u6301\uFF1A${action}`);
}
var input = (0, import_node_readline.createInterface)({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  void (async () => {
    let message;
    try {
      message = JSON.parse(line);
      if (message.id === void 0) return;
      let result;
      if (message.method === "initialize") result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "dx-cut-engine", version: "0.1.0" } };
      else if (message.method === "ping") result = {};
      else if (message.method === "tools/list") result = { tools: [{ name: "request", description: "HIOS DX Cut internal editor engine", inputSchema: { type: "object", properties: { action: { type: "string" }, args: { type: "object" }, scope: { type: "string" } }, required: ["action"] }, annotations: { readOnlyHint: false, openWorldHint: false } }] };
      else if (message.method === "tools/call" && message.params.name === "request") {
        try {
          const a = message.params.arguments;
          result = { content: [{ type: "text", text: JSON.stringify(await execute(a.action, a.args || {}, String(a.scope || ""))) }] };
        } catch (e) {
          result = { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] };
        }
      } else {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } }) + "\n");
        return;
      }
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
    } catch (e) {
      if (message?.id !== void 0) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: String(e) } }) + "\n");
    }
  })();
});
input.on("close", () => {
  void cancelAllExports().finally(() => process.exit(0));
});
