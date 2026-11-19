import { useEffect, useRef } from 'react';

export default function Dialog({ title, children, onClose, className = '', visible = true }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (visible && !element.open) element.showModal();
    if (!visible && element.open) element.close();
    document.body.style.overflow = visible ? 'hidden' : previousOverflow;
    return () => {
      if (element.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (visible) previousFocus?.focus();
    };
  }, [visible]);
  return <dialog ref={dialog} className={`soft-dialog ${className}`} data-lenis-prevent aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-content" data-lenis-prevent><div className="dialog-top">{title ? <span>{title}</span> : <span>Bungkok</span>}<button className="dialog-close" onClick={onClose} aria-label="Tutup dialog">×</button></div>{children}</div>
  </dialog>;
}
