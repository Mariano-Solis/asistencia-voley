import { useEffect, useState } from "react";

export default function UXEnhancements() {
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    let observer;
    let scheduled = false;

    const isVisible = (element) => {
      if (!element?.isConnected) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    };

    const rebuildPasswordToggles = () => {
      scheduled = false;
      observer?.disconnect();

      document.querySelectorAll(".password-visibility-toggle").forEach((toggle) => toggle.remove());

      const inputs = Array.from(
        document.querySelectorAll('input[type="password"], input[data-password-visibility-managed="true"]')
      ).filter(isVisible);

      inputs.forEach((input) => {
        input.dataset.passwordVisibilityManaged = "true";

        const label = document.createElement("label");
        label.className = "password-visibility-toggle";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = input.type === "text";
        checkbox.setAttribute("aria-label", checkbox.checked ? "Ocultar contraseña" : "Mostrar contraseña");

        const text = document.createElement("span");
        text.textContent = checkbox.checked ? "Ocultar contraseña" : "Mostrar contraseña";

        checkbox.addEventListener("change", () => {
          input.type = checkbox.checked ? "text" : "password";
          checkbox.setAttribute("aria-label", checkbox.checked ? "Ocultar contraseña" : "Mostrar contraseña");
          text.textContent = checkbox.checked ? "Ocultar contraseña" : "Mostrar contraseña";
        });

        label.append(checkbox, text);
        input.insertAdjacentElement("afterend", label);
      });

      observer?.observe(document.body, { childList: true, subtree: true });
    };

    const scheduleRebuild = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(rebuildPasswordToggles);
    };

    observer = new MutationObserver(scheduleRebuild);
    rebuildPasswordToggles();

    return () => {
      observer?.disconnect();
      document.querySelectorAll(".password-visibility-toggle").forEach((toggle) => toggle.remove());
    };
  }, []);

  useEffect(() => {
    const openPhoto = (event) => {
      const image = event.target?.closest?.("img.avatar.photo");
      if (!image) return;
      event.preventDefault();
      setPhoto({ src: image.currentSrc || image.src, alt: image.alt || "Foto de perfil" });
    };

    document.addEventListener("click", openPhoto, true);
    return () => document.removeEventListener("click", openPhoto, true);
  }, []);

  useEffect(() => {
    if (!photo) return;
    const onKey = (event) => {
      if (event.key === "Escape") setPhoto(null);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [photo]);

  if (!photo) return null;

  return (
    <div className="profile-photo-viewer" role="dialog" aria-modal="true" aria-label="Foto de perfil ampliada" onClick={() => setPhoto(null)}>
      <div className="profile-photo-viewer-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="profile-photo-viewer-close" aria-label="Cerrar foto" onClick={() => setPhoto(null)}>×</button>
        <img src={photo.src} alt={photo.alt} />
        <div className="profile-photo-viewer-caption">Foto de perfil</div>
      </div>
    </div>
  );
}
