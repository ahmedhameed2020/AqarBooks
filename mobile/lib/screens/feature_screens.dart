import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'resident_screens.dart'
    show maintenanceStatusLabel, priorityLabel;

String tr(BuildContext c, String ar, String en) =>
    AppLabels(Localizations.localeOf(c)).ar ? ar : en;

final featureUnitsProvider = FutureProvider.autoDispose<List<UnitItem>>(
  (ref) => ref.watch(repositoryProvider).units(),
);
final featureMaintenanceProvider =
    FutureProvider.autoDispose<List<MaintenanceItem>>(
  (ref) => ref.watch(repositoryProvider).maintenance(),
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

// ───────────────────────── Notifications ─────────────────────────

class NotificationsScreen extends ConsumerWidget {
  final bool embedded;
  const NotificationsScreen({super.key, this.embedded = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final list = ref.watch(notificationsProvider).when(
          data: (items) => items.isEmpty
              ? EmptyState(
                  title: t.ar ? 'لا جديد' : 'Nothing new',
                  icon: Icons.notifications_none,
                )
              : RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(notificationsProvider),
                  child: ListView.separated(
                    padding: const EdgeInsets.all(20),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (c, i) {
                      final n = items[i];
                      return ListRowCard(
                        icon: AqarIconType.bell,
                        iconFg: n.isRead ? appGrey : appNavy,
                        iconBg: n.isRead
                            ? const Color(0xFFEEF1F5)
                            : appNavyBg,
                        title: t.ar ? n.titleAr : n.titleEn,
                        subtitle: relativeFrom(n.createdAt, locale),
                        trailing: n.isRead
                            ? null
                            : Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: appPurple,
                                  shape: BoxShape.circle,
                                ),
                              ),
                        onTap: n.isRead
                            ? null
                            : () async {
                                try {
                                  await ref
                                      .read(repositoryProvider)
                                      .markNotification(n.id);
                                  ref.invalidate(notificationsProvider);
                                } catch (e) {
                                  if (c.mounted) {
                                    showFeedback(
                                        c, friendlyError(e, locale));
                                  }
                                }
                              },
                      );
                    },
                  ),
                ),
          loading: () => const SkeletonList(),
          error: (e, _) => AppError(
            message: friendlyError(e, locale, loading: true),
            onRetry: () => ref.invalidate(notificationsProvider),
          ),
        );
    final header = Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
      child: Row(
        children: [
          Expanded(
            child: Text(
              t.notifications,
              style: const TextStyle(
                  fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
            ),
          ),
          TextButton(
            onPressed: () async {
              try {
                await ref.read(repositoryProvider).markAllNotifications();
                ref.invalidate(notificationsProvider);
              } catch (_) {}
            },
            child: Text(
              t.ar ? 'تمييز الكل كمقروء' : 'Mark all read',
              style: const TextStyle(fontSize: 12, color: appNavy),
            ),
          ),
        ],
      ),
    );
    final column = Column(
      children: [
        if (embedded) header else ScreenHeader(title: t.notifications),
        Expanded(child: list),
      ],
    );
    return embedded ? column : Scaffold(body: SafeArea(child: column));
  }
}

// ───────────────────────── Vehicles ─────────────────────────

class VehiclesScreen extends ConsumerWidget {
  const VehiclesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: t.vehicles),
            Expanded(
              child: ref.watch(vehiclesProvider).when(
                    data: (items) => items.isEmpty
                        ? EmptyState(
                            title: t.ar
                                ? 'لا توجد مركبات مسجلة'
                                : 'No vehicles registered',
                            icon: Icons.directions_car_outlined,
                            ctaLabel: t.ar ? 'إضافة مركبة' : 'Add vehicle',
                            onCta: () => _create(context, ref),
                          )
                        : RefreshIndicator(
                            onRefresh: () async =>
                                ref.invalidate(vehiclesProvider),
                            child: ListView.separated(
                              padding: const EdgeInsets.all(20),
                              itemCount: items.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (_, i) {
                                final v = items[i];
                                return ListRowCard(
                                  icon: AqarIconType.gate,
                                  title: v.plateNumber,
                                  subtitle: [
                                    if (v.make != null) v.make,
                                    if (v.model != null) v.model,
                                    if (v.color != null) v.color,
                                    v.unitCode,
                                  ].whereType<String>().join(' · '),
                                  trailing: v.active
                                      ? TextButton(
                                          onPressed: () async {
                                            final ok =
                                                await confirmDestructive(
                                              context,
                                              title: t.ar
                                                  ? 'إيقاف المركبة؟'
                                                  : 'Deactivate vehicle?',
                                              message: t.ar
                                                  ? 'لن تتمكن اللوحة ${v.plateNumber} من الدخول بعد الإيقاف.'
                                                  : 'Plate ${v.plateNumber} will no longer be allowed in.',
                                              confirmLabel: t.ar
                                                  ? 'إيقاف'
                                                  : 'Deactivate',
                                            );
                                            if (!ok) return;
                                            try {
                                              await ref
                                                  .read(repositoryProvider)
                                                  .deactivateVehicle(v.id);
                                              ref.invalidate(
                                                  vehiclesProvider);
                                            } catch (e) {
                                              if (context.mounted) {
                                                showFeedback(context,
                                                    friendlyError(e, locale));
                                              }
                                            }
                                          },
                                          child: Text(
                                            t.ar ? 'إيقاف' : 'Deactivate',
                                            style: const TextStyle(
                                              color: appDanger,
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        )
                                      : StatusChip(
                                          t.ar ? 'موقوفة' : 'Inactive',
                                          fg: appGrey,
                                          bg: const Color(0xFFEEF1F5),
                                        ),
                                );
                              },
                            ),
                          ),
                    loading: () => const SkeletonList(),
                    error: (e, _) => AppError(
                      message: friendlyError(e, locale, loading: true),
                      onRetry: () => ref.invalidate(vehiclesProvider),
                    ),
                  ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: appNavy,
        foregroundColor: Colors.white,
        onPressed: () => _create(context, ref),
        icon: const Icon(Icons.add),
        label: Text(t.ar ? 'إضافة مركبة' : 'Add vehicle'),
      ),
    );
  }

  /// Full single-screen form (plate / make / model / color) — replaces the
  /// old one-field dialog with hidden defaults.
  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = await ref.read(featureUnitsProvider.future);
    if (!context.mounted) return;
    if (units.isEmpty) {
      showFeedback(
          context,
          t.ar
              ? 'لا توجد وحدة مرتبطة بحسابك'
              : 'No unit is linked to your account');
      return;
    }
    final plate = TextEditingController();
    final make = TextEditingController();
    final model = TextEditingController();
    final color = TextEditingController();
    String unitId = units.first.id;
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 14, 20, 20 + MediaQuery.viewInsetsOf(sheet).bottom),
        child: StatefulBuilder(
          builder: (sheet, setSheet) => Column(
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
                t.ar ? 'إضافة مركبة' : 'Add vehicle',
                style: const TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: plate,
                decoration: InputDecoration(
                    hintText: t.ar ? 'رقم اللوحة' : 'Plate number'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: make,
                      decoration: InputDecoration(
                          hintText: t.ar ? 'الماركة' : 'Make'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: model,
                      decoration: InputDecoration(
                          hintText: t.ar ? 'الموديل' : 'Model'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              TextField(
                controller: color,
                decoration:
                    InputDecoration(hintText: t.ar ? 'اللون' : 'Color'),
              ),
              if (units.length > 1) ...[
                const SizedBox(height: 10),
                Container(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: appCardBorder),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: unitId,
                      isExpanded: true,
                      items: [
                        for (final u in units)
                          DropdownMenuItem(
                              value: u.id, child: Text(u.code)),
                      ],
                      onChanged: (v) =>
                          setSheet(() => unitId = v ?? unitId),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              AqarButton(
                t.ar ? 'إضافة المركبة' : 'Add vehicle',
                onPressed: () => Navigator.pop(sheet, true),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;
    if (plate.text.trim().isEmpty) return;
    try {
      await ref.read(repositoryProvider).createVehicle(
            unitId: unitId,
            plateNumber: plate.text.trim(),
            country: 'EG',
            make: make.text.trim().isEmpty ? null : make.text.trim(),
            model: model.text.trim().isEmpty ? null : model.text.trim(),
            color: color.text.trim().isEmpty ? null : color.text.trim(),
          );
      ref.invalidate(vehiclesProvider);
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
    }
  }
}

// ───────────────────────── Legacy one-time pass dialog ─────────────────────

class VisitorPassDialog extends StatelessWidget {
  final String payload;
  final String guestName;
  const VisitorPassDialog({
    super.key,
    required this.payload,
    required this.guestName,
  });
  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    return AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Text(ar ? 'تصريح الزائر جاهز' : 'Visitor pass ready'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(guestName,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            SizedBox(
              key: const ValueKey('visitor-pass-qr'),
              width: 220,
              height: 220,
              child: QrImageView(
                data: payload,
                version: QrVersions.auto,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              ar
                  ? 'احفظ أو شارك التصريح الآن — لا يمكن استرجاعه لاحقًا.'
                  : 'Save or share this one-time pass now — it cannot be retrieved later.',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
      actions: [
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: appNavy),
          onPressed: () => Navigator.pop(context),
          child: Text(ar ? 'تم' : 'Done'),
        ),
      ],
    );
  }
}

// ───────────────────────── Maintenance detail ─────────────────────────

final maintenanceDetailProvider =
    FutureProvider.family.autoDispose<MaintenanceDetail, String>(
  (ref, id) => ref.watch(repositoryProvider).maintenanceDetail(id),
);

class MaintenanceDetailScreen extends ConsumerWidget {
  final String id;
  const MaintenanceDetailScreen({super.key, required this.id});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: ref.watch(maintenanceDetailProvider(id)).when(
              data: (d) {
                final cancellable =
                    {'SUBMITTED', 'TRIAGED'}.contains(d.request.status);
                return Column(
                  children: [
                    ScreenHeader(
                        title: t.ar ? 'تفاصيل الطلب' : 'Request details'),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                        children: [
                          AqarCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        d.request.title,
                                        style: const TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.w700,
                                          color: appInk,
                                        ),
                                      ),
                                    ),
                                    StatusChip(
                                      maintenanceStatusLabel(
                                          d.request.status, t.ar),
                                      fg: appBlue,
                                      bg: appPetrolBg,
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${ltr(d.request.requestNo)} · ${ltr(d.request.unitCode)} · ${priorityLabel(d.request.priority, t.ar)}',
                                  style: const TextStyle(
                                      fontSize: 12, color: appGrey),
                                ),
                                if (d.description.isNotEmpty) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                    d.description,
                                    style: const TextStyle(
                                        fontSize: 12.5,
                                        color: appGrey,
                                        height: 1.6),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          AqarCard(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.ar ? 'السجل الزمني' : 'Timeline',
                                  style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: appInk,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                if (d.updates.isEmpty)
                                  Text(
                                    t.ar
                                        ? 'لا تحديثات بعد — حدّث بالسحب لمتابعة الحالة'
                                        : 'No updates yet — pull to refresh for status',
                                    style: const TextStyle(
                                        fontSize: 12, color: appGrey),
                                  )
                                else
                                  for (final u in d.updates)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                          vertical: 5),
                                      child: Row(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Container(
                                            width: 8,
                                            height: 8,
                                            margin: const EdgeInsets.only(
                                                top: 5),
                                            decoration: const BoxDecoration(
                                              color: appBlue,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                          const SizedBox(width: 10),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  maintenanceStatusLabel(
                                                      '${u['resulting_status'] ?? ''}',
                                                      t.ar),
                                                  style: const TextStyle(
                                                    fontSize: 12.5,
                                                    fontWeight:
                                                        FontWeight.w600,
                                                  ),
                                                ),
                                                if ((u['note'] ?? '')
                                                    .toString()
                                                    .isNotEmpty)
                                                  Text(
                                                    '${u['note']}',
                                                    style: const TextStyle(
                                                        fontSize: 11.5,
                                                        color: appGrey),
                                                  ),
                                                Text(
                                                  formatDate(
                                                      u['created_at']
                                                          as String?,
                                                      locale),
                                                  style: const TextStyle(
                                                      fontSize: 10.5,
                                                      color: appGrey),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
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
                                    t.ar ? 'المرفقات' : 'Attachments',
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
                          const SizedBox(height: 18),
                          AqarButton(
                            t.ar ? 'إضافة صور' : 'Add photos',
                            secondary: true,
                            onPressed: () => _upload(context, ref, id),
                          ),
                          if (cancellable) ...[
                            const SizedBox(height: 10),
                            AqarButton(
                              t.ar ? 'إلغاء الطلب' : 'Cancel request',
                              danger: true,
                              onPressed: () async {
                                final ok = await confirmDestructive(
                                  context,
                                  title: t.ar
                                      ? 'إلغاء طلب الصيانة؟'
                                      : 'Cancel this request?',
                                  message: t.ar
                                      ? 'سيتوقف التعامل مع هذا الطلب نهائيًا.'
                                      : 'This request will be closed permanently.',
                                  confirmLabel:
                                      t.ar ? 'إلغاء الطلب' : 'Cancel it',
                                );
                                if (!ok || !context.mounted) return;
                                try {
                                  await ref
                                      .read(repositoryProvider)
                                      .cancelMaintenance(id, null);
                                  ref.invalidate(
                                      maintenanceDetailProvider(id));
                                  ref.invalidate(
                                      featureMaintenanceProvider);
                                  if (context.mounted) {
                                    Navigator.pop(context);
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    showFeedback(context,
                                        friendlyError(e, locale));
                                  }
                                }
                              },
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                );
              },
              loading: () => const SkeletonList(),
              error: (e, _) => AppError(
                message: friendlyError(e, locale, loading: true),
                onRetry: () => ref.invalidate(maintenanceDetailProvider(id)),
              ),
            ),
      ),
    );
  }
}

Future<void> _upload(BuildContext context, WidgetRef ref, String id) async {
  final locale = Localizations.localeOf(context);
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
          : f.extension == 'webp'
              ? 'image/webp'
              : 'image/jpeg';
  try {
    await ref.read(repositoryProvider).uploadMaintenanceAttachment(
          requestId: id,
          fileName: f.name,
          mimeType: mime,
          bytes: bytes,
        );
    ref.invalidate(maintenanceDetailProvider(id));
  } catch (e) {
    if (context.mounted) {
      showFeedback(context, friendlyError(e, locale));
    }
  }
}
