// @ts-nocheck
/**
 * مرکز دانلود — تنها مکان تحویل فایل در کل سامانه
 *
 * چرا این کامپوننت وجود دارد: در محیط‌های پیش‌نمایش/iframe ممکن است مرورگر
 * دانلودِ برنامه‌نویسی‌شده (anchor.click روی لینک مخفی) را بی‌صدا مسدود کند.
 * بنابراین هیچ‌جا ادعای «دانلود شد» نمی‌کنیم؛ فایل ساخته و اعتبارسنجی می‌شود،
 * سپس همین‌جا یک لینک دانلودِ آشکار و قابل کلیک ارائه می‌شود.
 *
 * چرخه object URL: تا زمانی که پنجره باز است زنده می‌ماند؛ هنگام بستن آزاد می‌شود.
 * (نه ۵۰۰ میلی‌ثانیه بعد — پشتیبان‌های چند مگابایتی روی دستگاه کند قطع نمی‌شوند)
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { faNum } from "../utils/format";
import { Btn } from "./kit";
import { IconCheck, IconDownload, IconFileText, IconX } from "./icons";

export type DownloadKind = "json" | "backup" | "pdf";

export interface DownloadOffer {
  blob: Blob;
  filename: string;
  kind: DownloadKind;
  title: string;
  note?: string;
}

interface DownloadCtxType {
  offer: (payload: DownloadOffer) => void;
}

const DownloadCtx = createContext<DownloadCtxType>({ offer: () => {} });

export function useDownloadCenter(): DownloadCtxType {
  return useContext(DownloadCtx);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${faNum(n)} بایت`;
  if (n < 1024 * 1024) return `${faNum(n / 1024)} کیلوبایت`;
  return `${faNum(Math.round((n / (1024 * 1024)) * 10) / 10)} مگابایت`;
}

const KIND_META: Record<DownloadKind, { label: string; accent: string }> = {
  json: { label: "فایل JSON", accent: "bg-oksoft text-ok" },
  backup: { label: "فایل پشتیبان", accent: "bg-brandsoft text-branddeep" },
  pdf: { label: "فایل PDF", accent: "bg-dangersoft text-danger" },
};

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<(DownloadOffer & { url: string }) | null>(null);
  const [clicked, setClicked] = useState(false);
  const [autoBlocked, setAutoBlocked] = useState(false);
  const autoTried = useRef(false);
  const urlRef = useRef<string | null>(null);

  const close = useCallback(() => {
    setCurrent((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    urlRef.current = null;
    setClicked(false);
    setAutoBlocked(false);
    autoTried.current = false;
  }, []);

  const offer = useCallback((payload: DownloadOffer) => {
    if (payload.blob.size === 0) {
      throw new Error("ساخت فایل انجام نشد — خروجی خالی است");
    }
    setCurrent((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      const url = URL.createObjectURL(payload.blob);
      urlRef.current = url;
      return { ...payload, url };
    });
    setClicked(false);
    setAutoBlocked(false);
    autoTried.current = false;
  }, []);

  /* تلاش خودکارِ یک‌بار — اگر مرورگر اجازه ندهد، لینک آشکار باقی می‌ماند */
  const tryAutoDownload = useCallback(() => {
    if (!current || autoTried.current) return;
    autoTried.current = true;
    const urlNow = current.url;
    try {
      const a = document.createElement("a");
      a.href = current.url;
      a.download = current.filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* راه مطمئنی برای تشخیص مسدودشدن نیست — اگر کاربر تا چند ثانیه کلیک نکند، راهنمایی می‌شود */
      window.setTimeout(() => {
        if (urlRef.current === urlNow) setAutoBlocked(true);
      }, 2500);
    } catch {
      setAutoBlocked(true);
    }
  }, [current]);

  /* بعد از نمایش پنجره، یک تلاش خودکار (در مرورگرهای مجاز) */
  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(tryAutoDownload, 600);
    return () => window.clearTimeout(t);
  }, [current, tryAutoDownload]);

  const value = useMemo(() => ({ offer }), [offer]);
  const meta = current ? KIND_META[current.kind] : null;

  return (
    <DownloadCtx.Provider value={value}>
      {children}

      {current && meta && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-coal/55 backdrop-blur-[2px]"
            onClick={close}
          />
          <div className="anim-pop relative w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow-pop)]">
            {/* سربرگ رنگی بر اساس نوع فایل */}
            <div className="flex items-center justify-between border-b border-line bg-black/[0.025] px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className={`grid size-10 place-items-center rounded-xl ${meta.accent}`}>
                  <IconFileText size={20} />
                </span>
                <div>
                  <h3 className="font-display text-lg leading-6 text-ink">{current.title}</h3>
                  <p className="text-[11px] font-bold text-inkmute">{meta.label}</p>
                </div>
              </div>
              <button
                onClick={close}
                className="cursor-pointer rounded-lg p-1.5 text-inksoft transition-colors hover:bg-black/5 hover:text-ink"
                aria-label="بستن"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className="space-y-3.5 p-5">
              {/* مشخصات فایل */}
              <div className="rounded-xl border border-dashed border-linedeep bg-black/[0.02] px-3.5 py-3">
                <p className="num truncate text-sm font-extrabold text-ink" dir="ltr" style={{ textAlign: "left" }}>
                  {current.filename}
                </p>
                <p className="num mt-1 text-[11px] font-bold text-inksoft">
                  اندازه: {fmtBytes(current.blob.size)} — ساخته‌شده همین حالا
                </p>
              </div>

              {current.note && (
                <p className="text-[11px] leading-5 text-inksoft">{current.note}</p>
              )}

              {/* وضعیت تحویل — فقط واقعیت */}
              {clicked ? (
                <div className="anim-pop flex items-start gap-2 rounded-xl border border-ok/30 bg-oksoft px-3.5 py-2.5 text-[11px] font-bold leading-5 text-[#155e41]">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ok text-white">
                    <IconCheck size={12} />
                  </span>
                  عملیات دانلود انجام شد — پوشهٔ دانلود مرورگر را بررسی کنید. اگر فایلی نیامد، دوباره روی دکمه دانلود کلیک کنید.
                </div>
              ) : autoBlocked ? (
                <div className="anim-pop rounded-xl border border-warn/40 bg-warnsoft px-3.5 py-2.5 text-[11px] font-bold leading-5 text-[#b45309]">
                  فایل آماده است، اما دانلود خودکار توسط مرورگر مسدود شد. برای دریافت فایل، روی دکمهٔ دانلود زیر کلیک کنید.
                </div>
              ) : (
                <p className="rounded-xl bg-black/[0.03] px-3.5 py-2.5 text-[11px] font-bold leading-5 text-inksoft">
                  فایل آماده است — برای دریافت، روی دکمهٔ دانلود کلیک کنید.
                </p>
              )}

              {/* اقدام اصلی: لینک واقعی و قابل کلیک */}
              <a
                href={current.url}
                download={current.filename}
                onClick={() => setClicked(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-display text-lg text-white shadow-[0_4px_14px_rgba(29,98,214,0.35)] transition-all duration-150 hover:bg-branddeep active:scale-[0.98]"
              >
                <IconDownload size={19} />
                دانلود {meta.label}
              </a>

              <div className="flex gap-2">
                {current.kind === "pdf" && (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setClicked(true)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-linedeep px-3 py-2 text-xs font-extrabold text-inksoft transition-colors hover:border-brand hover:text-branddeep"
                  >
                    باز کردن فایل
                  </a>
                )}
                <Btn variant="ghost" size="sm" className="flex-1" onClick={close}>
                  بستن
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </DownloadCtx.Provider>
  );
}
