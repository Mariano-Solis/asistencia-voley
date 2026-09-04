import { useEffect, useRef, useState } from "react";

export default function PhotoSourcePicker() {
  const [targetInput, setTargetInput] = useState(null);
  const [open, setOpen] = useState(false);
  const previousActive = useRef(null);

  useEffect(() => {
    const onClickCapture = (event) => {
      const button = event.target?.closest?.(".file-button");
      if (!button) return;

      const field = button.closest(".selfie-field") || button.parentElement;
      const input = field?.querySelector?.('input[type="file"][accept*="image"]');
      if (!input) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

      previousActive.current = document.activeElement;
      setTargetInput(input);
      setOpen(true);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => document.removeEventListener("click", onClickCapture, true);
  }, []);

  function close() {
    setOpen(false);
    setTargetInput(null);
    requestAnimationFrame(() => previousActive.current?.focus?.());
  }

  function chooseCamera() {
    if (!targetInput) return;
    targetInput.setAttribute("accept", "image/*");
    targetInput.setAttribute("capture", "user");
    setOpen(false);
    requestAnimationFrame(() => {
      targetInput.click();
      setTargetInput(null);
    });
  }

  function chooseGallery() {
    if (!targetInput) return;
    targetInput.setAttribute("accept", "image/*");
    targetInput.removeAttribute("capture");
    setOpen(false);
    requestAnimationFrame(() => {
      targetInput.click();
      setTargetInput(null);
    });
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir origen de la foto"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "rgba(0,0,0,.62)",
      }}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          background: "#fff",
          borderRadius: 18,
          padding: 22,
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <h2 style={{ margin: 0, color: "#111", fontSize: 22 }}>Foto / Selfie</h2>
          <button type="button" onClick={close} aria-label="Cerrar" style={{ border: 0, background: "none", fontSize: 28, cursor: "pointer" }}>×</button>
        </div>

        <p style={{ margin: "0 0 18px", color: "#555", lineHeight: 1.5 }}>
          Elegí cómo querés cargar tu foto.
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            onClick={chooseCamera}
            style={{ border: 0, borderRadius: 12, padding: "14px 16px", background: "#b5121b", color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}
          >
            📷 Abrir cámara
          </button>
          <button
            type="button"
            onClick={chooseGallery}
            style={{ border: "1px solid #d7d7d7", borderRadius: 12, padding: "14px 16px", background: "#fff", color: "#111", fontWeight: 800, fontSize: 16, cursor: "pointer" }}
          >
            🖼️ Elegir de galería
          </button>
        </div>
      </section>
    </div>
  );
}
