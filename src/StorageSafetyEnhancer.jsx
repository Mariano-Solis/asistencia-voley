import { useEffect } from "react";
import { supabase } from "./supabase";

const SELFIE_BUCKET = "player-selfies";
const SELFIE_MAX_DIMENSION = 1024;
const SELFIE_TARGET_BYTES = 320 * 1024;
const RECEIPT_MAX_DIMENSION = 1800;
const RECEIPT_TARGET_BYTES = 650 * 1024;
const SIGNED_URL_SECONDS = 15 * 60;
const SIGNED_URL_CACHE_MS = (SIGNED_URL_SECONDS - 60) * 1000;

const signedUrlCache = new Map();

function isFileInput(node) {
  return node instanceof HTMLInputElement && node.type === "file";
}

function isReceiptInput(input) {
  const accept = String(input.getAttribute("accept") || "").toLowerCase();
  return input.classList.contains("payment-file-input") || accept.includes("application/pdf");
}

function optimizedName(name) {
  const base = String(name || "imagen")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  return `${base || "imagen"}-optimizada.jpg`;
}

async function loadDrawable(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      };
    } catch (_) {
      // Fallback below for browsers/codecs that createImageBitmap cannot decode.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo leer la imagen seleccionada."));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo optimizar la imagen."))),
      "image/jpeg",
      quality,
    );
  });
}

async function compressImage(file, { maxDimension, targetBytes }) {
  if (!file?.type?.startsWith("image/")) return file;
  if (file.size <= targetBytes && /image\/(jpeg|jpg|webp)/i.test(file.type)) return file;

  const drawable = await loadDrawable(file);
  try {
    if (!drawable.width || !drawable.height) throw new Error("La imagen no tiene dimensiones válidas.");

    const initialScale = Math.min(1, maxDimension / Math.max(drawable.width, drawable.height));
    let width = Math.max(1, Math.round(drawable.width * initialScale));
    let height = Math.max(1, Math.round(drawable.height * initialScale));
    let bestBlob = null;

    for (let resizePass = 0; resizePass < 4; resizePass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("El navegador no pudo preparar la imagen.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(drawable.source, 0, 0, width, height);

      for (const quality of [0.86, 0.78, 0.70, 0.62]) {
        const blob = await canvasToBlob(canvas, quality);
        if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
        if (blob.size <= targetBytes) {
          return new File([blob], optimizedName(file.name), {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
        }
      }

      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }

    if (!bestBlob) throw new Error("No se pudo optimizar la imagen.");
    return new File([bestBlob], optimizedName(file.name), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    drawable.close();
  }
}

function assignSingleFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;

  Object.defineProperty(input, "__voleySelectedFile", {
    configurable: true,
    writable: true,
    value: file,
  });
}

function extractPublicSelfiePath(src) {
  if (!src) return null;
  const marker = "/storage/v1/object/public/player-selfies/";
  const index = src.indexOf(marker);
  if (index < 0) return null;
  const encoded = src.slice(index + marker.length).split("?")[0];
  try {
    return decodeURIComponent(encoded);
  } catch (_) {
    return encoded;
  }
}

async function signedSelfieUrl(path) {
  if (!path) return null;

  const now = Date.now();
  const cached = signedUrlCache.get(path);
  if (cached?.expiresAt > now) return cached.promise;
  if (cached) signedUrlCache.delete(path);

  const pending = (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session) {
      const { data, error } = await supabase.storage
        .from(SELFIE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      if (!error && data?.signedUrl) return data.signedUrl;
    }

    let legacy = null;
    try {
      legacy = JSON.parse(localStorage.getItem("voley_player") || "null");
    } catch (_) {
      legacy = null;
    }

    if (legacy?.legacy && legacy?.id && legacy?.code) {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/player-selfie-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: legacy.id, code: legacy.code }),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok && payload?.path === path && payload?.signed_url) {
        return payload.signed_url;
      }
    }

    return null;
  })();

  signedUrlCache.set(path, {
    promise: pending,
    expiresAt: now + SIGNED_URL_CACHE_MS,
  });

  const value = await pending;
  if (!value) signedUrlCache.delete(path);
  return value;
}

async function secureImage(img) {
  if (!(img instanceof HTMLImageElement)) return;
  const path = extractPublicSelfiePath(img.src);
  if (!path || img.dataset.voleyPrivateSelfiePath === path) return;

  img.dataset.voleyPrivateSelfiePath = path;
  try {
    const signed = await signedSelfieUrl(path);
    if (signed && img.isConnected) img.src = signed;
  } catch (_) {
    delete img.dataset.voleyPrivateSelfiePath;
  }
}

function scanSelfies(root = document) {
  if (root instanceof HTMLImageElement) secureImage(root);
  root.querySelectorAll?.('img[src*="/storage/v1/object/public/player-selfies/"]').forEach(secureImage);
}

export default function StorageSafetyEnhancer() {
  useEffect(() => {
    const onFileChangeCapture = async (event) => {
      const input = event.target;
      if (!isFileInput(input) || input.dataset.voleyCompressionPass === "1") return;

      const file = input.files?.[0] || input.__voleySelectedFile;
      if (!file || !file.type?.startsWith("image/")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const receipt = isReceiptInput(input);
      try {
        const optimized = await compressImage(file, {
          maxDimension: receipt ? RECEIPT_MAX_DIMENSION : SELFIE_MAX_DIMENSION,
          targetBytes: receipt ? RECEIPT_TARGET_BYTES : SELFIE_TARGET_BYTES,
        });
        assignSingleFile(input, optimized);
        input.dataset.voleyCompressionPass = "1";
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) {
        input.value = "";
        try { delete input.__voleySelectedFile; } catch (_) {}
        window.alert(
          error?.message ||
            "No se pudo optimizar la imagen. Probá con una foto JPG o PNG diferente.",
        );
      } finally {
        delete input.dataset.voleyCompressionPass;
      }
    };

    document.addEventListener("change", onFileChangeCapture, true);

    scanSelfies();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target instanceof HTMLImageElement) {
          secureImage(mutation.target);
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) scanSelfies(node);
        });
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      signedUrlCache.clear();
      document.querySelectorAll("img[data-voley-private-selfie-path]").forEach((img) => {
        delete img.dataset.voleyPrivateSelfiePath;
      });
      scanSelfies();
    });

    const cacheTimer = window.setInterval(() => {
      const cutoff = Date.now();
      for (const [path, entry] of signedUrlCache.entries()) {
        if (!entry?.expiresAt || entry.expiresAt <= cutoff) signedUrlCache.delete(path);
      }
    }, 60 * 1000);

    return () => {
      document.removeEventListener("change", onFileChangeCapture, true);
      observer.disconnect();
      authListener?.subscription?.unsubscribe();
      window.clearInterval(cacheTimer);
      signedUrlCache.clear();
    };
  }, []);

  return null;
}
