// @ts-nocheck
/** اشتراک‌ها — فروش بسته ساعتی و ثبت تردد روزانه مشتری */
import { useEffect, useMemo, useState } from "react";
import {
  DISCOUNT_PRESETS,
  VALIDITY_PRESETS,
  isExpired,
  itemsRate,
  quoteSubscription,
  SUB_STATUS_LABEL,
  subscriptionService,
  timeToMinutes,
} from "../services/subscriptionService";
import { availabilityService } from "../services/availabilityService";
import { useDB } from "../storage/storage";
import { accountKindLabel, faNum, faPhone, fmtDateFull, fmtTime, money } from "../utils/format";
import { Badge, Btn, Empty, KV, Modal, useToast } from "../ui/kit";
import { MoneyInput, moneyValue } from "../ui/money";
import { IconCash, IconCheck, IconClock, IconPlus, IconReceipt, IconUsers, IconX } from "../ui/icons";
import { TimeInput, faTimeDot } from "../ui/TimeInput";


const EMPTY_FORM = {
  name: "",
  phone: "",
  idNumber: "",
  planTitle: "اشتراک ساعتی",
  hours: "20",
  discountPercent: "0",
  validDays: "30",
  accountId: "",
  note: "",
};


function faDigits(s: string): string {
  return String(s).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export default function Subscriptions() {
  const db = useDB();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  /** تعداد انتخاب‌شده از هر دسته دوچرخه */
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "FINISHED">("ACTIVE");

  const accounts = useMemo(
    () => (db.settings.accounts ?? []).filter((a) => a.active),
    [db.settings.accounts]
  );

  /* پیش‌فرض نوع پرداخت — اولین حساب فعال */
  useEffect(() => {
    if (!form.accountId && accounts.length > 0) {
      setForm((f) => (f.accountId ? f : { ...f, accountId: accounts[0].id }));
    }
  }, [accounts, form.accountId]);

  const cats = useMemo(() => db.categories.filter((c) => c.active), [db.categories]);
  const pickedItems = useMemo(
    () =>
      cats
        .filter((c) => (qtys[c.id] ?? 0) > 0)
        .map((c) => ({
          categoryId: c.id,
          code: c.code,
          name: c.name,
          qty: qtys[c.id],
          hourlyRate: c.hourlyRate,
        })),
    [cats, qtys]
  );

  const hoursNum = Number(faDigits(form.hours).replace(/[^\d.]/g, "")) || 0;
  const rateNum = itemsRate(pickedItems);
  const pctNum = Number(faDigits(form.discountPercent).replace(/[^\d]/g, "")) || 0;
  const daysNum = Number(faDigits(form.validDays).replace(/[^\d]/g, "")) || 0;
  const quote = quoteSubscription(hoursNum, rateNum, pctNum);
  const expiryPreview = daysNum > 0 ? Date.now() + daysNum * 86_400_000 : null;

  const subs = useMemo(() => {
    const list = db.subscriptions ?? [];
    if (filter === "ALL") return list;
    return list.filter((s) => s.status === filter);
  }, [db.subscriptions, filter]);


  function submit() {
    try {
      const sub = subscriptionService.create({
        name: form.name,
        phone: faDigits(form.phone),
        idNumber: faDigits(form.idNumber),
        planTitle: form.planTitle,
        hours: hoursNum,
        hourlyRate: rateNum,
        discountPercent: pctNum,
        accountId: form.accountId,
        validDays: daysNum,
        note: form.note,
        items: pickedItems.map((i) => ({ categoryId: i.categoryId, qty: i.qty })),
      });
      toast.push(
        "ok",
        `اشتراک «${sub.planTitle}» برای ${sub.name} ثبت و ${money(sub.total)} دریافت شد`
      );
      setForm({ ...EMPTY_FORM, accountId: form.accountId });
      setQtys({});
      setFilter("ACTIVE");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ثبت اشتراک ناموفق بود");
    }
  }


  const now = Date.now();
  const activeCount = (db.subscriptions ?? []).filter(
    (s) => s.status === "ACTIVE" && !isExpired(s, now)
  ).length;
  const remainingTotal = (db.subscriptions ?? [])
    .filter((s) => s.status === "ACTIVE" && !isExpired(s, now))
    .reduce((sum, s) => sum + (s.totalHours - s.usedHours), 0);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      {/* ---------------- فرم ثبت اشتراک ---------------- */}
      <div className="space-y-4 xl:col-span-5">
        <section className="anim-up card p-4">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <IconPlus size={18} className="text-branddeep" />
            ثبت اشتراک جدید
          </h2>

          <div className="mt-3 space-y-3">
            <div>
              <label className="lbl">نام و نام خانوادگی *</label>
              <input
                className="inp"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثلاً: مریم رضایی"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="lbl">شماره تماس *</label>
                <input
                  className="inp num"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="09xxxxxxxxx"
                />
              </div>
              <div>
                <label className="lbl">کد ملی</label>
                <input
                  className="inp num"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  placeholder="۱۰ رقم"
                />
              </div>
            </div>

            <div>
              <label className="lbl">نوع اشتراک *</label>
              <input
                className="inp"
                value={form.planTitle}
                onChange={(e) => setForm({ ...form, planTitle: e.target.value })}
                placeholder="مثلاً: اشتراک ساعتی ویژه تابستان"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="lbl">تعداد ساعت *</label>
                <input
                  className="inp num"
                  dir="ltr"
                  inputMode="decimal"
                  value={form.hours}
                  onChange={(e) => setForm({ ...form, hours: e.target.value })}
                  placeholder="20"
                />
              </div>
              <div>
                <label className="lbl">هزینه هر ساعت (تومان) *</label>
                <MoneyInput
                  value={form.hourlyRate}
                  onChange={(v) => setForm({ ...form, hourlyRate: v })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="lbl">تخفیف روی کل هزینه (درصد)</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {DISCOUNT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm({ ...form, discountPercent: String(p) })}
                    className={`num cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-colors ${
                      pctNum === p
                        ? "border-branddeep bg-branddeep text-white"
                        : "border-linedeep text-inksoft hover:border-branddeep"
                    }`}
                  >
                    {faNum(p)}٪
                  </button>
                ))}
                <input
                  className="inp num"
                  dir="ltr"
                  inputMode="numeric"
                  style={{ width: "5.5rem" }}
                  value={form.discountPercent}
                  onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  placeholder="دستی"
                />
              </div>
            </div>

            {/* مدت اعتبار اشتراک */}
            <div>
              <label className="lbl">مدت اعتبار اشتراک (روز) *</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {VALIDITY_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm({ ...form, validDays: String(d) })}
                    className={`num cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-colors ${
                      daysNum === d
                        ? "border-branddeep bg-branddeep text-white"
                        : "border-linedeep text-inksoft hover:border-branddeep"
                    }`}
                  >
                    {faNum(d)} روز
                  </button>
                ))}
                <input
                  className="inp num"
                  dir="ltr"
                  inputMode="numeric"
                  style={{ width: "5.5rem" }}
                  value={form.validDays}
                  onChange={(e) => setForm({ ...form, validDays: e.target.value })}
                  placeholder="دستی"
                />
              </div>
              {expiryPreview && (
                <p className="mt-1.5 text-[11px] font-bold text-inkmute">
                  تاریخ پایان: <span className="num text-branddeep">{fmtDateFull(expiryPreview)}</span>
                </p>
              )}
            </div>

            {/* نوع پرداخت — الزامی؛ مبلغ همان لحظه دریافت و ثبت می‌شود */}
            <div>
              <label className="lbl">نوع پرداخت (دریافت همین حالا) *</label>
              {accounts.length === 0 ? (
                <p className="rounded-xl border border-danger/40 bg-dangersoft/50 p-2.5 text-[11px] font-bold text-danger">
                  هیچ حساب پرداخت فعالی تعریف نشده است — از بخش تنظیمات یک حساب اضافه کنید
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setForm({ ...form, accountId: a.id })}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-colors ${
                        form.accountId === a.id
                          ? "border-branddeep bg-branddeep text-white"
                          : "border-linedeep text-inksoft hover:border-branddeep"
                      }`}
                    >
                      <IconCash size={13} />
                      {a.name}
                      <span className="text-[10px] opacity-70">{accountKindLabel(a.kind)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="lbl">یادداشت</label>
              <input
                className="inp"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            <div className="rounded-xl bg-black/[0.03] p-3">
              <KV k="جمع کل" v={<span className="num">{money(quote.subtotal)}</span>} />
              <KV
                k={`تخفیف (${faNum(quote.percent)}٪)`}
                v={<span className="num text-danger">− {money(quote.discount)}</span>}
              />
              <KV k="مبلغ دریافتی همین حالا" v={<span className="num">{money(quote.total)}</span>} strong />
            </div>

            <p className="text-[11px] font-bold text-inkmute">
              با ثبت اشتراک، کل مبلغ به‌عنوان دریافتی امروز در پرداخت‌ها و گزارش‌های درآمد ثبت می‌شود.
            </p>

            <Btn className="w-full" onClick={submit} disabled={accounts.length === 0} data-enter-submit>
              <IconReceipt size={15} />
              ثبت اشتراک و دریافت {quote.total > 0 ? money(quote.total) : ""}
            </Btn>
          </div>
        </section>

        <div className="anim-up grid grid-cols-2 gap-4" style={{ animationDelay: "60ms" }}>
          <div className="card p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-inkmute">
              <IconUsers size={13} /> اشتراک فعال
            </p>
            <p className="num mt-1.5 font-display text-xl text-ink">{faNum(activeCount)}</p>
          </div>
          <div className="card p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-inkmute">
              <IconClock size={13} /> مجموع ساعت مانده
            </p>
            <p className="num mt-1.5 font-display text-xl text-ink">
              {faNum(Math.round(remainingTotal * 100) / 100)}
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- فهرست اشتراک‌ها ---------------- */}
      <section className="anim-up space-y-3 xl:col-span-7" style={{ animationDelay: "90ms" }}>
        <div className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h3 className="font-display text-base text-ink">
            اشتراک‌ها ({faNum(subs.length)})
          </h3>
          <div className="flex gap-1.5">
            {(["ACTIVE", "FINISHED", "ALL"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold transition-colors ${
                  filter === f
                    ? "border-branddeep bg-branddeep text-white"
                    : "border-linedeep text-inksoft hover:border-branddeep"
                }`}
              >
                {f === "ALL" ? "همه" : SUB_STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {subs.length === 0 ? (
          <div className="card">
            <Empty icon={<IconReceipt size={26} />} text="اشتراکی در این نما نیست" />
          </div>
        ) : (
          subs.map((s) => <SubCard key={s.id} sub={s} />)
        )}
      </section>
    </div>
  );
}

function nowPlus(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SubCard({ sub }: { sub: any }) {
  const db = useDB();
  const toast = useToast();
  const [start, setStart] = useState(() => nowPlus(db.settings.prepMinutes ?? 0));
  const [end, setEnd] = useState("");
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const remaining = Math.round((sub.totalHours - sub.usedHours) * 100) / 100;
  const pct = sub.totalHours > 0 ? Math.min(100, (sub.usedHours / sub.totalHours) * 100) : 0;
  const sMin = timeToMinutes(start);
  const eMin = timeToMinutes(end);
  const previewHours = sMin !== null && eMin !== null && eMin > sMin ? Math.round(((eMin - sMin) / 60) * 100) / 100 : 0;
  const expired = isExpired(sub);
  const daysLeft = sub.expiresAt ? Math.ceil((sub.expiresAt - Date.now()) / 86_400_000) : null;
  const accountName = sub.accountId
    ? db.settings.accounts.find((a: any) => a.id === sub.accountId)?.name ?? "—"
    : "—";

  function addSession() {
    try {
      subscriptionService.addSession(sub.id, { start, end });
      toast.push("ok", `${faNum(previewHours)} ساعت ثبت شد`);
      setStart(nowPlus(db.settings.prepMinutes ?? 0));
      setEnd("");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ثبت تردد ناموفق بود");
    }
  }

  function cancel() {
    try {
      subscriptionService.cancel(sub.id, "");
      toast.push("ok", "اشتراک لغو شد و مبلغ ساعت‌های مصرف‌نشده برگشت خورد");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "لغو ناموفق بود");
    }
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-display text-base text-ink">{sub.name}</p>
          <p className="num mt-0.5 text-[11px] text-inkmute">
            {faPhone(sub.phone)}
            {sub.idNumber ? ` — کد ملی ${faNum(Number(sub.idNumber))}` : ""}
          </p>
          <p className="mt-1 text-xs font-bold text-inksoft">{sub.planTitle}</p>
        </div>
        <div className="text-end">
          <div className="flex flex-wrap items-center justify-end gap-1">
            {expired && sub.status === "ACTIVE" && <Badge tone="danger">اعتبار تمام‌شده</Badge>}
            <Badge tone={sub.status === "ACTIVE" && !expired ? "ok" : sub.status === "FINISHED" ? "mute" : "danger"}>
              {SUB_STATUS_LABEL[sub.status]}
            </Badge>
          </div>
          <p className="num mt-1 text-xs font-extrabold text-ok">{money(sub.total)} پرداخت‌شده</p>
          <p className="text-[11px] text-inkmute">{accountName}</p>
          {sub.discountPercent > 0 && (
            <p className="num text-[11px] text-inkmute">{faNum(sub.discountPercent)}٪ تخفیف</p>
          )}
        </div>
      </div>

      {sub.expiresAt ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-inksoft">
          <IconClock size={12} className="text-inkmute" />
          تاریخ پایان: <span className="num text-ink">{fmtDateFull(sub.expiresAt)}</span>
          {daysLeft !== null && (
            <span className={`num ${daysLeft <= 0 ? "text-danger" : daysLeft <= 7 ? "text-warn" : "text-inkmute"}`}>
              ({daysLeft > 0 ? `${faNum(daysLeft)} روز مانده` : "منقضی"})
            </span>
          )}
        </p>
      ) : null}

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] font-bold text-inkmute">
          <span className="num">
            مصرف‌شده {faNum(sub.usedHours)} از {faNum(sub.totalHours)} ساعت
          </span>
          <span className="num text-branddeep">مانده {faNum(remaining)} ساعت</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/[0.07]">
          <div
            className="h-full rounded-full bg-branddeep transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

      </div>

      {sub.status === "ACTIVE" && expired && (
        <p className="mt-3 rounded-xl border border-danger/30 bg-dangersoft/60 px-3 py-2 text-[11px] font-bold text-danger">
          اعتبار زمانی این اشتراک تمام شده است — امکان ثبت تردد جدید وجود ندارد
        </p>
      )}

      {sub.status === "ACTIVE" && !expired && (
        <div className="mt-3 grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto]">
          <TimeInput
            label="ساعت رفت"
            value={start}
            onChange={setStart}
            separator=":"
            showHalfHour
            nowOffsetMinutes={db.settings.prepMinutes ?? 0}
            ltr
          />
          <TimeInput label="ساعت برگشت" value={end} onChange={setEnd} separator=":" showHalfHour ltr />
          <Btn data-enter-submit onClick={addSession} disabled={previewHours <= 0} className="h-[42px] w-full lg:w-auto">
            <IconCheck size={15} />
            ثبت {previewHours > 0 ? `${faNum(previewHours)} ساعت` : "تردد"}
          </Btn>
        </div>
      )}


      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="cursor-pointer text-[11px] font-extrabold text-branddeep"
        >
          {open ? "بستن تاریخچه" : `تاریخچه تردد (${faNum(sub.sessions.length)})`}
        </button>
        {sub.status === "ACTIVE" && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="flex cursor-pointer items-center gap-1 text-[11px] font-extrabold text-inkmute transition-colors hover:text-danger"
          >
            <IconX size={12} /> لغو اشتراک
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-line">
          {sub.sessions.length === 0 ? (
            <p className="p-3 text-[11px] text-inkmute">هنوز ترددی ثبت نشده است</p>
          ) : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-line">
                {sub.sessions.map((x: any) => (
                  <tr key={x.id}>
                    <td className="num px-3 py-2 text-inksoft">
                      {fmtDateFull(x.at)} — {fmtTime(x.at)}
                    </td>
                    <td className="num px-3 py-2 text-inksoft" dir="ltr">
                      {faTimeDot(x.start)} → {faTimeDot(x.end)}
                    </td>

                    <td className="num px-3 py-2 font-extrabold text-ink">{faNum(x.hours)} ساعت</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="تأیید لغو اشتراک">
        <div className="space-y-4">
          <p className="text-sm text-inksoft">
            آیا از لغو اشتراک <span className="font-extrabold text-ink">«{sub.planTitle}»</span> برای{" "}
            <span className="font-extrabold text-ink">{sub.name}</span> مطمئن هستید؟
          </p>
          <p className="text-xs text-inkmute">
            در صورت تأیید، اشتراک لغو می‌شود و مبلغ ساعت‌های مصرف‌نشده به‌صورت سند اصلاحی برگشت می‌خورد.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirmOpen(false)}>
              خیر
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                cancel();
              }}
            >
              بله، لغو شود
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
