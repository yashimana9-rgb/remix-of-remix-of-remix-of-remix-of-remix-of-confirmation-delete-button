// @ts-nocheck
/**
 * آمار و گزارش — مخصوص مدیر
 * همه اعداد از reportService می‌آیند؛ PDF و JSON هم از همین محاسبات خروجی می‌گیرند
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { reportService, lastMonthRange, thisMonthRange, thisWeekRange, todayRange, yesterdayRange } from "../services/reportService";
import type { Analytics } from "../services/reportService";
import { buildAIJSONBlob, REPORT_TYPE_LABEL } from "../services/exportService";
import type { ReportType } from "../services/exportService";
import { generateReportPDF } from "../services/pdfService";
import { useDB } from "../storage/storage";
import { accountKindLabel, faNum, jalaliDate, money, startOfDay, validateCustomRange, type RangeValidation } from "../utils/format";
import { Badge, Btn, Modal, useToast } from "../ui/kit";
import JalaliDateInput from "../ui/JalaliDateInput";
import { useDownloadCenter } from "../ui/DownloadCenter";
import {
  IconAlert,
  IconBike,
  IconCash,
  IconChart,
  IconClock,
  IconDownload,
  IconFileText,
  IconGift,
  IconPrint,
  IconTimer,
  IconUsers,
  IconWallet,
  IconWrench,
} from "../ui/icons";

type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "custom";
type DetailTab =
  | "daily"
  | "hourly"
  | "weekday"
  | "duration"
  | "categories"
  | "customers"
  | "payments"
  | "discount"
  | "maintenance";



export default function Reports() {
  const db = useDB();
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>("today");
  /* بازه دلخواه — مهر زمانی جلالی؛ هیچ رشته میلادی‌ای در کار نیست */
  const [fromTs, setFromTs] = useState<number | null>(() => startOfDay(Date.now()) - 6 * 86_400_000);
  const [toTs, setToTs] = useState<number | null>(() => startOfDay(Date.now()));
  const [detail, setDetail] = useState<DetailTab>("daily");
  const [pdfPicker, setPdfPicker] = useState(false);
  const [pdfType, setPdfType] = useState<ReportType>("full");
  const [pdfBusy, setPdfBusy] = useState(false);
  const dl = useDownloadCenter();

  /* بازه دلخواه نامعتبر هرگز بی‌صدا با «امروز» جایگزین نمی‌شود — گزارش تولید نمی‌شود */
  const range = useMemo((): RangeValidation => {
    if (preset === "custom") return validateCustomRange(fromTs, toTs);
    const [s, e] =
      preset === "today"
        ? todayRange()
        : preset === "yesterday"
          ? yesterdayRange()
          : preset === "week"
            ? thisWeekRange()
            : preset === "month"
              ? thisMonthRange()
              : lastMonthRange();
    return { ok: true, start: s, end: e, reason: "", field: null };
  }, [preset, fromTs, toTs]);

  const start = range.start;
  const end = range.end;

  const a = useMemo(
    () => (range.ok ? reportService.buildAnalytics(db, range.start, range.end) : null),
    [db, range]
  );

  /* ساخت JSON + اعتبارسنجی؛ تحویل با مرکز دانلود — هیچ «دانلود شد»ِ بی‌اساسی اعلام نمی‌شود */
  const doJSON = () => {
    if (!range.ok) {
      toast.push("err", "بازه تاریخ نامعتبر است.");
      return;
    }
    try {
      const { blob, name } = buildAIJSONBlob(db, range.start, range.end);
      dl.offer({
        blob,
        filename: name,
        kind: "json",
        title: "فایل JSON آماده است",
        note: "خروجی تحلیل برای هوش مصنوعی — با همان موتور گزارش صفحه ساخته و اعتبارسنجی شده است.",
      });
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ساخت فایل انجام نشد.");
    }
  };

  /* ساخت PDF واقعی (چندصفحه‌ای A4) از همان موتور گزارش */
  const doPDF = async () => {
    if (!range.ok || !a) {
      toast.push("err", "بازه تاریخ نامعتبر است.");
      return;
    }
    setPdfBusy(true);
    try {
      const { blob, name } = await generateReportPDF(db, a, pdfType);
      setPdfPicker(false);
      dl.offer({
        blob,
        filename: name,
        kind: "pdf",
        title: "فایل PDF آماده است",
        note: `${REPORT_TYPE_LABEL[pdfType]} — بازه ${jalaliDate(range.start)} تا ${jalaliDate(range.end - 1)}. برای دریافت روی دکمه دانلود کلیک کنید.`,
      });
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ساخت فایل PDF انجام نشد.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* نوار بازه + خروجی‌ها */}
      <div className="anim-up card flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex rounded-xl border border-linedeep p-0.5">
          {(
            [
              ["today", "امروز"],
              ["yesterday", "دیروز"],
              ["week", "این هفته"],
              ["month", "این ماه"],
              ["lastMonth", "ماه قبل"],
              ["custom", "بازه دلخواه"],
            ] as Array<[Preset, string]>
          ).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                preset === p ? "bg-coal text-white" : "text-inksoft hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="anim-pop flex items-center gap-2">
            <JalaliDateInput
              value={fromTs}
              onChange={setFromTs}
              invalid={range.field === "from"}
            />
            <span className="text-xs text-inkmute">تا</span>
            <JalaliDateInput
              value={toTs}
              onChange={setToTs}
              invalid={range.field === "to"}
            />
          </div>
        )}
        {range.ok ? (
          <span className="num text-[11px] font-bold text-inkmute">
            {jalaliDate(start)} تا {jalaliDate(end - 1)}
          </span>
        ) : (
          <span className="text-[11px] font-extrabold text-danger">بازه نامعتبر</span>
        )}
        <div className="ms-auto flex gap-2">
          <Btn variant="dark" size="sm" onClick={() => setPdfPicker(true)} disabled={!range.ok}>
            <IconPrint size={14} />
            خروجی PDF
          </Btn>
          <Btn size="sm" onClick={doJSON} disabled={!range.ok}>
            <IconFileText size={14} />
            خروجی JSON برای هوش مصنوعی
          </Btn>
        </div>
      </div>

      {!range.ok || !a ? (
        <div className="anim-pop card flex items-center gap-3 border-danger/40 bg-dangersoft/60 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger text-white">
            <IconAlert size={20} />
          </span>
          <div>
            <p className="font-display text-lg leading-6 text-danger">بازه تاریخ نامعتبر است.</p>
            <p className="mt-0.5 text-xs font-bold text-inksoft">
              {range.reason} تا اصلاح بازه، گزارشی تولید نمی‌شود.
            </p>
          </div>
        </div>
      ) : (
        <>

      {/* خلاصه مدیریتی */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <Tile label="درآمد" value={money(a.summary.revenue)} tone="text-ok" delay={0} />
        <Tile label="تعداد اجاره" value={faNum(a.summary.rentalCount)} tone="text-branddeep" delay={40} />
        <Tile label="میانگین اجاره" value={a.summary.avgRental !== null ? money(a.summary.avgRental) : "—"} tone="text-ink" delay={80} />
        <Tile label="مشتریان فعال" value={faNum(a.summary.activeCustomers)} tone="text-ink" delay={120} />
        <Tile label="نرخ مشتری تکراری" value={a.summary.repeatRate !== null ? `${faNum(a.summary.repeatRate)}٪` : "—"} tone="text-ink" delay={160} />
        <Tile label="دسته محبوب" value={a.summary.topCategory ?? "—"} tone="text-ink" delay={200} small />
        <Tile label="شلوغ‌ترین ساعت" value={a.summary.busiestHour !== null ? `${faNum(a.summary.busiestHour)}:۰۰` : "—"} tone="text-ink" delay={240} />
        <Tile label="شلوغ‌ترین روز" value={a.summary.busiestWeekday ?? "—"} tone="text-ink" delay={280} />
        <Tile label="تخفیف‌ها" value={money(a.summary.discounts)} tone="text-warn" delay={320} />
        <Tile label="جریمه تأخیر" value={money(a.summary.lateFees)} tone="text-danger" delay={360} />
      </div>

      {/* تب‌های جزئیات */}
      <div className="anim-up card overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5">
          {(
            [
              ["daily", "روزانه", <IconChart key="i" size={13} />],
              ["hourly", "ساعتی", <IconClock key="i" size={13} />],
              ["weekday", "روزهای هفته", <IconChart key="i" size={13} />],
              ["duration", "مدت‌ها", <IconTimer key="i" size={13} />],
              ["categories", "دسته‌ها", <IconBike key="i" size={13} />],
              ["customers", "مشتریان", <IconUsers key="i" size={13} />],
              ["payments", "پرداخت‌ها", <IconWallet key="i" size={13} />],
              ["discount", "تخفیف و تأخیر", <IconGift key="i" size={13} />],
              ["maintenance", "تعمیرات", <IconWrench key="i" size={13} />],
            ] as Array<[DetailTab, string, ReactNode]>
          ).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setDetail(id)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                detail === id ? "bg-brandsoft text-branddeep" : "text-inksoft hover:bg-black/5"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div key={detail} className="anim-up p-3.5">
          {detail === "daily" && <DailyView a={a} />}
          {detail === "hourly" && <HourlyView a={a} />}
          {detail === "weekday" && <WeekdayView a={a} />}
          {detail === "duration" && <DurationView a={a} />}
          {detail === "categories" && <CategoriesView a={a} />}
          {detail === "customers" && <CustomersView a={a} />}
          {detail === "payments" && <PaymentsView a={a} />}
          {detail === "discount" && <DiscountLateView a={a} />}
          {detail === "maintenance" && <MaintenanceView a={a} />}
        </div>
      </div>

      {/* انتخاب نوع PDF */}
      <Modal open={pdfPicker} onClose={() => setPdfPicker(false)} title="خروجی PDF — انتخاب گزارش">
        <p className="mb-3 text-xs text-inksoft">
          بازه: <b className="num">{jalaliDate(start)} تا {jalaliDate(end - 1)}</b> — گزارش با همین بازه تولید می‌شود
        </p>
        <div className="space-y-1.5">
          {(Object.keys(REPORT_TYPE_LABEL) as ReportType[]).map((t) => (
            <button
              key={t}
              onClick={() => setPdfType(t)}
              className={`flex w-full cursor-pointer items-center justify-between rounded-xl border-2 px-3.5 py-2.5 text-sm font-bold transition-all ${
                pdfType === t ? "border-brand bg-brandsoft text-branddeep" : "border-line text-inksoft hover:border-linedeep"
              }`}
            >
              {REPORT_TYPE_LABEL[t]}
              {pdfType === t && <Badge tone="brand">انتخاب شد</Badge>}
            </button>
          ))}
        </div>
        <Btn className="mt-4 w-full" onClick={doPDF} disabled={pdfBusy}>
          {pdfBusy ? (
            "در حال ساخت PDF…"
          ) : (
            <>
              <IconPrint size={16} />
              ساخت فایل PDF
            </>
          )}
        </Btn>
        <p className="mt-2 text-center text-[10px] leading-5 text-inkmute">
          فایل PDF واقعی (A4، چندصفحه‌ای) ساخته و برای دانلود ارائه می‌شود — نیاز به «Save as PDF» نیست
        </p>
      </Modal>
        </>
      )}
    </div>
  );
}

/* --------------------------------- نماها --------------------------------- */

function Tile({ label, value, tone, delay, small }: { label: string; value: string; tone: string; delay: number; small?: boolean }) {
  return (
    <div className="anim-up card px-3 py-2.5" style={{ animationDelay: `${delay}ms` }}>
      <p className="text-[10px] font-bold text-inkmute">{label}</p>
      <p className={`num mt-1 truncate font-display ${small ? "text-sm leading-6" : "text-lg"} ${tone}`}>{value}</p>
    </div>
  );
}

function Tbl({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-[10px] font-bold text-inkmute">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2.5 py-2 text-start">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="py-8 text-center text-xs font-bold text-inkmute">
                در این بازه داده‌ای نیست
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="transition-colors hover:bg-black/[0.02]">
                {r.map((c, j) => (
                  <td key={j} className="num whitespace-nowrap px-2.5 py-2 text-ink">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ pct, tone = "bg-brand" }: { pct: number; tone?: string }) {
  return (
    <span className="inline-block h-2 w-24 overflow-hidden rounded-full bg-black/5 align-middle">
      <span className={`block h-full rounded-full ${tone} transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  );
}

function DailyView({ a }: { a: Analytics }) {
  return (
    <Tbl
      head={["روز", "اجاره", "دوچرخه", "درآمد", "تخفیف", "جریمه", "لغو", "تکمیل", "میانگین مدت"]}
      rows={a.daily.map((d) => [
        jalaliDate(d.day),
        faNum(d.rentals),
        faNum(d.bikes),
        <b key="r" className="text-ok">{money(d.revenue)}</b>,
        d.discounts > 0 ? money(d.discounts) : "—",
        d.lateFees > 0 ? <span key="l" className="text-danger">{money(d.lateFees)}</span> : "—",
        d.cancellations > 0 ? <span key="c" className="text-danger">{faNum(d.cancellations)}</span> : "—",
        faNum(d.completed),
        d.avgDuration !== null ? `${faNum(d.avgDuration)} ساعت` : "—",
      ])}
    />
  );
}

function HourlyView({ a }: { a: Analytics }) {
  const maxRev = Math.max(1, ...a.hourly.map((h) => h.revenue));
  const maxRent = Math.max(1, ...a.hourly.map((h) => h.rentals));
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-bold text-inksoft">
        بازه اوج: <span className="text-branddeep">{a.summary.peakWindow ?? "—"}</span>
        {a.summary.busiestHour !== null && <> — شلوغ‌ترین ساعت: {faNum(a.summary.busiestHour)}:۰۰</>}
      </p>
      <div className="grid gap-x-6 lg:grid-cols-2">
        <Tbl
          head={["ساعت", "اجاره", "", "دوچرخه", "درآمد", "میانگین", "لغو"]}
          rows={a.hourly.map((h) => [
            <span key="h" className={`font-bold ${h.hour === a.summary.busiestHour ? "text-branddeep" : ""}`}>
              {faNum(h.hour)}:۰۰–{faNum((h.hour + 1) % 24)}:۰۰
            </span>,
            faNum(h.rentals),
            <Bar key="b" pct={(h.rentals / maxRent) * 100} />,
            faNum(h.bikes),
            money(h.revenue),
            h.avgQty !== null ? faNum(h.avgQty) : "—",
            h.cancellations > 0 ? faNum(h.cancellations) : "—",
          ])}
        />
        <div className="flex items-end gap-1 rounded-xl border border-line p-3">
          {a.hourly.map((h) => (
            <div key={h.hour} className="group flex h-40 flex-1 flex-col items-center justify-end gap-1" title={`${faNum(h.hour)}:۰۰ — ${money(h.revenue)}`}>
              <div
                className={`w-full rounded-t transition-all ${h.hour === a.summary.busiestHour ? "bg-branddeep" : "bg-brand/70 group-hover:bg-brand"}`}
                style={{ height: `${Math.max(2, (h.revenue / maxRev) * 100)}%` }}
              />
              <span className="num text-[8px] text-inkmute">{faNum(h.hour)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekdayView({ a }: { a: Analytics }) {
  const max = Math.max(1, ...a.weekdays.map((w) => w.revenue));
  const busiest = [...a.weekdays].sort((x, y) => y.rentals - x.rentals)[0];
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-inksoft">
        شلوغ‌ترین روز: <span className="text-branddeep">{busiest && busiest.rentals > 0 ? busiest.name : "—"}</span>
      </p>
      <ul className="space-y-2">
        {a.weekdays.map((w) => (
          <li key={w.weekday} className="flex items-center gap-3">
            <span className="w-20 text-xs font-extrabold text-ink">{w.name}</span>
            <Bar pct={(w.revenue / max) * 100} />
            <span className="num text-[11px] text-inksoft">
              {faNum(w.rentals)} اجاره · {faNum(w.bikes)} دوچرخه · {money(w.revenue)}
            </span>
            <span className="num ms-auto text-[11px] text-inkmute">
              میانگین {w.avgValue !== null ? money(w.avgValue) : "—"} · تأخیر {w.lateRate !== null ? `${faNum(w.lateRate)}٪` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DurationView({ a }: { a: Analytics }) {
  const popular = [...a.durations].sort((x, y) => y.rentals - x.rentals)[0];
  return (
    <div className="space-y-2">
      {popular && (
        <p className="text-[11px] font-bold text-inksoft">
          محبوب‌ترین مدت: <span className="text-branddeep">{popular.label}</span> ({faNum(popular.rentals)} اجاره)
        </p>
      )}
      <Tbl
        head={["مدت", "اجاره", "درصد", "", "دوچرخه", "درآمد"]}
        rows={a.durations.map((d) => [
          <b key="l">{d.label}</b>,
          faNum(d.rentals),
          d.percent !== null ? `${faNum(d.percent)}٪` : "—",
          <Bar key="b" pct={d.percent ?? 0} tone="bg-ok" />,
          faNum(d.bikes),
          money(d.revenue),
        ])}
      />
    </div>
  );
}

function CategoriesView({ a }: { a: Analytics }) {
  return (
    <Tbl
      head={["کد", "دسته", "موجودی", "اجاره‌شده", "ساعت اجاره", "درآمد", "میانگین مدت", "میانگین تعداد", "تعمیرات", "بهره‌وری"]}
      rows={a.categories.map((c) => [
        <span key="c" className="grid size-7 place-items-center rounded-md bg-coal font-display text-xs text-white">{c.code}</span>,
        <b key="n">{c.name}</b>,
        faNum(c.inventory),
        faNum(c.unitsRented),
        faNum(c.rentalHours),
        money(c.revenue),
        c.avgDuration !== null ? `${faNum(c.avgDuration)} س` : "—",
        c.avgQty !== null ? faNum(c.avgQty) : "—",
        c.maintenanceCount > 0 ? <span key="m" className="text-[#b45309]">{faNum(c.maintenanceCount)}</span> : "—",
        c.utilization !== null ? (
          <span key="u" className="flex items-center gap-2">
            <Bar pct={c.utilization} tone="bg-branddeep" />
            <span className="num font-bold">{faNum(c.utilization)}٪</span>
          </span>
        ) : (
          <Badge key="u" tone="neutral">داده ناکافی</Badge>
        ),
      ])}
    />
  );
}

function CustomersView({ a }: { a: Analytics }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <MiniStat label="مشتری جدید" v={faNum(a.retention.newCustomers)} />
        <MiniStat label="مشتری بازگشتی" v={faNum(a.retention.returningCustomers)} />
        <MiniStat label="نرخ تکرار" v={a.retention.repeatRate !== null ? `${faNum(a.retention.repeatRate)}٪` : "—"} />
        <MiniStat label="میانگین فاصله اجاره‌ها" v={a.retention.avgGapDays !== null ? `${faNum(a.retention.avgGapDays)} روز` : "—"} />
      </div>
      <Tbl
        head={["مشتری", "تلفن", "اولین", "آخرین", "تکمیل", "ساعت", "دوچرخه", "پرداخت", "تأخیر", "جریمه", "تخفیف", "پاداش"]}
        rows={a.customers.map((c) => [
          <b key="n">{c.name}</b>,
          <span key="p" dir="ltr">{c.phone}</span>,
          jalaliDate(c.firstRentalAt),
          jalaliDate(c.lastRentalAt),
          faNum(c.completedRentals),
          faNum(c.totalHours),
          faNum(c.totalUnits),
          money(c.spending),
          c.lateCount > 0 ? <span key="l" className="text-danger">{faNum(c.lateCount)}</span> : "—",
          c.lateFees > 0 ? money(c.lateFees) : "—",
          c.discounts > 0 ? money(c.discounts) : "—",
          c.rewardEligible ? <Badge key="r" tone="ok">واجد</Badge> : <span key="r" className="num text-inkmute">{faNum(c.rewardHours)}/{faNum(4)}</span>,
        ])}
      />
    </div>
  );
}

function MiniStat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="text-[10px] font-bold text-inkmute">{label}</p>
      <p className="num mt-0.5 font-display text-base text-ink">{v}</p>
    </div>
  );
}

function PaymentsView({ a }: { a: Analytics }) {
  const total = a.payments.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-black/5">
        {a.payments.map((p, i) => (
          <span
            key={p.accountId}
            className={i === 0 ? "bg-brand" : i === 1 ? "bg-ok" : i === 2 ? "bg-coal" : "bg-inkmute"}
            style={{ width: `${total > 0 ? (p.amount / total) * 100 : 0}%` }}
            title={`${p.name}: ${money(p.amount)}`}
          />
        ))}
      </div>
      <Tbl
        head={["روش", "حساب", "تراکنش", "مبلغ", "سهم از دریافتی"]}
        rows={a.payments.map((p) => [
          <b key="k">{accountKindLabel(p.kind)}</b>,
          p.name,
          faNum(p.count),
          money(p.amount),
          p.percent !== null ? (
            <span key="p" className="flex items-center gap-2">
              <Bar pct={p.percent} tone="bg-ok" />
              {faNum(p.percent)}٪
            </span>
          ) : (
            "—"
          ),
        ])}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniStat label="جمع دریافتی بازه" v={money(a.summary.received)} />
        <MiniStat label="مانده‌های باز" v={money(a.summary.outstanding)} />
        <MiniStat label="درآمد اجاره" v={money(a.summary.revenue)} />
      </div>
    </div>
  );
}

function DiscountLateView({ a }: { a: Analytics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink">
          <IconGift size={14} className="text-branddeep" />
          تخفیف‌ها
        </h4>
        <Tbl
          head={["نرخ", "اجاره", "مبلغ"]}
          rows={a.discounts.distribution.map((d) => [`${faNum(d.rate)}٪`, faNum(d.count), money(d.amount)])}
        />
        <div className="mt-2 space-y-1 text-[11px] font-bold text-inksoft">
          <p>جمع تخفیف: <span className="num text-ink">{money(a.discounts.totalDiscount)}</span></p>
          <p>پاداش مشتری مصرف‌شده: <span className="num text-ink">{faNum(a.discounts.rewardUsed)} مورد</span></p>
          <p>درآمد قبل از تخفیف: <span className="num text-ink">{money(a.discounts.beforeRevenue)}</span> — بعد از تخفیف: <span className="num text-ink">{money(a.discounts.afterRevenue)}</span></p>
        </div>
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink">
          <IconClock size={14} className="text-danger" />
          تأخیر در برگشت
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="اجاره دارای تأخیر" v={faNum(a.late.lateRentals)} />
          <MiniStat label="نرخ تأخیر" v={a.late.latePercent !== null ? `${faNum(a.late.latePercent)}٪` : "—"} />
          <MiniStat label="دیرکرد واقعی" v={`${faNum(a.late.actualMinutes)} دقیقه`} />
          <MiniStat label="بخشوده" v={`${faNum(a.late.waivedMinutes)} دقیقه`} />
          <MiniStat label="قابل محاسبه" v={`${faNum(a.late.chargeableMinutes)} دقیقه`} />
          <MiniStat label="جریمه دریافتی" v={money(a.late.fees)} />
        </div>
        <p className="num mt-2 text-[11px] font-bold text-inksoft">
          میانگین تأخیر: {a.late.avgDelay !== null ? `${faNum(a.late.avgDelay)} دقیقه` : "—"}
        </p>
      </div>
    </div>
  );
}

function MaintenanceView({ a }: { a: Analytics }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink">
          <IconWrench size={14} className="text-branddeep" />
          تعمیرات بازه
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <MiniStat label="تعداد" v={faNum(a.maintenance.count)} />
          <MiniStat label="هنوز باز" v={faNum(a.maintenance.openCount)} />
          <MiniStat label="مجموع زمان" v={`${faNum(a.maintenance.totalHours)} ساعت`} />
          <MiniStat label="هزینه" v={money(a.maintenance.totalCost)} />
        </div>
        {a.maintenance.byCategory.length > 0 && (
          <p className="mt-2 text-[11px] font-bold text-inksoft">
            دسته‌های درگیر: {a.maintenance.byCategory.map((c) => `${c.code} (${faNum(c.count)})`).join("، ")}
          </p>
        )}
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-ink">
          <IconBike size={14} className="text-branddeep" />
          بهره‌وری موجودی
        </h4>
        <Tbl
          head={["دسته", "موجودی", "ساعت اجاره", "بهره‌وری"]}
          rows={a.categories.map((c) => [
            `${c.code} — ${c.name}`,
            faNum(c.inventory),
            faNum(c.rentalHours),
            c.utilization !== null ? `${faNum(c.utilization)}٪` : <Badge key="b" tone="neutral">داده ناکافی</Badge>,
          ])}
        />
        <p className="mt-2 text-[10px] leading-5 text-inkmute">
          بهره‌وری = ساعت‌های اجاره ÷ (موجودی × روز × ۲۴). وقتی داده کافی نباشد هیچ عددی ساخته نمی‌شود.
        </p>
      </div>
    </div>
  );
}
