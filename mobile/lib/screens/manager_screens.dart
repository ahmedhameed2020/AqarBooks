import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'feature_screens.dart';
import 'resident_screens.dart'
    show duesProvider, priorityLabel;
import 'technician_screens.dart' show WorkOrderDetailScreen;

final managerAttentionProvider =
    FutureProvider.autoDispose<ManagerAttention>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  return ref
      .watch(repositoryProvider)
      .managerAttention(session?.organizationId);
});
final assignQueueProvider =
    FutureProvider.autoDispose<List<MaintenanceItem>>(
  (ref) => ref.watch(repositoryProvider).assignQueue(),
);

// ───────────────────────── 07 · Manager home ─────────────────────────

class ManagerHomeScreen extends ConsumerWidget {
  final AppSession session;
  const ManagerHomeScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final attention = ref.watch(managerAttentionProvider);
    final userName = session.user.email?.split('@').first ?? '';
    return Column(
      children: [
        HomeHeader(
          title: t.ar ? 'مرحبًا، $userName' : 'Welcome, $userName',
          subtitle: session.contextLabel(locale),
          onBell: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationsScreen()),
          ),
        ),
        Expanded(
          child: attention.when(
            data: (data) => RefreshIndicator(
              onRefresh: () async => ref.invalidate(managerAttentionProvider),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                children: [
                  // 4-number strip — every tile answers one question.
                  Row(
                    children: [
                      Expanded(
                        child: _stat(
                          formatMoney(data.todayCollections, locale),
                          t.ar ? 'تحصيلات اليوم' : "Today's collections",
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _stat(
                          formatMoney(data.totalOverdue, locale),
                          t.ar ? 'إجمالي المتأخرات' : 'Total overdue',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _stat(
                          formatNumber(data.openMaintenance, locale),
                          t.ar
                              ? 'طلبات صيانة مفتوحة'
                              : 'Open maintenance',
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _stat(
                          formatNumber(data.visitorsInside, locale),
                          t.ar
                              ? 'الزوار الموجودون الآن'
                              : 'Visitors inside now',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Text(
                        t.ar ? 'يحتاج انتباهك' : 'Needs your attention',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: appInk,
                        ),
                      ),
                      const SizedBox(width: 8),
                      if (data.items.isNotEmpty)
                        StatusChip(
                          formatNumber(data.items.length, locale),
                          fg: appDanger,
                          bg: appDangerBg,
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (data.items.isEmpty)
                    EmptyState(
                      title: t.ar
                          ? 'لا يوجد ما يحتاج انتباهك اليوم ✓'
                          : 'Nothing needs your attention today ✓',
                      icon: Icons.check_circle_outline,
                    )
                  else
                    for (final item in data.items) ...[
                      _attentionRow(context, item, locale, t),
                      const SizedBox(height: 10),
                    ],
                ],
              ),
            ),
            loading: () => const SkeletonList(rows: 5),
            error: (e, _) => AppError(
              message: friendlyError(e, locale),
              onRetry: () => ref.invalidate(managerAttentionProvider),
            ),
          ),
        ),
      ],
    );
  }

  Widget _stat(String value, String label) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: appCardBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: appNavy,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: appGrey),
            ),
          ],
        ),
      );

  Widget _attentionRow(
    BuildContext context,
    AttentionItem item,
    Locale locale,
    AppLabels t,
  ) {
    final (icon, fg, bg, title, sub) = switch (item.kind) {
      AttentionKind.overdue => (
          AqarIconType.cash,
          appDanger,
          appDangerBg,
          t.ar
              ? 'متأخرات كبيرة — ${item.title}'
              : 'Large overdue — ${item.title}',
          '${formatMoney(item.amount ?? 0, locale)} · ${t.ar ? 'استحق' : 'was due'} ${formatDate(item.date, locale)}',
        ),
      AttentionKind.cheque => (
          AqarIconType.cheque,
          appAmber,
          appAmberBg,
          t.ar
              ? (item.title == 'DEPOSITED'
                  ? 'شيك مودع يحتاج متابعة'
                  : 'شيك مستلم يحتاج متابعة')
              : (item.title == 'DEPOSITED'
                  ? 'Deposited cheque needs follow-up'
                  : 'Received cheque needs follow-up'),
          '${formatMoney(item.amount ?? 0, locale)} · ${formatDate(item.date, locale)}',
        ),
      AttentionKind.slaBreach => (
          AqarIconType.warning,
          appDanger,
          appDangerBg,
          t.ar
              ? 'أمر شغل تجاوز SLA — ${localizedDigits(item.title, locale)}'
              : 'Work order breached SLA — ${item.title}',
          '${t.ar ? 'المهلة' : 'Due'} ${formatDate(item.date, locale)}',
        ),
      AttentionKind.leaseEnding => (
          AqarIconType.document,
          appNavy,
          appSurface,
          t.ar
              ? 'عقد ينتهي قريبًا — وحدة ${item.title}'
              : 'Lease ending soon — unit ${item.title}',
          '${t.ar ? 'ينتهي' : 'Ends'} ${formatDate(item.date, locale, relative: false)}',
        ),
      AttentionKind.gateException => (
          AqarIconType.gate,
          appPurple,
          appPurpleLight,
          t.ar
              ? 'استثناء بوابة بانتظار الاعتماد'
              : 'Gate exception awaiting approval',
          relativeFrom(item.date, locale),
        ),
    };
    return ListRowCard(
      icon: icon,
      iconFg: fg,
      iconBg: bg,
      title: title,
      subtitle: sub,
      onTap: item.kind == AttentionKind.slaBreach && item.refId != null
          ? () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WorkOrderDetailScreen(id: item.refId!),
                ),
              )
          : null,
    );
  }
}

// ───────────────────────── Collections tab (overdue → act) ─────────────────

class ManagerCollectionsScreen extends ConsumerWidget {
  const ManagerCollectionsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final dues = ref.watch(duesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            t.collections,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Expanded(
          child: dues.when(
            data: (items) {
              final overdue = items
                  .where((d) =>
                      d.outstanding > 0 && overdueDays(d.dueDate) > 0)
                  .toList()
                ..sort((a, b) => b.outstanding.compareTo(a.outstanding));
              if (overdue.isEmpty) {
                return EmptyState(
                  title: t.ar
                      ? 'لا توجد متأخرات حاليًا ✓'
                      : 'No overdue balances ✓',
                  icon: Icons.check_circle_outline,
                );
              }
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(duesProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(20),
                  itemCount: overdue.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final d = overdue[i];
                    return ListRowCard(
                      icon: AqarIconType.cash,
                      iconFg: appDanger,
                      iconBg: appDangerBg,
                      title:
                          '${d.unitCode ?? '—'} · ${formatMoney(d.outstanding, locale)}',
                      subtitle:
                          '${d.description} · ${t.ar ? 'متأخر' : 'overdue'} ${formatNumber(overdueDays(d.dueDate), locale)} ${t.ar ? 'يومًا' : 'days'}',
                      trailing: StatusChip(t.overdue,
                          fg: appDanger, bg: appDangerBg),
                    );
                  },
                ),
              );
            },
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale),
              onRetry: () => ref.invalidate(duesProvider),
            ),
          ),
        ),
      ],
    );
  }
}

// ───────────────────────── 08 · Maintenance + assign sheet ─────────────────

class ManagerMaintenanceScreen extends ConsumerStatefulWidget {
  const ManagerMaintenanceScreen({super.key});
  @override
  ConsumerState<ManagerMaintenanceScreen> createState() =>
      _ManagerMaintenanceState();
}

class _ManagerMaintenanceState
    extends ConsumerState<ManagerMaintenanceScreen> {
  int filter = 0; // 0 = awaiting assignment, 1 = critical, 2 = all
  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final queue = ref.watch(assignQueueProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            t.maintenance,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        SizedBox(
          height: 42,
          child: queue.maybeWhen(
            data: (items) {
              final critical = items
                  .where((m) =>
                      m.priority == 'HIGH' || m.priority == 'URGENT')
                  .length;
              return ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  _filterChip(
                    '${t.ar ? 'بانتظار الإسناد' : 'Awaiting assignment'} · ${formatNumber(items.length, locale)}',
                    0,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(
                    '${t.ar ? 'حرِج' : 'Critical'} · ${formatNumber(critical, locale)}',
                    1,
                  ),
                  const SizedBox(width: 8),
                  _filterChip(t.ar ? 'الكل' : 'All', 2),
                ],
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
        ),
        const SizedBox(height: 8),
        Expanded(
          child: queue.when(
            data: (items) {
              final filtered = switch (filter) {
                1 => items
                    .where((m) =>
                        m.priority == 'HIGH' || m.priority == 'URGENT')
                    .toList(),
                _ => items,
              };
              if (filtered.isEmpty) {
                return EmptyState(
                  title: t.ar
                      ? 'لا توجد طلبات صيانة بانتظار الإسناد'
                      : 'No requests awaiting assignment',
                  icon: Icons.build_outlined,
                );
              }
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(assignQueueProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) =>
                      _requestCard(context, filtered[i], locale, t),
                ),
              );
            },
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale),
              onRetry: () => ref.invalidate(assignQueueProvider),
            ),
          ),
        ),
      ],
    );
  }

  Widget _filterChip(String label, int value) {
    final selected = filter == value;
    return GestureDetector(
      onTap: () => setState(() => filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? appNavy : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: selected ? appNavy : appCardBorder),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            color: selected ? Colors.white : appGrey,
          ),
        ),
      ),
    );
  }

  Widget _requestCard(
    BuildContext context,
    MaintenanceItem m,
    Locale locale,
    AppLabels t,
  ) {
    final (pfg, pbg) = switch (m.priority) {
      'URGENT' || 'HIGH' => (appDanger, appDangerBg),
      'NORMAL' => (appGrey, const Color(0xFFEEF1F5)),
      _ => (appAmber, appAmberBg),
    };
    return AqarCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${m.title} — ${m.unitCode}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: appInk,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${localizedDigits(m.requestNo, locale)} · ${relativeFrom(m.submittedAt, locale)}',
                      style: const TextStyle(fontSize: 11, color: appGrey),
                    ),
                  ],
                ),
              ),
              StatusChip(priorityLabel(m.priority, t.ar), fg: pfg, bg: pbg),
            ],
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: appNavy, width: 1.1),
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(9)),
            ),
            onPressed: () => showAssignSheet(context, ref, m),
            child: Text(
              t.ar ? 'إسناد' : 'Assign',
              style: const TextStyle(
                color: appNavy,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 08 — bottom sheet: pick a technician/supplier, schedule, assign.
Future<void> showAssignSheet(
  BuildContext context,
  WidgetRef ref,
  MaintenanceItem request,
) async {
  final locale = Localizations.localeOf(context);
  final t = AppLabels(locale);
  final repo = ref.read(repositoryProvider);

  // The request must carry a work order to assign; find or explain.
  Map<String, dynamic>? workOrder;
  try {
    final detail = await repo.maintenanceDetail(request.id);
    for (final order in detail.workOrders) {
      if (!{'COMPLETED', 'CANCELLED'}.contains(order['status'])) {
        workOrder = order;
        break;
      }
    }
  } catch (_) {}
  if (!context.mounted) return;
  if (workOrder == null) {
    showFeedback(
        context,
        t.ar
            ? 'أنشئ أمر الشغل من الويب أولًا ثم أسنده من هنا'
            : 'Create the work order on the web first, then assign it here');
    return;
  }
  final workOrderId = workOrder['id'] as String;

  // Assignable staff (best effort — falls back to suppliers only).
  final options = <(String id, String name, String sub, bool isSupplier)>[];
  try {
    final client = repo.db;
    final staff = await client
        .from('profiles')
        .select('id, full_name')
        .limit(10);
    for (final s in staff) {
      final name = s['full_name'] as String?;
      if (name != null && name.trim().isNotEmpty) {
        options.add((
          s['id'] as String,
          name,
          t.ar ? 'فني' : 'Technician',
          false,
        ));
      }
    }
  } catch (_) {}
  try {
    final client = repo.db;
    final suppliers = await client
        .from('suppliers')
        .select('id, name')
        .limit(5);
    for (final s in suppliers) {
      options.add((
        s['id'] as String,
        s['name'] as String? ?? '—',
        t.ar ? 'مورد خارجي' : 'External supplier',
        true,
      ));
    }
  } catch (_) {}
  if (!context.mounted) return;

  String? selectedId = options.isNotEmpty ? options.first.$1 : null;
  bool selectedSupplier =
      options.isNotEmpty ? options.first.$4 : false;
  DateTime scheduledAt = DateTime.now().add(const Duration(hours: 2));

  final confirmed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setSheet) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 14, 20, 20 + MediaQuery.viewInsetsOf(sheet).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: appCardBorder,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              t.ar ? 'إسناد أمر شغل' : 'Assign work order',
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: appSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${request.title} — ${request.unitCode}',
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600),
                    ),
                  ),
                  StatusChip(
                    priorityLabel(request.priority, t.ar),
                    fg: request.priority == 'HIGH' ||
                            request.priority == 'URGENT'
                        ? appDanger
                        : appGrey,
                    bg: request.priority == 'HIGH' ||
                            request.priority == 'URGENT'
                        ? appDangerBg
                        : const Color(0xFFEEF1F5),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              t.ar ? 'اختر الفني أو المورد' : 'Pick a technician or supplier',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: appGrey,
              ),
            ),
            const SizedBox(height: 8),
            if (options.isEmpty)
              Text(
                t.ar
                    ? 'لا توجد قائمة فنيين متاحة لهذا الحساب'
                    : 'No assignable staff visible to this account',
                style: const TextStyle(fontSize: 12, color: appGrey),
              )
            else
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240),
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (final option in options)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          onTap: () => setSheet(() {
                            selectedId = option.$1;
                            selectedSupplier = option.$4;
                          }),
                          borderRadius: BorderRadius.circular(12),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 11),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: selectedId == option.$1
                                    ? appNavy
                                    : appCardBorder,
                                width: selectedId == option.$1 ? 1.4 : 1,
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 18,
                                  height: 18,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: selectedId == option.$1
                                        ? appNavy
                                        : Colors.white,
                                    border: Border.all(
                                      color: selectedId == option.$1
                                          ? appNavy
                                          : appGrey,
                                      width: 1.6,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        option.$2,
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        option.$3,
                                        style: const TextStyle(
                                            fontSize: 11, color: appGrey),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 4),
            InkWell(
              onTap: () async {
                final picked = await showDatePicker(
                  context: sheet,
                  initialDate: scheduledAt,
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 60)),
                );
                if (picked != null) {
                  setSheet(() => scheduledAt = DateTime(
                      picked.year, picked.month, picked.day, 15));
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: appCardBorder),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${t.ar ? 'الموعد' : 'Schedule'}: ${formatDate(scheduledAt.toIso8601String(), locale)} ${formatTime(scheduledAt.toIso8601String(), locale)}',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w500),
                      ),
                    ),
                    const AqarIcon(AqarIconType.calendar, size: 18),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            AqarButton(
              t.ar ? 'إسناد أمر الشغل' : 'Assign work order',
              onPressed:
                  selectedId == null ? null : () => Navigator.pop(sheet, true),
            ),
          ],
        ),
      ),
    ),
  );
  if (confirmed != true || !context.mounted) return;
  try {
    await repo.assignWorkOrder(
      workOrderId: workOrderId,
      assignedUserId: selectedSupplier ? null : selectedId,
      supplierId: selectedSupplier ? selectedId : null,
    );
    try {
      await repo.scheduleWorkOrder(
        workOrderId: workOrderId,
        start: scheduledAt,
        end: scheduledAt.add(const Duration(hours: 2)),
      );
    } catch (_) {}
    ref.invalidate(assignQueueProvider);
    if (context.mounted) {
      showFeedback(
          context, t.ar ? 'أُسند أمر الشغل ✓' : 'Work order assigned ✓');
    }
  } catch (e) {
    if (context.mounted) showFeedback(context, friendlyError(e, locale));
  }
}

// ───────────────────────── Operations tab ─────────────────────────

final gateVisitorsNowProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  final orgId = session?.organizationId;
  if (orgId == null) return const [];
  try {
    return await ref.watch(repositoryProvider).gateCurrentVisitors(orgId);
  } catch (_) {
    return const [];
  }
});

class ManagerOperationsScreen extends ConsumerWidget {
  const ManagerOperationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final visitors = ref.watch(gateVisitorsNowProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            t.operations,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(gateVisitorsNowProvider),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                SectionTitle(
                    title: t.ar ? 'الزوار الموجودون الآن' : 'Visitors inside now'),
                visitors.when(
                  data: (items) => items.isEmpty
                      ? EmptyState(
                          title: t.ar
                              ? 'لا يوجد زوار داخل المشروع حاليًا'
                              : 'No visitors inside right now',
                          icon: Icons.people_outline,
                        )
                      : Column(
                          children: [
                            for (final v in items) ...[
                              ListRowCard(
                                icon: AqarIconType.inside,
                                iconFg: appSuccess,
                                iconBg: appSuccessBg,
                                title: '${v['guest_name'] ?? '—'}',
                                subtitle:
                                    '${v['unit_code'] ?? ''} · ${relativeFrom(v['entered_at'] as String?, locale)}',
                              ),
                              const SizedBox(height: 10),
                            ],
                          ],
                        ),
                  loading: () => const SkeletonList(rows: 2),
                  error: (e, _) => const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
