import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'resident_screens.dart' show workOrderStatusLabel;

final workOrdersProvider = FutureProvider.autoDispose<List<WorkOrderItem>>(
  (ref) => ref.watch(repositoryProvider).workOrders(),
);
final historyWorkOrdersProvider =
    FutureProvider.autoDispose<List<WorkOrderItem>>(
  (ref) => ref.watch(repositoryProvider).workOrderHistory(),
);

bool _slaBreached(WorkOrderItem w) {
  final due = parseServerDate(w.dueAt);
  return due != null && due.isBefore(DateTime.now());
}

List<WorkOrderItem> orderedTasks(List<WorkOrderItem> items) {
  // Blueprint §5: SLA-breached first, then by SLA due, then oldest.
  final sorted = [...items];
  sorted.sort((a, b) {
    final ba = _slaBreached(a), bb = _slaBreached(b);
    if (ba != bb) return ba ? -1 : 1;
    final da = a.dueAt ?? '9999', db2 = b.dueAt ?? '9999';
    return da.compareTo(db2);
  });
  return sorted;
}

// ───────────────────────── 12 · Technician today ─────────────────────────

class TechnicianTodayScreen extends ConsumerWidget {
  final AppSession session;
  const TechnicianTodayScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final orders = ref.watch(workOrdersProvider);
    final userName = session.user.email?.split('@').first ?? '';
    return Column(
      children: [
        orders.maybeWhen(
          data: (items) {
            final remaining = items
                .where((w) => !isHistoryWorkOrderStatus(w.status))
                .length;
            return HomeHeader(
              title: t.today,
              subtitle:
                  '$userName · ${t.ar ? 'فني صيانة' : 'Technician'}',
              action: StatusChip(
                t.ar
                    ? '${formatNumber(remaining, locale)} مهام متبقية'
                    : '$remaining tasks left',
                fg: appNavy,
                bg: appNavyBg,
                fontSize: 12,
              ),
            );
          },
          orElse: () => HomeHeader(title: t.today, subtitle: userName),
        ),
        Expanded(
          child: orders.when(
            data: (items) {
              final current = items
                  .where((w) => w.status == 'IN_PROGRESS')
                  .toList();
              final queue = orderedTasks(
                items.where((w) => w.status != 'IN_PROGRESS').toList(),
              );
              if (items.isEmpty) {
                return EmptyState(
                  title: t.ar
                      ? 'لا توجد مهام مسندة إليك اليوم ✓'
                      : 'No tasks assigned to you today ✓',
                  icon: Icons.task_alt,
                );
              }
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(workOrdersProvider),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                  children: [
                    if (current.isNotEmpty) ...[
                      _currentTask(context, current.first, locale, t),
                      const SizedBox(height: 16),
                    ],
                    SectionTitle(
                        title: t.ar
                            ? 'مهام اليوم — بالترتيب'
                            : "Today's tasks — in order"),
                    for (final w in queue) ...[
                      _taskRow(context, w, locale, t),
                      const SizedBox(height: 10),
                    ],
                    if (queue.isEmpty && current.isNotEmpty)
                      EmptyState(
                        title: t.ar
                            ? 'لا مهام أخرى اليوم'
                            : 'No other tasks today',
                        icon: Icons.task_alt,
                      ),
                  ],
                ),
              );
            },
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale),
              onRetry: () => ref.invalidate(workOrdersProvider),
            ),
          ),
        ),
      ],
    );
  }

  Widget _currentTask(
    BuildContext context,
    WorkOrderItem w,
    Locale locale,
    AppLabels t,
  ) =>
      AqarCard(
        borderColor: appBlue,
        borderWidth: 1.4,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                StatusChip(
                  t.ar ? 'جارية الآن' : 'In progress now',
                  fg: appBlue,
                  bg: appPetrolBg,
                ),
                if (w.dueAt != null)
                  Text(
                    '${t.ar ? 'مهلة' : 'SLA'} ${formatTime(w.dueAt, locale)}',
                    style: const TextStyle(fontSize: 11, color: appGrey),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              w.title,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: appInk,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const AqarIcon(AqarIconType.pin, size: 15, color: appGrey),
                const SizedBox(width: 4),
                Text(
                  '${t.ar ? 'وحدة' : 'Unit'} ${w.unitCode}',
                  style: const TextStyle(fontSize: 12, color: appGrey),
                ),
              ],
            ),
            const SizedBox(height: 12),
            AqarButton(
              t.ar ? 'متابعة المهمة' : 'Continue task',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WorkOrderDetailScreen(id: w.id),
                ),
              ),
            ),
          ],
        ),
      );

  Widget _taskRow(
    BuildContext context,
    WorkOrderItem w,
    Locale locale,
    AppLabels t,
  ) {
    final breached = _slaBreached(w);
    return ListRowCard(
      icon: AqarIconType.wrench,
      iconFg: breached ? appDanger : appBlue,
      iconBg: breached ? appDangerBg : appPetrolBg,
      title: w.title,
      subtitle: '${t.ar ? 'وحدة' : 'Unit'} ${w.unitCode}'
          '${w.dueAt != null ? ' · ${t.ar ? 'مهلة' : 'SLA'} ${formatDate(w.dueAt, locale)}' : ''}',
      trailing: breached
          ? StatusChip(t.overdue, fg: appDanger, bg: appDangerBg)
          : StatusChip(
              workOrderStatusLabel(w.status, t.ar),
              fg: appGrey,
              bg: const Color(0xFFEEF1F5),
            ),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => WorkOrderDetailScreen(id: w.id)),
      ),
    );
  }
}

// ───────────────────────── Tasks + history tabs ─────────────────────────

class TechnicianTasksScreen extends ConsumerWidget {
  final bool history;
  const TechnicianTasksScreen({super.key, this.history = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final provider = history ? historyWorkOrdersProvider : workOrdersProvider;
    final items = ref.watch(provider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            history ? t.history : t.myTasks,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Expanded(
          child: items.when(
            data: (list) {
              if (list.isEmpty) {
                return EmptyState(
                  title: history
                      ? (t.ar ? 'لم تُكمل مهام بعد' : 'No completed tasks yet')
                      : (t.ar
                          ? 'لا توجد مهام مسندة إليك ✓'
                          : 'No tasks assigned to you ✓'),
                  icon: history ? Icons.history : Icons.task_alt,
                );
              }
              final ordered = history ? list : orderedTasks(list);
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(provider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(20),
                  itemCount: ordered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final w = ordered[i];
                    return ListRowCard(
                      icon: AqarIconType.wrench,
                      iconFg: appBlue,
                      iconBg: appPetrolBg,
                      title: w.title,
                      subtitle:
                          '${localizedDigits(w.number, locale)} · ${t.ar ? 'وحدة' : 'Unit'} ${w.unitCode}',
                      trailing: StatusChip(
                        workOrderStatusLabel(w.status, t.ar),
                        fg: w.status == 'COMPLETED' ? appSuccess : appBlue,
                        bg: w.status == 'COMPLETED'
                            ? appSuccessBg
                            : appPetrolBg,
                      ),
                      onTap: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => WorkOrderDetailScreen(id: w.id),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale),
              onRetry: () => ref.invalidate(provider),
            ),
          ),
        ),
      ],
    );
  }
}

// ───────────────────────── 13 · Work order details ─────────────────────────

final workOrderDetailProvider =
    FutureProvider.family.autoDispose<WorkOrderDetail, String>(
  (ref, id) => ref.watch(repositoryProvider).workOrderDetail(id),
);

class WorkOrderDetailScreen extends ConsumerWidget {
  final String id;
  const WorkOrderDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: ref.watch(workOrderDetailProvider(id)).when(
              data: (d) {
                final session = ref.watch(sessionProvider).valueOrNull;
                final canManage = canUseWorkOrderAction(session, 'manage');
                final canComplete =
                    canUseWorkOrderAction(session, 'complete');
                final status = d.workOrder.status;
                final breached = _slaBreached(d.workOrder);
                return Column(
                  children: [
                    ScreenHeader(
                      title:
                          '${t.ar ? 'أمر شغل' : 'Work order'} ${localizedDigits(d.workOrder.number, locale)}',
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                        children: [
                          Row(
                            children: [
                              StatusChip(
                                workOrderStatusLabel(status, t.ar),
                                fg: appBlue,
                                bg: appPetrolBg,
                              ),
                              const SizedBox(width: 8),
                              if (d.workOrder.dueAt != null)
                                StatusChip(
                                  breached
                                      ? (t.ar
                                          ? 'تجاوز مهلة SLA'
                                          : 'SLA breached')
                                      : (t.ar
                                          ? 'ضمن مهلة SLA'
                                          : 'Within SLA'),
                                  fg: breached ? appDanger : appSuccess,
                                  bg: breached ? appDangerBg : appSuccessBg,
                                ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          AqarCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  d.workOrder.title,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: appInk,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  '${t.ar ? 'وحدة' : 'Unit'} ${d.workOrder.unitCode}'
                                  '${d.workOrder.dueAt != null ? ' · ${t.ar ? 'الموعد' : 'Due'} ${formatDate(d.workOrder.dueAt, locale)}' : ''}',
                                  style: const TextStyle(
                                      fontSize: 12, color: appGrey),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          AqarCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.ar ? 'سجل الأمر' : 'Order timeline',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: appInk,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                if (d.updates.isEmpty)
                                  Text(
                                    t.ar
                                        ? 'لا تحديثات مسجلة بعد'
                                        : 'No updates recorded yet',
                                    style: const TextStyle(
                                        fontSize: 12, color: appGrey),
                                  )
                                else
                                  for (var i = 0; i < d.updates.length; i++)
                                    _timelineRow(
                                      d.updates[i],
                                      i == d.updates.length - 1,
                                      locale,
                                      t,
                                    ),
                              ],
                            ),
                          ),
                          if (d.attachments.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            AqarCard(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    t.ar ? 'الصور والمرفقات' : 'Evidence',
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                      color: appInk,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  for (final a in d.attachments)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 4),
                                      child: Row(
                                        children: [
                                          const AqarIcon(
                                              AqarIconType.document,
                                              size: 16,
                                              color: appGrey),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              '${a['original_file_name'] ?? ''}',
                                              maxLines: 1,
                                              overflow:
                                                  TextOverflow.ellipsis,
                                              style: const TextStyle(
                                                  fontSize: 12.5),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 20),
                          // Actions mirror the DB transition matrix exactly.
                          if (canManage &&
                              canTransitionWorkOrder(status, 'IN_PROGRESS') &&
                              status != 'WAITING')
                            AqarButton(
                              t.ar ? 'بدء التنفيذ' : 'Start work',
                              onPressed: () => _transitionWithNote(
                                context,
                                ref,
                                t,
                                locale,
                                rpc: 'start_work_order',
                                title: t.ar ? 'بدء التنفيذ' : 'Start work',
                                noteOptional: true,
                              ),
                            )
                          else if (!canManage &&
                              canComplete &&
                              (status == 'ASSIGNED' ||
                                  status == 'SCHEDULED'))
                            // .complete without .manage cannot start —
                            // explain instead of showing a dead button.
                            AqarCard(
                              color: appAmberBg,
                              borderColor: appAmberBg,
                              child: Text(
                                t.ar
                                    ? 'بدء التنفيذ يسجله المشرف — تواصل مع الإدارة'
                                    : 'Starting is recorded by your supervisor — contact the office',
                                style: const TextStyle(
                                  color: appAmber,
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          if (canManage && status == 'WAITING') ...[
                            AqarButton(
                              t.ar ? 'استئناف التنفيذ' : 'Resume work',
                              onPressed: () => _transitionWithNote(
                                context,
                                ref,
                                t,
                                locale,
                                rpc: 'resume_work_order',
                                title:
                                    t.ar ? 'استئناف التنفيذ' : 'Resume work',
                                noteOptional: true,
                              ),
                            ),
                            const SizedBox(height: 10),
                          ],
                          if (status == 'IN_PROGRESS') ...[
                            if (canManage) ...[
                              AqarButton(
                                t.ar
                                    ? 'تعليق مؤقت — سبب إلزامي'
                                    : 'Put on hold — reason required',
                                secondary: true,
                                onPressed: () => _transitionWithNote(
                                  context,
                                  ref,
                                  t,
                                  locale,
                                  rpc: 'wait_work_order',
                                  title: t.ar
                                      ? 'تعليق المهمة مؤقتًا'
                                      : 'Put task on hold',
                                  noteOptional: false,
                                ),
                              ),
                              const SizedBox(height: 10),
                              _NoteComposer(workOrderId: id),
                              const SizedBox(height: 10),
                            ],
                            if (canComplete)
                              AqarButton(
                                t.ar ? 'إكمال المهمة' : 'Complete task',
                                onPressed: () =>
                                    _complete(context, ref, t, locale),
                              ),
                          ],
                          const SizedBox(height: 8),
                          Text(
                            t.ar
                                ? 'الإكمال يتطلب ملخص إنجاز · لا يمكن إلغاء أمر قيد التنفيذ'
                                : 'Completion requires a summary · an in-progress order cannot be cancelled',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 10.5, color: appGrey),
                          ),
                        ],
                      ),
                    ),
                  ],
                );
              },
              loading: () => const SkeletonList(),
              error: (e, _) => AppError(
                message: friendlyError(e, locale),
                onRetry: () => ref.invalidate(workOrderDetailProvider(id)),
              ),
            ),
      ),
    );
  }

  Widget _timelineRow(
    Map<String, dynamic> update,
    bool last,
    Locale locale,
    AppLabels t,
  ) {
    final status = update['resulting_status'] as String? ?? '';
    final note = update['note'] as String? ?? '';
    final visibility = update['visibility'] as String? ?? '';
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 9,
                height: 9,
                margin: const EdgeInsets.only(top: 6),
                decoration: const BoxDecoration(
                  color: appBlue,
                  shape: BoxShape.circle,
                ),
              ),
              if (!last)
                Expanded(
                  child: Container(width: 2, color: appCardBorder),
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    status.isEmpty
                        ? (visibility == 'STAFF_ONLY'
                            ? (t.ar
                                ? 'ملاحظة (داخلية)'
                                : 'Note (staff only)')
                            : (t.ar
                                ? 'ملاحظة (مرئية للساكن)'
                                : 'Note (member visible)'))
                        : workOrderStatusLabel(status, t.ar),
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: appInk,
                    ),
                  ),
                  if (note.isNotEmpty)
                    Text(
                      note,
                      style: const TextStyle(fontSize: 11.5, color: appGrey),
                    ),
                  Text(
                    formatDate(update['created_at'] as String?, locale),
                    style: const TextStyle(fontSize: 10.5, color: appGrey),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _transitionWithNote(
    BuildContext context,
    WidgetRef ref,
    AppLabels t,
    Locale locale, {
    required String rpc,
    required String title,
    required bool noteOptional,
  }) async {
    final note = TextEditingController();
    final proceed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: Colors.white,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(title,
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        content: TextField(
          controller: note,
          autofocus: !noteOptional,
          maxLines: 2,
          decoration: InputDecoration(
            hintText: noteOptional
                ? (t.ar ? 'ملاحظة (اختياري)' : 'Note (optional)')
                : (t.ar ? 'السبب — إلزامي' : 'Reason — required'),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: Text(t.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: appNavy),
            onPressed: () {
              if (!noteOptional && note.text.trim().isEmpty) return;
              Navigator.pop(d, true);
            },
            child: Text(t.confirm),
          ),
        ],
      ),
    );
    if (proceed != true || !context.mounted) return;
    try {
      await ref.read(repositoryProvider).workOrderTransition(
            rpc,
            id,
            note.text.trim().isEmpty ? null : note.text.trim(),
          );
      ref.invalidate(workOrderDetailProvider(id));
      ref.invalidate(workOrdersProvider);
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
    }
  }

  Future<void> _complete(
    BuildContext context,
    WidgetRef ref,
    AppLabels t,
    Locale locale,
  ) async {
    final summary = TextEditingController();
    final memberVisible = TextEditingController();
    final proceed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: Colors.white,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          t.ar ? 'إكمال المهمة' : 'Complete task',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: summary,
              autofocus: true,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: t.ar
                    ? 'ملخص الإنجاز — إلزامي'
                    : 'Completion summary — required',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: memberVisible,
              maxLines: 2,
              decoration: InputDecoration(
                hintText: t.ar
                    ? 'ملخص للساكن (اختياري)'
                    : 'Summary for the resident (optional)',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false),
              child: Text(t.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: appNavy),
            onPressed: () {
              if (summary.text.trim().isEmpty) return;
              Navigator.pop(d, true);
            },
            child: Text(t.ar ? 'إكمال' : 'Complete'),
          ),
        ],
      ),
    );
    if (proceed != true || !context.mounted) return;
    try {
      await ref.read(repositoryProvider).completeWorkOrder(
            id,
            summary.text.trim(),
            memberVisible.text.trim().isEmpty
                ? null
                : memberVisible.text.trim(),
            null,
          );
      ref.invalidate(workOrderDetailProvider(id));
      ref.invalidate(workOrdersProvider);
      ref.invalidate(historyWorkOrdersProvider);
      if (context.mounted) {
        showFeedback(
            context, t.ar ? 'أُكملت المهمة ✓' : 'Task completed ✓');
      }
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
    }
  }
}

class _NoteComposer extends ConsumerStatefulWidget {
  final String workOrderId;
  const _NoteComposer({required this.workOrderId});
  @override
  ConsumerState<_NoteComposer> createState() => _NoteComposerState();
}

class _NoteComposerState extends ConsumerState<_NoteComposer> {
  final note = TextEditingController();
  bool staffOnly = true;
  bool busy = false;

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return AqarCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.ar ? 'إضافة ملاحظة' : 'Add a note',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: appInk,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: note,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: t.ar ? 'اكتب الملاحظة…' : 'Write the note…',
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: SegmentedTabs(
                  labels: [
                    t.ar ? 'داخلية' : 'Staff only',
                    t.ar ? 'مرئية للساكن' : 'Member visible',
                  ],
                  index: staffOnly ? 0 : 1,
                  onChanged: (i) => setState(() => staffOnly = i == 0),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: appNavy,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 10),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: busy
                    ? null
                    : () async {
                        if (note.text.trim().isEmpty) return;
                        setState(() => busy = true);
                        try {
                          await ref
                              .read(repositoryProvider)
                              .addWorkOrderNote(
                                widget.workOrderId,
                                note.text.trim(),
                                visibility: staffOnly
                                    ? 'STAFF_ONLY'
                                    : 'MEMBER_VISIBLE',
                              );
                          note.clear();
                          ref.invalidate(
                              workOrderDetailProvider(widget.workOrderId));
                        } catch (e) {
                          if (context.mounted) {
                            showFeedback(
                                context, friendlyError(e, locale));
                          }
                        } finally {
                          if (mounted) setState(() => busy = false);
                        }
                      },
                child: Text(t.ar ? 'إرسال' : 'Send',
                    style: const TextStyle(fontSize: 12.5)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
