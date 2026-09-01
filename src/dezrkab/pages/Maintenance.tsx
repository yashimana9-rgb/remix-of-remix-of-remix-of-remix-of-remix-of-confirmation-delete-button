// @ts-nocheck
import { useState } from "react";
import { maintenanceService } from "../services/maintenanceService";
import { useDB } from "../storage/storage";
import { faNum, fmtDateTime, money } from "../utils/format";
import { Badge, Btn, Empty, useToast } from "../ui/kit";
import { MoneyInput, moneyValue } from "../ui/money";
import { IconCheck, IconClock, IconWrench } from "../ui/icons";
import { useNow } from "../state/app";

export default function Maintenance() {
  const db = useDB();
  const toast = useToast();
  const now = useNow(30_000);

  const [bikeId, setBikeId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [costs, setCosts] = useState<Record<string, string>>({});

  const freeBikes = db.bikes.filter((b) => b.status === "AVAILABLE");
  const open = db.maintenances.filter((m) => m.status === "OPEN");
  const done = db.maintenances.filter((m) => m.status === "DONE").slice(0, 12);

  const catName = (id: string) => db.categories.find((c) => c.id === id)?.name ?? "—";

  function start() {
    try {
      const rec = maintenanceService.start(bikeId, reason, note);
      toast.push("ok", `${rec.serial} به تعمیرات رفت — از موجودی قابل‌اجاره کم شد`);
      setBikeId("");
      setReason("");
      setNote("");
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "شروع تعمیر ناموفق بود");
    }
  }

  function finish(id: string) {
    try {
      const rec = maintenanceService.finish(id, moneyValue(costs[id] ?? "0"));
      toast.push("ok", `${rec.serial} به سرویس برگشت — موجودی به‌روزرسانی شد`);
    } catch (e) {
      toast.push("err", e instanceof Error ? e.message : "پایان تعمیر ناموفق بود");
    }
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-12">
      <div className="space-y-4 xl:col-span-5">
        <section className="anim-up card p-4">
          <h2 className="flex items-center gap-2 font-display text-lg text-ink">
            <IconWrench size={19} className="text-branddeep" />
            شروع تعمیرات
          </h2>
          <p className="mt-1 text-[11px] text-inkmute">
            دوچرخه در تعمیر از موجودی قابل‌اجاره خارج می‌شود و پس از پایان، خودکار برمی‌گردد
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <label className="lbl">دوچرخه آزاد</label>
              <select className="inp" value={bikeId} onChange={(e) => setBikeId(e.target.value)}>
                <option value="">انتخاب کنید…</option>
                {freeBikes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.serial} — {catName(b.categoryId)}
                  </option>
                ))}
              </select>
              {freeBikes.length === 0 && (
                <p className="mt-1 text-[11px] font-bold text-warn">دوچرخه آزادی برای تعمیر نیست</p>
              )}
            </div>
            <div>
              <label className="lbl">دلیل تعمیر *</label>
              <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: پنچری، تنظیم ترمز، سرویس زنجیر" />
            </div>
            <div>
              <label className="lbl">یادداشت</label>
              <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Btn className="w-full" onClick={start} disabled={!bikeId}>
              <IconWrench size={15} />
              شروع تعمیر
            </Btn>
          </div>
        </section>

        <section className="anim-up card overflow-hidden" style={{ animationDelay: "60ms" }}>
          <div className="border-b border-line px-4 py-3">
            <h3 className="font-display text-base text-ink">در صف تعمیر ({faNum(open.length)})</h3>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto p-3">
            {open.length === 0 ? (
              <Empty icon={<IconCheck size={26} />} text="تعمیر بازی نیست" sub="ناوگان آماده رکاب است" />
            ) : (
              open.map((m) => {
                const hours = Math.max(1, Math.round((now - m.startedAt) / 3_600_000));
                return (
                  <div key={m.id} className="rounded-xl border border-warn/40 bg-warnsoft/50 p-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 place-items-center rounded-lg bg-coal font-display text-xs text-white">{m.serial}</span>
                      <div className="flex-1">
                        <p className="text-xs font-extrabold text-ink">{m.reason}</p>
                        <p className="num mt-0.5 flex items-center gap-1 text-[11px] text-inksoft">
                          <IconClock size={11} />
                          {fmtDateTime(m.startedAt)} — {faNum(hours)} ساعت پیش
                        </p>
                      </div>
                      <Badge tone="warn">{catName(m.categoryId)}</Badge>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <MoneyInput
                        className="flex-1"
                        placeholder="هزینه تعمیر (تومان)"
                        value={costs[m.id] ?? ""}
                        onChange={(v) => setCosts((c) => ({ ...c, [m.id]: v }))}
                      />
                      <Btn variant="ok" size="sm" onClick={() => finish(m.id)}>
                        <IconCheck size={14} />
                        بازگشت به سرویس
                      </Btn>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="anim-up xl:col-span-7 card overflow-hidden" style={{ animationDelay: "100ms" }}>
        <div className="border-b border-line px-4 py-3">
          <h3 className="font-display text-base text-ink">تاریخچه تعمیرات</h3>
        </div>
        {done.length === 0 ? (
          <Empty icon={<IconWrench size={26} />} text="تاریخچه‌ای ثبت نشده" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] font-bold text-inkmute">
                <th className="px-4 py-2.5 text-start">دوچرخه</th>
                <th className="px-4 py-2.5 text-start">دلیل</th>
                <th className="px-4 py-2.5 text-start">شروع</th>
                <th className="px-4 py-2.5 text-start">پایان</th>
                <th className="px-4 py-2.5 text-start">هزینه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {done.map((m) => (
                <tr key={m.id} className="transition-colors hover:bg-black/[0.02]">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-lg bg-coal font-display text-[11px] text-white">{m.serial}</span>
                      <span className="text-[11px] text-inkmute">{catName(m.categoryId)}</span>
                    </span>
                  </td>
                  <td className="max-w-44 truncate px-4 py-2.5 text-xs font-bold text-ink">{m.reason}</td>
                  <td className="num px-4 py-2.5 text-xs text-inksoft">{fmtDateTime(m.startedAt)}</td>
                  <td className="num px-4 py-2.5 text-xs text-inksoft">{m.endedAt ? fmtDateTime(m.endedAt) : "—"}</td>
                  <td className="num px-4 py-2.5 text-xs font-bold text-ink">{m.cost > 0 ? money(m.cost) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
