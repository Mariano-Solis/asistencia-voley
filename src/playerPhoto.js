export const MAX_STORED_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_PHOTO_BYTES = 15 * 1024 * 1024;
const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function cleanBaseName(name = "foto") {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "foto";
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No Se Pudo Leer La Imagen Seleccionada."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("No Se Pudo Preparar La Foto.")),
      type,
      quality
    );
  });
}

async function renderCompressed(file, maxSide, quality) {
  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { alpha:false });
  if (!ctx) throw new Error("No Se Pudo Preparar La Foto.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas, "image/jpeg", quality);
}

export async function preparePlayerPhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Seleccioná Una Imagen Para La Foto De Perfil.");
  }
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("La Foto Es Demasiado Grande. Elegí Una Imagen De Menos De 15 MB.");
  }

  if (DIRECT_TYPES.has(file.type) && file.size <= MAX_STORED_PHOTO_BYTES) {
    return file;
  }

  let blob = await renderCompressed(file, 1600, 0.84);
  if (blob.size > MAX_STORED_PHOTO_BYTES) blob = await renderCompressed(file, 1280, 0.78);
  if (blob.size > MAX_STORED_PHOTO_BYTES) blob = await renderCompressed(file, 1000, 0.72);
  if (blob.size > MAX_STORED_PHOTO_BYTES) {
    throw new Error("No Se Pudo Reducir La Foto A Menos De 2 MB. Probá Con Otra Imagen.");
  }

  return new File([blob], `${cleanBaseName(file.name)}.jpg`, {
    type:"image/jpeg",
    lastModified:Date.now(),
  });
}

export function playerPhotoPath(userId, file) {
  const safe = (file?.name || "foto.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${userId}/${Date.now()}-${safe}`;
}
