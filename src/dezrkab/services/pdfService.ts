// @ts-nocheck
/**
 * ساخت فایل PDF واقعی — نه window.print()
 *
 * روش: گزارش موجود (PrintReport — همان موتور گزارش و همان چیدمان A4/RTL)
 * خارج از صفحه رندر می‌شود، مرورگر خودش حروف فارسی/اعداد جلالی را شکل می‌دهد،
 * سپس html2canvas-pro تصویر صفحه‌ها را می‌گیرد و jsPDF آن‌ها را به یک PDF
 * چندصفحه‌ای A4 تبدیل می‌کند.
 *
 * اعتبارسنجی: فایل نهایی باید غیرخالی باشد و با امضای %PDF شروع شود؛
 * در غیر این صورت خطای فارسی پرتاب می‌شود و هرگز «موفق» اعلام نمی‌شود.
 *
 * کتابخانه‌ها به‌صورت lazy بارگذاری می‌شوند تا باندل اولیه سبک بماند.
 */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { DB } from "../domain/models";
import { jalaliStamp } from "../utils/format";
import type { Analytics } from "./reportService";
import type { ReportType } from "./exportService";

const A4_W_MM = 210;
const A4_H_MM = 297;
/** عرض گزارش روی صفحه — معادل A4 در ۹۶dpi */
const RENDER_WIDTH_PX = 794;

export async function generateReportPDF(
  db: DB,
  a: Analytics,
  type: ReportType
): Promise<{ blob: Blob; name: string }> {
  const [{ jsPDF }, { default: html2canvas }, { default: PrintReport }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
    import("../ui/PrintReport"),
  ]);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = `${RENDER_WIDTH_PX}px`;
  host.style.background = "#ffffff";
  host.style.zIndex = "-10";
  document.body.appendChild(host);

  const root = createRoot(host);
  root.render(createElement(PrintReport, { type, a, db }));

  /* صبر برای commit ری‌اکت + آماده‌شدن فونت‌های وزیرمتن/لاله‌زار */
  try {
    await document.fonts.ready;
  } catch {
    /* بدون فونت‌ها هم ادامه می‌دهیم — فونت جایگزین سیستم */
  }
  await new Promise((r) => window.setTimeout(r, 400));

  let blob: Blob;
  try {
    const target = (host.firstElementChild as HTMLElement | null) ?? host;

    /* حیاتی برای درستی متن فارسی:
       موتور تصویربرداری، عرضِ letter-spacing را در چیدمانِ راست‌چین درست
       محاسبه نمی‌کند و حروف/ارقام روی هم می‌افتند («تهیه‌شده» → «ت ی‌شده»).
       پیش از عکس‌برداری، فاصله‌گذاری حروف روی همهٔ عناصر خنثی می‌شود. */
    const all = [target, ...Array.from(target.querySelectorAll<HTMLElement>("*"))];
    for (const el of all) {
      el.style.letterSpacing = "normal";
      el.style.wordSpacing = "normal";
      el.style.textRendering = "geometricPrecision";
    }
    /* نقاط برش امن — هیچ سطر جدول یا کارتی نصف نمی‌شود */
    const baseTop = target.getBoundingClientRect().top;
    const breakPoints = new Set<number>([0]);
    target
      .querySelectorAll<HTMLElement>("tr, section, header, footer, .keep-together > div, .report-break, p")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.height > 0) breakPoints.add(Math.round(r.bottom - baseTop));
      });
    const cuts = Array.from(breakPoints).sort((x, y) => x - y);

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
    });

    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error("رندر گزارش برای PDF ناموفق بود");
    }

    /* نسبت تبدیل مختصات CSS به پیکسل بوم */
    const ratio = canvas.width / target.getBoundingClientRect().width;
    const pageHpx = Math.round(canvas.width * (A4_H_MM / A4_W_MM));

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });

    let y = 0;
    let pageIndex = 0;
    while (y < canvas.height) {
      const maxEnd = Math.min(y + pageHpx, canvas.height);
      let end = maxEnd;
      if (maxEnd < canvas.height) {
        /* آخرین مرزِ امنِ داخل صفحه؛ اگر عنصری بلندتر از یک صفحه بود، برش سخت */
        let best = 0;
        for (const c of cuts) {
          const cy = Math.round(c * ratio);
          if (cy > y + pageHpx * 0.35 && cy <= maxEnd) best = cy;
          if (cy > maxEnd) break;
        }
        if (best > y) end = best;
      }
      const sliceH = Math.max(1, end - y);

      const page = document.createElement("canvas");
      page.width = canvas.width;
      page.height = sliceH;
      const ctx = page.getContext("2d");
      if (!ctx) throw new Error("ساخت PDF ناموفق بود — بوم در دسترس نیست");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      const img = page.toDataURL("image/jpeg", 0.95);
      if (pageIndex > 0) doc.addPage();
      doc.addImage(img, "JPEG", 0, 0, A4_W_MM, (sliceH / canvas.width) * A4_W_MM);
      pageIndex++;
      y = end;
    }

    blob = doc.output("blob");
  } finally {
    root.unmount();
    host.remove();
  }

  /* اعتبارسنجی واقعی: اندازه + امضای PDF */
  if (!blob || blob.size === 0) {
    throw new Error("ساخت فایل PDF انجام نشد — خروجی خالی است");
  }
  const head = await blob.slice(0, 5).text();
  if (!head.startsWith("%PDF")) {
    throw new Error("ساخت فایل PDF انجام نشد — قالب فایل نامعتبر است");
  }

  return { blob, name: `pedal-report-${jalaliStamp(Date.now())}.pdf` };
}
