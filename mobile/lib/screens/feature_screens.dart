import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../data/repository.dart';

String tr(BuildContext c, String ar, String en) =>
    AppLabels(Localizations.localeOf(c)).ar ? ar : en;
final featureUnitsProvider = FutureProvider.autoDispose<List<UnitItem>>(
  (ref) => ref.watch(repositoryProvider).units(),
);
final featureMaintenanceProvider =
    FutureProvider.autoDispose<List<MaintenanceItem>>(
      (ref) => ref.watch(repositoryProvider).maintenance(),
    );
final featureWorkOrdersProvider =
    FutureProvider.autoDispose<List<WorkOrderItem>>(
      (ref) => ref.watch(repositoryProvider).workOrders(),
    );
final visitorsProvider = FutureProvider.autoDispose<List<VisitorItem>>(
  (ref) => ref.watch(repositoryProvider).visitors(),
);
final vehiclesProvider = FutureProvider.autoDispose<List<VehicleItem>>(
  (ref) => ref.watch(repositoryProvider).vehicles(),
);
final notificationsProvider =
    FutureProvider.autoDispose<List<NotificationItem>>(
      (ref) => ref.watch(repositoryProvider).notifications(),
    );
final managerProvider = FutureProvider.autoDispose<ManagerSummary>(
  (ref) => ref.watch(repositoryProvider).managerSummary(),
);

class VisitorsScreen extends ConsumerWidget {
  const VisitorsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.visitors)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createVisitor(context, ref),
        icon: const Icon(Icons.add),
        label: Text(t.ar ? 'دعوة زائر' : 'Invite guest'),
      ),
      body: ref
          .watch(visitorsProvider)
          .when(
            data: (items) => items.isEmpty
                ? EmptyState(title: t.noData)
                : ListView.builder(
                    itemCount: items.length,
                    padding: const EdgeInsets.all(16),
                    itemBuilder: (_, i) => Card(
                      child: ListTile(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => VisitorDetailScreen(item: items[i]),
                          ),
                        ),
                        leading: const Icon(Icons.person_outline),
                        title: Text(items[i].guestName),
                        subtitle: Text(
                          '${items[i].number} · ${items[i].unitCode}',
                        ),
                        trailing: items[i].status == 'ACTIVE'
                            ? IconButton(
                                icon: const Icon(
                                  Icons.block,
                                  color: Colors.red,
                                ),
                                onPressed: () async {
                                  await ref
                                      .read(repositoryProvider)
                                      .revokeVisitor(items[i].id);
                                  ref.invalidate(visitorsProvider);
                                },
                              )
                            : Text(items[i].status),
                      ),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر تحميل الزوار' : 'Could not load visitors',
              onRetry: () => ref.invalidate(visitorsProvider),
            ),
          ),
    );
  }
}

class VisitorDetailScreen extends ConsumerWidget {
  final VisitorItem item;
  const VisitorDetailScreen({super.key, required this.item});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.ar ? 'تفاصيل الزائر' : 'Visitor details')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            item.guestName,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          Text('${item.number} · ${item.unitCode}'),
          const SizedBox(height: 16),
          Text('${t.ar ? 'من' : 'From'}: ${item.validFrom}'),
          Text('${t.ar ? 'إلى' : 'Until'}: ${item.validUntil}'),
          Text('${t.ar ? 'الحالة' : 'Status'}: ${item.status}'),
          if (item.phone != null)
            Text('${t.ar ? 'الهاتف' : 'Phone'}: ${item.phone}'),
          if (item.note != null) Text(item.note!),
          if (item.status == 'ACTIVE')
            FilledButton(
              onPressed: () async {
                await ref.read(repositoryProvider).revokeVisitor(item.id);
                ref.invalidate(visitorsProvider);
                if (context.mounted) Navigator.pop(context);
              },
              child: Text(t.ar ? 'إلغاء التصريح' : 'Revoke pass'),
            ),
        ],
      ),
    );
  }
}

Future<void> _createVisitor(BuildContext context, WidgetRef ref) async {
  final units = await ref.read(featureUnitsProvider.future);
  if (!context.mounted || units.isEmpty) return;
  final name = await _ask(context, tr(context, 'اسم الزائر', 'Guest name'));
  if (name == null || name.trim().isEmpty) return;
  try {
    await ref
        .read(repositoryProvider)
        .createVisitor(
          unitId: units.first.id,
          guestName: name,
          from: DateTime.now().toUtc().toIso8601String(),
          until: DateTime.now()
              .add(const Duration(hours: 8))
              .toUtc()
              .toIso8601String(),
          usage: 'SINGLE_USE',
        );
    ref.invalidate(visitorsProvider);
  } catch (_) {
    if (context.mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context, 'تعذر إنشاء التصريح', 'Could not create pass'),
          ),
        ),
      );
  }
}

Future<String?> _ask(BuildContext context, String label) async {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(label),
      content: TextField(controller: c, autofocus: true),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(d),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(d, c.text),
          child: const Text('Save'),
        ),
      ],
    ),
  );
}

class VehiclesScreen extends ConsumerWidget {
  const VehiclesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.vehicles)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createVehicle(context, ref),
        icon: const Icon(Icons.add),
        label: Text(t.ar ? 'إضافة مركبة' : 'Add vehicle'),
      ),
      body: ref
          .watch(vehiclesProvider)
          .when(
            data: (items) => items.isEmpty
                ? EmptyState(title: t.noData)
                : ListView.builder(
                    itemCount: items.length,
                    padding: const EdgeInsets.all(16),
                    itemBuilder: (_, i) => Card(
                      child: ListTile(
                        leading: const Icon(Icons.directions_car_outlined),
                        title: Text(
                          '${items[i].country} · ${items[i].plateNumber}',
                        ),
                        subtitle: Text(items[i].unitCode),
                        trailing: items[i].active
                            ? IconButton(
                                icon: const Icon(
                                  Icons.block,
                                  color: Colors.red,
                                ),
                                onPressed: () async {
                                  await ref
                                      .read(repositoryProvider)
                                      .deactivateVehicle(items[i].id);
                                  ref.invalidate(vehiclesProvider);
                                },
                              )
                            : const Icon(Icons.block, color: Colors.grey),
                      ),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر تحميل المركبات' : 'Could not load vehicles',
              onRetry: () => ref.invalidate(vehiclesProvider),
            ),
          ),
    );
  }
}

Future<void> _createVehicle(BuildContext context, WidgetRef ref) async {
  final units = await ref.read(featureUnitsProvider.future);
  if (!context.mounted || units.isEmpty) return;
  final plate = await _ask(context, tr(context, 'رقم اللوحة', 'Plate number'));
  if (plate == null || plate.trim().isEmpty) return;
  try {
    await ref
        .read(repositoryProvider)
        .createVehicle(
          unitId: units.first.id,
          plateNumber: plate,
          country: 'EG',
        );
    ref.invalidate(vehiclesProvider);
  } catch (_) {
    if (context.mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'تعذر الحفظ', 'Could not save'))),
      );
  }
}

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(
        title: Text(t.notifications),
        actions: [
          IconButton(
            onPressed: () async {
              await ref.read(repositoryProvider).markAllNotifications();
              ref.invalidate(notificationsProvider);
            },
            icon: const Icon(Icons.done_all),
          ),
        ],
      ),
      body: ref
          .watch(notificationsProvider)
          .when(
            data: (items) => items.isEmpty
                ? EmptyState(title: t.noData)
                : ListView.builder(
                    itemCount: items.length,
                    padding: const EdgeInsets.all(16),
                    itemBuilder: (c, i) => Card(
                      child: ListTile(
                        onTap: items[i].isRead
                            ? null
                            : () async {
                                await ref
                                    .read(repositoryProvider)
                                    .markNotification(items[i].id);
                                ref.invalidate(notificationsProvider);
                              },
                        leading: Icon(
                          Icons.notifications_none,
                          color: items[i].isRead ? Colors.grey : appBlue,
                        ),
                        title: Text(t.ar ? items[i].titleAr : items[i].titleEn),
                        subtitle: Text(
                          t.ar ? items[i].bodyAr : items[i].bodyEn,
                        ),
                      ),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(notificationsProvider),
            ),
          ),
    );
  }
}

class MaintenanceHubScreen extends ConsumerWidget {
  final AppSession session;
  const MaintenanceHubScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.maintenance)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _createMaintenance(context, ref),
        icon: const Icon(Icons.add),
        label: Text(t.ar ? 'طلب جديد' : 'New request'),
      ),
      body: ref
          .watch(featureMaintenanceProvider)
          .when(
            data: (items) => items.isEmpty
                ? EmptyState(title: t.noData)
                : ListView.builder(
                    itemCount: items.length,
                    padding: const EdgeInsets.all(16),
                    itemBuilder: (_, i) => Card(
                      child: ListTile(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                MaintenanceDetailScreen(id: items[i].id),
                          ),
                        ),
                        title: Text(items[i].title),
                        subtitle: Text(
                          '${items[i].requestNo} · ${items[i].unitCode}',
                        ),
                        trailing: Text(items[i].status),
                      ),
                    ),
                  ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(featureMaintenanceProvider),
            ),
          ),
    );
  }
}

Future<void> _createMaintenance(BuildContext context, WidgetRef ref) async {
  final units = await ref.read(featureUnitsProvider.future);
  final cats = await ref.read(repositoryProvider).maintenanceCategories();
  if (!context.mounted || units.isEmpty || cats.isEmpty) return;
  final title = await _ask(
    context,
    tr(context, 'عنوان الطلب', 'Request title'),
  );
  if (title == null || title.trim().isEmpty) return;
  final desc = await _ask(context, tr(context, 'وصف الطلب', 'Description'));
  if (desc == null) return;
  try {
    final id = await ref
        .read(repositoryProvider)
        .createMaintenance(
          unitId: units.first.id,
          categoryId: cats.first['id'] as String,
          title: title,
          description: desc,
          priority: 'NORMAL',
        );
    ref.invalidate(featureMaintenanceProvider);
    if (context.mounted)
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => MaintenanceDetailScreen(id: id)),
      );
  } catch (_) {
    if (context.mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(context, 'تعذر إنشاء الطلب', 'Could not create request'),
          ),
        ),
      );
  }
}

final maintenanceDetailProvider = FutureProvider.family
    .autoDispose<MaintenanceDetail, String>(
      (ref, id) => ref.watch(repositoryProvider).maintenanceDetail(id),
    );

class MaintenanceDetailScreen extends ConsumerWidget {
  final String id;
  const MaintenanceDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(
        title: Text(t.ar ? 'تفاصيل الصيانة' : 'Maintenance detail'),
      ),
      body: ref
          .watch(maintenanceDetailProvider(id))
          .when(
            data: (d) => ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  d.request.title,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text('${d.request.requestNo} · ${d.request.status}'),
                Text(d.description),
                SectionTitle(title: t.ar ? 'السجل الزمني' : 'Timeline'),
                for (final u in d.updates)
                  ListTile(
                    title: Text(u['resulting_status'] ?? ''),
                    subtitle: Text(u['note'] ?? ''),
                  ),
                SectionTitle(title: t.ar ? 'المرفقات' : 'Attachments'),
                for (final a in d.attachments)
                  ListTile(
                    leading: const Icon(Icons.attach_file),
                    title: Text(a['original_file_name'] ?? ''),
                  ),
                FilledButton.icon(
                  onPressed: () => _upload(context, ref, id),
                  icon: const Icon(Icons.upload_file),
                  label: Text(t.ar ? 'رفع دليل' : 'Upload evidence'),
                ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(maintenanceDetailProvider(id)),
            ),
          ),
    );
  }
}

Future<void> _upload(BuildContext context, WidgetRef ref, String id) async {
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
  );
  if (files.isEmpty) return;
  final f = files.first;
  final bytes = await f.readAsBytes();
  final mime = f.extension == 'pdf'
      ? 'application/pdf'
      : f.extension == 'png'
      ? 'image/png'
      : 'image/jpeg';
  try {
    await ref
        .read(repositoryProvider)
        .uploadMaintenanceAttachment(
          requestId: id,
          fileName: f.name,
          mimeType: mime,
          bytes: bytes,
        );
    ref.invalidate(maintenanceDetailProvider(id));
  } catch (_) {
    if (context.mounted)
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tr(context, 'فشل الرفع', 'Upload failed'))),
      );
  }
}

final workOrderDetailProvider = FutureProvider.family
    .autoDispose<WorkOrderDetail, String>(
      (ref, id) => ref.watch(repositoryProvider).workOrderDetail(id),
    );

class WorkOrderDetailScreen extends ConsumerWidget {
  final String id;
  const WorkOrderDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.ar ? 'أمر العمل' : 'Work order')),
      body: ref
          .watch(workOrderDetailProvider(id))
          .when(
            data: (d) {
              final session = ref.watch(sessionProvider).valueOrNull;
              final canManage = canUseWorkOrderAction(session, 'manage');
              final canComplete = canUseWorkOrderAction(session, 'complete');
              final canEvidence = canUseWorkOrderAction(session, 'evidence');
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    d.workOrder.title,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  Text('${d.workOrder.number} · ${d.workOrder.status}'),
                  Wrap(
                    children: [
                      if (canManage &&
                          (d.workOrder.status == 'ASSIGNED' ||
                              d.workOrder.status == 'SCHEDULED'))
                        _transition(
                          context,
                          ref,
                          d,
                          'start_work_order',
                          'Start',
                        ),
                      if (canManage && d.workOrder.status == 'IN_PROGRESS')
                        _transition(context, ref, d, 'wait_work_order', 'Wait'),
                      if (canManage && d.workOrder.status == 'WAITING')
                        _transition(
                          context,
                          ref,
                          d,
                          'resume_work_order',
                          'Resume',
                        ),
                      if (canManage &&
                          ![
                            'COMPLETED',
                            'CANCELLED',
                          ].contains(d.workOrder.status))
                        _transition(
                          context,
                          ref,
                          d,
                          'cancel_work_order',
                          'Cancel',
                        ),
                      if (canComplete && d.workOrder.status == 'IN_PROGRESS')
                        FilledButton(
                          onPressed: () async {
                            await ref
                                .read(repositoryProvider)
                                .completeWorkOrder(
                                  id,
                                  'Completed from mobile',
                                  null,
                                  null,
                                );
                            ref.invalidate(workOrderDetailProvider(id));
                          },
                          child: Text(t.ar ? 'إكمال' : 'Complete'),
                        ),
                    ],
                  ),
                  if (canManage)
                    TextField(
                      onSubmitted: (v) async {
                        if (v.trim().isNotEmpty) {
                          await ref
                              .read(repositoryProvider)
                              .addWorkOrderNote(id, v);
                          ref.invalidate(workOrderDetailProvider(id));
                        }
                      },
                      decoration: InputDecoration(
                        labelText: t.ar ? 'ملاحظة' : 'Note',
                      ),
                    ),
                  SectionTitle(title: t.ar ? 'السجل' : 'Timeline'),
                  SectionTitle(title: t.ar ? 'الأدلة' : 'Evidence'),
                  for (final a in d.attachments)
                    ListTile(
                      leading: const Icon(Icons.attach_file),
                      title: Text(a['original_file_name'] ?? ''),
                    ),
                  if (canEvidence)
                    FilledButton.icon(
                      onPressed: () => _upload(context, ref, d.requestId),
                      icon: const Icon(Icons.upload_file),
                      label: Text(
                        t.ar ? 'رفع صورة أو ملف' : 'Upload photo or file',
                      ),
                    ),
                  for (final u in d.updates)
                    ListTile(
                      title: Text(u['resulting_status'] ?? ''),
                      subtitle: Text(u['note'] ?? ''),
                    ),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(workOrderDetailProvider(id)),
            ),
          ),
    );
  }
}

Widget _transition(
  BuildContext c,
  WidgetRef ref,
  WorkOrderDetail d,
  String rpc,
  String label,
) => FilledButton(
  onPressed: () async {
    await ref
        .read(repositoryProvider)
        .workOrderTransition(rpc, d.workOrder.id, 'Mobile action');
    ref.invalidate(workOrderDetailProvider(d.workOrder.id));
  },
  child: Text(label),
);

class ManagerOverviewScreen extends ConsumerWidget {
  const ManagerOverviewScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      appBar: AppBar(title: Text(t.managerOverview)),
      body: ref
          .watch(managerProvider)
          .when(
            data: (s) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  children: [
                    MetricCard(
                      label: t.ar ? 'المستحقات' : 'Open dues',
                      value: '${s.openDues}',
                      icon: Icons.account_balance_wallet_outlined,
                    ),
                    const SizedBox(width: 8),
                    MetricCard(
                      label: t.ar ? 'المتأخرات' : 'Overdue',
                      value: '${s.overdueDues}',
                      icon: Icons.warning_amber_outlined,
                    ),
                  ],
                ),
                Row(
                  children: [
                    MetricCard(
                      label: t.maintenance,
                      value: '${s.openMaintenance}',
                      icon: Icons.build_outlined,
                    ),
                    const SizedBox(width: 8),
                    MetricCard(
                      label: t.workOrders,
                      value: '${s.openWorkOrders}',
                      icon: Icons.handyman_outlined,
                    ),
                  ],
                ),
                Row(
                  children: [
                    MetricCard(
                      label: t.ar ? 'إشغال الوحدات' : 'Occupancy',
                      value: '${s.occupiedUnits}/${s.totalUnits}',
                      icon: Icons.home_work_outlined,
                    ),
                    const SizedBox(width: 8),
                    MetricCard(
                      label: t.ar ? 'تصاريح الزوار' : 'Active visitors',
                      value: '${s.activeVisitors}',
                      icon: Icons.people_outline,
                    ),
                  ],
                ),
                ListTile(
                  title: Text(t.ar ? 'إجمالي التحصيلات' : 'Collections'),
                  trailing: Text(s.collections.toStringAsFixed(2)),
                ),
                ListTile(
                  title: Text(
                    t.ar
                        ? 'نشاط البوابة غير متاح للموبايل'
                        : 'Gate activity unavailable to mobile client',
                  ),
                  trailing: const Icon(Icons.lock_outline, size: 18),
                ),
                ListTile(
                  title: Text(t.ar ? 'تنبيهات غير مقروءة' : 'Unread alerts'),
                  trailing: Text('${s.unreadAlerts}'),
                ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: t.ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(managerProvider),
            ),
          ),
    );
  }
}
