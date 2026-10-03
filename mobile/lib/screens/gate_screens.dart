import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_core.dart';
import '../core/formatting.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'resident_screens.dart' show gateReasonLabel, visitorStatusLabel;

const _gateCredentialKey = 'gate_device_credential';

Future<bool> gateDeviceEnrolled() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_gateCredentialKey) != null;
  } catch (_) {
    return false;
  }
}

final gateEnrolledProvider =
    FutureProvider.autoDispose<bool>((ref) => gateDeviceEnrolled());

final gatesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    return await ref.watch(repositoryProvider).gates();
  } catch (_) {
    return const [];
  }
});

// ───────────────────────── 14 · Device activation ─────────────────────────

class GateActivationScreen extends ConsumerStatefulWidget {
  const GateActivationScreen({super.key});
  @override
  ConsumerState<GateActivationScreen> createState() => _GateActivationState();
}

class _GateActivationState extends ConsumerState<GateActivationScreen> {
  final code = TextEditingController();
  final focus = FocusNode();
  bool busy = false;

  @override
  void dispose() {
    code.dispose();
    focus.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final raw = code.text.trim();
    // Enrollment token: "<enrollment_id>-<6 digit code>" or just the code
    // when the id arrives via link; both are issued by the web console.
    final parts = raw.split(RegExp(r'[\s\-]+'));
    final digits = parts.last;
    final enrollmentId = parts.length > 1
        ? parts.sublist(0, parts.length - 1).join('-')
        : '';
    if (digits.length < 6 || enrollmentId.isEmpty) {
      showFeedback(
          context,
          t.ar
              ? 'أدخل كود التفعيل كاملًا كما استلمته من الإدارة'
              : 'Enter the full activation code exactly as issued');
      return;
    }
    setState(() => busy = true);
    try {
      final random = Random.secure();
      final installationId =
          base64UrlEncode(List<int>.generate(24, (_) => random.nextInt(256)));
      final credential =
          base64UrlEncode(List<int>.generate(32, (_) => random.nextInt(256)));
      await ref.read(repositoryProvider).redeemGateEnrollment(
            enrollmentId: enrollmentId,
            code: digits,
            installationIdHash:
                sha256.convert(utf8.encode(installationId)).toString(),
            credentialHash:
                sha256.convert(utf8.encode(credential)).toString(),
            displayName: 'AqarBooks Mobile Gate',
          );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_gateCredentialKey, credential);
      ref.invalidate(gateEnrolledProvider);
    } catch (e) {
      if (mounted) {
        showFeedback(
            context,
            t.ar
                ? 'تعذر تفعيل الجهاز — تحقق من الكود (صالح ١٥ دقيقة فقط)'
                : 'Could not activate — check the code (valid for 15 minutes)');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final typed = code.text.replaceAll(RegExp(r'\D'), '');
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
                      ? 'أدخل كود التفعيل الصادر من مدير التشغيل.\nالكود صالح لمدة ١٥ دقيقة فقط.'
                      : 'Enter the activation code issued by your manager.\nThe code is valid for 15 minutes only.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 13, color: appGrey, height: 1.6),
                ),
                const SizedBox(height: 20),
                // Visual 6-box code (tap to type)
                GestureDetector(
                  onTap: () => focus.requestFocus(),
                  child: Directionality(
                    textDirection: TextDirection.ltr,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 5; i >= 0; i--) ...[
                          Container(
                            width: 44,
                            height: 56,
                            margin:
                                const EdgeInsets.symmetric(horizontal: 4),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: i < typed.length
                                    ? appNavy
                                    : appCardBorder,
                                width: i < typed.length ? 1.4 : 1,
                              ),
                            ),
                            child: Center(
                              child: Text(
                                i < typed.length
                                    ? localizedDigits(typed[i], locale)
                                    : '',
                                style: const TextStyle(
                                  fontSize: 22,
                                  fontWeight: FontWeight.w700,
                                  color: appNavy,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const AqarIcon(AqarIconType.clock,
                        size: 16, color: appGold),
                    const SizedBox(width: 6),
                    Text(
                      t.ar
                          ? 'الكود صالح لمدة ١٥ دقيقة من إصداره'
                          : 'Code valid for 15 minutes after issue',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: appGold,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: code,
                  focusNode: focus,
                  onChanged: (_) => setState(() {}),
                  textDirection: TextDirection.ltr,
                  decoration: InputDecoration(
                    hintText: t.ar
                        ? 'كود التفعيل الكامل (المعرف-الأرقام)'
                        : 'Full activation code (id-digits)',
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
  String direction = 'IN';
  String? gateId;
  final manual = TextEditingController();

  @override
  void dispose() {
    manual.dispose();
    super.dispose();
  }

  Future<void> _processPayload(String payload) async {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final gates = ref.read(gatesProvider).valueOrNull ?? const [];
    final gate = gateId ?? (gates.isNotEmpty ? gates.first['id'] as String : null);
    if (gate == null) {
      showFeedback(
          context,
          t.ar
              ? 'لا توجد بوابة نشطة مهيأة — راجع الإدارة'
              : 'No active gate configured — contact the office');
      return;
    }
    // Pass payload format: AQP1.<invitation_id>.<secret>
    final parts = payload.trim().split('.');
    if (parts.length < 3 || parts.first != 'AQP1') {
      _showResult(decision: 'DENY', reason: 'INVALID');
      return;
    }
    try {
      final result = await ref.read(repositoryProvider).processGateScan(
            gateId: gate,
            invitationId: parts[1],
            rawSecret: parts.sublist(2).join('.'),
            direction: direction,
            clientScanId: _uuidV4(),
          );
      _showResult(
        decision: '${result['decision'] ?? 'DENY'}',
        reason: result['reason_code'] as String?,
        guestName: result['guest_name'] as String?,
        unitCode: result['unit_code'] as String?,
      );
    } catch (e) {
      if (mounted) showFeedback(context, friendlyError(e, locale));
    }
  }

  String _uuidV4() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    String hex(int start, int end) => bytes
        .sublist(start, end)
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
  }

  void _showResult({
    required String decision,
    String? reason,
    String? guestName,
    String? unitCode,
  }) {
    final gates = ref.read(gatesProvider).valueOrNull ?? const [];
    final t = AppLabels(Localizations.localeOf(context));
    final gateName = gates
        .where((g) => g['id'] == (gateId ?? (gates.isNotEmpty ? gates.first['id'] : null)))
        .map((g) => t.ar ? '${g['name_ar']}' : '${g['name_en']}')
        .join();
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => GateResultScreen(
          decision: decision,
          reasonCode: reason,
          guestName: guestName,
          unitCode: unitCode,
          direction: direction,
          gateName: gateName,
          canCreateException:
              widget.session.can('operations.gates.exceptions.create'),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final t = AppLabels(locale);
    final gates = ref.watch(gatesProvider).valueOrNull ?? const [];
    final currentGate = gates.isEmpty
        ? null
        : gates.firstWhere(
            (g) => g['id'] == gateId,
            orElse: () => gates.first,
          );
    return Container(
      color: gateDark,
      child: Column(
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
                        currentGate == null
                            ? (t.ar ? 'بوابة' : 'Gate')
                            : (t.ar
                                ? '${currentGate['name_ar']}'
                                : '${currentGate['name_en']}'),
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
                // Direction segmented (دخول/خروج)
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: gatePanel,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      _dirChip('IN', t.ar ? 'دخول' : 'In'),
                      const SizedBox(width: 4),
                      _dirChip('OUT', t.ar ? 'خروج' : 'Out'),
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
                  // Camera viewport — gold corner brackets, scan line.
                  Expanded(
                    child: Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: gatePanel,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: gatePanelBorder),
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Positioned.fill(
                            child: CustomPaint(
                                painter: _CornerBracketsPainter()),
                          ),
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const AqarIcon(AqarIconType.qr,
                                  size: 72, color: Color(0xFF1B5775)),
                              const SizedBox(height: 22),
                              Text(
                                t.ar
                                    ? 'وجّه الكاميرا نحو رمز التصريح'
                                    : 'Point the camera at the pass QR',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: gateMuted,
                                ),
                              ),
                            ],
                          ),
                          Positioned(
                            top: 0,
                            bottom: 0,
                            child: Center(
                              child: Container(
                                width: 240,
                                height: 2.5,
                                decoration: BoxDecoration(
                                  color: appGold.withAlpha(230),
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Manual fallback: paste/type the pass or search text.
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
                            controller: manual,
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
                            onSubmitted: (v) {
                              if (v.trim().isNotEmpty) _processPayload(v);
                            },
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
      ),
    );
  }

  Widget _dirChip(String value, String label) {
    final selected = direction == value;
    return GestureDetector(
      onTap: () => setState(() => direction = value),
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

class _CornerBracketsPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = appGold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;
    const inset = 20.0, len = 34.0, radius = 12.0;
    final w = size.width, h = size.height;
    Path corner(double sx, double sy, double dx, double dy) {
      // L-bracket with a rounded elbow at (sx, sy) extending dx, dy.
      return Path()
        ..moveTo(sx + dx * len, sy)
        ..lineTo(sx + dx * radius, sy)
        ..quadraticBezierTo(sx, sy, sx, sy + dy * radius)
        ..lineTo(sx, sy + dy * len);
    }

    canvas.drawPath(corner(inset, inset, 1, 1), paint);
    canvas.drawPath(corner(w - inset, inset, -1, 1), paint);
    canvas.drawPath(corner(w - inset, h - inset, -1, -1), paint);
    canvas.drawPath(corner(inset, h - inset, 1, -1), paint);
  }

  @override
  bool shouldRepaint(_CornerBracketsPainter oldDelegate) => false;
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
    final allow = decision == 'ALLOW';
    final attention = !allow && decision != 'DENY';
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
                  '${direction == 'IN' ? (t.ar ? 'دخول' : 'In') : (t.ar ? 'خروج' : 'Out')}'
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
                            title: e['direction'] == 'IN'
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
