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

    const enforceVisibility = (input) => {
      if (!input?.isConnected || input.dataset.passwordVisibilityManaged !== "true") return;
      const shouldShow = input.dataset.passwordVisible === "true";
      const expectedType = shouldShow ? "text" : "password";
      if (input.type !== expectedType) input.type = expectedType;
    };

    const buildToggle = (input) => {
      if (!isVisible(input)) return;
      input.dataset.passwordVisibilityManaged = "true";
      if (!input.dataset.passwordVisible) input.dataset.passwordVisible = "false";
      enforceVisibility(input);

      const next = input.nextElementSibling;
      if (next?.classList?.contains("password-visibility-toggle")) {
        const checkbox = next.querySelector('input[type="checkbox"]');
        const text = next.querySelector("span");
        const shown = input.dataset.passwordVisible === "true";
        if (checkbox) checkbox.checked = shown;
        if (text) text.textContent = shown ? "Ocultar contraseña" : "Mostrar contraseña";
        return;
      }

      const label = document.createElement("label");
      label.className = "password-visibility-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = input.dataset.passwordVisible === "true";

      const text = document.createElement("span");
      const syncLabel = () => {
        const shown = input.dataset.passwordVisible === "true";
        checkbox.checked = shown;
        checkbox.setAttribute("aria-label", shown ? "Ocultar contraseña" : "Mostrar contraseña");
        text.textContent = shown ? "Ocultar contraseña" : "Mostrar contraseña";
      };

      checkbox.addEventListener("change", () => {
        input.dataset.passwordVisible = checkbox.checked ? "true" : "false";
        enforceVisibility(input);
        syncLabel();
        input.focus({ preventScroll: true });
      });

      syncLabel();
      label.append(checkbox, text);
      input.insertAdjacentElement("afterend", label);
    };

    const rebuildPasswordToggles = () => {
      scheduled = false;
      document.querySelectorAll(".password-visibility-toggle").forEach((toggle) => {
        const previous = toggle.previousElementSibling;
        if (!previous?.matches?.('input[type="password"], input[data-password-visibility-managed="true"]') || !isVisible(previous)) toggle.remove();
      });

      Array.from(document.querySelectorAll('input[type="password"], input[data-password-visibility-managed="true"]'))
        .filter(isVisible)
        .forEach(buildToggle);
    };

    const scheduleRebuild = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(rebuildPasswordToggles);
    };

    const keepVisibleWhileTyping = (event) => {
      const input = event.target;
      if (!input?.matches?.('input[data-password-visibility-managed="true"]')) return;
      if (input.dataset.passwordVisible === "true") {
        queueMicrotask(() => enforceVisibility(input));
        requestAnimationFrame(() => enforceVisibility(input));
      }
    };

    document.addEventListener("input", keepVisibleWhileTyping, true);
    document.addEventListener("keyup", keepVisibleWhileTyping, true);

    observer = new MutationObserver((mutations) => {
      let needsRebuild = false;
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "type") {
          enforceVisibility(mutation.target);
        } else if (mutation.type === "childList") {
          needsRebuild = true;
        }
      }
      if (needsRebuild) scheduleRebuild();
    });

    rebuildPasswordToggles();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });

    return () => {
      observer.disconnect();
      document.removeEventListener("input", keepVisibleWhileTyping, true);
      document.removeEventListener("keyup", keepVisibleWhileTyping, true);
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
