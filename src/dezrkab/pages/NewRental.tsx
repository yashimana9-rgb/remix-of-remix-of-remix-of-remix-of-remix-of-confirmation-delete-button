// @ts-nocheck
/**
 * اجاره حضوری — پیشخوان POS
 * ترتیب ثابت: شماره تماس → مشتری → مدت → دوچرخه‌ها → تأیید (Enter) → فاکتور (Enter) → چاپ (Enter)
 * تمرکز کیبورد بین مراحل به‌صورت خودکار جابه‌جا می‌شود؛ گذارها کوتاه و نرم‌اند.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Customer, DB, Rental } from "../domain/models";
import { useNow, useRoute } from "../state/app";
import { useDB } from "../storage/storage";
import { availabilityService } from "../services/availabilityService";
import { balanceService } from "../services/balanceService";
import { customerService } from "../services/customerService";
import { paymentService } from "../services/paymentService";
import { pricingService } from "../services/pricingService";
import { rentalService } from "../services/rentalService";
import { accountKindLabel, durationLabel, faNum, faPhone, fmtDateFull, fmtTime, money } from "../utils/format";
import { Btn, Modal, useToast } from "../ui/kit";
import { SubChip } from "../ui/SubBadge";
import {
  IconBike,
  IconCheck,
  IconEdit,
  IconMinus,
  IconPhone,
  IconPlus,
  IconPrint,
  IconTimer,
} from "../ui/icons";

type Stage = "phone" | "duration" | "bikes" | "confirm";

export default function NewRental() {
  const db = useDB();
  const toast = useToast();
  const route = useRoute();
  const now = useNow(1000);
  const S = db.settings;

  const [phone, setPhone] = useState("");
  const [phoneTried, setPhoneTried] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [newCust, setNewCust] = useState({ first: "", last: "" });
  const [stage, setStage] = useState<Stage>("phone");
  const [durIdx, setDurIdx] = useState(1); // پیش‌فرض: 1 ساعت
  const [hours, setHours] = useState<number | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ rental: Rental; startAt: number } | null>(null);
  const [printed, setPrinted] = useState(false);
  const [shakeKey, setShakeKey] = useState("");
  /* بیعانه / پیش‌پرداخت قبل از تحویل — پیش‌فرض صفر (ودیعه نیست) */
  const [payStr, setPayStr] = useState("");
  const [payAccountId, setPayAccountId] = useState<string>(
    () => db.settings.accounts.find((a) => a.kind === "POS" && a.active)?.id ?? db.settings.accounts.find((a) => a.active)?.id ?? ""
  );
  /* تخفیف روی کل فاکتور — ۰ تا ۴۰٪؛ اگر مشتری پاداش داشته باشد پیش‌فرض همان است */
  const [discountChoice, setDiscountChoice] = useState(0);

  const phoneRef = useRef<HTMLInputElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  const durationBoxRef = useRef<HTMLDivElement>(null);
  const bikesBoxRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const payAmountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const code = route.params.get("cat");
    if (code) {
      const cat = db.categories.find((c) => c.code === code && c.active);
      /* پیش‌انتخاب فقط برای دسته‌ای که همین لحظه موجودی دارد — صفر موجودی هرگز پیش‌انتخاب نمی‌شود */
      if (cat && availabilityService.availableCount(db, cat.id) > 0) {
        setQtys({ [cat.id]: 1 });
      }
    }
    phoneRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----------------------------- داده‌های زنده ----------------------------- */
  const phoneNorm = phone.replace(/\s/g, "");
  const matches = phoneNorm ? customerService.search(db, phoneNorm).slice(0, 4) : [];
  const exact = matches.find((m) => m.phone === phoneNorm) ?? null;
  const phoneValid = /^0\d{10}$/.test(phoneNorm);
  const newMode = !customer && phoneValid && !exact;
  const newReady = newMode && newCust.first.trim() !== "" && newCust.last.trim() !== "";
  const customerReady = !!customer || newReady;
  const fullName = customer ? customer.name : `${newCust.first} ${newCust.last}`.trim();

  const threshold = S.rewardThresholdHours;
  const pct = S.rewardDiscountPercent;
  const eligible = customerReady && (customer?.completedHours ?? 0) >= threshold;

  /* با انتخاب مشتری، تخفیف پیش‌فرض = پاداش مشتری (در صورت واجد شرایط بودن) */
  useEffect(() => {
    setDiscountChoice(eligible ? pct : 0);
  }, [customer?.id, customerReady, eligible, pct]);

  const availability = availabilityService.snapshot(db, now);
  const totalUnits = Object.values(qtys).reduce((s, q) => s + q, 0);

  const quote = useMemo(() => {
    if (!hours || totalUnits === 0) return null;
    try {
      const items = Object.entries(qtys)
        .filter(([, q]) => q > 0)
        .map(([categoryId, qty]) => ({ categoryId, qty }));
      const q = pricingService.quote(db, items, hours, 0);
      const discount = Math.round((q.subtotal * discountChoice) / 100);
      return { ...q, discount, final: q.subtotal - discount };
    } catch {
      return null;
    }
  }, [db, qtys, hours, discountChoice, totalUnits]);

  /* شروع خودکار: الان + زمان آماده‌سازی (گرد به دقیقه) */
  const startAt = Math.ceil((now + S.prepMinutes * 60_000) / 60_000) * 60_000;

  /* ------------------------------ اصلاح خودکار ------------------------------ */
  useEffect(() => {
    if (confirmed) return;
    if (!customerReady && stage !== "phone") {
      setStage("phone");
      setHours(null);
      setQtys({});
    } else if (hours === null && (stage === "bikes" || stage === "confirm")) {
      setStage("duration");
    } else if (hours !== null && totalUnits === 0 && stage === "confirm") {
      setStage("bikes");
    }
  }, [customerReady, hours, totalUnits, stage, confirmed]);

  /*
    هم‌گام‌سازی زنده پیش‌نویس با موجودی لحظه‌ای (M5):
    اگر موجودی دسته‌ای حین بازبودن فرم کاهش یافت (اجاره هم‌زمان، تعمیر و…)،
    تعداد انتخابی بلافاصله به سقف جدید محدود می‌شود — در صفر، از پیش‌نویس حذف می‌شود.
    هیچ تعداد قدیمی‌شده‌ای بی‌صدا به تأیید نهایی نمی‌رسد؛ لایه تراکنش هم هنگام commit دوباره بررسی می‌کند.
  */
  useEffect(() => {
    if (confirmed) return;
    const stale = Object.entries(qtys).filter(
      ([id, q]) => q > availabilityService.availableCount(db, id, now)
    );
    if (stale.length > 0) {
      setQtys((q) => {
        const next = { ...q };
        for (const [id] of stale) {
          const avail = availabilityService.availableCount(db, id, now);
          if ((next[id] ?? 0) > avail) {
            if (avail === 0) delete next[id];
            else next[id] = avail;
          }
        }
        return next;
      });
      toast.push(
        "err",
        stale.length === 1 && qtys[stale[0][0]] > 0 && availabilityService.availableCount(db, stale[0][0], now) === 0
          ? `«${db.categories.find((c) => c.id === stale[0][0])?.name ?? ""}» ناموجود شد — از پیش‌نویس حذف شد`
          : "موجودی تغییر کرد — تعداد انتخابی با موجودی لحظه‌ای هماهنگ شد"
      );
    }
  }, [db, now, confirmed, qtys]); // eslint-disable-line react-hooks/exhaustive-deps

  /* --------- گذار نرم: تمرکز خودکار روی مرحله بعد + اسکرول کوتاه --------- */
  useEffect(() => {
    if (confirmed) return;
    const t = window.setTimeout(() => {
      if (stage === "phone") {
        phoneRef.current?.focus({ preventScroll: true });
      } else if (stage === "duration") {
        durationBoxRef.current?.focus({ preventScroll: true });
        durationBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (stage === "bikes") {
        bikesBoxRef.current?.focus({ preventScroll: true });
        bikesBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (stage === "confirm") {
        confirmBtnRef.current?.focus({ preventScroll: true });
        confirmBtnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 70);
    return () => window.clearTimeout(t);
  }, [stage, confirmed]);

  /* -------------------------------- اکشن‌ها -------------------------------- */
  const bump = (k: string) => {
    setShakeKey("");
    requestAnimationFrame(() => setShakeKey(k));
    window.setTimeout(() => setShakeKey(""), 650);
  };

  const selectCustomer = (c: Customer) => {
    setCustomer(c);
    setPhone(c.phone);
    setPhoneTried(false);
    setStage("duration");
  };

  const changeCustomer = () => {
    setCustomer(null);
    setNewCust({ first: "", last: "" });
    setHours(null);
    setQtys({});
    setPhone("");
    setStage("phone");
  };

  const onPhoneEnter = () => {
    setPhoneTried(true);
    if (exact) return selectCustomer(exact);
    if (matches.length === 1 && phoneNorm.length >= 8) return selectCustomer(matches[0]);
    if (newMode) {
      firstRef.current?.focus();
      return;
    }
    bump("phone");
  };

  const confirmNew = () => {
    if (!newCust.first.trim()) {
      firstRef.current?.focus();
      bump("newcust");
      return;
    }
    if (!newCust.last.trim()) {
      lastRef.current?.focus();
      bump("newcust");
      return;
    }
    setStage("duration");
  };

  const pickDuration = (i: number) => {
    setDurIdx(i);
    setHours(S.durations[i].hours);
    setStage("bikes");
  };

  const setQty = (catId: string, v: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, v));
    setQtys((q) => {
      const next = { ...q };
      if (clamped === 0) delete next[catId];
      else next[catId] = clamped;
      return next;
    });
  };

  /* حساب جاری مشتری — بستانکاری (طلب او) و بدهی فاکتورهای قبلی */
  const bal = useMemo(
    () => (customer ? balanceService.summary(db, customer.id) : { credit: 0, debt: 0, net: 0, debtItems: [] }),
    [db, customer]
  );
  /* بستانکاری قبلی خودکار روی همین فاکتور خرج می‌شود */
  const creditApplied = quote ? Math.min(bal.credit, quote.final) : 0;
  /* مبلغ قابل پرداخت = فاکتور − بستانکاری + بدهی قبلی */
  const payableNow = quote ? Math.max(0, quote.final - creditApplied) + bal.debt : 0;

  /* مبلغ بیعانه — پیش‌فرض صفر؛ فروشنده هر مبلغی بخواهد وارد می‌کند */
  const prepayAmount = useMemo(() => {
    if (!quote) return 0;
    const v = parseInt(payStr, 10);
    return Number.isFinite(v) ? Math.max(0, Math.min(v, payableNow)) : 0;
  }, [quote, payStr, payableNow]);
  const prepayRemaining = payableNow - prepayAmount;
  const payAccount = db.settings.accounts.find((a) => a.id === payAccountId) ?? null;
  const consumeReward = eligible && discountChoice === pct;

  const confirmRental = () => {
    if (submitting || !hours || totalUnits === 0 || !customerReady) return;
    setSubmitting(true);
    try {
      const items = Object.entries(qtys)
        .filter(([, q]) => q > 0)
        .map(([categoryId, qty]) => ({ categoryId, qty }));
      const startMs = Math.ceil((Date.now() + S.prepMinutes * 60_000) / 60_000) * 60_000;
      const rental = rentalService.createRental({
        customer: customer ? { id: customer.id } : { name: fullName, phone: phoneNorm },
        items,
        hours,
        startAt: startMs,
        note: "",
        discountRate: discountChoice,
        consumeReward,
        prepayAmount,
        accountId: payAccountId,
      });
      setConfirmed({ rental, startAt: startMs });
      setPrinted(false);
      toast.push("ok", `اجاره #${faNum(rental.number)} ثبت شد — Enter برای چاپ فاکتور`);
    } catch (err) {
      toast.push("err", err instanceof Error ? err.message : "ثبت اجاره ناموفق بود");
      bump("confirm");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * چاپ رسید روی رول حرارتی ۸ سانتی — بدون هیچ کاغذ اضافه.
   *
   * علت کاغذ اضافهٔ قبلی: «size:80mm auto» در CSS معتبر نیست (auto برای
   * ارتفاع برگه پذیرفته نمی‌شود) پس قانون نادیده گرفته می‌شد و چاپ روی
   * قالب A4ِ پیش‌فرض می‌افتاد → هر رسید یک برگهٔ بلندِ پر از فضای خالی.
   *
   * راه‌حل: ارتفاع واقعی رسید در همان چیدمان چاپی (عرض ۸۰mm و padding چاپ)
   * اندازه‌گیری می‌شود و اندازهٔ برگه دقیقاً همان‌قدر تنظیم می‌شود، با
   * margin صفر — نه فضای خالی بالا/پایین می‌ماند، نه برگهٔ دوم ساخته می‌شود.
   */
  const doPrint = () => {
    setPrinted(true);
    const receipt = document.querySelector<HTMLElement>(".print-receipt");
    let pageHeightMm = 0;
    if (receipt) {
      const prev = receipt.style.cssText;
      /* موقتاً همان چیدمان چاپ اعمال می‌شود تا اندازه‌گیری دقیق باشد */
      receipt.style.width = "80mm";
      receipt.style.maxWidth = "80mm";
      receipt.style.margin = "0";
      receipt.style.padding = "0 2mm";
      /* px→mm (۹۶dpi) + ۱mm اطمینان تا گردشدن اعشار برگهٔ دوم نسازد */
      pageHeightMm = Math.ceil((receipt.getBoundingClientRect().height * 25.4) / 96) + 1;
      receipt.style.cssText = prev;
    }
    const style = document.createElement("style");
    style.id = "pedal-receipt-page";
    style.textContent =
      pageHeightMm > 0
        ? `@page{size:80mm ${pageHeightMm}mm;margin:0}`
        : "@page{size:80mm 200mm;margin:0}";
    document.head.appendChild(style);
    try {
      window.print();
    } finally {
      style.remove();
    }
  };


  const resetAll = () => {
    setConfirmed(null);
    setPhone("");
    setPhoneTried(false);
    setCustomer(null);
    setNewCust({ first: "", last: "" });
    setHours(null);
    setDurIdx(1);
    setQtys({});
    setStage("phone");
    setPrinted(false);
    setPayStr("");
    setDiscountChoice(0);
  };

  /* ------------------------- کیبورد سراسری (POS) ------------------------- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      const inField =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      if (confirmed) {
        if (e.key === "Enter" && !inField) {
          e.preventDefault();
          if (!printed) doPrint();
          else resetAll();
        }
        return;
      }
      if (inField) return;
      if (stage === "duration") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setDurIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setDurIdx((i) => Math.min(S.durations.length - 1, i + 1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          pickDuration(durIdx);
        }
      } else if (stage === "bikes" && e.key === "Enter") {
        e.preventDefault();
        if (totalUnits > 0) setStage("confirm");
        else bump("bikes");
      } else if (stage === "confirm" && e.key === "Enter") {
        e.preventDefault();
        confirmRental();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  /* ------------------------------- وضعیت مراحل ------------------------------- */
  /*
    وضعیت هر کارت فقط از ترتیبِ مرحلهٔ فعال (stage) به دست می‌آید — نه از کامل‌بودن داده‌ها.
    اگر از customerReady مشتق می‌شد، با تایپ اولین حرفِ نام خانوادگی کارت تلفن «done» شده،
    ورودیِ دارای focus از DOM حذف می‌شد و فرم وسط تایپ می‌پرید. پیشروی فقط با Enter است.
  */
  const STAGE_ORDER: Record<Stage, number> = { phone: 0, duration: 1, bikes: 2, confirm: 3 };
  const stageIdx = STAGE_ORDER[stage];
  const stepState = (i: number): StepState =>
    i < stageIdx ? "done" : i === stageIdx ? "active" : "locked";
  const phoneState = stepState(0);
  const durationState = stepState(1);
  const bikesState = stepState(2);
  const confirmState = stepState(3);
  const durLabel = hours !== null
    ? S.durations.find((d) => d.hours === hours)?.label ?? durationLabel(hours)
    : null;

  const bikeSummary = Object.entries(qtys)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => {
      const c = db.categories.find((x) => x.id === id);
      return `${faNum(q)} × ${c?.name ?? "?"}`;
    })
    .join("، ");

  return (
    <div data-enter-flow="off" className="grid items-start gap-3.5 xl:grid-cols-12">
      {/* ------------------------------- ستون مراحل ------------------------------- */}
      <div className="space-y-2.5 xl:col-span-8">
        {/* مرحله ۱ — شماره تماس */}
        <StepCard
          n={1}
          title="شماره تماس"
          state={phoneState}
          shake={shakeKey === "phone"}
          onEdit={changeCustomer}
          summary={
            customerReady ? (
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 place-items-center rounded-full bg-coal font-display text-xs text-white">
                  {fullName.slice(0, 1)}
                </span>
                <span className="text-sm font-extrabold text-ink">{fullName}</span>
                <span className="num hidden text-xs text-inkmute sm:inline" dir="ltr">{phoneNorm}</span>
                <SubChip customerId={customer?.id} />
                {eligible && (
                  <span className="rounded-full bg-oksoft px-2.5 py-0.5 text-[11px] font-extrabold text-ok">
                    {faNum(pct)}٪ تخفیف فعال
                  </span>
                )}
              </div>
            ) : null
          }
        >
          <div className="relative">
            <input
              ref={phoneRef}
              dir="ltr"
              inputMode="numeric"
              className="inp num px-11 text-lg font-extrabold tracking-[0.15em]"
              style={{ textAlign: "left" }}
              placeholder="09xxxxxxxxx"
              value={phone}
              autoFocus
              onChange={(e) => {
                setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11));
                setPhoneTried(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onPhoneEnter();
                }
              }}
            />
            <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-inkmute">
              <IconPhone size={19} />
            </span>
          </div>

          {phoneTried && !phoneValid && !customer && (
            <p className="mt-1.5 text-[11px] font-bold text-danger">
              شماره تماس باید ۱۱ رقمی و با ۰ شروع شود
            </p>
          )}

          {/* نتایج جستجو — بلافاصله هنگام تایپ */}
          {!customer && matches.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {matches.map((m) => {
                const mEligible = m.completedHours >= threshold;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => selectCustomer(m)}
                      className={`anim-pop flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-2 text-start transition-all hover:border-brand ${
                        exact?.id === m.id ? "border-ok bg-oksoft/60" : "border-line bg-white"
                      }`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-coal font-display text-sm text-white">
                        {m.name.slice(0, 1)}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-extrabold text-ink">{m.name}</span>
                        <span className="num block text-[11px] text-inkmute" dir="ltr">{m.phone}</span>
                      </span>
                      {mEligible && (
                        <span className="rounded-full bg-oksoft px-2.5 py-0.5 text-[11px] font-extrabold text-ok">
                          {faNum(pct)}٪ تخفیف فعال
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-branddeep">Enter ↵</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* مشتری جدید — بدون پیشنهاد جعلی، بدون ساخت موقت */}
          {newMode && (
            <div className={`anim-pop mt-3 rounded-xl border-2 border-dashed border-linedeep bg-black/[0.02] p-3.5 ${shakeKey === "newcust" ? "anim-shake" : ""}`}>
              <p className="text-xs font-extrabold text-inksoft">
                مشتری‌ای با این شماره پیدا نشد — نام را وارد کنید
                <span className="ms-2 font-normal text-inkmute">(بعد از تأیید اجاره ذخیره می‌شود)</span>
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <div>
                  <label className="lbl">نام *</label>
                  <input
                    ref={firstRef}
                    className="inp"
                    value={newCust.first}
                    onChange={(e) => setNewCust({ ...newCust, first: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        lastRef.current?.focus();
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="lbl">نام خانوادگی *</label>
                  <input
                    ref={lastRef}
                    className="inp"
                    value={newCust.last}
                    onChange={(e) => setNewCust({ ...newCust, last: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        confirmNew();
                      }
                    }}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-inkmute">Enter ↵ برای ادامه</p>
            </div>
          )}
        </StepCard>

        {/* مرحله ۲ — مدت اجاره */}
        <StepCard
          n={2}
          title="مدت اجاره"
          state={durationState}
          onEdit={() => setStage("duration")}
          summary={durLabel ? <span className="rounded-lg bg-brandsoft px-3 py-1 font-display text-base text-branddeep">{durLabel}</span> : null}
        >
          <div
            ref={durationBoxRef}
            tabIndex={-1}
            className="grid grid-cols-3 gap-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-xl sm:grid-cols-7"
          >
            {S.durations.map((d, i) => {
              const selected = hours === d.hours || (hours === null && i === durIdx);
              return (
                <button
                  key={d.hours}
                  onClick={() => pickDuration(i)}
                  onMouseEnter={() => setDurIdx(i)}
                  className={`cursor-pointer rounded-xl border-2 px-1 py-2.5 text-center transition-all duration-100 ${
                    selected
                      ? "border-brand bg-brandsoft shadow-[0_4px_14px_rgba(29,98,214,0.18)]"
                      : "border-line bg-white hover:border-linedeep"
                  }`}
                >
                  <span className={`block font-display text-base leading-6 md:text-lg ${selected ? "text-branddeep" : "text-ink"}`}>
                    {d.label}
                  </span>
                  {hours === null && i === durIdx && (
                    <span className="mt-0.5 block text-[10px] font-bold text-branddeep">↵</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-inkmute">
            با <Kbd>→</Kbd> <Kbd>←</Kbd> انتخاب و <Kbd>Enter</Kbd> تأیید — پیش‌فرض: 1 ساعت
          </p>
        </StepCard>

        {/* مرحله ۳ — دوچرخه‌ها */}
        <StepCard
          n={3}
          title="دوچرخه‌ها"
          state={bikesState}
          shake={shakeKey === "bikes"}
          onEdit={() => setStage("bikes")}
          summary={bikeSummary ? <span className="text-sm font-extrabold text-ink">{bikeSummary}</span> : null}
        >
          <div
            ref={bikesBoxRef}
            tabIndex={-1}
            className="grid grid-cols-2 gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-brand/50 rounded-xl md:grid-cols-3 xl:grid-cols-5"
          >
            {availability.map((a) => {
              const q = qtys[a.category.id] ?? 0;
              const out = a.available === 0;
              return (
                <div
                  key={a.category.id}
                  className={`overflow-hidden rounded-xl border-2 bg-white transition-all duration-150 ${
                    q > 0 ? "border-brand shadow-[0_6px_18px_rgba(29,98,214,0.15)]" : out ? "border-line opacity-50" : "border-line"
                  }`}
                >
                  {/* جای خالی تصویر دوچرخه — برای عکس واقعی در آینده */}
                  <div className={`grid h-14 place-items-center border-b-2 border-dashed border-line md:h-16 ${q > 0 ? "bg-brandsoft/50" : "bg-black/[0.025]"}`}>
                    <IconBike size={30} className={q > 0 ? "text-branddeep/70" : "text-inkmute/50"} />
                  </div>
                  <div className="p-2">
                    <div className="flex items-center justify-between">
                      <span className="grid size-6 place-items-center rounded-md bg-coal font-display text-xs text-white">
                        {a.category.code}
                      </span>
                      <span className="num text-[10px] font-bold text-inkmute">از مجموع {faNum(a.total)}</span>
                    </div>
                    <p className="mt-1 text-[13px] font-extrabold text-ink">{a.category.name}</p>
                    <p className={`num text-[11px] font-extrabold ${out ? "text-danger" : "text-ok"}`}>
                      {faNum(a.available)} موجود
                    </p>
                    {out ? (
                      <p className="text-[10px] font-bold text-danger/80">فعلاً قابل اجاره نیست</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <button
                        onClick={() => setQty(a.category.id, q - 1, a.available)}
                        disabled={q === 0}
                        className="grid size-10 cursor-pointer place-items-center rounded-xl border-2 border-linedeep text-ink transition-all hover:border-danger hover:bg-dangersoft hover:text-danger active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                        aria-label="کاهش"
                      >
                        <IconMinus size={19} />
                      </button>
                      <span className={`num w-7 text-center font-display text-xl ${q > 0 ? "text-branddeep" : "text-inkmute"}`}>
                        {q > 0 ? faNum(q) : "—"}
                      </span>
                      <button
                        onClick={() => setQty(a.category.id, q + 1, a.available)}
                        disabled={out || q >= a.available}
                        className="grid size-10 cursor-pointer place-items-center rounded-xl border-2 border-brand bg-brand text-white transition-all hover:bg-branddeep active:scale-90 disabled:pointer-events-none disabled:opacity-25"
                        aria-label="افزایش"
                      >
                        <IconPlus size={19} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <p className="text-[11px] text-inkmute">موجودی لحظه‌ای از سامانه مرکزی — انتخاب بیش از موجودی ممکن نیست</p>
            <p className="num text-xs font-extrabold text-inksoft">
              {totalUnits > 0 ? `${faNum(totalUnits)} دستگاه — Enter ↵` : "دوچرخه انتخاب کنید"}
            </p>
          </div>
        </StepCard>

        {/* مرحله ۴ — تأیید نهایی */}
        <StepCard n={4} title="تأیید و شروع اجاره" state={confirmState} shake={shakeKey === "confirm"}>
          <div className="grid gap-3.5 md:grid-cols-2">
            <div className="space-y-0.5 text-sm">
              <Row k="مشتری" v={fullName} />
              <Row k="تلفن" v={<span dir="ltr" className="num">{phoneNorm}</span>} />
              <Row k="مدت" v={durLabel ?? "—"} />
              <Row k="دوچرخه‌ها" v={bikeSummary || "—"} />
              {/* تخفیف روی کل فاکتور */}
              {quote && (
                <div className="mt-2 rounded-xl border border-line bg-black/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <p className="lbl !mb-0">تخفیف (کل فاکتور)</p>
                    {consumeReward && (
                      <span className="flex items-center gap-1 rounded-full bg-oksoft px-2 py-0.5 text-[10px] font-extrabold text-ok">
                        <IconCheck size={11} />
                        تخفیف پاداش مشتری
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex gap-1.5">
                    {[0, 10, 20, 30, 40].map((r) => (
                      <button
                        key={r}
                        onClick={() => setDiscountChoice(r)}
                        className={`num flex-1 cursor-pointer rounded-lg border-2 py-1.5 text-sm font-extrabold transition-all duration-100 ${
                          discountChoice === r
                            ? "border-brand bg-brandsoft text-branddeep shadow-[0_3px_10px_rgba(29,98,214,0.15)]"
                            : "border-line bg-white text-inksoft hover:border-linedeep"
                        }`}
                      >
                        {faNum(r)}٪
                      </button>
                    ))}
                  </div>
                  {consumeReward && (
                    <p className="mt-1.5 text-[11px] font-bold text-ok">
                      شمارنده پاداش بعد از ثبت اجاره صفر می‌شود
                    </p>
                  )}
                  {eligible && discountChoice !== pct && (
                    <p className="mt-1.5 text-[11px] font-bold text-[#b45309]">
                      پاداش مشتری برای این اجاره مصرف نخواهد شد
                    </p>
                  )}
                </div>
              )}

              {/* بیعانه / پیش‌پرداخت قبل از تحویل — پیش‌فرض صفر */}
              {quote && (
                <div className="mt-2 rounded-xl border border-line bg-black/[0.02] p-3">
                  <p className="lbl !mb-1.5">بیعانه / پرداخت قبل از تحویل</p>
                  {(bal.credit > 0 || bal.debt > 0) && (
                    <p
                      className={`num mb-2 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold ${
                        bal.debt > 0 ? "bg-dangersoft text-danger" : "bg-oksoft text-ok"
                      }`}
                    >
                      {bal.credit > 0 && `این مشتری ${money(bal.credit)} بستانکار است — از همین فاکتور کم می‌شود. `}
                      {bal.debt > 0 && `این مشتری ${money(bal.debt)} از فاکتورهای قبلی بدهکار است — با پرداخت بیشتر تسویه می‌شود.`}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="lbl">مبلغ پرداخت‌شده (تومان)</label>
                      <input
                        ref={payAmountRef}
                        className="inp num"
                        dir="ltr"
                        style={{ textAlign: "left" }}
                        type="number"
                        min={0}
                        value={payStr}
                        onChange={(e) => setPayStr(e.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="lbl">روش پرداخت</label>
                      <select className="inp" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                        {db.settings.accounts.filter((a) => a.active).map((a) => (
                          <option key={a.id} value={a.id}>
                            {accountKindLabel(a.kind)} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* خلاصه مالی — ترتیب: اصلی → تخفیف → نهایی → پرداخت‌شده → مانده */}
              {quote && (
                <div className="mt-2 space-y-0.5 border-t-2 border-dashed border-line pt-2">
                  <Row k="مبلغ اصلی" v={money(quote.subtotal)} />
                  {quote.discount > 0 && (
                    <Row k={`تخفیف ${faNum(discountChoice)}٪`} v={<span className="text-ok">− {money(quote.discount)}</span>} />
                  )}
                  <Row k="مبلغ نهایی" v={<span className="font-display text-base text-branddeep">{money(quote.final)}</span>} />
                  {creditApplied > 0 && (
                    <Row
                      k="بستانکاری قبلی مشتری"
                      v={<span className="text-ok">− {money(creditApplied)}</span>}
                    />
                  )}
                  {bal.debt > 0 && (
                    <Row
                      k="بدهی فاکتورهای قبلی"
                      v={<span className="text-danger">+ {money(bal.debt)}</span>}
                    />
                  )}
                  {(creditApplied > 0 || bal.debt > 0) && (
                    <Row
                      k="قابل پرداخت"
                      v={<span className="font-display text-base text-ink">{money(payableNow)}</span>}
                    />
                  )}
                  <Row k="پرداخت‌شده" v={<span className={prepayAmount > 0 ? "text-ok" : "text-inkmute"}>{money(prepayAmount)}</span>} />
                  <Row
                    k="مانده"
                    v={
                      <span className={prepayRemaining > 0 ? "text-danger" : "text-ok"}>
                        {money(prepayRemaining)}
                      </span>
                    }
                  />
                  {prepayAmount > 0 && payAccount && (
                    <Row k="روش پرداخت" v={`${accountKindLabel(payAccount.kind)} — ${payAccount.name}`} />
                  )}
                </div>
              )}
            </div>
            <div>
              <div className="rounded-xl bg-coal p-3.5 text-white">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-white/60">
                    <IconTimer size={14} />
                    شروع (خودکار)
                  </span>
                  <span className="num font-display text-2xl">{fmtTime(startAt)}</span>
                </div>
                <p className="num mt-0.5 text-end text-[10px] text-white/40">
                  الان {fmtTime(now)} + {faNum(S.prepMinutes)} دقیقه آماده‌سازی
                </p>
                <div className="mt-1.5 flex items-center justify-between border-t border-white/10 pt-1.5">
                  <span className="text-xs text-white/60">برگشت مورد انتظار</span>
                  <span className="num font-display text-2xl text-white">
                    {hours !== null ? fmtTime(startAt + hours * 3_600_000) : "—"}
                  </span>
                </div>
              </div>
              <Btn size="lg" className="mt-2.5 w-full text-base" ref={confirmBtnRef} onClick={confirmRental} disabled={submitting}>
                <IconCheck size={19} />
                شروع اجاره — Enter ↵
              </Btn>
            </div>
          </div>
        </StepCard>
      </div>

      {/* ------------------------------- پیش‌فاکتور زنده ------------------------------- */}
      <aside className="space-y-2.5 xl:sticky xl:top-16 xl:col-span-4">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h3 className="font-display text-base text-ink">پیش‌فاکتور</h3>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-ok">
              <span className="dot-live size-2 rounded-full bg-ok" />
              محاسبه زنده
            </span>
          </div>
          <div className="p-3.5">
            <MiniRow k="مشتری" v={fullName || "—"} />
            <MiniRow k="مدت" v={durLabel ?? "—"} />
            <MiniRow k="شروع" v={fmtTime(startAt)} />
            <div className="my-2 border-t-2 border-dashed border-line" />
            {!quote ? (
              <p className="py-1.5 text-center text-xs text-inkmute">
                مدت و دوچرخه را انتخاب کنید تا قیمت همین‌جا حساب شود
              </p>
            ) : (
              <>
                {quote.lines.map((l) => (
                  <MiniRow
                    key={l.categoryId}
                    v={money(l.lineTotal)}
                    k={
                      <span className="num">
                        <b className="text-ink">{l.code}</b> — {l.name} × {faNum(l.qty)}
                      </span>
                    }
                  />
                ))}
                <div className="my-2 border-t-2 border-dashed border-line" />
                {quote.discount > 0 ? (
                  <>
                    <MiniRow k="قیمت اصلی" v={<span className="num text-inkmute line-through">{money(quote.subtotal)}</span>} />
                    <MiniRow
                      k={
                        <span className="font-extrabold text-ok">
                          تخفیف {faNum(discountChoice)}٪{consumeReward ? " (پاداش)" : ""}
                        </span>
                      }
                      v={<span className="num font-extrabold text-ok">− {money(quote.discount)}</span>}
                    />
                  </>
                ) : null}
                <div className="mt-1 flex items-center justify-between rounded-xl bg-coal px-3.5 py-2 text-white">
                  <span className="text-xs font-bold text-white/70">قابل پرداخت</span>
                  <span className="num font-display text-2xl text-white">{money(quote.final)}</span>
                </div>
              </>
            )}

            {/* وضعیت پاداش مشتری */}
            {customerReady && customer && (
              <div className={`mt-2.5 rounded-xl px-3.5 py-2 ${eligible ? "bg-oksoft" : "bg-black/[0.03]"}`}>
                <div className="flex items-center justify-between text-[11px] font-extrabold">
                  <span className={eligible ? "text-ok" : "text-inksoft"}>
                    {eligible ? "پاداش آماده مصرف!" : "پاداش مشتری"}
                  </span>
                  <span className={`num ${eligible ? "text-ok" : "text-inkmute"}`}>
                    {faNum(Math.min(customer.completedHours, threshold))} از {faNum(threshold)} ساعت
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${eligible ? "bg-ok" : "bg-brand"}`}
                    style={{ width: `${Math.min(100, (customer.completedHours / threshold) * 100)}%` }}
                  />
                </div>
                <p className="num mt-1 text-[10px] text-inkmute">
                  {eligible
                    ? customer.completedHours > threshold
                      ? `روی کل فاکتور این اجاره اعمال می‌شود — ${faNum(
                          Math.round((customer.completedHours - threshold) * 100) / 100
                        )} ساعت اضافه برای دور بعد ذخیره می‌ماند`
                      : "روی کل فاکتور این اجاره اعمال می‌شود"
                    : `هر دوچرخه×ساعت اجاره تکمیل‌شده شمرده می‌شود — ${faNum(threshold - customer.completedHours)} ساعت تا تخفیف ${faNum(pct)}٪`}
                </p>

              </div>
            )}
            {newMode && (
              <p className="mt-2.5 rounded-xl bg-black/[0.03] px-3.5 py-2 text-[11px] font-bold text-inksoft">
                مشتری جدید — پاداش از اولین اجاره شروع می‌شود
              </p>
            )}
          </div>
        </div>

        <div className="card px-4 py-2.5">
          <p className="mb-1.5 text-[11px] font-extrabold text-inkmute">عملیات سریع (POS)</p>
          <div className="space-y-1 text-[11px] font-bold text-inksoft">
            <p className="flex items-center justify-between">تأیید / ادامه <Kbd>Enter ↵</Kbd></p>
            <p className="flex items-center justify-between">انتخاب مدت <span className="flex gap-1"><Kbd>→</Kbd><Kbd>←</Kbd></span></p>
            <p className="flex items-center justify-between">تعداد دوچرخه <span className="text-inkmute">کلیک موس</span></p>
            <p className="flex items-center justify-between">چاپ فاکتور <Kbd>Enter ↵</Kbd></p>
          </div>
        </div>
      </aside>

      {/* ------------------------------- فاکتور نهایی ------------------------------- */}
      <Modal
        open={!!confirmed}
        onClose={resetAll}
        title={confirmed ? `فاکتور اجاره #${faNum(confirmed.rental.number)}` : ""}
      >
        {confirmed && <Receipt rental={confirmed.rental} startAt={confirmed.startAt} />}
        <div className="mt-4 flex gap-2">
          <Btn className="flex-1" onClick={doPrint} autoFocus>
            <IconPrint size={16} />
            {printed ? "چاپ دوباره — Enter ↵" : "چاپ فاکتور — Enter ↵"}
          </Btn>
          <Btn variant="dark" className="flex-1" onClick={resetAll}>
            اجاره بعدی — Enter ↵
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ اجزای کمکی ------------------------------ */

type StepState = "done" | "active" | "locked";

function StepCard({
  n,
  title,
  state,
  summary,
  onEdit,
  children,
  shake,
}: {
  n: number;
  title: string;
  state: StepState;
  summary?: ReactNode;
  onEdit?: () => void;
  children?: ReactNode;
  shake?: boolean;
}) {
  return (
    <section
      className={`card scroll-mt-20 overflow-hidden transition-opacity duration-200 ${state === "locked" ? "opacity-40" : ""} ${shake ? "anim-shake" : ""}`}
    >
      <header className="flex min-h-12 items-center gap-3 border-b border-line px-4 py-2">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full font-display text-sm transition-colors ${
            state === "done" ? "bg-ok text-white" : state === "active" ? "bg-brand text-white" : "bg-black/10 text-inksoft"
          }`}
        >
          {state === "done" ? <IconCheck size={14} /> : faNum(n)}
        </span>
        <h3 className="flex-1 font-display text-base text-ink md:text-lg">{title}</h3>
        {state === "done" && (
          <>
            {summary}
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-inksoft transition-colors hover:bg-black/5 hover:text-ink"
              >
                <IconEdit size={13} />
                ویرایش
              </button>
            )}
          </>
        )}
      </header>
      {/* مرحله کامل‌شده جمع می‌شود تا جریان روی لپ‌تاپ بدون اسکرول بماند */}
      {state === "active" && <div className="anim-step p-3.5">{children}</div>}
    </section>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-linedeep bg-black/[0.04] px-1.5 py-0.5 font-body text-[10px] font-extrabold text-inksoft">
      {children}
    </kbd>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-line py-1.5">
      <span className="text-inksoft">{k}</span>
      <span className="font-extrabold text-ink">{v}</span>
    </div>
  );
}

function MiniRow({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-inksoft">{k}</span>
      <span className="num font-bold text-ink">{v}</span>
    </div>
  );
}

/* ------------------------- رسید حرارتی ۸۰ میلی‌متری ------------------------- */

function Receipt({ rental, startAt }: { rental: Rental; startAt: number }) {
  const db = useDB();
  const S = db.settings;
  const cust = db.customers.find((c) => c.id === rental.customerId);
  const paid = paymentService.paidFor(db, rental.id);
  const remaining = rental.total - paid;
  const lastPay = [...db.payments]
    .filter((p) => p.rentalId === rental.id && p.kind === "RENT")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const acc = lastPay ? db.settings.accounts.find((a) => a.id === lastPay.accountId) : null;

  return (
    <div
      dir="rtl"
      className="print-root print-receipt mx-auto w-[72mm] bg-white px-[4mm] pb-[3mm] pt-[2.5mm] text-[#161616] shadow-[0_10px_40px_rgba(20,20,15,0.25)] print:shadow-none"
    >
      {/* ── سربرگ ── */}
      <header className="text-center">
        <p className="text-[9px] font-extrabold tracking-[0.28em] text-[#3d3d3a]">
          {S.receiptTitleSub}
        </p>
        <h1 className="font-display text-[27px] leading-9 text-[#111]">{S.receiptTitleMain}</h1>
        <div className="mx-auto mt-1 h-[3px] w-12 border-y border-[#111]" />
        <p className="num mt-1.5 text-[9.5px] font-bold text-[#3d3d3a]">
          {fmtDateFull(rental.createdAt)} <span className="mx-1 text-[#9a9a94]">•</span> اجاره{" "}
          <bdi dir="ltr">#{faNum(rental.number)}</bdi>
        </p>
      </header>

      {/* ── مشتری ── */}
      <div className="mt-2.5">
        <p className="text-[9.5px] font-extrabold text-[#5c5c58]">نام مشتری</p>
        <p className="font-display text-[19px] leading-7 text-[#111]">{cust?.name ?? "—"}</p>
      </div>

      {/* ── ساعت رفت / برگشت ── */}
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border-[1.6px] border-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-[#5c5c58]">ساعت رفت</p>
          <p className="num font-display text-[23px] leading-8 text-[#111]">{fmtTime(startAt)}</p>
        </div>
        <div className="rounded-md border-[1.6px] border-[#111] bg-[#111] px-1.5 pb-1.5 pt-1 text-center">
          <p className="text-[9.5px] font-extrabold text-white/70">ساعت برگشت</p>
          <p className="num font-display text-[23px] leading-8 text-white">{fmtTime(rental.plannedEndAt)}</p>
        </div>
      </div>

      {/* ── دوچرخه‌ها ── */}
      <div className="mt-2.5">
        <p className="border-b border-dashed border-[#8f8f8a] pb-0.5 text-[9.5px] font-extrabold text-[#5c5c58]">
          دوچرخه‌ها
        </p>
        <ul className="mt-1 space-y-1">
          {rental.items.map((it) => (
            <li key={it.categoryId} className="flex items-center gap-2">
              <span className="num font-display text-[20px] leading-6 text-[#111]">{faNum(it.qty)}</span>
              <span className="text-[13px] font-black text-[#3d3d3a]">×</span>
              <bdi
                dir="ltr"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border-[1.6px] border-[#111] font-display text-[17px] leading-none text-[#111]"
              >
                {it.code}
              </bdi>
              <span className="text-[11.5px] font-bold text-[#3d3d3a]">{it.name}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* ── مبلغ‌ها ── */}
      <div className="mt-2.5 border-t border-dashed border-[#8f8f8a] pt-1.5">
        <div className="num flex items-center justify-between text-[11px] font-bold text-[#3d3d3a]">
          <span>مبلغ اصلی</span>
          <span className={rental.discount > 0 ? "text-[#8f8f8a] line-through" : "text-[#111]"}>
            {faNum(rental.subtotal)}
          </span>
        </div>
        {rental.discount > 0 && (
          <div className="num mt-0.5 flex items-center justify-between text-[11px] font-extrabold text-[#111]">
            <span>تخفیف {faNum(rental.discountRate)}٪</span>
            <span>− {faNum(rental.discount)}</span>
          </div>
        )}
        <div className="mt-1.5 flex items-center justify-between rounded-md bg-[#111] px-2.5 py-1.5">
          <span className="text-[10.5px] font-extrabold text-white/75">مبلغ نهایی</span>
          <span className="num font-display text-[21px] leading-7 text-white">
            {faNum(rental.total)} <span className="text-[11px]">تومان</span>
          </span>
        </div>
      </div>

      {/* ── پرداخت ── */}
      <div className="num mt-1.5 space-y-0.5 text-[11px] font-bold text-[#3d3d3a]">
        <div className="flex items-center justify-between">
          <span>پرداخت شده</span>
          <span className="text-[#111]">{faNum(paid)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>مانده</span>
          <span className="text-[13px] font-black text-[#111]">{faNum(remaining)}</span>
        </div>
        <p className="pt-0.5 text-[10px] font-bold text-[#5c5c58]">
          پرداخت: {acc ? accountKindLabel(acc.kind) : paid > 0 ? "—" : "هنگام برگشت"}
        </p>
      </div>

      {/* ── قانون دیرکرد ── */}
      <div className="mt-2.5 rounded-md bg-[#f2f2ee] px-2 py-1.5 print:bg-transparent print:p-0 print:pt-1 print:border-t print:border-dashed print:border-[#8f8f8a]">
        <p className="text-[9px] font-black text-[#111]">قانون دیرکرد</p>
        <p className="mt-0.5 text-[9px] font-bold leading-4 text-[#3d3d3a]">{S.receiptLateRule}</p>
      </div>

      {/* ── تشکر و تماس ── */}
      <footer className="mt-2 text-center">
        <p className="text-[11px] font-extrabold text-[#111]">{S.receiptThanks}</p>
        <p className="mt-1.5 text-[9px] font-bold text-[#5c5c58]">برای اطلاعات بیشتر با ما تماس بگیرید</p>
        <p className="num text-[15px] font-black tracking-wide text-[#111]" dir="ltr">
          {faPhone(S.receiptPhone)}
        </p>
      </footer>
    </div>
  );
}

function ReceiptRow({ k, v, bold }: { k: ReactNode; v: ReactNode; bold?: boolean }) {
  return (
    <div className="num flex items-center justify-between">
      <span className="text-inksoft">{k}</span>
      <span className={bold ? "font-extrabold text-ink" : "font-semibold text-ink"}>{v}</span>
    </div>
  );
}
