import 'server-only';

import fs from 'node:fs';
import path from 'node:path';

const MAX_SIZE_BYTES = Number(process.env.LOGO_MAX_BYTES ?? String(2 * 1024 * 1024));
const MAX_DIM_PX = Number(process.env.LOGO_MAX_DIM_PX ?? '4096');

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
};

export function uploadsRoot() {
  return process.env.EVAC_UPLOAD_ROOT || '/home/mdares/evac-cloud/uploads';
}

export function logoDir() {
  return path.join(uploadsRoot(), 'building-logos');
}

export function logoPathForBuilding(buildingId: string, ext: string) {
  return path.join(logoDir(), `${buildingId}.${ext}`);
}

function pngDimensions(buf: Buffer) {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf: Buffer) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (!marker) break;
    if (marker >= 0xc0 && marker <= 0xc3) {
      if (i + 8 >= buf.length) return null;
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    if (i + 4 >= buf.length) break;
    const size = buf.readUInt16BE(i + 2);
    if (!size || size < 2) break;
    i += 2 + size;
  }
  return null;
}

function svgDimensions(content: string) {
  const widthMatch = content.match(/\bwidth\s*=\s*['\"]?(\d+(?:\.\d+)?)/i);
  const heightMatch = content.match(/\bheight\s*=\s*['\"]?(\d+(?:\.\d+)?)/i);
  if (widthMatch && heightMatch) {
    return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
  }
  const viewBox = content.match(/\bviewBox\s*=\s*['\"]?\s*[-\d.]+\s+[-\d.]+\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  return null;
}

export async function validateLogoFile(file: File) {
  const mime = file.type?.toLowerCase();
  if (!mime || !(mime in MIME_EXT)) throw new Error('Formato inválido. Usa PNG, JPG o SVG.');
  if (!file.size || file.size > MAX_SIZE_BYTES) {
    throw new Error(`Archivo demasiado grande (máximo ${Math.round(MAX_SIZE_BYTES / 1024 / 1024)} MB).`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let dimensions: { width: number; height: number } | null = null;

  if (mime === 'image/png') dimensions = pngDimensions(buffer);
  if (mime === 'image/jpeg') dimensions = jpegDimensions(buffer);
  if (mime === 'image/svg+xml') dimensions = svgDimensions(buffer.toString('utf8'));

  if (dimensions) {
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error('Dimensiones inválidas en el archivo de imagen.');
    }
    if (dimensions.width > MAX_DIM_PX || dimensions.height > MAX_DIM_PX) {
      throw new Error(`Dimensiones excedidas (máximo ${MAX_DIM_PX}px).`);
    }
  }

  return {
    mime,
    ext: MIME_EXT[mime],
    buffer,
    dimensions,
  };
}

export function ensureLogoDir() {
  fs.mkdirSync(logoDir(), { recursive: true });
}

export function deletePreviousLogos(buildingId: string) {
  ensureLogoDir();
  for (const ext of Object.values(MIME_EXT)) {
    const p = logoPathForBuilding(buildingId, ext);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

export function saveLogo(buildingId: string, ext: string, buffer: Buffer) {
  ensureLogoDir();
  const filePath = logoPathForBuilding(buildingId, ext);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function loadFileOrNull(filePath?: string | null) {
  if (!filePath) return null;
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}
