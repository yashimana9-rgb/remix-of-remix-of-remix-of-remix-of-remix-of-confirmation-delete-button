// @ts-nocheck
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { IconAlert, IconCheck, IconMinus, IconPlus, IconX } from "./icons";

/* --------------------------------- دکمه --------------------------------- */

type BtnVariant = "primary" | "dark" | "ghost" | "danger" | "ok" | "outline";

const btnStyles: Record<BtnVariant, string> = {
  primary:
    "bg-brand text-white hover:bg-branddeep shadow-[0_4px_14px_rgba(29,98,214,0.35)]",
  dark: "bg-coal text-white hover:bg-coal3",
  ghost: "bg-transparent text-inksoft hover:bg-black/5",
  danger: "bg-danger text-white hover:bg-[#b91c1c] shadow-[0_4px_14px_rgba(220,38,38,0.25)]",
  ok: "bg-ok text-white hover:bg-[#1b8559] shadow-[0_4px_14px_rgba(34,160,107,0.25)]",
  outline: "bg-white text-ink border border-linedeep hover:border-brand hover:text-brand",
};

export const Btn = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: "sm" | "md" | "lg";
  }
>(function Btn({ variant = "primary", size = "md", className = "", children, ...rest }, ref) {
  const sz =
    size === "sm"
      ? "text-xs px-3 py-1.5 rounded-lg gap-1"
      : size === "lg"
        ? "text-base px-6 py-3 rounded-xl gap-2"
        : "text-sm px-4 py-2 rounded-lg gap-1.5";
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none cursor-pointer ${btnStyles[variant]} ${sz} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});

/* --------------------------------- نشان --------------------------------- */

type Tone = "ok" | "warn" | "danger" | "neutral" | "brand" | "coal";

const tones: Record<Tone, string> = {
  ok: "bg-oksoft text-ok",
  warn: "bg-warnsoft text-[#b45309]",
  danger: "bg-dangersoft text-danger",
  neutral: "bg-black/5 text-inksoft",
  brand: "bg-brandsoft text-branddeep",
  coal: "bg-coal text-white",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------- مودال --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-coal/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={`anim-pop relative card w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto shadow-[var(--shadow-pop)]`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-5 py-3.5">
          <h3 className="font-display text-lg text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-inksoft transition-colors hover:bg-black/5 hover:text-ink"
            aria-label="بستن"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- شمارنده تعداد ------------------------------ */

export function Stepper({
  value,
  onChange,
  max,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="grid size-8 cursor-pointer place-items-center rounded-lg border border-linedeep text-inksoft transition-all hover:border-danger hover:text-danger disabled:opacity-30 disabled:pointer-events-none"
        aria-label="کاهش"
      >
        <IconMinus size={15} />
      </button>
      <span className="num w-10 text-center font-display text-xl text-ink">
        {value > 0 ? new Intl.NumberFormat("fa-IR").format(value) : "—"}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="grid size-8 cursor-pointer place-items-center rounded-lg border border-linedeep text-inksoft transition-all hover:border-brand hover:text-brand disabled:opacity-30 disabled:pointer-events-none"
        aria-label="افزایش"
      >
        <IconPlus size={15} />
      </button>
    </div>
  );
}

/* ------------------------------ وضعیت خالی ------------------------------ */

export function Empty({
  icon,
  text,
  sub,
}: {
  icon: ReactNode;
  text: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-black/[0.04] text-inkmute">
        {icon}
      </div>
      <p className="text-sm font-semibold text-inksoft">{text}</p>
      {sub ? <p className="text-xs text-inkmute">{sub}</p> : null}
    </div>
  );
}

/* --------------------------------- توست --------------------------------- */

type ToastKind = "ok" | "err" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

const ToastCtx = createContext<{ push: (kind: ToastKind, msg: string) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);

  const push = useCallback((kind: ToastKind, msg: string) => {
    const id = idRef.current++;
    setItems((prev) => [...prev.slice(-3), { id, kind, msg }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(92vw,360px)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`anim-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-[var(--shadow-pop)] ${
              t.kind === "ok"
                ? "border-ok/30 bg-[#f0faf5] text-[#155e41]"
                : t.kind === "err"
                  ? "border-danger/30 bg-[#fdf1f1] text-[#8f1d1d]"
                  : "border-line bg-card text-ink"
            }`}
          >
            <span
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white ${
                t.kind === "ok" ? "bg-ok" : t.kind === "err" ? "bg-danger" : "bg-coal"
              }`}
            >
              {t.kind === "err" ? <IconAlert size={12} /> : <IconCheck size={12} />}
            </span>
            <span className="leading-6">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------- خط‌دار/جدا ------------------------------- */

export function KV({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-inksoft">{k}</span>
      <span className={`num ${strong ? "font-extrabold text-ink" : "font-semibold text-ink"}`}>{v}</span>
    </div>
  );
}
