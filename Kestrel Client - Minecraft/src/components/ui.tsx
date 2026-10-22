import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useApp } from "../lib/store";

/** Closes on outside click or Escape. */
export function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open, close, ref]);
}

type SegItem<T extends string> = { value: T; label: string; icon?: React.ReactNode };
export function Seg<T extends string>({ items, value, onChange, onSurface, label }: { items: SegItem<T>[]; value: T; onChange: (v: T) => void; onSurface?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("button.on");
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, items.length]);
  return (
    <div className={"seg" + (onSurface ? " on-surface" : "")} ref={ref} role="tablist" aria-label={label}>
      <span className="pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={it.value === value} className={it.value === value ? "on" : ""} onClick={() => onChange(it.value)}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button className="toggle" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Select<T extends string>({ value, options, onChange, label, width = 180, render }: {
  value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; label: string; width?: number; render?: (v: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const cur = options.find((o) => o.value === value);
  return (
    <div className="select" ref={ref} style={{ width }}>
      <button aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)}>
        <span>{render ? render(value) : cur?.label ?? value}</span><ChevronDown size={16} />
      </button>
      {open && (
        <div className="menu" role="listbox" style={{ top: 42, right: 0, minWidth: width }}>
          {options.map((o) => (
            <button key={o.value} role="option" aria-selected={o.value === value} className={"mi" + (o.value === value ? " active" : "")} onClick={() => { onChange(o.value); setOpen(false); }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span>{o.label}</span>{o.hint && <span className="t-cap" style={{ fontWeight: 400 }}>{o.hint}</span>}</span>
              {o.value === value && <Check size={14} className="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Row({ title, detail, children }: { title: React.ReactNode; detail?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="row">
      <div className="tx"><b>{title}</b>{detail && <span>{detail}</span>}</div>
      {children}
    </div>
  );
}

export function Group({ title, children, style }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="group" style={style}>
      {title && <span className="gt">{title}</span>}
      <div className="rows">{children}</div>
    </div>
  );
}

export function DialogHost() {
  const app = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!app.dialog) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeDialog();
      if (e.key !== "Tab" || !ref.current) return;
      const els = ref.current.querySelectorAll<HTMLElement>("button:not(:disabled),input,textarea,select,[tabindex='0']");
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [app.dialog]);
  if (!app.dialog) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && app.closeDialog()}>
      <section className={"dialog" + (app.dialog.wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={app.dialog.title} tabIndex={-1} ref={ref}>
        <div className="dh">
          <div><h2 className="t-title">{app.dialog.title}</h2></div>
          <button className="ibtn sm" aria-label="Close" onClick={app.closeDialog}><X size={16} /></button>
        </div>
        {app.dialog.body}
      </section>
    </div>
  );
}

export function ToastHost() {
  const { toast } = useApp();
  if (!toast) return null;
  return <div className={"toast" + (toast.tone === "error" ? " error" : "")} role="status" key={toast.id}><span className="dot" />{toast.text}</div>;
}

export function confirmDialog(app: ReturnType<typeof useApp>, opts: { title: string; text: string; confirm: string; danger?: boolean; onConfirm: () => void | Promise<void> }) {
  app.openDialog({
    title: opts.title,
    body: (
      <>
        <p className="muted" style={{ lineHeight: "20px" }}>{opts.text}</p>
        <div className="actions">
          <button className="btn ghost" onClick={app.closeDialog}>Cancel</button>
          <button className={"btn " + (opts.danger ? "danger" : "green")} onClick={async () => { app.closeDialog(); await opts.onConfirm(); }}>{opts.confirm}</button>
        </div>
      </>
    ),
  });
}
