import { useEffect, useState } from "react";

export default function UXEnhancements() {
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    const enhancePasswords = () => {
      document.querySelectorAll('input[type="password"], input[data-password-visibility="managed"]').forEach((input) => {
        if (input.dataset.passwordVisibility === "managed") return;
        input.dataset.passwordVisibility = "managed";

        const label = document.createElement("label");
        label.className = "password-visibility-toggle";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.setAttribute("aria-label", "Mostrar contraseña");

        const text = document.createElement("span");
        text.textContent = "Mostrar contraseña";

        checkbox.addEventListener("change", () => {
          input.type = checkbox.checked ? "text" : "password";
          text.textContent = checkbox.checked ? "Ocultar contraseña" : "Mostrar contraseña";
        });

        label.append(checkbox, text);
        input.insertAdjacentElement("afterend", label);
      });
    };

    enhancePasswords();
    const observer = new MutationObserver(enhancePasswords);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
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
