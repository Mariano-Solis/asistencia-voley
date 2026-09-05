import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ProfessorDetailGuard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => {
      const modal = document.querySelector(".professor-detail-modal");
      setVisible(!!modal);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;

  const goBack = () => {
    const back = document.querySelector(".professor-detail-back");
    if (back) {
      back.click();
      return;
    }
    const close = document.querySelector(".professor-detail-close");
    close?.click();
  };

  return createPortal(
    <button type="button" className="professor-detail-guard-back" onClick={goBack}>
      ← Volver a Profes
    </button>,
    document.body,
  );
}
