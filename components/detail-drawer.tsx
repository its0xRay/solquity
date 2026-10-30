"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function DetailDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);
  return <dialog ref={dialog} className="detail-drawer" aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="detail-drawer-inner"><header className="drawer-heading"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Close details" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>{open ? children : null}</div>
  </dialog>;
}
