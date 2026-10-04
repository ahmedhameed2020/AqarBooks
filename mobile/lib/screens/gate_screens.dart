import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../data/gate_device_store.dart';
import '../data/gate_scan_logic.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/gate_scanner_view.dart';
import '../widgets/ui_kit.dart';
import 'resident_screens.dart' show gateReasonLabel, visitorStatusLabel;

final gatesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    return await ref.watch(repositoryProvider).gates();
  } catch (_) {
    return const [];
  }
});

/// Builds the per-screen duplicate-scan coordinator. Overridable so tests can
/// drive time deterministically.
final scanCoordinatorFactoryProvider =
    Provider<ScanCoordinator Function()>((ref) => ScanCoordinator.new);

/// Live camera scanning only on phones; web/desktop/tests fall back to the
/// idle placeholder with manual entry.
final gateCameraEnabledProvider = Provider<bool>(
  (ref) =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS),
);

/// Operator-safe copy for gate failures. Device-trust failures get the
/// blueprint's wording; nothing raw from the backend ever reaches the UI.
String gateErrorMessage(Object error, Locale locale) {
  final ar = locale.languageCode == 'ar';
  final text = error.toString();
  if (text.contains('DEVICE_BINDING_NOT_AUTHORIZED') ||
      text.contains('GATE_TRUSTED_DEVICE_REQUIRED')) {
    return ar
        ? 'هذا الجهاز غير مفعّل — راجع الإدارة'
        : 'This device is not activated — contact the office';
  }
  return friendlyError(error, locale);
}

// ───────────────────────── 14 · Device activation ─────────────────────────

final _enrollmentSecret = RegExp(r'^[A-Za-z0-9_-]{43}$');
final _enrollmentUuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

String _randomSecret() {
  final random = Random.secure();
  // 32 random bytes, base64url without padding (43 chars) — the same shape
  // the web console uses for device secrets.
  return base64UrlEncode(List<int>.generate(32, (_) => random.nextInt(256)))
      .replaceAll('=', '');
}

class GateActivationScreen extends ConsumerStatefulWidget {
  const GateActivationScreen({super.key});
  @override
  ConsumerState<GateActivationScreen> createState() => _GateActivationState();
}

class _GateActivationState extends ConsumerState<GateActivationScreen> {
  final code = TextEditingController();
  final enrollmentId = TextEditingController();
  bool busy = false;

  @override
  void dispose() {
    code.dispose();
    enrollmentId.dispose();
    super.dispose();
  }

  String _activationError(Object e, AppLabels t) {
    final text = e.toString();
    if (text.contains('ENROLLMENT_EXPIRED')) {
      return t.ar
          ? 'انتهت صلاحية الكود — اطلب كودًا جديدًا من الإدارة'
          : 'The code expired — ask the office for a new one';
    }
    if (text.contains('ENROLLMENT_ALREADY_REDEEMED')) {
      return t.ar
          ? 'هذا الكود استُخدم من قبل — اطلب كودًا جديدًا'
          : 'This code was already used — ask for a new one';
    }
    return t.ar
        ? 'تعذر تفعيل الجهاز — تحقق من الكود والمعرّف (صالحان ١٥ دقيقة فقط)'
        : 'Could not activate — check the code and ID (valid for 15 minutes)';
  }

  Future<void> _activate() async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final id = enrollmentId.text.trim();
    final secret = code.text.trim();
    if (!_enrollmentUuid.hasMatch(id) || !_enrollmentSecret.hasMatch(secret)) {
      showFeedback(
          context,
          t.ar
              ? 'أدخل كود التفعيل ومعرّف التسجيل كما استلمتهما من الإدارة'
              : 'Enter the activation code and enrollment ID exactly as issued');
      return;
    }
    setState(() => busy = true);
    try {
      final installationId = _randomSecret();
      final credential = _randomSecret();
      final row = await ref.read(repositoryProvider).redeemGateEnrollment(
            enrollmentId: id,
            code: secret,
            installationIdHash:
                sha256.convert(utf8.encode(installationId)).toString(),
            credentialHash:
                sha256.convert(utf8.encode(credential)).toString(),
            displayName: 'AqarBooks Mobile Gate',
          );
      final device = GateDevice.tryParse({
        'deviceId': row['id'],
        'gateId': row['gate_id'],
        'allowedDirection': row['allowed_direction'],
        'displayName': row['display_name'] ?? 'AqarBooks Mobile Gate',
        'credential': credential,
      });
      if (device == null) {
        throw const AppRepositoryException('device_row_invalid');
      }
      try {
        await ref.read(gateDeviceStoreProvider).save(device);
      } catch (_) {
        if (mounted) {
          showFeedback(
              context,
              t.ar
                  ? 'تم التفعيل لكن تعذر حفظ بيانات الجهاز — اطلب من الإدارة إلغاء الجهاز وإصدار كود جديد'
                  : 'Activated, but this phone could not store the device credential — ask the office to revoke it and issue a new code');
        }
        return;
      }
      ref.invalidate(gateDeviceProvider);
      ref.invalidate(gateEnrolledProvider);
    } catch (e) {
      if (mounted) showFeedback(context, _activationError(e, t));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 30),
            child: Column(
              children: [
                SizedBox(
                  width: 76,
                  height: 79,
                  child: Image.asset('assets/images/logo.png',
                      fit: BoxFit.contain),
                ),
                const SizedBox(height: 18),
                Text(
                  t.ar ? 'تفعيل جهاز البوابة' : 'Activate gate device',
                  style: const TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w700,
                    color: appInk,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  t.ar
                      ? 'أدخل كود التفعيل ومعرّف التسجيل الصادرين من مدير التشغيل.'
                      : 'Enter the activation code and enrollment ID issued by your manager.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 13, color: appGrey, height: 1.6),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const AqarIcon(AqarIconType.clock,
                        size: 16, color: appGold),
                    const SizedBox(width: 6),
                    Text(
                      t.ar
                          ? 'صالح لمدة ١٥ دقيقة من إصداره'
                          : 'Valid for 15 minutes after issue',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: appGold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                TextField(
                  key: const ValueKey('gate-enrollment-code'),
                  controller: code,
                  textDirection: TextDirection.ltr,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    hintText: t.ar ? 'كود التفعيل' : 'Activation code',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  key: const ValueKey('gate-enrollment-id'),
                  controller: enrollmentId,
                  textDirection: TextDirection.ltr,
                  autocorrect: false,
                  enableSuggestions: false,
                  decoration: InputDecoration(
                    hintText: t.ar ? 'معرّف التسجيل' : 'Enrollment ID',
                  ),
                ),
                const SizedBox(height: 18),
                AqarButton(
                  t.ar ? 'تفعيل الجهاز' : 'Activate device',
                  busy: busy,
                  onPressed: _activate,
                ),
                const SizedBox(height: 12),
                Text(
                  t.ar
                      ? 'لا تملك كودًا؟ اطلبه من مدير التشغيل عبر لوحة الويب.'
                      : 'No code? Ask your operations manager to issue one from the web console.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 12, color: appGrey),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── 15 · Scan (dark) ─────────────────────────

class GateScanScreen extends ConsumerStatefulWidget {
  final AppSession session;
  const GateScanScreen({super.key, required this.session});
  @override
  ConsumerState<GateScanScreen> createState() => _GateScanState();
}

class _GateScanState extends ConsumerState<GateScanScreen> {
  String? _direction;
  final _manual = TextEditingController();
  late final ScanCoordinator _coordinator;

  @override
  void initState() {
    super.initState();
    // Created eagerly: `ref` cannot be read for the first time in dispose().
    _coordinator = ref.read(scanCoordinatorFactoryProvider)();
  }

  @override
  void dispose() {
    _manual.dispose();
    _coordinator.reset();
    super.dispose();
  }

  String _directionFor(GateDevice device) =>
      device.directions.contains(_direction)
          ? _direction!
          : device.directions.first;

  /// Single entry point for camera detections and manual entry. The lock is
  /// taken synchronously (before any await) so simultaneous detections cannot
  /// both start a scan.
  Future<void> _handlePayload(String raw, GateDevice device) async {
    final direction = _directionFor(device);
    final ticket = _coordinator.tryBegin(raw, direction);
    if (ticket == null) return;
    var delivered = false;
    try {
      // Trust is re-verified at the moment of use, not just at render time:
      // a cleared/unreadable store must stop scanning immediately.
      final trusted = await ref.read(gateDeviceStoreProvider).read();
      if (trusted == null) {
        ref.invalidate(gateDeviceProvider);
        ref.invalidate(gateEnrolledProvider);
        return;
      }
      final pass = parsePassPayload(raw);
      if (pass == null) {
        delivered = true;
        await _showResult(
          device: trusted,
          direction: direction,
          decision: 'DENY',
          reason: 'INVALID_PASS',
        );
        return;
      }
      final result = await ref.read(repositoryProvider).processGateScan(
            device: trusted,
            invitationId: pass.invitationId,
            rawSecret: pass.secret,
            direction: direction,
            clientScanId: ticket.clientScanId,
          );
      delivered = true;
      await _showResult(
        device: trusted,
        direction: direction,
        decision: '${result['decision'] ?? 'DENY'}',
        reason: result['reason_code'] as String?,
        guestName: result['guest_name'] as String?,
        unitCode: result['unit_code'] as String?,
      );
    } catch (e) {
      if (mounted) {
        showFeedback(
            context, gateErrorMessage(e, Localizations.localeOf(context)));
      }
    } finally {
      _coordinator.complete(ticket, delivered: delivered);
    }
  }

  void _submitManual(GateDevice device) {
    final value = _manual.text;
    if (value.trim().isEmpty) return;
    // Never leave a pass secret sitting in the field after submit.
    _manual.clear();
    unawaited(_handlePayload(value, device));
  }

  Future<void> _showResult({
    required GateDevice device,
    required String direction,
    required String decision,
    String? reason,
    String? guestName,
    String? unitCode,
  }) async {
    if (!mounted) return;
    final gates = ref.read(gatesProvider).valueOrNull ?? const [];
    final t = AppLabels(Localizations.localeOf(context));
    final gateName = gates
        .where((g) => g['id'] == device.gateId)
        .map((g) => t.ar ? '${g['name_ar']}' : '${g['name_en']}')
        .join();
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => GateResultScreen(
          decision: decision,
          reasonCode: reason,
          guestName: guestName,
          unitCode: unitCode,
          direction: direction,
          gateName: gateName.isEmpty ? device.displayName : gateName,
          canCreateException:
              widget.session.can('operations.gates.exceptions.create'),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    final deviceAsync = ref.watch(gateDeviceProvider);
    return Container(
      color: gateDark,
      child: deviceAsync.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: appGold)),
        // An unreadable store means "not trusted", never "scan anyway".
        error: (_, __) => _notTrusted(t),
        data: (device) => device == null ? _notTrusted(t) : _scanBody(t, device),
      ),
    );
  }

  /// Defence in depth: the shell already routes un-enrolled devices to the
  /// activation screen; this keeps the scanner itself closed too.
  Widget _notTrusted(AppLabels t) => Center(
        child: Padding(
          padding: const EdgeInsets.all(30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AqarIcon(AqarIconType.gate, size: 48, color: appGold),
              const SizedBox(height: 14),
              Text(
                t.ar ? 'هذا الجهاز غير مفعّل' : 'This device is not activated',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                t.ar
                    ? 'لا يمكن المسح قبل تفعيل الجهاز — راجع الإدارة.'
                    : 'Scanning is disabled until this device is activated — contact the office.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: gateMuted, fontSize: 13, height: 1.6),
              ),
              const SizedBox(height: 18),
              OutlinedButton(
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: appGold, width: 1.2),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 22, vertical: 10),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                onPressed: () {
                  ref.invalidate(gateDeviceProvider);
                  ref.invalidate(gateEnrolledProvider);
                },
                child: Text(
                  t.ar ? 'تفعيل الجهاز' : 'Activate device',
                  style: const TextStyle(
                    color: appGold,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  Widget _scanBody(AppLabels t, GateDevice device) {
    final gates = ref.watch(gatesProvider).valueOrNull ?? const [];
    final gate = gates.where((g) => g['id'] == device.gateId).toList();
    final gateTitle = gate.isEmpty
        ? device.displayName
        : (t.ar ? '${gate.first['name_ar']}' : '${gate.first['name_en']}');
    final direction = _directionFor(device);
    // The camera runs only while this tab is the visible one and nothing is
    // pushed over it (e.g. the result screen); the view also pauses itself
    // when the app leaves the foreground.
    final active = TickerMode.valuesOf(context).enabled &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      gateTitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    Text(
                      t.ar ? 'جهاز موثوق ✓' : 'Trusted device ✓',
                      style:
                          const TextStyle(fontSize: 10.5, color: gateMuted),
                    ),
                  ],
                ),
              ),
              // Only the directions this trusted device is bound to.
              Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: gatePanel,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    for (final value in device.directions) ...[
                      _dirChip(
                        value,
                        value == 'ENTRY'
                            ? (t.ar ? 'دخول' : 'In')
                            : (t.ar ? 'خروج' : 'Out'),
                        selected: value == direction,
                      ),
                      if (value != device.directions.last)
                        const SizedBox(width: 4),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 30),
            child: Column(
              children: [
                const SizedBox(height: 6),
                Expanded(
                  child: GateScannerView(
                    active: active,
                    cameraEnabled: ref.watch(gateCameraEnabledProvider),
                    onPayload: (raw) => _handlePayload(raw, device),
                  ),
                ),
                const SizedBox(height: 16),
                // Manual fallback: paste/type the pass payload.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: gatePanel,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: gatePanelBorder),
                  ),
                  child: Row(
                    children: [
                      const AqarIcon(AqarIconType.search,
                          size: 18, color: gateMuted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          key: const ValueKey('gate-manual-entry'),
                          controller: _manual,
                          autocorrect: false,
                          enableSuggestions: false,
                          style: const TextStyle(
                              color: Colors.white, fontSize: 13),
                          decoration: InputDecoration(
                            hintText: t.ar
                                ? 'بحث يدوي بالاسم أو كود التصريح'
                                : 'Manual search — name or pass code',
                            hintStyle: const TextStyle(
                                color: gateMuted, fontSize: 13),
                            filled: false,
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                          ),
                          onSubmitted: (_) => _submitManual(device),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _dirChip(String value, String label, {required bool selected}) {
    return GestureDetector(
      onTap: () => setState(() => _direction = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? gateAllow : gatePanel,
          borderRadius: BorderRadius.circular(7),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected ? Colors.white : gateMuted,
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── 16 · Scan result ─────────────────────────

class GateResultScreen extends StatelessWidget {
  final String decision;
  final String? reasonCode, guestName, unitCode, gateName;
  final String direction;
  final bool canCreateException;
  const GateResultScreen({
    super.key,
    required this.decision,
    this.reasonCode,
    this.guestName,
    this.unitCode,
    this.gateName,
    required this.direction,
    this.canCreateException = false,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final outcome = classifyScanResult(decision, reasonCode);
    final allow = outcome == GateOutcome.allow;
    final attention = outcome == GateOutcome.attention;
    final bg = allow
        ? gateAllow
        : attention
            ? const Color(0xFF9A6B00)
            : const Color(0xFF9B1C1C);
    final headline = allow
        ? (t.ar ? 'مسموح بالدخول' : 'Entry allowed')
        : attention
            ? (t.ar ? 'يحتاج انتباه' : 'Needs attention')
            : (t.ar ? 'مرفوض' : 'Denied');
    return Scaffold(
      backgroundColor: bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(28, 30, 28, 20),
          child: Column(
            children: [
              const SizedBox(height: 20),
              Container(
                width: 104,
                height: 104,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: allow
                      ? AqarIcon(AqarIconType.check,
                          size: 52, color: bg, strokeWidth: 2.8)
                      : Icon(
                          attention
                              ? Icons.priority_high_rounded
                              : Icons.close_rounded,
                          size: 52,
                          color: bg,
                        ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                headline,
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 10),
              if (guestName != null)
                Text(
                  guestName!,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              if (unitCode != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    '${t.ar ? 'وحدة' : 'Unit'} $unitCode',
                    style: TextStyle(
                        fontSize: 14, color: Colors.white.withAlpha(217)),
                  ),
                ),
              if (!allow)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    gateReasonLabel(reasonCode ?? decision, t.ar),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 14, color: Colors.white.withAlpha(217)),
                  ),
                ),
              const SizedBox(height: 12),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.black.withAlpha(46),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${direction == 'ENTRY' ? (t.ar ? 'دخول' : 'In') : (t.ar ? 'خروج' : 'Out')}'
                  '${gateName != null && gateName!.isNotEmpty ? ' — $gateName' : ''}'
                  ' · ${formatTime(DateTime.now().toIso8601String(), locale)}',
                  style: TextStyle(
                      fontSize: 12, color: Colors.white.withAlpha(242)),
                ),
              ),
              const Spacer(),
              Text(
                allow
                    ? (t.ar
                        ? 'سُجّل الحدث تلقائيًا — لا يتكرر الدخول عند إعادة المسح'
                        : 'Event recorded — rescanning will not duplicate entry')
                    : (t.ar
                        ? 'سُجّل حدث الرفض تلقائيًا'
                        : 'The denial was recorded automatically'),
                textAlign: TextAlign.center,
                style:
                    TextStyle(fontSize: 11.5, color: Colors.white.withAlpha(179)),
              ),
              const SizedBox(height: 12),
              if (!allow && canCreateException) ...[
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.white, width: 1.2),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: () => Navigator.pop(context),
                    child: Text(
                      t.ar ? 'تسجيل استثناء يدوي' : 'Record manual exception',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
              ],
              SizedBox(
                width: double.infinity,
                height: 54,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () => Navigator.pop(context),
                  child: Text(
                    t.ar ? 'تم — مسح التالي' : 'Done — scan next',
                    style: TextStyle(
                      color: bg,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ───────────────────────── Gate tabs: visitors / inside / events ───────────

class GateVisitorsScreen extends ConsumerWidget {
  const GateVisitorsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final visitors = ref.watch(_gateInvitationsProvider);
    return Container(
      color: gateDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _darkTitle(t.visitors),
          Expanded(
            child: visitors.when(
              data: (items) => items.isEmpty
                  ? _darkEmpty(
                      t.ar ? 'لا دعوات نشطة اليوم' : 'No active invitations today')
                  : RefreshIndicator(
                      onRefresh: () async =>
                          ref.invalidate(_gateInvitationsProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(20),
                        itemCount: items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 10),
                        itemBuilder: (_, i) => _darkRow(
                          title: items[i].guestName,
                          subtitle:
                              '${items[i].unitCode} · ${t.ar ? 'حتى' : 'until'} ${formatDate(items[i].validUntil, locale)}',
                          trailing: visitorStatusLabel(
                              items[i].status, t.ar),
                        ),
                      ),
                    ),
              loading: () => const Center(
                  child: CircularProgressIndicator(color: appGold)),
              error: (e, _) => _darkEmpty(friendlyError(e, locale)),
            ),
          ),
        ],
      ),
    );
  }
}

final _gateInvitationsProvider =
    FutureProvider.autoDispose<List<VisitorItem>>(
  (ref) => ref.watch(repositoryProvider).visitors(),
);

class GateInsideScreen extends ConsumerWidget {
  const GateInsideScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final inside = ref.watch(_insideProvider);
    return Container(
      color: gateDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _darkTitle(t.currentVisitors),
          Expanded(
            child: inside.when(
              data: (items) => items.isEmpty
                  ? _darkEmpty(t.ar
                      ? 'لا يوجد زوار داخل المشروع حاليًا'
                      : 'No visitors inside right now')
                  : RefreshIndicator(
                      onRefresh: () async => ref.invalidate(_insideProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(20),
                        itemCount: items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 10),
                        itemBuilder: (_, i) => _darkRow(
                          title: '${items[i]['guest_name'] ?? '—'}',
                          subtitle:
                              '${items[i]['unit_code'] ?? ''} · ${relativeFrom(items[i]['entered_at'] as String?, locale)}',
                        ),
                      ),
                    ),
              loading: () => const Center(
                  child: CircularProgressIndicator(color: appGold)),
              error: (e, _) => _darkEmpty(friendlyError(e, locale)),
            ),
          ),
        ],
      ),
    );
  }
}

final _insideProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final session = await ref.watch(sessionProvider.future);
  final orgId = session?.organizationId;
  if (orgId == null) return const [];
  return ref.watch(repositoryProvider).gateCurrentVisitors(orgId);
});

class GateEventsScreen extends ConsumerWidget {
  const GateEventsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final events = ref.watch(_eventsProvider);
    return Container(
      color: gateDark,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _darkTitle(t.events),
          Expanded(
            child: events.when(
              data: (items) => items.isEmpty
                  ? _darkEmpty(
                      t.ar ? 'لا أحداث اليوم بعد' : 'No events yet today')
                  : RefreshIndicator(
                      onRefresh: () async => ref.invalidate(_eventsProvider),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(20),
                        itemCount: items.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final e = items[i];
                          final allow = e['decision'] == 'ALLOW';
                          return _darkRow(
                            title: e['direction'] == 'ENTRY'
                                ? (t.ar ? 'دخول' : 'Entry')
                                : (t.ar ? 'خروج' : 'Exit'),
                            subtitle: formatTime(
                                e['occurred_at'] as String?, locale),
                            trailing: allow
                                ? (t.ar ? 'مسموح' : 'Allowed')
                                : gateReasonLabel(
                                    e['reason_code'] as String?, t.ar),
                            trailingColor: allow
                                ? const Color(0xFF6EE7A8)
                                : const Color(0xFFF59E9E),
                          );
                        },
                      ),
                    ),
              loading: () => const Center(
                  child: CircularProgressIndicator(color: appGold)),
              error: (e, _) => _darkEmpty(friendlyError(e, locale)),
            ),
          ),
        ],
      ),
    );
  }
}

final _eventsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (ref) => ref.watch(repositoryProvider).todayAccessEvents(),
);

Widget _darkTitle(String title) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 4),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );

Widget _darkEmpty(String message) => Center(
      child: Padding(
        padding: const EdgeInsets.all(30),
        child: Text(
          message,
          textAlign: TextAlign.center,
          style: const TextStyle(color: gateMuted, fontSize: 13),
        ),
      ),
    );

Widget _darkRow({
  required String title,
  String? subtitle,
  String? trailing,
  Color trailingColor = gateMuted,
}) =>
    Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: gatePanel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: gatePanelBorder),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (subtitle != null)
                  Text(subtitle,
                      style:
                          const TextStyle(color: gateMuted, fontSize: 11)),
              ],
            ),
          ),
          if (trailing != null)
            Text(
              trailing,
              style: TextStyle(
                color: trailingColor,
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            ),
        ],
      ),
    );
