// 从 barcode 1.0.7 发布代码恢复，保留原有编码行为与限制。
export type BarcodeFormat = "ean13" | "upca" | "code128b" | "code39" | "qr";

export interface BarcodeBase {
  label: string;
  human: string;
  quietModules: number;
}

export interface LinearBarcode extends BarcodeBase {
  kind: "linear";
  bits: string;
}

export interface QrBarcode extends BarcodeBase {
  kind: "qr";
  matrix: boolean[][];
}

export type Barcode = LinearBarcode | QrBarcode;

export type SetModule = (x: number, y: number, dark: boolean) => void;

const eanLeftPatterns: Record<string, string> = {
  0: "0001101",
  1: "0011001",
  2: "0010011",
  3: "0111101",
  4: "0100011",
  5: "0110001",
  6: "0101111",
  7: "0111011",
  8: "0110111",
  9: "0001011",
};

const eanEvenPatterns: Record<string, string> = {
  0: "0100111",
  1: "0110011",
  2: "0011011",
  3: "0100001",
  4: "0011101",
  5: "0111001",
  6: "0000101",
  7: "0010001",
  8: "0001001",
  9: "0010111",
};

const eanRightPatterns: Record<string, string> = {
  0: "1110010",
  1: "1100110",
  2: "1101100",
  3: "1000010",
  4: "1011100",
  5: "1001110",
  6: "1010000",
  7: "1000100",
  8: "1001000",
  9: "1110100",
};

const eanParityPatterns = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

const code39Patterns: Record<string, string> = {
  0: "101001101101",
  1: "110100101011",
  2: "101100101011",
  3: "110110010101",
  4: "101001101011",
  5: "110100110101",
  6: "101100110101",
  7: "101001011011",
  8: "110100101101",
  9: "101100101101",
  A: "110101001011",
  B: "101101001011",
  C: "110110100101",
  D: "101011001011",
  E: "110101100101",
  F: "101101100101",
  G: "101010011011",
  H: "110101001101",
  I: "101101001101",
  J: "101011001101",
  K: "110101010011",
  L: "101101010011",
  M: "110110101001",
  N: "101011010011",
  O: "110101101001",
  P: "101101101001",
  Q: "101010110011",
  R: "110101011001",
  S: "101101011001",
  T: "101011011001",
  U: "110010101011",
  V: "100110101011",
  W: "110011010101",
  X: "100101101011",
  Y: "110010110101",
  Z: "100110110101",
  "-": "100101011011",
  ".": "110010101101",
  " ": "100110101101",
  $: "100100100101",
  "/": "100100101001",
  "+": "100101001001",
  "%": "101001001001",
  "*": "100101101101",
};

const code128Patterns = [
  "11011001100",
  "11001101100",
  "11001100110",
  "10010011000",
  "10010001100",
  "10001001100",
  "10011001000",
  "10011000100",
  "10001100100",
  "11001001000",
  "11001000100",
  "11000100100",
  "10110011100",
  "10011011100",
  "10011001110",
  "10111001100",
  "10011101100",
  "10011100110",
  "11001110010",
  "11001011100",
  "11001001110",
  "11011100100",
  "11001110100",
  "11101101110",
  "11101001100",
  "11100101100",
  "11100100110",
  "11101100100",
  "11100110100",
  "11100110010",
  "11011011000",
  "11011000110",
  "11000110110",
  "10100011000",
  "10001011000",
  "10001000110",
  "10110001000",
  "10001101000",
  "10001100010",
  "11010001000",
  "11000101000",
  "11000100010",
  "10110111000",
  "10110001110",
  "10001101110",
  "10111011000",
  "10111000110",
  "10001110110",
  "11101110110",
  "11010001110",
  "11000101110",
  "11011101000",
  "11011100010",
  "11011101110",
  "11101011000",
  "11101000110",
  "11100010110",
  "11101101000",
  "11101100010",
  "11100011010",
  "11101111010",
  "11001000010",
  "11110001010",
  "10100110000",
  "10100001100",
  "10010110000",
  "10010000110",
  "10000101100",
  "10000100110",
  "10110010000",
  "10110000100",
  "10011010000",
  "10011000010",
  "10000110100",
  "10000110010",
  "11000010010",
  "11001010000",
  "11110111010",
  "11000010100",
  "10001111010",
  "10100111100",
  "10010111100",
  "10010011110",
  "10111100100",
  "10011110100",
  "10011110010",
  "11110100100",
  "11110010100",
  "11110010010",
  "11011011110",
  "11011110110",
  "11110110110",
  "10101111000",
  "10100011110",
  "10001011110",
  "10111101000",
  "10111100010",
  "11110101000",
  "11110100010",
  "10111011110",
  "10111101110",
  "11101011110",
  "11110101110",
  "11010000100",
  "11010010000",
  "11010011100",
  "11000111010",
];

const qrVersions = [
  { version: 1, total: 26, data: 19, blocks: 1, ecc: 7, align: [] },
  { version: 2, total: 44, data: 34, blocks: 1, ecc: 10, align: [6, 18] },
  { version: 3, total: 70, data: 55, blocks: 1, ecc: 15, align: [6, 22] },
  { version: 4, total: 100, data: 80, blocks: 1, ecc: 20, align: [6, 26] },
  { version: 5, total: 134, data: 108, blocks: 1, ecc: 26, align: [6, 30] },
  { version: 6, total: 172, data: 136, blocks: 2, ecc: 18, align: [6, 34] },
  {
    version: 7,
    total: 196,
    data: 156,
    blocks: 2,
    ecc: 20,
    align: [6, 22, 38],
  },
  {
    version: 8,
    total: 242,
    data: 194,
    blocks: 2,
    ecc: 24,
    align: [6, 24, 42],
  },
  {
    version: 9,
    total: 292,
    data: 232,
    blocks: 2,
    ecc: 30,
    align: [6, 26, 46],
  },
  {
    version: 10,
    total: 346,
    data: 274,
    blocks: 4,
    ecc: 18,
    align: [6, 28, 50],
  },
];

const qrByteCapacities = [17, 32, 53, 78, 106, 134, 154, 192, 230, 271];

function calculateChecksum(digits: string) {
  const weightedSum = digits.split("").reduce((sum, digit, index) => {
    const positionFromRight = digits.length - index;
    return sum + Number(digit) * (positionFromRight % 2 === 1 ? 3 : 1);
  }, 0);
  return String((10 - (weightedSum % 10)) % 10);
}

function normalizeRetailCode(input: string, length: number) {
  const digits = input.replace(/\D/g, "");
  const payloadLength = length - 1;
  if (digits.length === payloadLength)
    return digits + calculateChecksum(digits);
  if (digits.length === length) return digits;
  throw new Error(
    `${length === 13 ? "EAN-13" : "UPC-A"} 需要 ${payloadLength} 位或 ${length} 位数字`,
  );
}

export function encodeEan13(input: string, quietModules = 12): LinearBarcode {
  const digits = normalizeRetailCode(input, 13);
  const parity = eanParityPatterns[Number(digits[0])];
  let bits = "101";
  for (let index = 1; index <= 6; index++)
    bits += (parity[index - 1] === "L" ? eanLeftPatterns : eanEvenPatterns)[
      digits[index]
    ];
  bits += "01010";
  for (let index = 7; index <= 12; index++)
    bits += eanRightPatterns[digits[index]];
  bits += "101";
  return {
    kind: "linear",
    label: "EAN-13",
    bits: bits,
    human: digits,
    quietModules,
  };
}

export function encodeUpca(input: string, quietModules = 12): LinearBarcode {
  const digits = normalizeRetailCode(input, 12);
  return {
    kind: "linear",
    label: "UPC-A",
    bits: encodeEan13(`0${digits}`, quietModules).bits,
    human: digits,
    quietModules,
  };
}

export function encodeCode39(input: string, quietModules = 12): LinearBarcode {
  const value = input.trim().toUpperCase();
  if (!value) throw new Error("请输入 Code 39 内容");
  const unsupported = [...value].find(
    (character) => !code39Patterns[character],
  );
  if (unsupported) throw new Error(`Code 39 不支持字符：${unsupported}`);
  return {
    kind: "linear",
    label: "Code 39",
    bits: `*${value}*`
      .split("")
      .map((character) => code39Patterns[character])
      .join("0"),
    human: value,
    quietModules,
  };
}

export function encodeCode128(input: string, quietModules = 12): LinearBarcode {
  const value = input.trim();
  if (!value) throw new Error("请输入 Code 128 内容");
  const symbols = [104];
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint < 32 || codePoint > 126)
      throw new Error("Code 128B 目前支持 ASCII 32-126 字符");
    symbols.push(codePoint - 32);
  }
  const checksum =
    symbols.reduce(
      (character, codePoint, index) =>
        character + codePoint * (index === 0 ? 1 : index),
      0,
    ) % 103;
  symbols.push(checksum, 106);
  return {
    kind: "linear",
    label: "Code 128B",
    bits: symbols.map((character) => code128Patterns[character]).join(""),
    human: value,
    quietModules,
  };
}

export function encodeQr(input: string, quietModules = 12): QrBarcode {
  const value = input.trim();
  if (!value) throw new Error("请输入二维码内容");
  const bytes = [...new TextEncoder().encode(value)];
  const versionIndex = qrByteCapacities.findIndex(
    (mask) => bytes.length <= mask,
  );
  if (versionIndex < 0)
    throw new Error("当前内置二维码最多支持约 271 字节内容");
  const version = qrVersions[versionIndex];
  const dataBytes = encodeQrBytes(bytes, version.version, version.data);
  const dataBlocks = splitBlocks(dataBytes, version.blocks);
  const errorBlocks = dataBlocks.map((mask) => reedSolomon(mask, version.ecc));
  const codewords = interleaveBlocks(dataBlocks, errorBlocks);
  const grid = createQrGrid(version.version, version.align);
  let best = { matrix: grid.modules, score: Number.POSITIVE_INFINITY };
  for (let mask = 0; mask < 8; mask++) {
    const matrix = cloneMatrix(grid.modules);
    placeQrData(matrix, grid.reserved, codewords, mask);
    writeFormat(matrix, mask);
    if (version.version >= 7) {
      writeVersion(matrix, version.version);
    }
    const score = scoreQr(matrix);
    if (score < best.score) {
      best = { matrix: matrix, score: score };
    }
  }
  return {
    kind: "qr",
    label: `QR v${version.version}-L`,
    matrix: best.matrix,
    human: value,
    quietModules,
  };
}

function encodeQrBytes(bytes: number[], version: number, capacity: number) {
  const bits: number[] = [];
  appendBits(bits, 4, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const index of bytes) appendBits(bits, index, 8);
  const capacityBits = capacity * 8;
  for (
    appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
    bits.length % 8;
  )
    bits.push(0);
  const codewords = [];
  for (let index = 0; index < bits.length; index += 8)
    codewords.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
  for (let index = 0; codewords.length < capacity; index++)
    codewords.push(index % 2 ? 17 : 236);
  return codewords;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let shift = length - 1; shift >= 0; shift--)
    bits.push((value >>> shift) & 1);
}

function splitBlocks(bytes: number[], count: number) {
  const baseLength = Math.floor(bytes.length / count);
  const remainder = bytes.length % count;
  const blocks = [];
  let offset = 0;
  for (let index = 0; index < count; index++) {
    const length = baseLength + (index >= count - remainder ? 1 : 0);
    blocks.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return blocks;
}

function interleaveBlocks(dataBlocks: number[][], errorBlocks: number[][]) {
  const codewords = [];
  const maxLength = Math.max(...dataBlocks.map((index) => index.length));
  for (let index = 0; index < maxLength; index++)
    for (const block of dataBlocks)
      if (index < block.length) {
        codewords.push(block[index]);
      }
  for (let index = 0; index < errorBlocks[0].length; index++)
    for (const block of errorBlocks) codewords.push(block[index]);
  return codewords;
}

function reedSolomon(bytes: number[], degree: number) {
  const polynomial = generatorPolynomial(degree);
  const remainder = Array(degree).fill(0);
  for (const byte of bytes) {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    for (let index = 0; index < degree; index++)
      remainder[index] ^= multiplyGalois(polynomial[index], factor);
  }
  return remainder;
}

function generatorPolynomial(degree: number) {
  let polynomial = [1];
  for (let power = 0; power < degree; power++) {
    const next = Array(polynomial.length + 1).fill(0);
    for (let index = 0; index < polynomial.length; index++) {
      next[index] ^= multiplyGalois(polynomial[index], 1);
      next[index + 1] ^= multiplyGalois(
        polynomial[index],
        powerGalois(2, power),
      );
    }
    polynomial = next;
  }
  return polynomial.slice(1);
}

function multiplyGalois(left: number, right: number) {
  let multiplicand = left;
  let multiplier = right;
  let product = 0;
  for (; multiplier;) {
    if (multiplier & 1) {
      product ^= multiplicand;
    }
    multiplicand <<= 1;
    if (multiplicand & 256) {
      multiplicand ^= 285;
    }
    multiplier >>>= 1;
  }
  return product;
}

function powerGalois(base: number, exponent: number) {
  let value = 1;
  for (let index = 0; index < exponent; index++)
    value = multiplyGalois(value, base);
  return value;
}

function createQrGrid(version: number, alignments: number[]) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setModule: SetModule = (row, column, dark) => {
    row < 0 ||
      column < 0 ||
      row >= size ||
      column >= size ||
      ((modules[column][row] = dark), (reserved[column][row] = true));
  };
  drawFinder(setModule, 0, 0);
  drawFinder(setModule, size - 7, 0);
  drawFinder(setModule, 0, size - 7);
  for (let row = 0; row < size; row++) {
    setModule(6, row, row % 2 === 0);
    setModule(row, 6, row % 2 === 0);
  }
  for (const row of alignments)
    for (const column of alignments)
      (column === 6 && row === 6) ||
        (column === 6 && row === size - 7) ||
        (column === size - 7 && row === 6) ||
        drawAlignment(setModule, column - 2, row - 2);
  setModule(8, size - 8, true);
  reserveFormat(reserved);
  if (version >= 7) {
    reserveVersion(reserved);
  }
  return { modules: modules, reserved: reserved };
}

function drawFinder(setModule: SetModule, x: number, y: number) {
  for (let dy = -1; dy <= 7; dy++)
    for (let dx = -1; dx <= 7; dx++) {
      const dark =
        dx >= 0 &&
        dy >= 0 &&
        dx <= 6 &&
        dy <= 6 &&
        (dx === 0 ||
          dy === 0 ||
          dx === 6 ||
          dy === 6 ||
          (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(x + dx, y + dy, dark);
    }
}

function drawAlignment(setModule: SetModule, x: number, y: number) {
  for (let dy = 0; dy < 5; dy++)
    for (let dx = 0; dx < 5; dx++)
      setModule(
        x + dx,
        y + dy,
        dx === 0 || dy === 0 || dx === 4 || dy === 4 || (dx === 2 && dy === 2),
      );
}

function reserveFormat(reserved: boolean[][]) {
  const size = reserved.length;
  for (let index = 0; index < 9; index++) {
    reserved[8][index] = true;
    reserved[index][8] = true;
    reserved[8][size - 1 - index] = true;
    reserved[size - 1 - index][8] = true;
  }
}

function reserveVersion(reserved: boolean[][]) {
  const size = reserved.length;
  for (let row = 0; row < 6; row++)
    for (let column = 0; column < 3; column++) {
      reserved[row][size - 11 + column] = true;
      reserved[size - 11 + column][row] = true;
    }
}

function cloneMatrix(matrix: boolean[][]) {
  return matrix.map((row) => [...row]);
}

function placeQrData(
  matrix: boolean[][],
  reserved: boolean[][],
  codewords: number[],
  mask: number,
) {
  const size = matrix.length;
  const bits = codewords.flatMap((rightColumn) =>
    Array.from(
      { length: 8 },
      (step, row) => ((rightColumn >>> (7 - row)) & 1) === 1,
    ),
  );
  let bitIndex = 0;
  let upward = true;
  for (let rightColumn = size - 1; rightColumn > 0; rightColumn -= 2) {
    if (rightColumn === 6) {
      rightColumn--;
    }
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const column = rightColumn - offset;
        if (reserved[row][column]) continue;
        const dark = bits[bitIndex++] || false;
        matrix[row][column] = dark !== maskBit(mask, column, row);
      }
    }
    upward = !upward;
  }
}

function maskBit(mask: number, x: number, y: number) {
  return mask === 0
    ? (x + y) % 2 === 0
    : mask === 1
      ? y % 2 === 0
      : mask === 2
        ? x % 3 === 0
        : mask === 3
          ? (x + y) % 3 === 0
          : mask === 4
            ? (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
            : mask === 5
              ? ((x * y) % 2) + ((x * y) % 3) === 0
              : mask === 6
                ? (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
                : (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
}

function writeFormat(matrix: boolean[][], mask: number) {
  const size = matrix.length;
  const bits = formatBits(8 | mask);
  for (let index = 0; index < 15; index++) {
    const dark = ((bits >>> index) & 1) === 1;
    const primary = [
      [0, 8],
      [1, 8],
      [2, 8],
      [3, 8],
      [4, 8],
      [5, 8],
      [7, 8],
      [8, 8],
      [8, 7],
      [8, 5],
      [8, 4],
      [8, 3],
      [8, 2],
      [8, 1],
      [8, 0],
    ][index];
    matrix[primary[1]][primary[0]] = dark;
    const secondary =
      index < 8 ? [size - 1 - index, 8] : [8, size - 15 + index];
    matrix[secondary[1]][secondary[0]] = dark;
  }
}

function formatBits(value: number) {
  let remainder = value << 10;
  const polynomial = 1335;
  for (let shift = 14; shift >= 10; shift--)
    if ((remainder >>> shift) & 1) {
      remainder ^= polynomial << (shift - 10);
    }
  return ((value << 10) | remainder) ^ 21522;
}

function writeVersion(matrix: boolean[][], version: number) {
  const size = matrix.length;
  const bits = versionBits(version);
  for (let index = 0; index < 18; index++) {
    const dark = ((bits >>> index) & 1) === 1;
    const column = size - 11 + (index % 3);
    const row = Math.floor(index / 3);
    matrix[row][column] = dark;
    matrix[column][row] = dark;
  }
}

function versionBits(version: number) {
  let remainder = version << 12;
  const polynomial = 7973;
  for (let shift = 17; shift >= 12; shift--)
    if ((remainder >>> shift) & 1) {
      remainder ^= polynomial << (shift - 12);
    }
  return (version << 12) | remainder;
}

function scoreQr(matrix: boolean[][]) {
  const size = matrix.length;
  let score = 0;
  const runPenalty = (row: boolean[]) => {
    let column = 0;
    let dark = 1;
    for (let index = 1; index <= row.length; index++)
      row[index] === row[index - 1]
        ? dark++
        : (dark >= 5 && (column += 3 + dark - 5), (dark = 1));
    return column;
  };
  for (let row = 0; row < size; row++) score += runPenalty(matrix[row]);
  for (let row = 0; row < size; row++)
    score += runPenalty(matrix.map((column) => column[row]));
  for (let row = 0; row < size - 1; row++)
    for (let column = 0; column < size - 1; column++) {
      const dark = matrix[row][column];
      if (
        matrix[row][column + 1] === dark &&
        matrix[row + 1][column] === dark &&
        matrix[row + 1][column + 1] === dark
      ) {
        score += 3;
      }
    }
  const darkCount = matrix.flat().filter(Boolean).length;
  score +=
    Math.floor(Math.abs((darkCount * 100) / (size * size) - 50) / 5) * 10;
  return score;
}
