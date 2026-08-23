"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  MoreHorizontal,
  ExternalLink,
  FileText,
  MessageCircle,
  Archive,
  ArchiveRestore,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  BellRing,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { SendReminderDialog } from "./send-reminder-dialog";
import {
  archiveMemberAction,
  restoreMemberAction,
  deleteMemberAction,
  getMemberDependenciesAction,
  type MemberDependencies,
} from "@/lib/actions/member-lifecycle";
import { cn } from "@/lib/utils";

// Built on Base UI's Menu rather than an absolutely-positioned div. The
// hand-rolled version was clipped: every row lives inside the table's
// overflow-x-auto wrapper, and an absolute child of a scroll container is cut
// off at its edge, so the menu lost its lower half. Portalling the popup out of
// the table subtree fixes that at the root instead of fighting it with z-index,
// and brings keyboard navigation, typeahead, focus return and correct ARIA
// roles along with it.

const ITEM =
  "flex w-full cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-xs font-semibold text-foreground outline-none transition-colors data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50";

export function MemberRowActions({
  memberId,
  memberName,
  organizationId,
  phone,
  email,
  balance,
  currency,
  isArchived,
  canManage,
  locale,
}: {
  memberId: string;
  memberName: string;
  organizationId: string;
  phone: string | null;
  email: string | null;
  balance: number;
  currency: string;
  isArchived: boolean;
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deps, setDeps] = useState<MemberDependencies | null>(null);
  const [depsError, setDepsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const whatsappUrl = phone ? `https://wa.me/${phone.replace(/\D/g, "")}` : null;

  function openDelete() {
    setDeps(null);
    setDepsError(false);
    setDeleteOpen(true);
    // Opens into a loading state; the destructive button only appears once the
    // real counts return. Nothing is deletable on an assumption.
    startTransition(async () => {
      const res = await getMemberDependenciesAction(memberId);
      if (!res.ok) setDepsError(true);
      else setDeps(res.dependencies);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveMemberAction({ memberId, reason });
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّرت الأرشفة" : "Could not archive",
          description:
            res.error === "reason_required"
              ? isAr
                ? "اكتب سببًا لا يقل عن ٣ أحرف."
                : "Enter a reason of at least 3 characters."
              : isAr
                ? "قد لا تملك صلاحية إدارة الملاك."
                : "You may not have permission to manage owners.",
          type: "error",
        });
        return;
      }
      setArchiveOpen(false);
      setReason("");
      router.refresh();
      toast.add({ title: isAr ? "تمت أرشفة المالك" : "Owner archived", type: "success" });
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreMemberAction(memberId);
      if (!res.ok) {
        toast.add({ title: isAr ? "تعذّرت الاستعادة" : "Could not restore", type: "error" });
        return;
      }
      router.refresh();
      toast.add({ title: isAr ? "تمت استعادة المالك" : "Owner restored", type: "success" });
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteMemberAction(memberId);
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّر الحذف" : "Could not delete",
          description:
            res.error === "has_dependencies"
              ? isAr
                ? "ظهرت سجلات مرتبطة بهذا المالك. أرشفه بدل حذفه."
                : "Linked records appeared for this owner. Archive instead."
              : undefined,
          type: "error",
        });
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.add({ title: isAr ? "تم حذف المالك نهائيًا" : "Owner permanently deleted", type: "success" });
    });
  }

  const sum = (o: Record<string, number>) =>
    Object.values(o).reduce((a, b) => a + Math.max(b, 0), 0);

  const blockingTotal = deps ? sum(deps.blocking) : 0;
  // Scoped to what the sentence below it actually claims: ownership links and
  // the dues they strand. Phones and invitations are not that, and folding them
  // in made the warning fire for owners who own nothing at all.
  const ownershipAtRisk = deps
    ? Math.max(deps.destructive.ownerships, 0) + Math.max(deps.duesOnOwnedUnits, 0)
    : 0;
  const otherRecordsAtRisk = deps
    ? Math.max(deps.destructive.documents, 0) + Math.max(deps.destructive.onlineTransactions, 0)
    : 0;
  const harmlessTotal = deps ? sum(deps.harmless) : 0;

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={isAr ? `إجراءات ${memberName}` : `Actions for ${memberName}`}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
            <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <Menu.LinkItem
                render={<Link href={`/members/${memberId}`} locale={locale} />}
                className={ITEM}
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
                {isAr ? "عرض الملف الكامل" : "Open full profile"}
              </Menu.LinkItem>

              <Menu.LinkItem
                render={
                  <Link href={`/finance/reports/owner-statement?member=${memberId}`} locale={locale} />
                }
                className={ITEM}
              >
                <FileText className="size-3.5 text-indigo-500" />
                {isAr ? "كشف حساب المالك" : "Owner statement"}
              </Menu.LinkItem>

              {/* Disabled with its reason rather than hidden: a missing item
                  reads as "the product cannot do this", and sends staff
                  hunting for a feature that is simply unavailable here. */}
              {whatsappUrl ? (
                <Menu.LinkItem
                  render={<a href={whatsappUrl} target="_blank" rel="noopener noreferrer" />}
                  className={ITEM}
                >
                  <MessageCircle className="size-3.5 text-emerald-500" />
                  {isAr ? "مراسلة عبر واتساب" : "Message on WhatsApp"}
                </Menu.LinkItem>
              ) : (
                <Menu.Item disabled className={ITEM}>
                  <MessageCircle className="size-3.5" />
                  {isAr ? "واتساب — لا يوجد رقم" : "WhatsApp — no number"}
                </Menu.Item>
              )}

              <Menu.Item className={ITEM} onClick={() => setReminderOpen(true)}>
                <BellRing className="size-3.5 text-amber-500" />
                {isAr ? "تذكير بالسداد" : "Send payment reminder"}
              </Menu.Item>

              {canManage && (
                <>
                  <div role="separator" className="my-1 h-px bg-border" />

                  {isArchived ? (
                    <Menu.Item className={ITEM} disabled={isPending} onClick={handleRestore}>
                      <ArchiveRestore className="size-3.5 text-emerald-600" />
                      {isAr ? "استعادة من الأرشيف" : "Restore from archive"}
                    </Menu.Item>
                  ) : (
                    <Menu.Item className={ITEM} onClick={() => setArchiveOpen(true)}>
                      <Archive className="size-3.5 text-muted-foreground" />
                      {isAr ? "أرشفة المالك" : "Archive owner"}
                    </Menu.Item>
                  )}

                  <Menu.Item
                    className={cn(ITEM, "text-destructive data-highlighted:bg-destructive/10")}
                    onClick={openDelete}
                  >
                    <Trash2 className="size-3.5" />
                    {isAr ? "حذف نهائي…" : "Delete permanently…"}
                  </Menu.Item>
                </>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>

      {/* Driven by the menu item rather than owning a trigger inside the popup:
          a dialog trigger nested in a menu is not a menu item, and would drop
          out of keyboard navigation. */}
      <SendReminderDialog
        memberId={memberId}
        organizationId={organizationId}
        memberName={memberName}
        phone={phone}
        email={email}
        balance={balance}
        currency={currency}
        locale={locale}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
      />

      {/* ---------------------------------------------------------- archive */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>{isAr ? "أرشفة المالك" : "Archive owner"}</DialogTitle>
              <DialogDescription>{memberName}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-[11px] leading-relaxed text-muted-foreground">
              {isAr
                ? "سيختفي هذا المالك من القوائم والاختيارات، وتبقى كل مطالباته وسنداته وقيوده المحاسبية وكشوف حسابه كما هي دون أي تغيير. يمكنك استعادته في أي وقت."
                : "This owner disappears from lists and pickers. Every due, receipt, ledger entry and statement stays exactly as it is. You can restore them at any time."}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="archive-reason" className="text-xs font-semibold">
                {isAr ? "سبب الأرشفة" : "Reason for archiving"}
              </label>
              <Textarea
                id="archive-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={
                  isAr
                    ? "مثال: باع كل وحداته وانتهت علاقته بالكيان."
                    : "e.g. Sold all units; relationship ended."
                }
                className="text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {isAr
                  ? "يُسجَّل السبب في سجل التدقيق مع اسمك وتاريخ العملية."
                  : "The reason is recorded in the audit log with your name and the date."}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="button" disabled={isPending || reason.trim().length < 3} onClick={handleArchive}>
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
              {isAr ? "أرشفة" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------- delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>{isAr ? "حذف نهائي" : "Delete permanently"}</DialogTitle>
              <DialogDescription>{memberName}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {isPending && !deps && !depsError && (
              <div className="flex items-center justify-center gap-2.5 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {isAr ? "جارٍ فحص السجلات المرتبطة…" : "Checking linked records…"}
              </div>
            )}

            {depsError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-xs font-bold text-destructive">
                {isAr
                  ? "تعذّر فحص السجلات المرتبطة، ولن يُسمح بالحذف دون فحص ناجح."
                  : "The linked-record check failed, and deletion is not offered without one."}
              </div>
            )}

            {deps && deps.safeToDelete && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p className="text-[11px] leading-relaxed text-destructive">
                    {isAr
                      ? "هذا السجل لا يرتبط بأي وحدة أو مطالبة أو سند أو مستند، لذلك يمكن حذفه نهائيًا. الحذف لا يمكن التراجع عنه."
                      : "This record is linked to no unit, due, receipt or document, so it can be permanently removed. Deletion cannot be undone."}
                  </p>
                </div>
                {harmlessTotal > 0 && (
                  <ul className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-[11px]">
                    <li className="pb-1 font-semibold text-foreground">
                      {isAr ? "سيُحذف معه أيضًا:" : "Removed along with it:"}
                    </li>
                    {(
                      [
                        [isAr ? "أرقام هواتف" : "Phone numbers", deps.harmless.phones],
                        [isAr ? "دعوات بوابة" : "Portal invitations", deps.harmless.invitations],
                      ] as [string, number][]
                    )
                      .filter(([, n]) => n > 0)
                      .map(([label, n]) => (
                        <li key={label} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-bold tabular-nums text-foreground">{n}</span>
                        </li>
                      ))}
                  </ul>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {isAr
                    ? "إن كنت تريد الاحتفاظ به للسجل التاريخي، اختر الأرشفة بدلًا من الحذف."
                    : "If you want to keep it for the historical record, archive it instead."}
                </p>
              </div>
            )}

            {deps && !deps.safeToDelete && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      {isAr ? "لا يمكن حذف هذا المالك" : "This owner cannot be deleted"}
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                      {isAr
                        ? "له سجلات مرتبطة تجعل الحذف إما مرفوضًا من قاعدة البيانات أو مدمّرًا لبيانات محاسبية. الأرشفة هي الإجراء الصحيح هنا."
                        : "It has linked records that make deletion either impossible or destructive to accounting data. Archiving is the correct action here."}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-[11px]">
                  {(
                    [
                      [isAr ? "سندات سداد" : "Payments", deps.blocking.payments],
                      [isAr ? "شيكات" : "Cheques", deps.blocking.cheques],
                      [isAr ? "عقود إيجار" : "Leases", deps.blocking.leases],
                      [isAr ? "خطط تقسيط" : "Instalment plans", deps.blocking.plans],
                      [isAr ? "قرارات ضريبية" : "Tax decisions", deps.blocking.taxDecisions],
                      [isAr ? "روابط ملكية وحدات" : "Unit ownerships", deps.destructive.ownerships],
                      [isAr ? "مطالبات على وحداته" : "Dues on their units", deps.duesOnOwnedUnits],
                      [isAr ? "مستندات مرفوعة" : "Uploaded documents", deps.destructive.documents],
                      [isAr ? "محاولات دفع إلكتروني" : "Online payment attempts", deps.destructive.onlineTransactions],
                      [isAr ? "حساب بوابة مُفعّل" : "Active portal account", deps.hasPortalAccess ? 1 : 0],
                    ] as [string, number][]
                  )
                    .filter(([, n]) => n !== 0)
                    .map(([label, n]) => (
                      <li key={label} className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-bold tabular-nums text-foreground">
                          {n < 0 ? (isAr ? "تعذّر الفحص" : "check failed") : n}
                        </span>
                      </li>
                    ))}
                </ul>

                {blockingTotal > 0 && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {isAr
                      ? "السجلات المالية أعلاه جزء من الدفاتر ولا يجوز المساس بها."
                      : "The financial records above are part of the books and must not be touched."}
                  </p>
                )}
                {ownershipAtRisk > 0 && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {isAr
                      ? "وحذفه كان سيمحو روابط ملكيته بصمت، فتبقى مطالباته قائمة في الدفاتر بلا مالك."
                      : "Deleting would silently remove the ownership links, leaving their dues in the books with no owner attached."}
                  </p>
                )}
                {otherRecordsAtRisk > 0 && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {isAr
                      ? "كما أن مستنداته ومحاولات الدفع تُمحى معه، وتبقى ملفاته المرفوعة في التخزين بلا مرجع."
                      : "Their documents and payment attempts would go with them, leaving the uploaded files in storage with nothing referencing them."}
                  </p>
                )}
                {deps.hasPortalAccess && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {isAr
                      ? "ولهذا المالك حساب بوابة مُفعّل — أرشفته تبقي الحساب مرتبطًا وقابلًا للاستعادة."
                      : "This owner also has a live portal account; archiving keeps it linked and restorable."}
                  </p>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            {deps && !deps.safeToDelete && !deps.isArchived && (
              <Button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setArchiveOpen(true);
                }}
              >
                <Archive className="size-3.5" />
                {isAr ? "أرشفة بدلًا من ذلك" : "Archive instead"}
              </Button>
            )}
            {deps?.safeToDelete && (
              <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                {isAr ? "حذف نهائيًا" : "Delete permanently"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
