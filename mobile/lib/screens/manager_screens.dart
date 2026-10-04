import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../core/contact.dart';
import '../core/formatting.dart';
import '../core/plural.dart';
import '../core/shell_nav.dart';
import '../data/overdue_aging.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'feature_screens.dart';
import 'resident_screens.dart' show priorityLabel;
import 'technician_screens.dart' show WorkOrderDetailScreen;

/// Every overdue due, net of allocations, with its owner. Shared by the
/// manager home (totals + largest) and the Collections tab.
final overdueProvider = FutureProvider.autoDispose<List<OverdueItem>>(
  (ref) => ref.watch(repositoryProvider).overdueDues(),
);

final managerAttentionProvider = FutureProvider.autoDispose<ManagerAttention>((
  ref,
) async {
  final session = await ref.watch(sessionProvider.future);
  var overdue = const <OverdueItem>[];
  var failed = false;
  try {
    overdue = await ref.watch(overdueProvider.future);
  } catch (_) {
    // Reported as "unknown", never as a reassuring zero.
    failed = true;
  }
  return ref
      .watch(repositoryProvider)
      .managerAttention(
        session?.organizationId,
        overdue: overdue,
        overdueFailed: failed,
      );
});
final assignQueueProvider = FutureProvider.autoDispose<List<MaintenanceItem>>(
  (ref) => ref.watch(repositoryProvider).assignQueue(),
);

/// Manager bottom-navigation indexes (see AppShell).
const managerTabCollections = 1;
const managerTabMaintenance = 2;
const managerTabOperations = 3;

void goToShellTab(WidgetRef ref, int index) =>
    ref.read(shellTabProvider.notifier).state = index;

// ───────────────────────── 07 · Manager home ─────────────────────────

class ManagerHomeScreen extends ConsumerWidget {
  final AppSession session;
  const ManagerHomeScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final attention = ref.watch(managerAttentionProvider);
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
          child: attention.when(
            data: (data) => RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(overdueProvider);
                ref.invalidate(managerAttentionProvider);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                children: [
                  // The number a manager acts on first gets the most weight;
                  // the rest are a quiet strip. Each tile that has a
                  // destination is tappable.
                  _overdueHero(ref, data, locale, t),
                  const SizedBox(height: 10),
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Expanded(
                          child: _stat(
                            formatMoney(data.todayCollections, locale),
                            t.ar ? 'تحصيلات اليوم' : "Today's collections",
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _stat(
                            formatNumber(data.openMaintenance, locale),
                            t.ar ? 'طلبات صيانة مفتوحة' : 'Open maintenance',
                            onTap: () =>
                                goToShellTab(ref, managerTabMaintenance),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _stat(
                            formatNumber(data.visitorsInside, locale),
                            t.ar ? 'الزوار الآن' : 'Visitors inside',
                            onTap: () =>
                                goToShellTab(ref, managerTabOperations),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
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
                      _attentionRow(context, ref, item, locale, t),
                      const SizedBox(height: 10),
                    ],
                ],
              ),
            ),
            loading: () => const SkeletonList(rows: 5),
            error: (e, _) => AppError(
              message: friendlyError(e, locale, loading: true),
              onRetry: () {
                ref.invalidate(overdueProvider);
                ref.invalidate(managerAttentionProvider);
              },
            ),
          ),
        ),
      ],
    );
  }

  Widget _overdueHero(
    WidgetRef ref,
    ManagerAttention data,
    Locale locale,
    AppLabels t,
  ) {
    final failed = data.overdueFailed;
    final clear = !failed && data.totalOverdue <= 0;
    final caption = failed
        ? (t.ar
              ? 'تعذر تحميل المتأخرات — اسحب للتحديث'
              : 'Could not load overdue balances — pull to refresh')
        : clear
        ? (t.ar ? 'لا توجد متأخرات ✓' : 'No overdue balances ✓')
        : '${t.ar ? 'من' : 'Across'} ${countText(data.overdueUnitCount, locale, ar: unitNoun, enOne: 'unit', enOther: 'units')}'
              ' — ${t.ar ? 'اضغط لعرض التفاصيل' : 'tap for details'}';
    return Semantics(
      button: !failed && !clear,
      label:
          '${t.ar ? 'إجمالي المتأخرات' : 'Total overdue'}: '
          '${failed ? '' : formatMoney(data.totalOverdue, locale)}. $caption',
      child: Material(
        color: appNavy,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: (failed || clear)
              ? null
              : () => goToShellTab(ref, managerTabCollections),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.ar ? 'إجمالي المتأخرات' : 'Total overdue',
                        style: const TextStyle(
                          color: Color(0xFFCFE0E8),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    if (!failed && !clear)
                      const AqarIcon(
                        AqarIconType.chevron,
                        size: 16,
                        color: Color(0xFFCFE0E8),
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  failed ? '—' : formatMoney(data.totalOverdue, locale),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  caption,
                  style: const TextStyle(
                    color: Color(0xFFCFE0E8),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _stat(String value, String label, {VoidCallback? onTap}) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(14),
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
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
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: appNavy,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 11,
                color: appGrey,
                height: 1.35,
              ),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _attentionRow(
    BuildContext context,
    WidgetRef ref,
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
            ? 'متأخرات كبيرة — ${ltr(item.title)}'
            : 'Large overdue — ${ltr(item.title)}',
        '${formatMoney(item.amount ?? 0, locale)} · ${t.ar ? 'متأخر' : 'overdue'} ${countText(daysLate(item.date ?? '', DateTime.now()), locale, ar: dayNoun, enOne: 'day', enOther: 'days')}',
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
            ? 'أمر شغل تجاوز مهلة الخدمة — ${ltr(item.title)}'
            : 'Work order past its SLA — ${ltr(item.title)}',
        '${t.ar ? 'المهلة' : 'Due'} ${formatDate(item.date, locale)}',
      ),
      AttentionKind.leaseEnding => (
        AqarIconType.document,
        appNavy,
        appSurface,
        t.ar
            ? 'عقد ينتهي قريبًا — وحدة ${ltr(item.title)}'
            : 'Lease ending soon — unit ${ltr(item.title)}',
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
    // Rows with a destination are tappable; the rest stay informational
    // instead of showing a dead chevron.
    final VoidCallback? onTap = switch (item.kind) {
      AttentionKind.overdue => () => goToShellTab(ref, managerTabCollections),
      AttentionKind.gateException => () => goToShellTab(
        ref,
        managerTabOperations,
      ),
      AttentionKind.slaBreach when item.refId != null => () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => WorkOrderDetailScreen(id: item.refId!),
        ),
      ),
      _ => null,
    };
    return ListRowCard(
      icon: icon,
      iconFg: fg,
      iconBg: bg,
      title: title,
      subtitle: sub,
      onTap: onTap,
    );
  }
}

// ───────────────────────── Collections tab (overdue → act) ─────────────────

/// Aging colours run from a calm amber to the danger red; every bucket is also
/// labelled with text and an amount, so colour is never the only signal.
const _agingColors = <AgingBucket, Color>{
  AgingBucket.d1to30: Color(0xFFE8B04A),
  AgingBucket.d31to60: Color(0xFFDB8340),
  AgingBucket.d61to90: Color(0xFFC85A3C),
  AgingBucket.d90plus: appDanger,
};

String _bucketLabel(AgingBucket bucket, Locale locale) {
  final ar = locale.languageCode == 'ar';
  return switch (bucket) {
    AgingBucket.all => ar ? 'الكل' : 'All',
    AgingBucket.d1to30 =>
      ar ? '${localizedDigits('1–30', locale)} يوم' : '1–30 days',
    AgingBucket.d31to60 =>
      ar ? '${localizedDigits('31–60', locale)} يوم' : '31–60 days',
    AgingBucket.d61to90 =>
      ar ? '${localizedDigits('61–90', locale)} يوم' : '61–90 days',
    AgingBucket.d90plus =>
      ar ? '${localizedDigits('+90', locale)} يوم' : '90+ days',
  };
}

class ManagerCollectionsScreen extends ConsumerStatefulWidget {
  const ManagerCollectionsScreen({super.key});
  @override
  ConsumerState<ManagerCollectionsScreen> createState() =>
      _ManagerCollectionsState();
}

class _ManagerCollectionsState extends ConsumerState<ManagerCollectionsScreen> {
  AgingBucket bucket = AgingBucket.all;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final overdue = ref.watch(overdueProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Text(
            t.collections,
            style: const TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: appInk,
            ),
          ),
        ),
        Expanded(
          child: overdue.when(
            data: (items) {
              if (items.isEmpty) {
                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(overdueProvider),
                  child: ListView(
                    children: [
                      EmptyState(
                        title: t.ar
                            ? 'لا توجد متأخرات حاليًا ✓'
                            : 'No overdue balances ✓',
                        icon: Icons.check_circle_outline,
                      ),
                    ],
                  ),
                );
              }
              final now = DateTime.now();
              final summary = summarizeAging(items, now);
              final visible = bucket == AgingBucket.all
                  ? items
                  : items.where(
                      (d) => agingBucketOf(daysLate(d.dueDate, now)) == bucket,
                    );
              final groups = groupOverdue(visible);
              return RefreshIndicator(
                onRefresh: () async => ref.invalidate(overdueProvider),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
                  children: [
                    _SummaryCard(summary: summary, locale: locale),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 58,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        children: [
                          for (final b in AgingBucket.values)
                            if (b == AgingBucket.all ||
                                (summary.amount[b] ?? 0) > 0)
                              Padding(
                                padding: const EdgeInsetsDirectional.only(
                                  end: 8,
                                ),
                                child: _BucketChip(
                                  label: _bucketLabel(b, locale),
                                  amount: formatMoney(
                                    summary.amount[b] ?? 0,
                                    locale,
                                  ),
                                  selected: bucket == b,
                                  dot: _agingColors[b],
                                  onTap: () => setState(() => bucket = b),
                                ),
                              ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    for (final group in groups) ...[
                      _OverdueGroupCard(
                        key: ValueKey(group.unitId),
                        group: group,
                        now: now,
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
              );
            },
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale, loading: true),
              onRetry: () => ref.invalidate(overdueProvider),
            ),
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final AgingSummary summary;
  final Locale locale;
  const _SummaryCard({required this.summary, required this.locale});
  @override
  Widget build(BuildContext context) {
    final ar = locale.languageCode == 'ar';
    final unitCount = summary.units[AgingBucket.all] ?? 0;
    final segments = [
      for (final b in AgingBucket.values)
        if (b != AgingBucket.all && (summary.amount[b] ?? 0) > 0) b,
    ];
    return AqarCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  ar ? 'إجمالي المتأخرات' : 'Total overdue',
                  style: const TextStyle(fontSize: 12.5, color: appGrey),
                ),
              ),
              StatusChip(
                countText(unitCount, locale,
                    ar: unitNoun, enOne: 'unit', enOther: 'units'),
                fg: appNavy,
                bg: appNavyBg,
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            formatMoney(summary.total, locale),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              color: appDanger,
            ),
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(5),
            child: SizedBox(
              height: 8,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final b in segments)
                    Expanded(
                      flex: ((summary.amount[b]! / summary.total) * 1000)
                          .round()
                          .clamp(1, 1000),
                      child: ColoredBox(color: _agingColors[b]!),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _BucketChip extends StatelessWidget {
  final String label, amount;
  final bool selected;
  final Color? dot;
  final VoidCallback onTap;
  const _BucketChip({
    required this.label,
    required this.amount,
    required this.selected,
    required this.onTap,
    this.dot,
  });
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: '$label, $amount',
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? appNavy : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? appNavy : appCardBorder),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (dot != null) ...[
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: dot,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? Colors.white : appInk,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              amount,
              style: TextStyle(
                fontSize: 11,
                color: selected ? const Color(0xFFCFE0E8) : appGrey,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// One unit's overdue dues: owner, what is owed, how late, the dues behind it
/// (tap to expand) and one-tap call / WhatsApp to the owner.
class _OverdueGroupCard extends ConsumerStatefulWidget {
  final OverdueGroup group;
  final DateTime now;
  const _OverdueGroupCard({super.key, required this.group, required this.now});
  @override
  ConsumerState<_OverdueGroupCard> createState() => _OverdueGroupCardState();
}

class _OverdueGroupCardState extends ConsumerState<_OverdueGroupCard> {
  bool open = false;

  String _reminder(AppLabels t, Locale locale) {
    final g = widget.group;
    final name = g.ownerName == null ? '' : ' ${g.ownerName}';
    final amount = formatMoney(g.total, locale);
    return t.ar
        ? 'السلام عليكم$name،\nنذكّركم بوجود مستحقات متأخرة على الوحدة ${g.unitCode} بإجمالي $amount.\nبرجاء التواصل معنا للسداد. شكرًا لكم.'
        : 'Hello$name,\nThis is a reminder of overdue dues on unit ${g.unitCode} totalling $amount.\nPlease contact us to settle. Thank you.';
  }

  Future<void> _open(Uri? uri, AppLabels t) async {
    final ok = await ref.read(externalOpenerProvider)(uri);
    if (!ok && mounted) {
      showFeedback(
        context,
        t.ar
            ? 'تعذر فتح التطبيق على هذا الجهاز'
            : 'Could not open the app on this device',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final g = widget.group;
    final days = g.oldestDays(widget.now);
    final severe = days > 30;
    final phone = normalizeEgyptPhone(g.ownerPhone);
    return AqarCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => open = !open),
            borderRadius: BorderRadius.circular(16),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          g.ownerName ?? g.unitCode,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: appInk,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${t.ar ? 'وحدة' : 'Unit'} ${ltr(g.unitCode)} · '
                          '${countText(g.items.length, locale, ar: dueNoun, enOne: 'due', enOther: 'dues')}',
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: appGrey,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        formatMoney(g.total, locale),
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: appDanger,
                        ),
                      ),
                      const SizedBox(height: 4),
                      StatusChip(
                        t.ar
                            ? 'متأخر ${countText(days, locale, ar: dayNoun, enOne: 'day', enOther: 'days')}'
                            : '${countText(days, locale, ar: dayNoun, enOne: 'day', enOther: 'days')} late',
                        fg: severe ? appDanger : appAmber,
                        bg: severe ? appDangerBg : appAmberBg,
                      ),
                    ],
                  ),
                  const SizedBox(width: 8),
                  AqarIcon(
                    open ? AqarIconType.chevronUp : AqarIconType.chevronDown,
                    size: 18,
                    color: appGrey,
                  ),
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: open
                ? Column(
                    children: [
                      const Divider(height: 1),
                      for (final due in g.items)
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 9,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      due.description.isEmpty
                                          ? (t.ar ? 'استحقاق' : 'Due')
                                          : due.description,
                                      style: const TextStyle(
                                        fontSize: 12.5,
                                        color: appInk,
                                      ),
                                    ),
                                    Text(
                                      '${t.ar ? 'استحق' : 'Due'} ${formatDate(due.dueDate, locale, relative: false)}',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: appGrey,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatMoney(due.outstanding, locale),
                                style: const TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w600,
                                  color: appInk,
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  )
                : const SizedBox(width: double.infinity),
          ),
          const Divider(height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
            child: phone == null
                ? Text(
                    g.ownerPhone == null || g.ownerPhone!.trim().isEmpty
                        ? (t.ar
                              ? 'لا يوجد رقم هاتف مسجّل للمالك'
                              : 'No phone number on file for the owner')
                        : (t.ar
                              ? 'رقم هاتف المالك غير صالح'
                              : "The owner's phone number is not valid"),
                    style: const TextStyle(fontSize: 11.5, color: appGrey),
                  )
                : Row(
                    children: [
                      Expanded(
                        child: _ContactButton(
                          icon: AqarIconType.phone,
                          label: t.ar ? 'اتصال' : 'Call',
                          onTap: () => _open(telUri(g.ownerPhone), t),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _ContactButton(
                          icon: AqarIconType.chat,
                          label: t.ar ? 'واتساب' : 'WhatsApp',
                          onTap: () => _open(
                            whatsappUri(
                              g.ownerPhone,
                              message: _reminder(t, locale),
                            ),
                            t,
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _ContactButton extends StatelessWidget {
  final AqarIconType icon;
  final String label;
  final VoidCallback onTap;
  const _ContactButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: onTap,
    style: OutlinedButton.styleFrom(
      minimumSize: const Size.fromHeight(44),
      side: const BorderSide(color: appNavy, width: 1.1),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        AqarIcon(icon, size: 18),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            color: appNavy,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );
}

// ───────────────────────── 08 · Maintenance + assign sheet ─────────────────

class ManagerMaintenanceScreen extends ConsumerStatefulWidget {
  const ManagerMaintenanceScreen({super.key});
  @override
  ConsumerState<ManagerMaintenanceScreen> createState() =>
      _ManagerMaintenanceState();
}

class _ManagerMaintenanceState extends ConsumerState<ManagerMaintenanceScreen> {
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
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: appInk,
            ),
          ),
        ),
        SizedBox(
          height: 42,
          child: queue.maybeWhen(
            data: (items) {
              final critical = items
                  .where((m) => m.priority == 'HIGH' || m.priority == 'URGENT')
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
                1 =>
                  items
                      .where(
                        (m) => m.priority == 'HIGH' || m.priority == 'URGENT',
                      )
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
              message: friendlyError(e, locale, loading: true),
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
                      '${ltr(m.requestNo)} · ${relativeFrom(m.submittedAt, locale)}',
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
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
              ),
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
          : 'Create the work order on the web first, then assign it here',
    );
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
  bool selectedSupplier = options.isNotEmpty ? options.first.$4 : false;
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
          20,
          14,
          20,
          20 + MediaQuery.viewInsetsOf(sheet).bottom,
        ),
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
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  StatusChip(
                    priorityLabel(request.priority, t.ar),
                    fg:
                        request.priority == 'HIGH' ||
                            request.priority == 'URGENT'
                        ? appDanger
                        : appGrey,
                    bg:
                        request.priority == 'HIGH' ||
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
                              horizontal: 14,
                              vertical: 11,
                            ),
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
                                          fontSize: 11,
                                          color: appGrey,
                                        ),
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
                  setSheet(
                    () => scheduledAt = DateTime(
                      picked.year,
                      picked.month,
                      picked.day,
                      15,
                    ),
                  );
                }
              },
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
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
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
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
              onPressed: selectedId == null
                  ? null
                  : () => Navigator.pop(sheet, true),
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
        context,
        t.ar ? 'أُسند أمر الشغل ✓' : 'Work order assigned ✓',
      );
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
              fontSize: 19,
              fontWeight: FontWeight.w700,
              color: appInk,
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(gateVisitorsNowProvider),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                SectionTitle(
                  title: t.ar ? 'الزوار الموجودون الآن' : 'Visitors inside now',
                ),
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
