import {
  encodeEan13,
  encodeUpca,
  encodeCode39,
  encodeCode128,
  encodeQr,
  type BarcodeFormat,
  type Barcode,
  type LinearBarcode,
  type QrBarcode,
} from "./encoders";
import { ref, computed, nextTick } from "vue";
import { saveFile } from "./host";
// 从发布包恢复的业务逻辑，不包含 Vue 编译运行时；原算法行为保留。
export default function useBarcode() {
  const format = ref<BarcodeFormat>("ean13");
  const content = ref("6803066683314");
  const moduleWidth = ref(3);
  const barHeight = ref(150);
  const quietZone = ref(12);
  const showText = ref(true);
  const showBackground = ref(true);
  const fontSize = ref(22);
  const foreground = ref("#111111");
  const background = ref("#ffffff");
  const previewElement = ref<HTMLElement | null>(null);
  const formats: {
    value: BarcodeFormat;
    label: string;
    hint: string;
  }[] = [
    { value: "ean13", label: "EAN-13", hint: "13 位商品码，自动补校验位" },
    { value: "upca", label: "UPC-A", hint: "12 位北美商品码" },
    { value: "code128b", label: "Code 128B", hint: "PN / SKU / 英文数字" },
    { value: "code39", label: "Code 39", hint: "大写英文数字，兼容高" },
    { value: "qr", label: "二维码", hint: "链接 / 中文 / 短说明" },
  ];
  const sampleContent = {
    ean13: "6803066683314",
    upca: "036000291452",
    code128b: "MSL430HK-US V4.0",
    code39: "TEST-1234",
    qr: "https://example.com/MSL430",
  };
  const formatDefaults = {
    ean13: { moduleWidth: 3, quiet: 12 },
    upca: { moduleWidth: 3, quiet: 12 },
    code128b: { moduleWidth: 3, quiet: 12 },
    code39: { moduleWidth: 3, quiet: 12 },
    qr: { moduleWidth: 8, quiet: 4 },
  };
  function encodeCurrent() {
    return format.value === "ean13"
      ? encodeEan13(content.value, quietZone.value)
      : format.value === "upca"
        ? encodeUpca(content.value, quietZone.value)
        : format.value === "code39"
          ? encodeCode39(content.value, quietZone.value)
          : format.value === "qr"
            ? encodeQr(content.value, quietZone.value)
            : encodeCode128(content.value, quietZone.value);
  }
  const result = computed(() => {
    try {
      if (
        ![foreground.value, background.value].every((color) =>
          /^#[0-9a-f]{6}$/i.test(color),
        )
      )
        throw new Error("颜色须为 #RRGGBB 格式");
      return { data: encodeCurrent(), error: "" };
    } catch (a) {
      return {
        data: null,
        error: a instanceof Error ? a.message : String(a),
      };
    }
  });
  const svg = computed(() => {
    const barcode = result.value.data;
    if (!barcode) return "";
    if (barcode.kind === "qr") return renderQrSvg(barcode);
    const leftPadding = barcode.quietModules * moduleWidth.value;
    const width =
      (barcode.bits.length + barcode.quietModules * 2) * moduleWidth.value;
    const retail = barcode.label === "EAN-13" || barcode.label === "UPC-A";
    const guardExtra = retail ? Math.round(fontSize.value * 0.48) : 0;
    const captionHeight = showText.value ? fontSize.value + 14 : guardExtra;
    const height = barHeight.value + captionHeight;
    const guardHeight = barHeight.value + guardExtra;
    const guardPositions = new Set(retail ? [0, 2, 45, 47, 49, 92, 94] : []);
    const rectangles = [];
    let runStart = -1;
    for (let index = 0; index <= barcode.bits.length; index++)
      if (
        (barcode.bits[index] === "1" && runStart < 0 && (runStart = index),
        (barcode.bits[index] !== "1" || index === barcode.bits.length) &&
          runStart >= 0)
      ) {
        const isGuard = [...Array(index - runStart)].some((unused, offset) =>
          guardPositions.has(runStart + offset),
        );
        rectangles.push(
          `<rect x="${leftPadding + runStart * moduleWidth.value}" y="0" width="${(index - runStart) * moduleWidth.value}" height="${isGuard ? guardHeight : barHeight.value}"/>`,
        );
        runStart = -1;
      }
    const caption = showText.value
      ? `<text x="${width / 2}" y="${barHeight.value + fontSize.value}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.value}" fill="${foreground.value}">${escapeXml(barcode.human)}</text>`
      : "";
    const backgroundRect = showBackground.value
      ? `<rect width="100%" height="100%" fill="${background.value}"/>`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${barcode.label} ${escapeXml(barcode.human)}">
  ${backgroundRect}
  <g fill="${foreground.value}">
    ${rectangles.join(`
    `)}
  </g>
  ${caption}
</svg>`;
  });
  const metrics = computed(() => {
    const barcode = result.value.data;
    if (!barcode) return [];
    if (barcode.kind === "qr") {
      const size = barcode.matrix.length + barcode.quietModules * 2;
      return [
        { label: "码制", value: barcode.label },
        {
          label: "矩阵",
          value: `${barcode.matrix.length} × ${barcode.matrix.length}`,
        },
        { label: "成品尺寸", value: `${size * moduleWidth.value}px` },
        { label: "静区", value: `${barcode.quietModules} 模块` },
      ];
    }
    return [
      { label: "码制", value: barcode.label },
      { label: "模块", value: `${barcode.bits.length}` },
      {
        label: "成品宽度",
        value: `${(barcode.bits.length + barcode.quietModules * 2) * moduleWidth.value}px`,
      },
      { label: "条高", value: `${barHeight.value}px` },
    ];
  });
  function escapeXml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function renderQrSvg(barcode: QrBarcode) {
    var currentRow;
    var rowAtEnd;
    const size = barcode.matrix.length;
    const width = (size + barcode.quietModules * 2) * moduleWidth.value;
    const rectangles = [];
    for (let row = 0; row < size; row++) {
      let runStart = -1;
      for (let column = 0; column <= size; column++) {
        if (
          (currentRow = barcode.matrix[row]) != null &&
          currentRow[column] &&
          runStart < 0
        ) {
          runStart = column;
        }
        if (
          (!((rowAtEnd = barcode.matrix[row]) != null && rowAtEnd[column]) ||
            column === size) &&
          runStart >= 0
        ) {
          rectangles.push(
            `<rect x="${(runStart + barcode.quietModules) * moduleWidth.value}" y="${(row + barcode.quietModules) * moduleWidth.value}" width="${(column - runStart) * moduleWidth.value}" height="${moduleWidth.value}"/>`,
          );
          runStart = -1;
        }
      }
    }
    const backgroundRect = showBackground.value
      ? `<rect width="100%" height="100%" fill="${background.value}"/>`
      : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}" role="img" aria-label="${escapeXml(barcode.label)} ${escapeXml(barcode.human)}">
  ${backgroundRect}
  <g fill="${foreground.value}">
    ${rectangles.join(`
    `)}
  </g>
</svg>`;
  }
  function exportName() {
    var barcode;
    return (
      (
        ((barcode = result.value.data) == null ? void 0 : barcode.human) ||
        content.value ||
        "barcode"
      )
        .replace(/[\\/:*?"<>|]+/g, "-")
        .slice(0, 80) || "barcode"
    );
  }
  function selectFormat(nextFormat: BarcodeFormat) {
    format.value = nextFormat;
    content.value = sampleContent[nextFormat];
    moduleWidth.value = formatDefaults[nextFormat].moduleWidth;
    quietZone.value = formatDefaults[nextFormat].quiet;
  }
  async function exportSvg() {
    if (svg.value) {
      await saveFile(
        new Blob([svg.value], { type: "image/svg+xml;charset=utf-8" }),
        `${exportName()}.svg`,
      );
    }
  }
  async function exportPdf() {
    const barcode = result.value.data;
    if (barcode) {
      await saveFile(
        new Blob([new Uint8Array(renderPdf(barcode))], {
          type: "application/pdf",
        }),
        `${exportName()}.pdf`,
      );
    }
  }
  async function exportPng(save = true) {
    if (!svg.value) return;
    const fileName = exportName();
    const includeBackground = showBackground.value;
    const backgroundColor = background.value;
    const url = URL.createObjectURL(
      new Blob([svg.value], { type: "image/svg+xml;charset=utf-8" }),
    );
    try {
      const image = new Image();
      image.decoding = "async";
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("PNG 渲染失败"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      if (image.naturalWidth * 3 > 16384 || image.naturalHeight * 3 > 16384 || image.naturalWidth * image.naturalHeight * 9 > 16777216) throw new Error("输出图片过大，请减少内容或模块宽度");
      canvas.width = image.naturalWidth * 3;
      canvas.height = image.naturalHeight * 3;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建画布");
      if (includeBackground) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("PNG 编码失败")),
          "image/png",
        );
      });
      if (save) await saveFile(blob, fileName + ".png");
      return { blob, name: fileName + ".png", width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  function renderPdf(barcode: Barcode) {
    const size = measureBarcode(barcode);
    const shapes =
      barcode.kind === "qr"
        ? renderQrPdf(barcode, size.height)
        : renderLinearPdf(barcode, size.height);
    const caption = escapePdfText(barcode.human);
    const stream = [
      "q",
      showBackground.value ? pdfColor(background.value) : "",
      showBackground.value
        ? `0 0 ${formatNumber(size.width)} ${formatNumber(size.height)} re f`
        : "",
      pdfColor(foreground.value),
      shapes,
      showText.value && barcode.kind === "linear"
        ? `BT /F1 ${formatNumber(fontSize.value)} Tf ${formatNumber(size.width / 2 - estimateTextWidth(barcode.human) / 2)} ${formatNumber(size.height - barHeight.value - fontSize.value)} Td (${caption}) Tj ET`
        : "",
      "Q",
    ].filter(Boolean).join(`
`);
    return buildPdf(size.width, size.height, stream);
  }
  function measureBarcode(barcode: Barcode) {
    if (barcode.kind === "qr") {
      const size =
        (barcode.matrix.length + barcode.quietModules * 2) * moduleWidth.value;
      return { width: size, height: size };
    }
    const guardExtra =
      barcode.label === "EAN-13" || barcode.label === "UPC-A"
        ? Math.round(fontSize.value * 0.48)
        : 0;
    return {
      width:
        (barcode.bits.length + barcode.quietModules * 2) * moduleWidth.value,
      height:
        barHeight.value + (showText.value ? fontSize.value + 14 : guardExtra),
    };
  }
  function renderLinearPdf(barcode: LinearBarcode, height: number) {
    const leftPadding = barcode.quietModules * moduleWidth.value;
    const retail = barcode.label === "EAN-13" || barcode.label === "UPC-A";
    const guardExtra = retail ? Math.round(fontSize.value * 0.48) : 0;
    const guardHeight = barHeight.value + guardExtra;
    const guardPositions = new Set(retail ? [0, 2, 45, 47, 49, 92, 94] : []);
    const commands = [];
    let runStart = -1;
    for (let index = 0; index <= barcode.bits.length; index++)
      if (
        (barcode.bits[index] === "1" && runStart < 0 && (runStart = index),
        (barcode.bits[index] !== "1" || index === barcode.bits.length) &&
          runStart >= 0)
      ) {
        const rectHeight = [...Array(index - runStart)].some((unused, offset) =>
          guardPositions.has(runStart + offset),
        )
          ? guardHeight
          : barHeight.value;
        commands.push(
          `${formatNumber(leftPadding + runStart * moduleWidth.value)} ${formatNumber(height - rectHeight)} ${formatNumber((index - runStart) * moduleWidth.value)} ${formatNumber(rectHeight)} re f`,
        );
        runStart = -1;
      }
    return commands.join(`
`);
  }
  function renderQrPdf(barcode: QrBarcode, height: number) {
    var currentRow;
    var rowAtEnd;
    const commands = [];
    for (let row = 0; row < barcode.matrix.length; row++) {
      let runStart = -1;
      for (let column = 0; column <= barcode.matrix.length; column++)
        if (
          ((currentRow = barcode.matrix[row]) != null &&
            currentRow[column] &&
            runStart < 0 &&
            (runStart = column),
          (!((rowAtEnd = barcode.matrix[row]) != null && rowAtEnd[column]) ||
            column === barcode.matrix.length) &&
            runStart >= 0)
        ) {
          const x = (runStart + barcode.quietModules) * moduleWidth.value;
          const y =
            height - (row + barcode.quietModules + 1) * moduleWidth.value;
          commands.push(
            `${formatNumber(x)} ${formatNumber(y)} ${formatNumber((column - runStart) * moduleWidth.value)} ${formatNumber(moduleWidth.value)} re f`,
          );
          runStart = -1;
        }
    }
    return commands.join(`
`);
  }
  function buildPdf(width: number, height: number, stream: string) {
    const encoder = new TextEncoder();
    const streamLength = encoder.encode(stream).length;
    const objects = [
      `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`,
      `2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
`,
      `3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(width)} ${formatNumber(height)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
`,
      `4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`,
      `5 0 obj
<< /Length ${streamLength} >>
stream
${stream}
endstream
endobj
`,
    ];
    let document = `%PDF-1.4
`;
    const offsets = [0];
    for (const index of objects) {
      offsets.push(encoder.encode(document).length);
      document += index;
    }
    const xrefOffset = encoder.encode(document).length;
    document += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;
    for (let index = 1; index <= objects.length; index++)
      document += `${String(offsets[index]).padStart(10, "0")} 00000 n 
`;
    document += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;
    return encoder.encode(document);
  }
  function pdfColor(color: string) {
    const [red, green, blue] = parseColor(color).map((channel) =>
      formatNumber(channel / 255),
    );
    return `${red} ${green} ${blue} rg`;
  }
  function parseColor(color: string) {
    const hex = color.replace("#", "");
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  function formatNumber(value: number) {
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }
  function escapePdfText(value: string) {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }
  function estimateTextWidth(value: string) {
    return value.length * fontSize.value * 0.56;
  }
  async function animatePreview() {
    var element;
    await nextTick();
    (element = previewElement.value) == null ||
      element.animate(
        [{ transform: "scale(.985)" }, { transform: "scale(1)" }],
        {
          duration: 220,
          easing: "cubic-bezier(.22,1,.36,1)",
        },
      );
  }
  return {
    format,
    content,
    moduleWidth,
    barHeight,
    quietZone,
    showText,
    showBackground,
    fontSize,
    foreground,
    background,
    previewElement,
    formats,
    selectFormat,
    result,
    svg,
    metrics,
    exportSvg,
    exportPdf,
    exportPng,
    animatePreview,
  };
}
