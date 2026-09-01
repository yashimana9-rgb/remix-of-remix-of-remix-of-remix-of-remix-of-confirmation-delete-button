// @ts-nocheck
import { useMemo, useState } from "react";
import type { Payment, PaymentKind } from "../domain/models";
import { useAuth } from "../state/app";
import { can } from "../services/authService";
import { KIND_LABEL, paymentService } from "../services/paymentService";
import { useDB } from "../storage/storage";
import { accountKindLabel, faNum, fmtDateTime, isSameDay, money } from "../utils/format";
import { Badge, Btn, Empty, Modal, useToast } from "../ui/kit";
import { MoneyInput, PaymentSplit, makeSplit, moneyValue, splitPayments } from "../ui/money";


import { IconCash, IconEdit, IconPlus, IconSearch, IconWallet } from "../ui/icons";

type Tab = "all" | "rent" | "corr";

const kindTone: Record<PaymentKind, "ok" | "brand" | "warn" | "danger" | "neutral"> = {
  RENT: "ok",
  DEPOSIT: "brand",
  DEPOSIT_REFUND: "warn",
  DEPOSIT_APPLY: "neutral",
  CORRECTION: "danger",
};

export default function Payments() {
  const db = useDB();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [corrFor, setCorrFor] = useState<Payment | null>(null);

  const now = Date.now();
  const activeLike = db.rentals.filter(
    (r) => r.status === "ACTIVE" || r.status === "PARTIAL" || r.status === "COMPLETED"
  );
  const todayReceived = db.payments
    .filter(
      (p) =>
        isSameDay(p.createdAt, now) &&
        (p.kind === "RENT" || p.kind === "CORRECTION" || p.kind === "DEPOSIT_APPLY")
    )
    .reduce((s, p) => s + p.amount, 0);
  const outstanding = activeLike.reduce((s, r) => s + Math.max(0, paymentService.remainingFor(db, r)), 0);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...db.payments]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((p) => {
        if (tab === "rent" && !(p.kind === "RENT" || p.kind === "DEPOSIT_APPLY")) return false;
        if (tab === "corr" && p.kind !== "CORRECTION") return false;
        if (!s) return true;
        const r = db.rentals.find((x) => x.id === p.rentalId);
        const c = r ? db.customers.find((x) => x.id === r.customerId) : null;
        return (
          (r && String(r.number).includes(s)) ||
          (c && c.name.toLowerCase().includes(s))
        );
      })
      .slice(0, 80);
  }, [db, tab, q]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="anim-up card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-inksoft">دریافتی امروز</p>
            <span className="grid size-9 place-items-center rounded-xl bg-oksoft text-ok"><IconCash size={19} /></span>
          </div>
          <p className="num mt-2 font-display text-2xl text-ink">{money(todayReceived)}</p>
        </div>
        <div className="anim-up card p-4" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-inksoft">مانده‌های باز</p>
            <span className="grid size-9 place-items-center rounded-xl bg-warnsoft text-warn"><IconCash size={19} /></span>
          </div>
          <p className="num mt-2 font-display text-2xl text-ink">{money(outstanding)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3.5">
          <div className="flex rounded-xl border border-linedeep p-1">
            {(
              [
                ["all", "همه"],
                ["rent", "اجاره"],
                ["corr", "اصلاحیه"],
              ] as Array<[Tab, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  tab === t ? "bg-coal text-white" : "text-inksoft hover:bg-black/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-52 flex-1">
            <input className="inp ps-10" placeholder="جستجو: شماره اجاره یا مشتری…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute"><IconSearch size={16} /></span>
          </div>
          <Btn onClick={() => setAddOpen(true)}>
            <IconPlus size={15} />
            ثبت پرداخت
          </Btn>
        </div>

        {list.length === 0 ? (
          <Empty icon={<IconCash size={28} />} text="پرداختی ثبت نشده" />
        ) : (
          <div className="max-h-[62vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-line text-[11px] font-bold text-inkmute">
                  <th className="px-4 py-2.5 text-start">زمان</th>
                  <th className="px-4 py-2.5 text-start">اجاره</th>
                  <th className="px-4 py-2.5 text-start">مشتری</th>
                  <th className="px-4 py-2.5 text-start">نوع</th>
                  <th className="px-4 py-2.5 text-start">حساب</th>
                  <th className="px-4 py-2.5 text-start">اپراتور</th>
                  <th className="px-4 py-2.5 text-start">مبلغ</th>
                  {can(user, "payment.correct") && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((p) => {
                  const r = db.rentals.find((x) => x.id === p.rentalId);
                  const c = r ? db.customers.find((x) => x.id === r.customerId) : null;
                  const op = db.users.find((u) => u.id === p.operatorId);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-black/[0.02]">
                      <td className="num px-4 py-2.5 text-xs text-inksoft">{fmtDateTime(p.createdAt)}</td>
                      <td className="num px-4 py-2.5 font-display text-ink">{r ? `#${faNum(r.number)}` : "—"}</td>
                      <td className="px-4 py-2.5 font-bold text-ink">{c?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge tone={kindTone[p.kind]}>{KIND_LABEL[p.kind]}</Badge>
                        {p.note && <span className="ms-1.5 hidden text-[11px] text-inkmute xl:inline">{p.note}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-inksoft">{paymentService.accountName(db, p.accountId)}</td>
                      <td className="px-4 py-2.5 text-xs text-inksoft">{op?.name ?? "سامانه"}</td>
                      <td className={`num px-4 py-2.5 font-extrabold ${p.amount < 0 ? "text-danger" : "text-ok"}`}>
                        {p.amount < 0 ? `− ${money(-p.amount)}` : money(p.amount)}
                      </td>
                      {can(user, "payment.correct") && (
                        <td className="px-4 py-2.5 text-end">
                          <button
                            onClick={() => setCorrFor(p)}
                            className="cursor-pointer rounded-lg p-1.5 text-inkmute transition-colors hover:bg-warnsoft hover:text-warn"
                            title="اصلاح با سند اصلاحی"
                          >
                            <IconEdit size={15} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddPaymentModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CorrectionModal payment={corrFor} onClose={() => setCorrFor(null)} />
    </div>
  );
}

function AddPaymentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [rentalId, setRentalId] = useState<string | null>(null);
  const [kind, setKind] = useState<PaymentKind>("RENT");
  const defaultAccountId =
    db.settings.accounts.find((a) => a.kind === "POS" && a.active)?.id ??
    db.settings.accounts.find((a) => a.active)?.id ??
    "";
  const [accountId, setAccountId] = useState(() => defaultAccountId);
  const [payLines, setPayLines] = useState(() => makeSplit(defaultAccountId, 0));
  const [note, setNote] = useState("");

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.rentals
      .filter((r) => r.status !== "CANCELLED" && r.status !== "SETTLED")
      .filter((r) => {
        if (!s) return true;
        const c = db.customers.find((x) => x.id === r.customerId);
        return String(r.number).includes(s) || (c && c.name.toLowerCase().includes(s));
      })
      .slice(0, 6);
  }, [db, q]);

  const rental = rentalId ? db.rentals.find((r) => r.id === rentalId) : null;
  const remaining = rental ? Math.max(0, paymentService.remainingFor(db, rental)) : 0;

  function submit() {
    if (!rental) {
      toast.push("err", "اجاره را انتخاب کنید");
      return;
    }
    const lines = splitPayments(payLines);
    if (lines.length === 0) {
      toast.push("err", "مبلغ پرداخت را وارد کنید");
      return;
    }
    try {
      for (const l of lines) {
        paymentService.addPayment({
          rentalId: rental.id,
          kind,
          amount: l.amount,
          accountId: l.accountId,
          note,
        });
      }
      toast.push("ok", "پرداخت ثبت شد");
      onClose();
      setRentalId(null);
      setQ("");
      setPayLines(makeSplit(defaultAccountId, 0));
      setNote("");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "ثبت ناموفق بود");
    }
  }


  return (
    <Modal open={open} onClose={onClose} title="ثبت پرداخت" wide>
      {!rental ? (
        <>
          <div className="relative">
            <input className="inp ps-10" placeholder="جستجوی اجاره (شماره یا مشتری)…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-inkmute"><IconSearch size={16} /></span>
          </div>
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {candidates.length === 0 ? (
              <li className="p-4 text-center text-xs font-bold text-inkmute">اجاره‌ای پیدا نشد</li>
            ) : (
              candidates.map((r) => {
                const c = db.customers.find((x) => x.id === r.customerId);
                const rem = paymentService.remainingFor(db, r);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => {
                        setRentalId(r.id);
                        setPayLines(makeSplit(defaultAccountId, Math.max(0, rem)));
                      }}

                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-brandsoft/60"
                    >
                      <span className="num font-display text-sm text-inksoft">#{faNum(r.number)}</span>
                      <span className="flex-1 text-sm font-bold text-ink">{c?.name}</span>
                      <Badge tone={rem > 0 ? "warn" : "ok"}>{rem > 0 ? `مانده ${money(rem)}` : "بدون مانده"}</Badge>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2.5 text-sm">
            <span className="font-extrabold text-ink">
              اجاره #{faNum(rental.number)} — {db.customers.find((c) => c.id === rental.customerId)?.name}
            </span>
            <button onClick={() => setRentalId(null)} className="cursor-pointer text-xs font-bold text-branddeep hover:underline">تغییر</button>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-brandsoft/60 px-3 py-2">
            <span className="text-xs font-extrabold text-branddeep">قیمت کل اجاره</span>
            <span className="num font-display text-lg text-ink">{money(rental.total)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="lbl">نوع پرداخت</label>
              <select className="inp" value={kind} onChange={(e) => setKind(e.target.value as PaymentKind)}>
                <option value="RENT">اجاره / مانده</option>
              </select>
            </div>
            <div>
              <label className="lbl">یادداشت</label>
              <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <PaymentSplit
            lines={payLines}
            onChange={setPayLines}
            accounts={db.settings.accounts}
            label="مبلغ و روش پرداخت (ترکیبی)"
            hint="برای پرداخت ترکیبی، هر مبلغ را روی روش پرداخت خودش وارد کنید."
          />

          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <Badge tone="warn">مانده {money(remaining)}</Badge>
          </div>
          <Btn data-enter-submit className="w-full" onClick={submit}>
            <IconCash size={16} />
            ثبت پرداخت
          </Btn>
        </div>
      )}
    </Modal>
  );
}

function CorrectionModal({ payment, onClose }: { payment: Payment | null; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [accountId, setAccountId] = useState(() => db.settings.accounts.find((a) => a.active)?.id ?? "");

  function submit() {
    if (!payment || !payment.rentalId) return;
    try {
      paymentService.addPayment({
        rentalId: payment.rentalId,
        kind: "CORRECTION",
        amount: moneyValue(amount),
        accountId,
        note,
      });
      toast.push("ok", "سند اصلاحی ثبت شد — تاریخچه دست‌نخورده ماند");
      onClose();
      setAmount("");
      setNote("");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "اصلاح ناموفق بود");
    }
  }

  if (!payment) return null;
  const rental = db.rentals.find((r) => r.id === payment.rentalId);

  return (
    <Modal open onClose={onClose} title="اصلاح پرداخت">
      <div className="rounded-xl bg-warnsoft p-3 text-xs font-bold leading-6 text-[#8a5a00]">
        سند اصلی ({KIND_LABEL[payment.kind]} به مبلغ {money(payment.amount)}) حذف یا ویرایش نمی‌شود؛
        یک سند اصلاحیِ مجزا ثبت می‌شود و در تاریخچه قابل ردیابی است.
      </div>
      <p className="num mt-3 text-xs text-inksoft">
        اجاره #{rental ? faNum(rental.number) : "—"} — {fmtDateTime(payment.createdAt)}
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <label className="lbl">مبلغ اصلاحیه (منفی = کسر از حساب)</label>
          <MoneyInput allowNegative value={amount} onChange={setAmount} placeholder="مثلاً 50,000 یا -50,000" />
        </div>
        <div>
          <label className="lbl">حساب</label>
          <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {db.settings.accounts.filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="lbl">توضیح اصلاحیه * (الزامی)</label>
          <textarea className="inp min-h-[64px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: مبلغ اشتباه کشیده شد، مابه‌التفاوت برگشت داده شد" />
        </div>
        <Btn data-enter-submit className="w-full" variant="dark" onClick={submit}>
          <IconEdit size={15} />
          ثبت سند اصلاحی
        </Btn>
      </div>
    </Modal>
  );
}
