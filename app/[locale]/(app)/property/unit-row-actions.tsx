"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "@base-ui/react/menu";
import {
  MoreHorizontal,
  ExternalLink,
  UserRound,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
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
import {
  archiveUnitAction,
  restoreUnitAction,
  deleteUnitAction,
  getUnitDependenciesAction,
  type UnitDependencies,
} from "@/lib/actions/unit-lifecycle";
import { EditUnitDialog } from "./edit-unit-dialog";
import { cn } from "@/lib/utils";

// The unit equivalent of MemberRowActions, and built the same way: a Base UI
// Menu portalled out of the table, so the popup is not clipped by the table's
// own overflow container and arrives with keyboard navigation and menu
// semantics rather than a stack of unlabelled icon buttons.

const ITEM =
  "flex w-full cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-xs font-semibold text-foreground outline-none transition-colors data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50";

export function UnitRowActions({
  unitId,
  unitCode,
  ownerId,
  isArchived,
  canManage,
  locale,
}: {
  unitId: string;
  unitCode: string;
  ownerId: string | null;
  isArchived: boolean;
  canManage: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [deps, setDeps] = useState<UnitDependencies | null>(null);
  const [depsError, setDepsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openDelete() {
    setDeps(null);
    setDepsError(false);
    setDeleteOpen(true);
    startTransition(async () => {
      const res = await getUnitDependenciesAction(unitId);
      if (!res.ok) setDepsError(true);
      else setDeps(res.dependencies);
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archiveUnitAction({ unitId, reason });
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّرت الأرشفة" : "Could not archive",
          description:
            res.error === "reason_required"
              ? isAr
                ? "اكتب سببًا لا يقل عن ٣ أحرف."
                : "Enter a reason of at least 3 characters."
              : res.error === "has_active_ownership"
                ? isAr
                  ? "لا يمكن أرشفة وحدة عليها ملكية نشطة — أنهِ الملكية أولًا."
                  : "A unit with an active ownership cannot be archived — end the ownership first."
                : res.error === "has_open_dues"
                  ? isAr
                    ? "لا يمكن أرشفة وحدة عليها مستحقات مفتوحة غير مسددة."
                    : "A unit with unsettled open dues cannot be archived."
                  : isAr
                    ? "قد لا تملك صلاحية إدارة الوحدات."
                    : "You may not have permission to manage units.",
          type: "error",
        });
        return;
      }
      setArchiveOpen(false);
      setReason("");
      router.refresh();
      toast.add({ title: isAr ? "تمت أرشفة الوحدة" : "Unit archived", type: "success" });
    });
  }

  function handleRestore() {
    startTransition(async () => {
      const res = await restoreUnitAction(unitId);
      if (!res.ok) {
        toast.add({ title: isAr ? "تعذّرت الاستعادة" : "Could not restore", type: "error" });
        return;
      }
      router.refresh();
      toast.add({ title: isAr ? "تمت استعادة الوحدة" : "Unit restored", type: "success" });
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteUnitAction(unitId);
      if (!res.ok) {
        toast.add({
          title: isAr ? "تعذّر الحذف" : "Could not delete",
          description:
            res.error === "has_dependencies"
              ? isAr
                ? "ظهرت سجلات مرتبطة بهذه الوحدة. أرشفها بدل حذفها."
                : "Linked records appeared for this unit. Archive it instead."
              : undefined,
          type: "error",
        });
        return;
      }
      setDeleteOpen(false);
      router.refresh();
      toast.add({ title: isAr ? "تم حذف الوحدة نهائيًا" : "Unit permanently deleted", type: "success" });
    });
  }

  const rows: [string, number][] = deps
    ? [
        [isAr ? "مطالبات مالية" : "Dues", deps.blocking.dues],
        [isAr ? "سندات سداد" : "Payments", deps.blocking.payments],
        [isAr ? "روابط ملكية" : "Ownership links", deps.destructive.ownerships],
        [isAr ? "عقود إيجار" : "Leases", deps.destructive.leases],
        [isAr ? "خطط تقسيط" : "Instalment plans", deps.destructive.installmentPlans],
        [isAr ? "محاضر تسليم" : "Handovers", deps.destructive.handovers],
        [isAr ? "توزيعات مصاريف خدمة" : "Service-charge allocations", deps.destructive.serviceCharges],
        [isAr ? "عمولات مرتبطة" : "Linked commissions", deps.detaching.commissions],
      ]
    : [];

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={isAr ? `إجراءات الوحدة ${unitCode}` : `Actions for unit ${unitCode}`}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
            <Menu.Popup className="min-w-56 origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <Menu.LinkItem
                render={<Link href={`/property/${unitId}`} locale={locale} />}
                className={ITEM}
              >
                <ExternalLink className="size-3.5 text-muted-foreground" />
                {isAr ? "عرض ملف الوحدة" : "Open unit profile"}
              </Menu.LinkItem>

              {ownerId ? (
                <Menu.LinkItem
                  render={<Link href={`/members/${ownerId}`} locale={locale} />}
                  className={ITEM}
                >
                  <UserRound className="size-3.5 text-indigo-500" />
                  {isAr ? "عرض ملف المالك" : "Open owner profile"}
                </Menu.LinkItem>
              ) : (
                <Menu.Item disabled className={ITEM}>
                  <UserRound className="size-3.5" />
                  {isAr ? "لا يوجد مالك مرتبط" : "No owner linked"}
                </Menu.Item>
              )}

              {canManage && (
                <>
                  <div role="separator" className="my-1 h-px bg-border" />

                  <Menu.Item className={ITEM} onClick={() => setEditOpen(true)}>
                    <Pencil className="size-3.5 text-muted-foreground" />
                    {isAr ? "تعديل بيانات الوحدة" : "Edit unit details"}
                  </Menu.Item>

                  {isArchived ? (
                    <Menu.Item className={ITEM} disabled={isPending} onClick={handleRestore}>
                      <ArchiveRestore className="size-3.5 text-emerald-600" />
                      {isAr ? "استعادة من الأرشيف" : "Restore from archive"}
                    </Menu.Item>
                  ) : (
                    <Menu.Item className={ITEM} onClick={() => setArchiveOpen(true)}>
                      <Archive className="size-3.5 text-muted-foreground" />
                      {isAr ? "أرشفة الوحدة" : "Archive unit"}
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

      <EditUnitDialog
        unitId={unitId}
        unitCode={unitCode}
        locale={locale}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      {/* ---------------------------------------------------------- archive */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <div>
              <DialogTitle>{isAr ? "أرشفة الوحدة" : "Archive unit"}</DialogTitle>
              <DialogDescription>{unitCode}</DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-[11px] leading-relaxed text-muted-foreground">
              {isAr
                ? "ستختفي هذه الوحدة من القوائم والاختيارات، وتبقى كل مطالباتها وسنداتها وعقودها وقيودها المحاسبية كما هي. يمكنك استعادتها في أي وقت."
                : "This unit disappears from lists and pickers. Every due, receipt, contract and ledger entry stays exactly as it is. You can restore it at any time."}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="unit-archive-reason" className="text-xs font-semibold">
                {isAr ? "سبب الأرشفة" : "Reason for archiving"}
              </label>
              <Textarea
                id="unit-archive-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={isAr ? "مثال: تم دمجها مع وحدة مجاورة." : "e.g. Merged into the adjacent unit."}
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
              <DialogDescription>{unitCode}</DialogDescription>
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
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-[11px] leading-relaxed text-destructive">
                  {isAr
                    ? "هذه الوحدة لا ترتبط بأي مطالبة أو سند أو عقد أو مالك، لذلك يمكن حذفها نهائيًا. الحذف لا يمكن التراجع عنه."
                    : "This unit is linked to no due, receipt, contract or owner, so it can be permanently removed. Deletion cannot be undone."}
                </p>
              </div>
            )}

            {deps && !deps.safeToDelete && (
              <div className="space-y-3">
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3.5">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      {isAr ? "لا يمكن حذف هذه الوحدة" : "This unit cannot be deleted"}
                    </p>
                    <p className="text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                      {isAr
                        ? "لها سجلات مرتبطة تجعل الحذف إما مرفوضًا من قاعدة البيانات أو مدمّرًا لعقود وبيانات محاسبية. الأرشفة هي الإجراء الصحيح هنا."
                        : "It has linked records that make deletion either impossible or destructive to contracts and accounting data. Archiving is the correct action here."}
                    </p>
                  </div>
                </div>

                <ul className="space-y-1 rounded-xl border border-border bg-muted/40 p-3 text-[11px]">
                  {rows
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

                {(deps.destructive.leases > 0 || deps.destructive.installmentPlans > 0) && (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {isAr
                      ? "عقود الإيجار وخطط التقسيط اتفاقات مع أشخاص، وحذف الوحدة كان سيمحوها بصمت."
                      : "Leases and instalment plans are agreements with people, and deleting the unit would erase them silently."}
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
