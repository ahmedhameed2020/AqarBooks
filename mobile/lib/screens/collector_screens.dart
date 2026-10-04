import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../core/plural.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'resident_screens.dart' show paymentMethodLabel;

final cashierSessionProvider =
    FutureProvider.autoDispose<CashierSessionInfo?>((ref) async {
  try {
    return await ref.watch(repositoryProvider).activeCashierSession();
  } catch (_) {
    return null;
  }
});
final myCollectionsTodayProvider =
    FutureProvider.autoDispose<List<PaymentItem>>(
  (ref) => ref.watch(repositoryProvider).myCollectionsToday(),
);

// ───────────────────────── 09 · Collector today ─────────────────────────

class CollectorTodayScreen extends ConsumerWidget {
  final AppSession session;
  const CollectorTodayScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final collections = ref.watch(myCollectionsTodayProvider);
    final cashierCapable = session.can('cashier.sessions.open');
    final userName = session.user.email?.split('@').first ?? '';
    return Column(
      children: [
        HomeHeader(
          title: t.today,
          subtitle: '${formatWeekdayDate(DateTime.now(), locale)} · $userName',
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(cashierSessionProvider);
              ref.invalidate(myCollectionsTodayProvider);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
              children: [
                // Session card — only for holders of cashier.sessions.open
                if (cashierCapable) ...[
                  _SessionCard(session: session),
                  const SizedBox(height: 12),
                ],
                // Today total
                collections.when(
                  data: (items) {
                    final total = items.fold<double>(
                        0, (sum, item) => sum + item.amount);
                    return Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: appNavy,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                t.ar ? 'تحصيلات اليوم' : "Today's collections",
                                style: const TextStyle(
                                  color: Color(0xFFCFE0E8),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              StatusChip(
                                countText(items.length, locale,
                                    ar: operationNoun,
                                    enOne: 'payment',
                                    enOther: 'payments'),
                                fg: Colors.white,
                                bg: const Color(0xFF1B5775),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            formatMoney(total, locale),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                  loading: () =>
                      const SkeletonList(rows: 1, rowHeight: 100),
                  error: (e, _) => AppError(
                    message: friendlyError(e, locale, loading: true),
                    onRetry: () =>
                        ref.invalidate(myCollectionsTodayProvider),
                  ),
                ),
                const SizedBox(height: 16),
                SectionTitle(title: t.ar ? 'آخر التحصيلات' : 'Latest collections'),
                collections.maybeWhen(
                  data: (items) => items.isEmpty
                      ? EmptyState(
                          title: t.ar
                              ? 'لم تسجّل تحصيلات اليوم بعد'
                              : 'No collections recorded today yet',
                          icon: Icons.payments_outlined,
                          ctaLabel: t.ar ? 'ابدأ التحصيل' : 'Start collecting',
                          onCta: () => startCollectFlow(context),
                        )
                      : Column(
                          children: [
                            for (final p in items.take(5)) ...[
                              ListRowCard(
                                icon: AqarIconType.receipt,
                                iconFg: appSuccess,
                                iconBg: appSuccessBg,
                                title: formatMoney(p.amount, locale),
                                subtitle:
                                    '${t.ar ? 'إيصال' : 'Receipt'} ${localizedDigits(p.receipt, locale)} · ${paymentMethodLabel(p.method, t.ar)}',
                              ),
                              const SizedBox(height: 10),
                            ],
                          ],
                        ),
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SessionCard extends ConsumerWidget {
  final AppSession session;
  const _SessionCard({required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final state = ref.watch(cashierSessionProvider);
    final collections =
        ref.watch(myCollectionsTodayProvider).valueOrNull ?? const [];
    return state.when(
      data: (info) {
        if (info == null) {
          return AqarCard(
            child: Row(
              children: [
                const IconBadge(AqarIconType.cashbox),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    t.ar ? 'لا توجد جلسة خزينة مفتوحة' : 'No open cashier session',
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: appNavy, width: 1.1),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () => _openSession(context, ref, t, locale),
                  child: Text(
                    t.ar ? 'فتح جلسة' : 'Open session',
                    style: const TextStyle(
                        color: appNavy,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          );
        }
        final expected = info.openingBalance +
            collections
                .where((p) => p.method == 'CASH')
                .fold<double>(0, (sum, p) => sum + p.amount);
        return AqarCard(
          child: Column(
            children: [
              Row(
                children: [
                  const IconBadge(AqarIconType.cashbox),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      t.ar ? 'جلسة الخزينة' : 'Cashier session',
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                  ),
                  StatusChip(
                    '${t.ar ? 'مفتوحة منذ' : 'Open since'} ${formatTime(info.openedAt, locale)}',
                    fg: appSuccess,
                    bg: appSuccessBg,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              KeyValueRow(
                t.ar ? 'الرصيد الافتتاحي' : 'Opening balance',
                formatMoney(info.openingBalance, locale),
              ),
              KeyValueRow(
                t.ar ? 'المتوقع بالخزينة الآن' : 'Expected in box now',
                formatMoney(expected, locale),
                valueColor: appNavy,
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: appNavy, width: 1.1),
                    padding: const EdgeInsets.symmetric(vertical: 11),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () =>
                      _closeSession(context, ref, t, locale, info, expected),
                  child: Text(
                    t.ar ? 'إغلاق الجلسة' : 'Close session',
                    style: const TextStyle(
                        color: appNavy,
                        fontSize: 13,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        );
      },
      loading: () => const SkeletonList(rows: 1, rowHeight: 150),
      error: (e, _) => const SizedBox.shrink(),
    );
  }

  Future<void> _openSession(
    BuildContext context,
    WidgetRef ref,
    AppLabels t,
    Locale locale,
  ) async {
    final repo = ref.read(repositoryProvider);
    List<Map<String, dynamic>> boxes;
    try {
      boxes = await repo.cashboxes();
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
      return;
    }
    if (!context.mounted) return;
    if (boxes.isEmpty) {
      showFeedback(
          context,
          t.ar
              ? 'لا توجد صناديق خزينة مهيأة — راجع الإدارة'
              : 'No cashboxes configured — contact the office');
      return;
    }
    String cashboxId = boxes.first['id'] as String;
    final opening = TextEditingController(text: '0');
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (sheet) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 16, 20, 20 + MediaQuery.viewInsetsOf(sheet).bottom),
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
                t.ar ? 'فتح جلسة خزينة' : 'Open cashier session',
                style: const TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 14),
              Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: appCardBorder),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: cashboxId,
                    isExpanded: true,
                    items: [
                      for (final b in boxes)
                        DropdownMenuItem(
                          value: b['id'] as String,
                          child: Text('${b['name']}'),
                        ),
                    ],
                    onChanged: (v) =>
                        setSheet(() => cashboxId = v ?? cashboxId),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: opening,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: t.ar
                      ? 'الرصيد الافتتاحي (ج.م)'
                      : 'Opening balance (EGP)',
                ),
              ),
              const SizedBox(height: 18),
              AqarButton(
                t.ar ? 'فتح الجلسة' : 'Open session',
                onPressed: () => Navigator.pop(sheet, true),
              ),
            ],
          ),
        ),
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      final box = boxes.firstWhere((b) => b['id'] == cashboxId);
      final session = ref.read(sessionProvider).valueOrNull;
      await repo.openCashierSession(
        organizationId: session?.organizationId ?? '',
        propertyId: box['property_id'] as String,
        cashboxId: cashboxId,
        openingBalance: double.tryParse(opening.text) ?? 0,
      );
      ref.invalidate(cashierSessionProvider);
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
    }
  }

  Future<void> _closeSession(
    BuildContext context,
    WidgetRef ref,
    AppLabels t,
    Locale locale,
    CashierSessionInfo info,
    double expected,
  ) async {
    final actual = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: Colors.white,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          t.ar ? 'إغلاق الجلسة' : 'Close session',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KeyValueRow(
              t.ar ? 'المتوقع بالخزينة' : 'Expected in box',
              formatMoney(expected, locale),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: actual,
              keyboardType: TextInputType.number,
              autofocus: true,
              decoration: InputDecoration(
                hintText: t.ar ? 'المبلغ الفعلي بالخزينة' : 'Actual amount',
              ),
            ),
            const SizedBox(height: 8),
            Text(
              t.ar
                  ? 'التسوية النهائية تعتمدها الإدارة لاحقًا'
                  : 'Final reconciliation is approved by the office later',
              style: const TextStyle(fontSize: 11, color: appGrey),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: Text(t.cancel),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: appNavy),
            onPressed: () => Navigator.pop(d, true),
            child: Text(t.ar ? 'إغلاق الجلسة' : 'Close'),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    try {
      await ref
          .read(repositoryProvider)
          .closeCashierSession(info.id, double.tryParse(actual.text) ?? 0);
      ref.invalidate(cashierSessionProvider);
      if (context.mounted) {
        showFeedback(
            context,
            t.ar
                ? 'أُغلقت الجلسة — بانتظار اعتماد التسوية'
                : 'Session closed — awaiting reconciliation approval');
      }
    } catch (e) {
      if (context.mounted) showFeedback(context, friendlyError(e, locale));
    }
  }
}

// ───────────────────────── Search tab + collect entry ─────────────────────────

void startCollectFlow(BuildContext context) => Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const CollectSearchScreen(push: true)),
    );

class CollectSearchScreen extends ConsumerStatefulWidget {
  final bool push;
  const CollectSearchScreen({super.key, this.push = false});
  @override
  ConsumerState<CollectSearchScreen> createState() => _CollectSearchState();
}

class _CollectSearchState extends ConsumerState<CollectSearchScreen> {
  final query = TextEditingController();
  List<CollectTarget> results = const [];
  bool busy = false;
  bool failed = false;
  Timer? _debounce;
  String _latest = '';

  /// Typing is debounced so a query is not sent per keystroke, and only the
  /// answer to the latest text is applied (slow earlier replies are dropped).
  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () => _search(value));
  }

  Future<void> _search(String value) async {
    final mine = value.trim();
    _latest = mine;
    if (mine.length < 2) {
      setState(() {
        results = const [];
        busy = false;
        failed = false;
      });
      return;
    }
    setState(() {
      busy = true;
      failed = false;
    });
    try {
      final found =
          await ref.read(repositoryProvider).searchCollectTargets(mine);
      if (mounted && mine == _latest) setState(() => results = found);
    } catch (_) {
      if (mounted && mine == _latest) {
        setState(() {
          results = const [];
          failed = true;
        });
      }
    } finally {
      if (mounted && mine == _latest) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final body = Column(
      children: [
        widget.push
            ? ScreenHeader(title: t.ar ? 'تحصيل — بحث' : 'Collect — search')
            : Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    t.search,
                    style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w700,
                        color: appInk),
                  ),
                ),
              ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
          child: TextField(
            controller: query,
            onChanged: _onChanged,
            decoration: InputDecoration(
              hintText: t.ar
                  ? 'كود الوحدة · الاسم · الهاتف'
                  : 'Unit code · name · phone',
              prefixIcon: const Padding(
                padding: EdgeInsets.all(12),
                child: AqarIcon(AqarIconType.search, size: 20, color: appGrey),
              ),
            ),
          ),
        ),
        Expanded(
          child: busy
              ? const SkeletonList(rows: 3)
              : failed
                  ? AppError(
                      message: loadErrorMessage(locale),
                      onRetry: () => _search(query.text),
                    )
                  : results.isEmpty
                  ? EmptyState(
                      title: query.text.trim().length < 2
                          ? (t.ar
                              ? 'ابحث بكود الوحدة أو الاسم أو الهاتف'
                              : 'Search by unit code, name or phone')
                          : (t.ar
                              ? 'لا نتائج — جرّب كود الوحدة أو رقم الهاتف'
                              : 'No results — try the unit code or phone'),
                      icon: Icons.search,
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                      itemCount: results.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final r = results[i];
                        return ListRowCard(
                          icon: AqarIconType.building,
                          title: r.unitCode,
                          subtitle: r.ownerName,
                          trailing: Text(
                            formatMoney(r.balance, locale),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color:
                                  r.balance > 0 ? appDanger : appSuccess,
                            ),
                          ),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => CollectStepScreen(
                                unitId: r.unitId,
                                unitCode: r.unitCode,
                                balance: r.balance,
                                memberId: r.memberId,
                                ownerName: r.ownerName,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
    return widget.push ? Scaffold(body: SafeArea(child: body)) : body;
  }
}

// ───────────────────────── 10 · Collection step ─────────────────────────

class CollectStepScreen extends ConsumerStatefulWidget {
  final String unitId, unitCode;
  final double balance;

  /// The unit's current owner — the payer recorded on the payment. Null when
  /// the unit has no registered owner, in which case collecting is blocked.
  final String? memberId, ownerName;
  const CollectStepScreen({
    super.key,
    required this.unitId,
    required this.unitCode,
    required this.balance,
    this.memberId,
    this.ownerName,
  });
  @override
  ConsumerState<CollectStepScreen> createState() => _CollectStepState();
}

class _CollectStepState extends ConsumerState<CollectStepScreen> {
  List<DueItem> dues = const [];
  final selected = <String>{};
  String method = 'CASH';
  bool loading = true;
  bool loadFailed = false;
  bool busy = false;
  late final String idempotencyKey =
      'col-${widget.unitId}-${DateTime.now().millisecondsSinceEpoch}';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      loading = true;
      loadFailed = false;
    });
    try {
      final items =
          await ref.read(repositoryProvider).unitOpenDues(widget.unitId);
      if (mounted) {
        setState(() {
          dues = items;
          // Default: oldest first — overdue and near-term dues preselected,
          // far-future dues left unchecked.
          selected.addAll(items
              .where((d) => overdueDays(d.dueDate) > -30)
              .map((d) => d.id));
          loading = false;
        });
      }
    } catch (_) {
      // A failed load must not read as "no open dues" (a false all-clear).
      if (mounted) {
        setState(() {
          loading = false;
          loadFailed = true;
        });
      }
    }
  }

  double get total => dues
      .where((d) => selected.contains(d.id))
      .fold(0, (sum, d) => sum + d.outstanding);

  Future<void> _confirm() async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final picked = dues.where((d) => selected.contains(d.id)).toList();
    if (picked.isEmpty) return;
    final memberId = widget.memberId;
    if (memberId == null) {
      showFeedback(
          context,
          t.ar
              ? 'لا يوجد مالك مسجّل لهذه الوحدة — لا يمكن تسجيل تحصيل'
              : 'This unit has no registered owner — a collection cannot be recorded');
      return;
    }
    // Single review step before recording (Figma flow step 5).
    final proceed = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        backgroundColor: Colors.white,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text(
          t.ar ? 'تأكيد التحصيل' : 'Confirm collection',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            KeyValueRow(t.ar ? 'الوحدة' : 'Unit', widget.unitCode),
            KeyValueRow(
              t.ar ? 'المبلغ' : 'Amount',
              formatMoney(total, locale),
              valueColor: appNavy,
              valueSize: 15,
            ),
            KeyValueRow(
              t.ar ? 'الطريقة' : 'Method',
              paymentMethodLabel(method, t.ar),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(d, false), child: Text(t.cancel)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: appNavy),
            onPressed: () => Navigator.pop(d, true),
            child: Text(t.confirm),
          ),
        ],
      ),
    );
    if (proceed != true || !mounted) return;
    setState(() => busy = true);
    try {
      final session = ref.read(cashierSessionProvider).valueOrNull;
      await ref.read(repositoryProvider).recordCollection(
            unitId: widget.unitId,
            memberId: memberId,
            amount: total,
            method: method,
            allocations: {
              for (final d in picked) d.id: d.outstanding,
            },
            idempotencyKey: idempotencyKey,
            session: session,
          );
      ref.invalidate(myCollectionsTodayProvider);
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => ReceiptSuccessScreen(
              amount: total,
              method: method,
              unitCode: widget.unitCode,
            ),
          ),
        );
      }
    } catch (e) {
      // The idempotency key stays the same, so retrying is safe.
      if (mounted) showFeedback(context, friendlyError(e, locale));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final session = ref.watch(sessionProvider).valueOrNull;
    final canCheques = session?.can('banking.cheques.manage') ?? false;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(
              title: t.ar
                  ? 'تحصيل — وحدة ${widget.unitCode}'
                  : 'Collect — unit ${widget.unitCode}',
            ),
            Expanded(
              child: loading
                  ? const SkeletonList()
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                      children: [
                        AqarCard(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      widget.ownerName ?? widget.unitCode,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                        color: appInk,
                                      ),
                                    ),
                                    Text(
                                      widget.ownerName != null
                                          ? '${t.ar ? 'وحدة' : 'Unit'} ${widget.unitCode}'
                                          : (t.ar ? 'وحدة' : 'Unit'),
                                      style: const TextStyle(
                                          fontSize: 12, color: appGrey),
                                    ),
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    formatMoney(widget.balance, locale),
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: widget.balance > 0
                                          ? appDanger
                                          : appSuccess,
                                    ),
                                  ),
                                  Text(
                                    t.ar
                                        ? 'الرصيد المستحق'
                                        : 'Outstanding',
                                    style: const TextStyle(
                                        fontSize: 10.5, color: appGrey),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          t.ar
                              ? 'المستحقات المفتوحة — الأقدم أولًا'
                              : 'Open dues — oldest first',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: appInk,
                          ),
                        ),
                        const SizedBox(height: 10),
                        if (loadFailed)
                          AppError(
                            message: loadErrorMessage(locale),
                            onRetry: _load,
                          )
                        else if (widget.memberId == null)
                          AqarCard(
                            color: appAmberBg,
                            borderColor: appAmberBg,
                            child: Text(
                              t.ar
                                  ? 'لا يوجد مالك مسجّل لهذه الوحدة — سجّل المالك من الويب أولًا ثم أعد المحاولة.'
                                  : 'This unit has no registered owner — add the owner on the web first, then try again.',
                              style: const TextStyle(
                                color: appAmber,
                                fontSize: 12.5,
                                fontWeight: FontWeight.w500,
                                height: 1.6,
                              ),
                            ),
                          )
                        else if (dues.isEmpty)
                          EmptyState(
                            title: t.ar
                                ? 'لا توجد مستحقات على هذه الوحدة ✓'
                                : 'No open dues on this unit ✓',
                            icon: Icons.check_circle_outline,
                          )
                        else
                          for (final d in dues) ...[
                            _dueRow(d, locale, t),
                            const SizedBox(height: 10),
                          ],
                        if (dues.isNotEmpty) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 13),
                            decoration: BoxDecoration(
                              color: appNavy,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  t.ar ? 'المبلغ المُحصَّل' : 'Amount collected',
                                  style: const TextStyle(
                                    color: Color(0xFFCFE0E8),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                Text(
                                  formatMoney(total, locale),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 20,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            t.ar ? 'طريقة الدفع' : 'Payment method',
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: appInk,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _methodChip('CASH', t.ar ? 'نقدي' : 'Cash'),
                              _methodChip('BANK_TRANSFER',
                                  t.ar ? 'تحويل بنكي' : 'Bank transfer'),
                              // Cheques only with banking.cheques.manage —
                              // not in the default collector/cashier roles.
                              if (canCheques)
                                _methodChip('CHEQUE', t.ar ? 'شيك' : 'Cheque'),
                              _methodChip('OTHER', t.ar ? 'أخرى' : 'Other'),
                            ],
                          ),
                          if (!canCheques) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                const AqarIcon(AqarIconType.info,
                                    size: 14, color: appGrey),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    t.ar
                                        ? 'الشيكات تُسلَّم لمكتب الإدارة — لا تملك صلاحية تسجيلها'
                                        : 'Cheques are handed to the office — you cannot record them',
                                    style: const TextStyle(
                                        fontSize: 11, color: appGrey),
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 20),
                          AqarButton(
                            t.ar ? 'متابعة للتأكيد' : 'Continue to confirm',
                            busy: busy,
                            onPressed:
                                (selected.isEmpty || widget.memberId == null)
                                ? null
                                : _confirm,
                          ),
                        ],
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dueRow(DueItem d, Locale locale, AppLabels t) {
    final isSelected = selected.contains(d.id);
    final late = overdueDays(d.dueDate) > 0;
    return AqarCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      borderColor: isSelected ? appNavy : null,
      borderWidth: isSelected ? 1.4 : 1,
      onTap: () => setState(() {
        if (isSelected) {
          selected.remove(d.id);
        } else {
          selected.add(d.id);
        }
      }),
      child: Row(
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: isSelected ? appNavy : Colors.white,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: isSelected ? appNavy : appGrey,
                width: 1.5,
              ),
            ),
            child: isSelected
                ? const Center(
                    child: AqarIcon(AqarIconType.check,
                        size: 13, color: Colors.white, strokeWidth: 2.4),
                  )
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.description,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: appInk,
                  ),
                ),
                if (late)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: StatusChip(t.overdue,
                        fg: appDanger, bg: appDangerBg),
                  ),
              ],
            ),
          ),
          Text(
            formatMoney(d.outstanding, locale),
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: isSelected ? appNavy : appInk,
            ),
          ),
        ],
      ),
    );
  }

  Widget _methodChip(String value, String label) {
    final isSelected = method == value;
    return GestureDetector(
      onTap: () => setState(() => method = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        decoration: BoxDecoration(
          color: isSelected ? appNavy : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: isSelected ? appNavy : appCardBorder),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
            color: isSelected ? Colors.white : appGrey,
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── 11 · Receipt success ─────────────────────────

class ReceiptSuccessScreen extends ConsumerWidget {
  final double amount;
  final String method, unitCode;
  const ReceiptSuccessScreen({
    super.key,
    required this.amount,
    required this.method,
    required this.unitCode,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final latest =
        ref.watch(myCollectionsTodayProvider).valueOrNull ?? const [];
    final receiptNo = latest.isNotEmpty ? latest.first.receipt : '—';
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 18, 24, 20),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 84,
                height: 84,
                decoration: const BoxDecoration(
                  color: appSuccessBg,
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: AqarIcon(AqarIconType.check,
                      size: 40, color: appSuccess, strokeWidth: 2.6),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                t.ar ? 'تم التحصيل بنجاح' : 'Collection recorded',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: appInk,
                ),
              ),
              const SizedBox(height: 16),
              AqarCard(
                gold: true,
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      t.ar ? 'إيصال رقم' : 'Receipt number',
                      style: const TextStyle(fontSize: 12, color: appGrey),
                    ),
                    Text(
                      localizedDigits(receiptNo, locale),
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        color: appNavy,
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 10),
                      child: Divider(height: 1),
                    ),
                    KeyValueRow(
                      t.ar ? 'المبلغ' : 'Amount',
                      formatMoney(amount, locale),
                      valueColor: appNavy,
                      valueSize: 15,
                    ),
                    KeyValueRow(
                      t.ar ? 'طريقة الدفع' : 'Method',
                      paymentMethodLabel(method, t.ar),
                    ),
                    KeyValueRow(t.ar ? 'الوحدة' : 'Unit', unitCode),
                    KeyValueRow(
                      t.ar ? 'التاريخ' : 'Date',
                      formatDate(
                          DateTime.now().toIso8601String(), locale),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(
                t.ar
                    ? 'يُعرض الإيصال من بيانات الدفعة على جهازك'
                    : 'The receipt is rendered from the payment data on-device',
                style: const TextStyle(fontSize: 11, color: appGrey),
              ),
              const Spacer(),
              AqarButton(
                t.ar ? 'مشاركة الإيصال' : 'Share receipt',
                onPressed: () async {
                  final text = Uri.encodeComponent(
                    t.ar
                        ? 'إيصال تحصيل ${localizedDigits(receiptNo, locale)}\nالوحدة: $unitCode\nالمبلغ: ${formatMoney(amount, locale)}'
                        : 'Receipt $receiptNo\nUnit: $unitCode\nAmount: ${formatMoney(amount, locale)}',
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
                              ? 'تعذر فتح المشاركة'
                              : 'Could not open sharing');
                    }
                  }
                },
              ),
              const SizedBox(height: 10),
              AqarButton(
                t.ar ? 'تحصيل جديد' : 'New collection',
                secondary: true,
                onPressed: () {
                  Navigator.pop(context);
                  startCollectFlow(context);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── Receipts tab ─────────────────────────

class ReceiptsScreen extends ConsumerWidget {
  const ReceiptsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final items = ref.watch(myCollectionsTodayProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
          child: Text(
            t.receipts,
            style: const TextStyle(
                fontSize: 19, fontWeight: FontWeight.w700, color: appInk),
          ),
        ),
        Expanded(
          child: items.when(
            data: (list) => list.isEmpty
                ? EmptyState(
                    title: t.ar
                        ? 'لم تسجّل تحصيلات اليوم بعد'
                        : 'No collections recorded today yet',
                    icon: Icons.receipt_long_outlined,
                    ctaLabel: t.ar ? 'ابدأ التحصيل' : 'Start collecting',
                    onCta: () => startCollectFlow(context),
                  )
                : RefreshIndicator(
                    onRefresh: () async =>
                        ref.invalidate(myCollectionsTodayProvider),
                    child: ListView.separated(
                      padding: const EdgeInsets.all(20),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) {
                        final p = list[i];
                        return ListRowCard(
                          icon: AqarIconType.receipt,
                          iconFg: appSuccess,
                          iconBg: appSuccessBg,
                          title: formatMoney(p.amount, locale),
                          subtitle:
                              '${t.ar ? 'إيصال' : 'Receipt'} ${localizedDigits(p.receipt, locale)} · ${paymentMethodLabel(p.method, t.ar)}',
                        );
                      },
                    ),
                  ),
            loading: () => const SkeletonList(),
            error: (e, _) => AppError(
              message: friendlyError(e, locale, loading: true),
              onRetry: () => ref.invalidate(myCollectionsTodayProvider),
            ),
          ),
        ),
      ],
    );
  }
}
