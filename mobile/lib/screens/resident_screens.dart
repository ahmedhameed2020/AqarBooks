import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../core/plural.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'feature_screens.dart';

final homeProvider = FutureProvider.autoDispose<HomeSummary>(
  (ref) => ref.watch(repositoryProvider).homeSummary(),
);
final duesProvider = FutureProvider.autoDispose<List<DueItem>>(
  (ref) => ref.watch(repositoryProvider).dues(),
);
final paymentsProvider = FutureProvider.autoDispose<List<PaymentItem>>(
  (ref) => ref.watch(repositoryProvider).payments(),
);
final unitsProvider = FutureProvider.autoDispose<List<UnitItem>>(
  (ref) => ref.watch(repositoryProvider).units(),
);
final fawrySettingsProvider = FutureProvider.autoDispose<Map<String, dynamic>?>(
  (ref) async {
    try {
      return await ref.watch(repositoryProvider).fawrySettings();
    } catch (_) {
      return null;
    }
  },
);

/// Visitor passes are shown once by the server; the app stores them locally
/// on this device so the pass can be re-opened (blueprint §2 / Figma 06).
class SavedPass {
  final String id, guestName, validUntil, payload, unitCode;
  const SavedPass({
    required this.id,
    required this.guestName,
    required this.validUntil,
    required this.payload,
    required this.unitCode,
  });
  Map<String, dynamic> toJson() => {
        'id': id,
        'guestName': guestName,
        'validUntil': validUntil,
        'payload': payload,
        'unitCode': unitCode,
      };
  static SavedPass fromJson(Map<String, dynamic> m) => SavedPass(
        id: m['id'] ?? '',
        guestName: m['guestName'] ?? '',
        validUntil: m['validUntil'] ?? '',
        payload: m['payload'] ?? '',
        unitCode: m['unitCode'] ?? '',
      );
}

const _passPrefKey = 'saved_visitor_passes';

Future<List<SavedPass>> loadSavedPasses() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_passPrefKey);
    if (raw == null) return const [];
    final list = jsonDecode(raw) as List;
    return [
      for (final item in list) SavedPass.fromJson(Map<String, dynamic>.from(item))
    ];
  } catch (_) {
    return const [];
  }
}

Future<void> saveVisitorPass(SavedPass pass) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final existing = await loadSavedPasses();
    final updated = [pass, ...existing.where((p) => p.id != pass.id)];
    await prefs.setString(
      _passPrefKey,
      jsonEncode([for (final p in updated.take(20)) p.toJson()]),
    );
  } catch (_) {}
}

final savedPassesProvider =
    FutureProvider.autoDispose<List<SavedPass>>((ref) => loadSavedPasses());

// ───────────────────────── 02 · Resident home ─────────────────────────

class ResidentHomeScreen extends ConsumerWidget {
  final AppSession session;
  const ResidentHomeScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.watch(unitsProvider);
    final dues = ref.watch(duesProvider);
    final payments = ref.watch(paymentsProvider);
    final maintenance = ref.watch(featureMaintenanceProvider);
    final passes = ref.watch(savedPassesProvider);
    final notifications = ref.watch(notificationsProvider);
    final userName = session.user.email?.split('@').first ?? '';
    return Column(
      children: [
        HomeHeader(
          title: t.ar ? 'مرحبًا، $userName' : 'Welcome, $userName',
          subtitle: session.contextLabel(locale),
          unread: notifications.maybeWhen(
            data: (items) => items.any((n) => !n.isRead),
            orElse: () => false,
          ),
          onBell: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationsScreen()),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(unitsProvider);
              ref.invalidate(duesProvider);
              ref.invalidate(paymentsProvider);
              ref.invalidate(featureMaintenanceProvider);
              ref.invalidate(notificationsProvider);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
              children: [
                // 1 — unit + balance
                units.when(
                  data: (items) => _unitCard(context, t, locale, items),
                  loading: () => const SkeletonList(rows: 1, rowHeight: 120),
                  error: (e, _) => AppError(
                    message: t.ar
                        ? 'تعذر تحميل حسابك — أعد المحاولة'
                        : 'Could not load your account — try again',
                    onRetry: () => ref.invalidate(unitsProvider),
                  ),
                ),
                const SizedBox(height: 12),
                // 2 — next due + pay CTA
                dues.maybeWhen(
                  data: (items) {
                    if (items.isEmpty) return const SizedBox.shrink();
                    final open =
                        items.where((d) => d.outstanding > 0).toList();
                    if (open.isEmpty) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _nextDueCard(context, ref, t, locale, open.first),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
                // 3 — last payment
                payments.maybeWhen(
                  data: (items) => items.isEmpty
                      ? const SizedBox.shrink()
                      : Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: ListRowCard(
                            icon: AqarIconType.wallet,
                            title: t.ar
                                ? 'آخر دفعة — ${formatMoney(items.first.amount, locale)}'
                                : 'Last payment — ${formatMoney(items.first.amount, locale)}',
                            subtitle:
                                '${t.ar ? 'إيصال' : 'Receipt'} ${localizedDigits(items.first.receipt, locale)} · ${formatDate(items.first.date, locale)}',
                          ),
                        ),
                  orElse: () => const SizedBox.shrink(),
                ),
                // 4 — active maintenance request
                maintenance.maybeWhen(
                  data: (items) {
                    final active = items
                        .where((m) => !{
                              'COMPLETED',
                              'CLOSED',
                              'CANCELLED',
                            }.contains(m.status))
                        .toList();
                    if (active.isEmpty) return const SizedBox.shrink();
                    final m = active.first;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: ListRowCard(
                        icon: AqarIconType.wrench,
                        iconFg: appBlue,
                        iconBg: appPetrolBg,
                        title: m.title,
                        subtitle:
                            '${t.ar ? 'آخر تحديث' : 'Updated'} ${relativeFrom(m.submittedAt, locale)}',
                        trailing: StatusChip(
                          maintenanceStatusLabel(m.status, t.ar),
                          fg: appBlue,
                          bg: appPetrolBg,
                        ),
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => MaintenanceDetailScreen(id: m.id),
                          ),
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
                // 5 — active visitor pass (saved locally)
                passes.maybeWhen(
                  data: (items) {
                    final active = items.where((p) {
                      final until = parseServerDate(p.validUntil);
                      return until != null && until.isAfter(DateTime.now());
                    }).toList();
                    if (active.isEmpty) return const SizedBox.shrink();
                    final p = active.first;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: ListRowCard(
                        icon: AqarIconType.qr,
                        iconFg: appPurple,
                        iconBg: appPurpleLight,
                        title: t.ar
                            ? 'تصريح زائر — ${p.guestName}'
                            : 'Visitor pass — ${p.guestName}',
                        subtitle: t.ar
                            ? 'صالح حتى ${formatDate(p.validUntil, locale)}'
                            : 'Valid until ${formatDate(p.validUntil, locale)}',
                        trailing: Text(
                          t.ar ? 'عرض QR' : 'Show QR',
                          style: const TextStyle(
                            color: appPurple,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => VisitorPassScreen(
                              guestName: p.guestName,
                              unitCode: p.unitCode,
                              validUntil: p.validUntil,
                              payload: p.payload,
                              invitationId: p.id,
                              alreadySaved: true,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
                // 6 — one important unread notification
                notifications.maybeWhen(
                  data: (items) {
                    final important = items
                        .where((n) => !n.isRead && n.priority != 'NORMAL')
                        .toList();
                    if (important.isEmpty) return const SizedBox.shrink();
                    final n = important.first;
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 11),
                      decoration: BoxDecoration(
                        color: appAmberBg,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const AqarIcon(AqarIconType.bell,
                              size: 16, color: appAmber),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              t.ar ? n.titleAr : n.titleEn,
                              maxLines: 2,
                              style: const TextStyle(
                                color: appAmber,
                                fontSize: 12,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _unitCard(
    BuildContext context,
    AppLabels t,
    Locale locale,
    List<UnitItem> items,
  ) {
    if (items.isEmpty) {
      return AqarCard(
        child: EmptyState(
          title: t.ar
              ? 'لا توجد وحدات مرتبطة بحسابك بعد'
              : 'No units are linked to your account yet',
          icon: Icons.home_work_outlined,
        ),
      );
    }
    final unit = items.first;
    final balance =
        items.fold<double>(0, (sum, item) => sum + item.balance);
    final overdue = balance > 0;
    return AqarCard(
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.ar ? 'وحدتي' : 'My unit',
                        style:
                            const TextStyle(fontSize: 11, color: appGrey)),
                    Text(
                      unit.code,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: appNavy,
                      ),
                    ),
                  ],
                ),
              ),
              if (items.length > 1)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: appSurface,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      const AqarIcon(AqarIconType.swap, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        t.ar ? 'تبديل الوحدة' : 'Switch unit',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: appNavy,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(height: 1),
          ),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.ar ? 'الرصيد المستحق' : 'Outstanding balance',
                      style: const TextStyle(fontSize: 12, color: appGrey),
                    ),
                    Text(
                      formatMoney(balance, locale),
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: appNavy,
                      ),
                    ),
                  ],
                ),
              ),
              if (overdue)
                StatusChip(t.overdue, fg: appDanger, bg: appDangerBg)
              else
                StatusChip(
                  t.ar ? 'خالص ✓' : 'Settled ✓',
                  fg: appSuccess,
                  bg: appSuccessBg,
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _nextDueCard(
    BuildContext context,
    WidgetRef ref,
    AppLabels t,
    Locale locale,
    DueItem due,
  ) =>
      AqarCard(
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t.ar ? 'الاستحقاق القادم' : 'Next due',
                        style: const TextStyle(fontSize: 11, color: appGrey),
                      ),
                      Text(
                        due.description,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: appInk,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  formatMoney(due.outstanding, locale),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: appInk,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${t.ar ? 'استحقاق' : 'Due'} ${formatDate(due.dueDate, locale, relative: false)}',
                    style: const TextStyle(fontSize: 12, color: appGrey),
                  ),
                ),
                _PayCta(due: due),
              ],
            ),
          ],
        ),
      );
}

/// «ادفع عبر فوري» appears only when the organization has Fawry enabled;
/// otherwise nothing renders here and the payments tab explains the offline
/// path (blueprint: no dead electronic-payment buttons).
class _PayCta extends ConsumerWidget {
  final DueItem due;
  const _PayCta({required this.due});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final settings = ref.watch(fawrySettingsProvider);
    return settings.maybeWhen(
      data: (s) => s == null
          ? const SizedBox.shrink()
          : FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: appNavy,
                padding:
                    const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => FawryCodeScreen(due: due, settings: s),
                ),
              ),
              child: Text(
                t.ar ? 'ادفع عبر فوري' : 'Pay with Fawry',
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

// ───────────────────────── My units ─────────────────────────

class UnitsScreen extends ConsumerWidget {
  const UnitsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.watch(unitsProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            t.units,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Expanded(
          child: units.when(
            data: (items) => items.isEmpty
                ? EmptyState(
                    title: t.ar
                        ? 'لا توجد وحدات مرتبطة بحسابك'
                        : 'No units linked to your account',
                    icon: Icons.home_work_outlined,
                  )
                : RefreshIndicator(
                    onRefresh: () async => ref.invalidate(unitsProvider),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final u = items[i];
                        return ListRowCard(
                          icon: AqarIconType.building,
                          title: u.code,
                          subtitle:
                              '${unitTypeLabel(u.type, t.ar)}${u.leaseStatus != null ? ' · ${leaseStatusLabel(u.leaseStatus!, t.ar)}' : ''}',
                          trailing: Text(
                            formatMoney(u.balance, locale),
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: u.balance > 0 ? appDanger : appSuccess,
                            ),
                          ),
                        );
                      },
                    ),
                  ),
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale, loading: true),
              onRetry: () => ref.invalidate(unitsProvider),
            ),
          ),
        ),
      ],
    );
  }
}

// ───────────────────────── 03 · Payments (عليّ / دفعت) ─────────────────────────

class PaymentsTabScreen extends ConsumerStatefulWidget {
  const PaymentsTabScreen({super.key});
  @override
  ConsumerState<PaymentsTabScreen> createState() => _PaymentsTabState();
}

class _PaymentsTabState extends ConsumerState<PaymentsTabScreen> {
  int tab = 0;
  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 10),
          child: Text(
            t.payments,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: SegmentedTabs(
            labels: [t.ar ? 'عليّ' : 'I owe', t.ar ? 'دفعت' : 'Paid'],
            index: tab,
            onChanged: (v) => setState(() => tab = v),
          ),
        ),
        const SizedBox(height: 12),
        Expanded(child: tab == 0 ? _duesList(locale, t) : _paymentsList(locale, t)),
      ],
    );
  }

  Widget _duesList(Locale locale, AppLabels t) {
    final dues = ref.watch(duesProvider);
    final fawry = ref.watch(fawrySettingsProvider).valueOrNull;
    return dues.when(
      data: (items) {
        final open = items.where((d) => d.outstanding > 0).toList()
          ..sort((a, b) {
            final lateA = overdueDays(a.dueDate), lateB = overdueDays(b.dueDate);
            if ((lateA > 0) != (lateB > 0)) return lateA > 0 ? -1 : 1;
            return a.dueDate.compareTo(b.dueDate);
          });
        if (open.isEmpty) {
          return EmptyState(
            title: t.ar
                ? 'لا توجد مستحقات حالية — ذمتك خالصة ✓'
                : 'No open dues — you are all settled ✓',
            icon: Icons.check_circle_outline,
          );
        }
        final total =
            open.fold<double>(0, (sum, due) => sum + due.outstanding);
        return RefreshIndicator(
          onRefresh: () async => ref.invalidate(duesProvider),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: appNavyBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      t.ar ? 'إجمالي المستحق عليك' : 'Total you owe',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: appNavy,
                      ),
                    ),
                    Text(
                      formatMoney(total, locale),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: appNavy,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              for (var i = 0; i < open.length; i++) ...[
                _dueCard(open[i], i == 0, locale, t, fawry),
                const SizedBox(height: 10),
              ],
              if (fawry == null)
                AqarCard(
                  child: Row(
                    children: [
                      const IconBadge(AqarIconType.cash),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          t.ar
                              ? 'السداد عند المحصّل أو مكتب الإدارة'
                              : 'Pay with the collector or at the office',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: appInk,
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              else
                Text(
                  t.ar
                      ? 'لا يظهر خيار الدفع الإلكتروني إلا إذا كانت خدمة فوري مفعّلة لمؤسستك.'
                      : 'Online payment only appears when Fawry is enabled for your organization.',
                  style: const TextStyle(fontSize: 11, color: appGrey),
                ),
            ],
          ),
        );
      },
      loading: () => const SkeletonList(),
      error: (e, _) => AppError(
        message: friendlyError(e, locale, loading: true),
        onRetry: () => ref.invalidate(duesProvider),
      ),
    );
  }

  Widget _dueCard(
    DueItem due,
    bool highlight,
    Locale locale,
    AppLabels t,
    Map<String, dynamic>? fawry,
  ) {
    final late = overdueDays(due.dueDate);
    final isLate = late > 0;
    return AqarCard(
      borderColor: isLate && highlight ? appDanger : null,
      borderWidth: isLate && highlight ? 1.3 : 1,
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      due.description,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: appInk,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${isLate ? (t.ar ? 'استحق' : 'Was due') : (t.ar ? 'يستحق' : 'Due')} ${formatDate(due.dueDate, locale, relative: false)}',
                      style: const TextStyle(fontSize: 11, color: appGrey),
                    ),
                  ],
                ),
              ),
              Text(
                formatMoney(due.outstanding, locale),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: appInk,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              isLate
                  ? StatusChip(
                      t.ar
                          ? 'متأخر ${countText(late, locale, ar: dayNoun, enOne: 'day', enOther: 'days')}'
                          : 'Overdue ${countText(late, locale, ar: dayNoun, enOne: 'day', enOther: 'days')}',
                      fg: appDanger,
                      bg: appDangerBg,
                    )
                  : StatusChip(
                      t.ar
                          ? 'مستحق خلال ${countText(-late, locale, ar: dayNoun, enOne: 'day', enOther: 'days')}'
                          : 'Due in ${countText(-late, locale, ar: dayNoun, enOne: 'day', enOther: 'days')}',
                      fg: appNavy,
                      bg: appNavyBg,
                    ),
              if (fawry != null && highlight)
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: appNavy,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          FawryCodeScreen(due: due, settings: fawry),
                    ),
                  ),
                  child: Text(
                    t.ar ? 'ادفع عبر فوري' : 'Pay with Fawry',
                    style: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _paymentsList(Locale locale, AppLabels t) {
    final payments = ref.watch(paymentsProvider);
    return payments.when(
      data: (items) => items.isEmpty
          ? EmptyState(
              title: t.ar
                  ? 'لم تُسجَّل مدفوعات بعد'
                  : 'No payments recorded yet',
              icon: Icons.receipt_long_outlined,
            )
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(paymentsProvider),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (_, i) {
                  final p = items[i];
                  return ListRowCard(
                    icon: AqarIconType.receipt,
                    iconFg: appSuccess,
                    iconBg: appSuccessBg,
                    title: formatMoney(p.amount, locale),
                    subtitle:
                        '${t.ar ? 'إيصال' : 'Receipt'} ${localizedDigits(p.receipt, locale)} · ${formatDate(p.date, locale)}',
                    trailing: StatusChip(
                      paymentMethodLabel(p.method, t.ar),
                      fg: appNavy,
                      bg: appNavyBg,
                    ),
                  );
                },
              ),
            ),
      loading: () => const SkeletonList(),
      error: (e, _) => AppError(
        message: friendlyError(e, locale, loading: true),
        onRetry: () => ref.invalidate(paymentsProvider),
      ),
    );
  }
}

// ───────────────────────── 04 · Fawry reference code ─────────────────────────

class FawryCodeScreen extends ConsumerStatefulWidget {
  final DueItem due;
  final Map<String, dynamic> settings;
  const FawryCodeScreen({super.key, required this.due, required this.settings});
  @override
  ConsumerState<FawryCodeScreen> createState() => _FawryCodeState();
}

class _FawryCodeState extends ConsumerState<FawryCodeScreen> {
  late final Future<FawryCheckout> _checkout;
  @override
  void initState() {
    super.initState();
    _checkout = ref.read(repositoryProvider).createFawryCheckout(
          dueIds: [widget.due.id],
          settings: widget.settings,
          clientRequestId:
              'mob-${widget.due.id}-${DateTime.now().millisecondsSinceEpoch ~/ 60000}',
        );
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ScreenHeader(title: ''),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  t.ar ? 'الدفع عبر فوري' : 'Pay with Fawry',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: appNavy,
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFDD00),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'fawry',
                    style: TextStyle(
                      color: Color(0xFF1C3F94),
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ),
              ],
            ),
            Expanded(
              child: FutureBuilder<FawryCheckout>(
                future: _checkout,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return AppError(
                      message: friendlyError(snapshot.error!, locale, loading: true),
                      onRetry: () => setState(() {}),
                    );
                  }
                  if (!snapshot.hasData) {
                    return const Center(
                        child: Padding(
                      padding: EdgeInsets.all(40),
                      child: SkeletonList(rows: 1, rowHeight: 200),
                    ));
                  }
                  final checkout = snapshot.data!;
                  final grouped = _groupReference(checkout.reference);
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                    children: [
                      AqarCard(
                        gold: true,
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            Text(
                              t.ar
                                  ? 'كود الدفع المرجعي'
                                  : 'Payment reference code',
                              style: const TextStyle(
                                  fontSize: 14, color: appGrey),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              localizedDigits(grouped, locale),
                              textAlign: TextAlign.center,
                              textDirection: TextDirection.ltr,
                              style: const TextStyle(
                                fontSize: 36,
                                fontWeight: FontWeight.w700,
                                color: appNavy,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              '${t.ar ? 'المبلغ' : 'Amount'}: ${formatMoney(checkout.amount, locale)}',
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: appInk,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const AqarIcon(AqarIconType.clock,
                                    size: 16, color: appGold),
                                const SizedBox(width: 6),
                                Text(
                                  t.ar
                                      ? 'الكود صالح للسداد الآن'
                                      : 'Code is ready for payment',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: appGold,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 18),
                      AqarButton(
                        t.ar ? 'نسخ الكود' : 'Copy code',
                        onPressed: () async {
                          await Clipboard.setData(
                              ClipboardData(text: checkout.reference));
                          if (context.mounted) {
                            showFeedback(
                                context, t.ar ? 'تم نسخ الكود' : 'Code copied');
                          }
                        },
                      ),
                      const SizedBox(height: 10),
                      AqarButton(
                        t.ar ? 'مشاركة' : 'Share',
                        secondary: true,
                        onPressed: () => _shareViaWhatsApp(checkout, t),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        t.ar
                            ? 'ادفع بهذا الكود في أي منفذ فوري'
                            : 'Pay with this code at any Fawry outlet',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                          color: appInk,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        t.ar
                            ? 'تظهر الدفعة في سجلك بعد السداد — حدّث الشاشة بالسحب'
                            : 'The payment appears in your history after paying — pull to refresh',
                        textAlign: TextAlign.center,
                        style:
                            const TextStyle(fontSize: 11.5, color: appGrey),
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _groupReference(String ref) {
    final digits = ref.replaceAll(RegExp(r'\s'), '');
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 3 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  Future<void> _shareViaWhatsApp(FawryCheckout checkout, AppLabels t) async {
    final text = Uri.encodeComponent(
      t.ar
          ? 'كود الدفع المرجعي (فوري): ${checkout.reference}'
          : 'Fawry payment reference: ${checkout.reference}',
    );
    final uri = Uri.parse('https://wa.me/?text=$text');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (mounted) {
        showFeedback(context,
            t.ar ? 'تعذر فتح المشاركة' : 'Could not open sharing');
      }
    }
  }
}

// ───────────────────────── Maintenance list + 05 new request ─────────────────

class MaintenanceListScreen extends ConsumerWidget {
  final AppSession session;
  const MaintenanceListScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final items = ref.watch(featureMaintenanceProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  t.maintenance,
                  style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w700,
                      color: appInk),
                ),
              ),
              FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: appNavy,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(
                      builder: (_) => const NewMaintenanceRequestScreen()),
                ),
                child: Text(
                  t.ar ? 'طلب جديد' : 'New request',
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: items.when(
            data: (list) => list.isEmpty
                ? EmptyState(
                    title: t.ar
                        ? 'لا توجد طلبات صيانة مفتوحة'
                        : 'No open maintenance requests',
                    icon: Icons.build_outlined,
                    ctaLabel: t.ar ? 'طلب جديد' : 'New request',
                    onCta: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (_) =>
                              const NewMaintenanceRequestScreen()),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: () async =>
                        ref.invalidate(featureMaintenanceProvider),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final m = list[i];
                        return ListRowCard(
                          icon: AqarIconType.wrench,
                          iconFg: appBlue,
                          iconBg: appPetrolBg,
                          title: m.title,
                          subtitle:
                              '${ltr(m.requestNo)} · ${ltr(m.unitCode)}',
                          trailing: StatusChip(
                            maintenanceStatusLabel(m.status, t.ar),
                            fg: appBlue,
                            bg: appPetrolBg,
                          ),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  MaintenanceDetailScreen(id: m.id),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale, loading: true),
              onRetry: () => ref.invalidate(featureMaintenanceProvider),
            ),
          ),
        ),
      ],
    );
  }
}

final maintenanceCategoriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(repositoryProvider).maintenanceCategories(),
);

class NewMaintenanceRequestScreen extends ConsumerStatefulWidget {
  const NewMaintenanceRequestScreen({super.key});
  @override
  ConsumerState<NewMaintenanceRequestScreen> createState() =>
      _NewMaintenanceState();
}

class _NewMaintenanceState extends ConsumerState<NewMaintenanceRequestScreen> {
  String? unitId;
  String? categoryId;
  final description = TextEditingController();
  bool busy = false;

  @override
  void dispose() {
    description.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.read(unitsProvider).valueOrNull ?? const <UnitItem>[];
    final cats =
        ref.read(maintenanceCategoriesProvider).valueOrNull ?? const [];
    final unit = unitId ?? (units.isNotEmpty ? units.first.id : null);
    final cat =
        categoryId ?? (cats.isNotEmpty ? cats.first['id'] as String : null);
    if (unit == null || cat == null || description.text.trim().isEmpty) {
      showFeedback(
          context,
          t.ar
              ? 'اختر الوحدة والتصنيف واكتب وصف المشكلة'
              : 'Pick a unit, a category and describe the problem');
      return;
    }
    setState(() => busy = true);
    try {
      final catName = cats
          .where((c) => c['id'] == cat)
          .map((c) => '${c['name_ar'] ?? c['name_en'] ?? ''}')
          .join();
      final id = await ref.read(repositoryProvider).createMaintenance(
            unitId: unit,
            categoryId: cat,
            title: catName.isEmpty
                ? description.text.trim().split('\n').first
                : catName,
            description: description.text.trim(),
            priority: 'NORMAL',
          );
      ref.invalidate(featureMaintenanceProvider);
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => MaintenanceDetailScreen(id: id)),
        );
        showFeedback(context,
            t.ar ? 'تم إرسال طلب الصيانة' : 'Maintenance request submitted');
      }
    } catch (e) {
      if (mounted) showFeedback(context, friendlyError(e, locale));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.watch(unitsProvider);
    final cats = ref.watch(maintenanceCategoriesProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: t.ar ? 'طلب صيانة جديد' : 'New maintenance request'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                children: [
                  _label(t.ar ? 'الوحدة' : 'Unit'),
                  units.maybeWhen(
                    data: (items) => _dropdown<String>(
                      value: unitId ??
                          (items.isNotEmpty ? items.first.id : null),
                      items: [
                        for (final u in items)
                          DropdownMenuItem(value: u.id, child: Text(u.code)),
                      ],
                      onChanged: (v) => setState(() => unitId = v),
                    ),
                    orElse: () =>
                        const SkeletonList(rows: 1, rowHeight: 52),
                  ),
                  const SizedBox(height: 14),
                  _label(t.ar ? 'التصنيف' : 'Category'),
                  cats.maybeWhen(
                    data: (items) => _dropdown<String>(
                      value: categoryId ??
                          (items.isNotEmpty
                              ? items.first['id'] as String
                              : null),
                      items: [
                        for (final c in items)
                          DropdownMenuItem(
                            value: c['id'] as String,
                            child: Text(
                              t.ar
                                  ? '${c['name_ar'] ?? c['name_en']}'
                                  : '${c['name_en'] ?? c['name_ar']}',
                            ),
                          ),
                      ],
                      onChanged: (v) => setState(() => categoryId = v),
                    ),
                    orElse: () =>
                        const SkeletonList(rows: 1, rowHeight: 52),
                  ),
                  const SizedBox(height: 14),
                  _label(t.ar ? 'وصف المشكلة' : 'Describe the problem'),
                  TextField(
                    controller: description,
                    maxLines: 4,
                    decoration: InputDecoration(
                      hintText: t.ar
                          ? 'اشرح المشكلة باختصار…'
                          : 'Briefly describe the issue…',
                    ),
                  ),
                  const SizedBox(height: 14),
                  _label(t.ar ? 'صور (اختياري)' : 'Photos (optional)'),
                  _UploadHint(t: t),
                  const SizedBox(height: 22),
                  AqarButton(
                    t.ar ? 'إرسال الطلب' : 'Submit request',
                    busy: busy,
                    onPressed: submit,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    t.ar
                        ? 'يمكنك إلغاء الطلب طالما لم يبدأ الفحص'
                        : 'You can cancel the request until triage starts',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 11, color: appGrey),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: appInk,
          ),
        ),
      );

  Widget _dropdown<T>({
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) =>
      Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: appCardBorder),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<T>(
            value: value,
            isExpanded: true,
            icon: const AqarIcon(AqarIconType.chevronDown,
                size: 18, color: appGrey),
            style: const TextStyle(
              fontFamily: appFontFamily,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: appInk,
            ),
            items: items,
            onChanged: onChanged,
          ),
        ),
      );
}

class _UploadHint extends StatelessWidget {
  final AppLabels t;
  const _UploadHint({required this.t});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 22),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: appNavy, width: 1.1),
        ),
        child: Column(
          children: [
            const AqarIcon(AqarIconType.camera, size: 26),
            const SizedBox(height: 8),
            Text(
              t.ar ? 'إضافة صور المشكلة' : 'Add photos of the issue',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: appNavy,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              t.ar
                  ? 'JPEG · PNG · WebP · PDF — حتى ١٠ م.ب (بعد الإرسال)'
                  : 'JPEG · PNG · WebP · PDF — up to 10 MB (after submit)',
              style: const TextStyle(fontSize: 11, color: appGrey),
            ),
          ],
        ),
      );
}

// ───────────────────────── Visitors + 06 pass screen ─────────────────────────

class VisitorsScreen extends ConsumerWidget {
  const VisitorsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: t.visitors),
            Expanded(
              child: ref.watch(visitorsProvider).when(
                    data: (items) => items.isEmpty
                        ? EmptyState(
                            title: t.ar
                                ? 'لا توجد دعوات زوار نشطة'
                                : 'No active visitor invitations',
                            icon: Icons.people_outline,
                            ctaLabel: t.ar ? 'دعوة زائر' : 'Invite a guest',
                            onCta: () => _openCreate(context),
                          )
                        : RefreshIndicator(
                            onRefresh: () async =>
                                ref.invalidate(visitorsProvider),
                            child: ListView.separated(
                              padding: const EdgeInsets.all(20),
                              itemCount: items.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 10),
                              itemBuilder: (_, i) => _row(
                                  context, ref, items[i], t, locale),
                            ),
                          ),
                    loading: () => const SkeletonList(),
                    error: (e, _) => AppError(
                      message: friendlyError(e, locale, loading: true),
                      onRetry: () => ref.invalidate(visitorsProvider),
                    ),
                  ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: appNavy,
        foregroundColor: Colors.white,
        onPressed: () => _openCreate(context),
        icon: const Icon(Icons.add),
        label: Text(t.ar ? 'دعوة زائر' : 'Invite guest'),
      ),
    );
  }

  void _openCreate(BuildContext context) => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const NewVisitorScreen()),
      );

  Widget _row(BuildContext context, WidgetRef ref, VisitorItem item,
      AppLabels t, Locale locale) {
    return ListRowCard(
      icon: AqarIconType.people,
      iconFg: appPurple,
      iconBg: appPurpleLight,
      title: item.guestName,
      subtitle:
          '${item.unitCode} · ${t.ar ? 'حتى' : 'until'} ${formatDate(item.validUntil, locale)}',
      trailing: item.status == 'ACTIVE'
          ? TextButton(
              onPressed: () async {
                final confirmed = await confirmDestructive(
                  context,
                  title: t.ar ? 'إلغاء التصريح؟' : 'Revoke this pass?',
                  message: t.ar
                      ? 'لن يتمكن ${item.guestName} من الدخول بهذا التصريح بعد الإلغاء.'
                      : '${item.guestName} will no longer be able to enter with this pass.',
                  confirmLabel: t.ar ? 'إلغاء التصريح' : 'Revoke',
                );
                if (!confirmed) return;
                try {
                  await ref.read(repositoryProvider).revokeVisitor(item.id);
                  ref.invalidate(visitorsProvider);
                } catch (e) {
                  if (context.mounted) {
                    showFeedback(context, friendlyError(e, locale));
                  }
                }
              },
              child: Text(
                t.ar ? 'إلغاء' : 'Revoke',
                style: const TextStyle(
                  color: appDanger,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            )
          : StatusChip(
              visitorStatusLabel(item.status, t.ar),
              fg: appGrey,
              bg: const Color(0xFFEEF1F5),
            ),
    );
  }
}

class NewVisitorScreen extends ConsumerStatefulWidget {
  const NewVisitorScreen({super.key});
  @override
  ConsumerState<NewVisitorScreen> createState() => _NewVisitorState();
}

class _NewVisitorState extends ConsumerState<NewVisitorScreen> {
  final name = TextEditingController();
  final phone = TextEditingController();
  String? unitId;
  bool singleUse = true;
  int validityDays = 1;
  bool busy = false;

  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.read(unitsProvider).valueOrNull ?? const <UnitItem>[];
    final unit = unitId ?? (units.isNotEmpty ? units.first.id : null);
    if (unit == null || name.text.trim().isEmpty) {
      showFeedback(context,
          t.ar ? 'اكتب اسم الزائر واختر الوحدة' : 'Enter the guest name and unit');
      return;
    }
    setState(() => busy = true);
    try {
      final now = DateTime.now();
      final until = now.add(Duration(days: validityDays));
      final endOfDay =
          DateTime(until.year, until.month, until.day, 23, 59, 59);
      final result = await ref.read(repositoryProvider).createVisitor(
            unitId: unit,
            guestName: name.text.trim(),
            phone: phone.text.trim().isEmpty ? null : phone.text.trim(),
            from: now.toUtc().toIso8601String(),
            until: endOfDay.toUtc().toIso8601String(),
            usage: singleUse ? 'SINGLE_USE' : 'MULTI_USE',
          );
      ref.invalidate(visitorsProvider);
      final unitCode = units
          .where((u) => u.id == unit)
          .map((u) => u.code)
          .join();
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => VisitorPassScreen(
              guestName: name.text.trim(),
              unitCode: unitCode,
              validUntil: endOfDay.toIso8601String(),
              payload: result.qrPayload,
              invitationId: result.id,
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) showFeedback(context, friendlyError(e, locale));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final units = ref.watch(unitsProvider).valueOrNull ?? const <UnitItem>[];
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: t.ar ? 'دعوة زائر' : 'Invite a guest'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
                children: [
                  TextField(
                    controller: name,
                    decoration: InputDecoration(
                      hintText: t.ar ? 'اسم الزائر' : 'Guest name',
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: phone,
                    keyboardType: TextInputType.phone,
                    decoration: InputDecoration(
                      hintText:
                          t.ar ? 'هاتف الزائر (اختياري)' : 'Guest phone (optional)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (units.length > 1)
                    Container(
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: appCardBorder),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: unitId ?? units.first.id,
                          isExpanded: true,
                          items: [
                            for (final u in units)
                              DropdownMenuItem(
                                  value: u.id, child: Text(u.code)),
                          ],
                          onChanged: (v) => setState(() => unitId = v),
                        ),
                      ),
                    ),
                  const SizedBox(height: 12),
                  SegmentedTabs(
                    labels: [
                      t.ar ? 'اليوم' : 'Today',
                      t.ar ? '٣ أيام' : '3 days',
                      t.ar ? 'أسبوع' : 'Week',
                    ],
                    index: validityDays == 1 ? 0 : (validityDays == 3 ? 1 : 2),
                    onChanged: (i) => setState(
                        () => validityDays = i == 0 ? 1 : (i == 1 ? 3 : 7)),
                  ),
                  const SizedBox(height: 12),
                  SegmentedTabs(
                    labels: [
                      t.ar ? 'مرة واحدة' : 'Single use',
                      t.ar ? 'متعدد' : 'Multi use',
                    ],
                    index: singleUse ? 0 : 1,
                    onChanged: (i) => setState(() => singleUse = i == 0),
                  ),
                  const SizedBox(height: 22),
                  AqarButton(
                    t.ar ? 'إنشاء التصريح' : 'Create pass',
                    busy: busy,
                    onPressed: submit,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 06 · The pass screen with the explicit "save or share now" warning —
/// the server stores only a hash and can never show this QR again.
class VisitorPassScreen extends ConsumerStatefulWidget {
  final String guestName, unitCode, validUntil, payload, invitationId;
  final bool alreadySaved;
  const VisitorPassScreen({
    super.key,
    required this.guestName,
    required this.unitCode,
    required this.validUntil,
    required this.payload,
    required this.invitationId,
    this.alreadySaved = false,
  });
  @override
  ConsumerState<VisitorPassScreen> createState() => _VisitorPassState();
}

class _VisitorPassState extends ConsumerState<VisitorPassScreen> {
  late bool saved = widget.alreadySaved;

  Future<void> _save() async {
    await saveVisitorPass(SavedPass(
      id: widget.invitationId,
      guestName: widget.guestName,
      validUntil: widget.validUntil,
      payload: widget.payload,
      unitCode: widget.unitCode,
    ));
    ref.invalidate(savedPassesProvider);
    if (mounted) setState(() => saved = true);
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: t.ar ? 'تصريح زائر' : 'Visitor pass'),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 6, 24, 24),
                children: [
                  AqarCard(
                    gold: true,
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        Container(
                          key: const ValueKey('visitor-pass-qr'),
                          color: Colors.white,
                          child: QrImageView(
                            data: widget.payload,
                            version: QrVersions.auto,
                            size: 180,
                            backgroundColor: Colors.white,
                            eyeStyle: const QrEyeStyle(
                              eyeShape: QrEyeShape.square,
                              color: appNavy,
                            ),
                            dataModuleStyle: const QrDataModuleStyle(
                              dataModuleShape: QrDataModuleShape.square,
                              color: appNavy,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          widget.guestName,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: appInk,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${widget.unitCode.isEmpty ? '' : '${widget.unitCode} · '}${t.ar ? 'زيارة' : 'Visit'}',
                          style:
                              const TextStyle(fontSize: 13, color: appGrey),
                        ),
                        const SizedBox(height: 8),
                        StatusChip(
                          '${t.ar ? 'صالح حتى' : 'Valid until'} ${formatDate(widget.validUntil, locale)}',
                          fg: appSuccess,
                          bg: appSuccessBg,
                          fontSize: 12,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: appAmberBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const AqarIcon(AqarIconType.warning,
                            size: 20, color: appAmber),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            t.ar
                                ? 'احفظ أو شارك التصريح الآن — لا يمكن استرجاعه لاحقًا'
                                : 'Save or share this pass now — it cannot be retrieved later',
                            style: const TextStyle(
                              color: appAmber,
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  AqarButton(
                    t.ar ? 'مشاركة عبر واتساب' : 'Share via WhatsApp',
                    onPressed: () async {
                      final text = Uri.encodeComponent(
                        t.ar
                            ? 'تصريح زيارة لـ${widget.guestName} — ${widget.unitCode}\n${widget.payload}'
                            : 'Visitor pass for ${widget.guestName} — ${widget.unitCode}\n${widget.payload}',
                      );
                      try {
                        await launchUrl(
                          Uri.parse('https://wa.me/?text=$text'),
                          mode: LaunchMode.externalApplication,
                        );
                      } catch (_) {
                        if (context.mounted) {
                          showFeedback(
                              context,
                              t.ar
                                  ? 'تعذر فتح واتساب'
                                  : 'Could not open WhatsApp');
                        }
                      }
                    },
                  ),
                  const SizedBox(height: 10),
                  AqarButton(
                    saved
                        ? (t.ar ? 'محفوظ على الجهاز ✓' : 'Saved on device ✓')
                        : (t.ar ? 'حفظ على الجهاز' : 'Save on device'),
                    secondary: true,
                    onPressed: saved ? null : _save,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    t.ar
                        ? 'التصريح محفوظ محليًا على هذا الجهاز فقط'
                        : 'The pass is stored locally on this device only',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 11, color: appGrey),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ───────────────────────── Localized domain labels ─────────────────────────

String maintenanceStatusLabel(String status, bool ar) => switch (status) {
      'SUBMITTED' => ar ? 'مُقدَّم' : 'Submitted',
      'TRIAGED' => ar ? 'قيد الفحص' : 'Triaged',
      'IN_PROGRESS' => ar ? 'قيد التنفيذ' : 'In progress',
      'WAITING' => ar ? 'معلّق مؤقتًا' : 'On hold',
      'COMPLETED' => ar ? 'مكتمل' : 'Completed',
      'CLOSED' => ar ? 'مغلق' : 'Closed',
      'CANCELLED' => ar ? 'ملغي' : 'Cancelled',
      _ => ar ? 'قيد المتابعة' : status,
    };

String workOrderStatusLabel(String status, bool ar) => switch (status) {
      'DRAFT' => ar ? 'مسودة' : 'Draft',
      'ASSIGNED' => ar ? 'مُسند' : 'Assigned',
      'SCHEDULED' => ar ? 'مجدول' : 'Scheduled',
      'IN_PROGRESS' => ar ? 'قيد التنفيذ' : 'In progress',
      'WAITING' => ar ? 'معلّق مؤقتًا' : 'On hold',
      'COMPLETED' => ar ? 'مكتمل' : 'Completed',
      'CANCELLED' => ar ? 'ملغي' : 'Cancelled',
      _ => status,
    };

String priorityLabel(String priority, bool ar) => switch (priority) {
      'URGENT' => ar ? 'طارئة' : 'Urgent',
      'HIGH' => ar ? 'عالية' : 'High',
      'NORMAL' => ar ? 'عادية' : 'Normal',
      'LOW' => ar ? 'منخفضة' : 'Low',
      _ => priority,
    };

String paymentMethodLabel(String method, bool ar) => switch (method) {
      'CASH' => ar ? 'نقدي' : 'Cash',
      'BANK_TRANSFER' => ar ? 'تحويل بنكي' : 'Bank transfer',
      'CHEQUE' => ar ? 'شيك' : 'Cheque',
      'ONLINE' => ar ? 'أونلاين (فوري)' : 'Online (Fawry)',
      'OTHER' => ar ? 'أخرى' : 'Other',
      _ => method,
    };

String visitorStatusLabel(String status, bool ar) => switch (status) {
      'ACTIVE' => ar ? 'نشط' : 'Active',
      'USED' => ar ? 'مستخدم' : 'Used',
      'EXPIRED' => ar ? 'منتهي' : 'Expired',
      'REVOKED' => ar ? 'ملغي' : 'Revoked',
      _ => status,
    };

String unitTypeLabel(String? type, bool ar) => switch (type) {
      'VILLA' => ar ? 'فيلا' : 'Villa',
      'APARTMENT' => ar ? 'شقة' : 'Apartment',
      'CHALET' => ar ? 'شاليه' : 'Chalet',
      'SHOP' => ar ? 'محل' : 'Shop',
      'OFFICE' => ar ? 'مكتب' : 'Office',
      null => ar ? 'وحدة' : 'Unit',
      _ => type,
    };

String leaseStatusLabel(String status, bool ar) => switch (status) {
      'ACTIVE' => ar ? 'عقد نشط' : 'Active lease',
      'SCHEDULED' => ar ? 'عقد قادم' : 'Upcoming lease',
      'ENDED' => ar ? 'عقد منتهٍ' : 'Ended lease',
      _ => status,
    };

String gateReasonLabel(String? code, bool ar) => switch (code) {
      'EXPIRED' => ar ? 'التصريح منتهي الصلاحية' : 'Pass expired',
      'PASS_ALREADY_USED' =>
        ar ? 'التصريح مستخدم من قبل' : 'Pass already used',
      'REVOKED' => ar ? 'التصريح ملغي' : 'Pass revoked',
      'INVALID_PASS' => ar ? 'تصريح غير صحيح' : 'Invalid pass',
      'NOT_YET_VALID' => ar ? 'خارج وقت الصلاحية' : 'Not yet valid',
      'GATE_INACTIVE' => ar ? 'البوابة غير نشطة' : 'Gate inactive',
      'DIRECTION_NOT_ALLOWED' =>
        ar ? 'اتجاه غير مسموح لهذه البوابة' : 'Direction not allowed',
      'PROPERTY_MISMATCH' =>
        ar ? 'التصريح لا يخص هذا المشروع' : 'Pass is for another property',
      'ALREADY_INSIDE' => ar ? 'الزائر بالداخل بالفعل' : 'Already inside',
      'NOT_INSIDE' => ar ? 'لا يوجد دخول مسجل للزائر' : 'No entry on record',
      _ => ar ? 'غير مسموح' : 'Not allowed',
    };
