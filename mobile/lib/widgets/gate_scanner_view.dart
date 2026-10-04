import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/app_core.dart';
import 'aqar_icons.dart';

/// Why the camera could not run. Raw plugin errors are never shown to the
/// operator (blueprint §7: no raw backend/plugin errors in the UI).
enum ScannerIssue { permissionDenied, unsupported, failed }

ScannerIssue mapScannerError(MobileScannerException error) =>
    switch (error.errorCode) {
      MobileScannerErrorCode.permissionDenied => ScannerIssue.permissionDenied,
      MobileScannerErrorCode.unsupported => ScannerIssue.unsupported,
      _ => ScannerIssue.failed,
    };

/// First non-empty QR payload in a capture, or null.
@visibleForTesting
String? firstQrPayload(Iterable<Barcode> barcodes) {
  for (final barcode in barcodes) {
    final value = barcode.rawValue;
    if (value != null && value.isNotEmpty) return value;
  }
  return null;
}

/// Camera-denied / unavailable state. Explains how to recover and always
/// points at the manual fallback, so the gate is never a dead end.
class ScannerIssuePanel extends StatelessWidget {
  final ScannerIssue issue;
  final VoidCallback onRetry;
  const ScannerIssuePanel({
    super.key,
    required this.issue,
    required this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    final ar = AppLabels(Localizations.localeOf(context)).ar;
    final ios = defaultTargetPlatform == TargetPlatform.iOS;
    final (title, body) = switch (issue) {
      ScannerIssue.permissionDenied => (
          ar ? 'الكاميرا غير مسموح بها' : 'Camera access is off',
          ar
              ? 'اسمح لـ AqarBooks باستخدام الكاميرا لمسح تصاريح الزوار.\n'
                  '${ios ? 'الإعدادات ← AqarBooks ← الكاميرا' : 'الإعدادات ← التطبيقات ← AqarBooks ← الأذونات ← الكاميرا'}\n'
                  'ثم ارجع هنا — أو أدخل التصريح يدويًا بالأسفل.'
              : 'Allow AqarBooks to use the camera to scan visitor passes.\n'
                  '${ios ? 'Settings ▸ AqarBooks ▸ Camera' : 'Settings ▸ Apps ▸ AqarBooks ▸ Permissions ▸ Camera'}\n'
                  'Then come back — or enter the pass manually below.',
        ),
      ScannerIssue.unsupported => (
          ar ? 'لا توجد كاميرا متاحة' : 'No camera available',
          ar
              ? 'هذا الجهاز لا يدعم المسح بالكاميرا — استخدم الإدخال اليدوي بالأسفل.'
              : 'This device cannot scan with a camera — use manual entry below.',
        ),
      ScannerIssue.failed => (
          ar ? 'تعذر تشغيل الكاميرا' : 'Could not start the camera',
          ar
              ? 'أعد المحاولة، أو استخدم الإدخال اليدوي بالأسفل.'
              : 'Try again, or use manual entry below.',
        ),
    };
    return Container(
      color: gatePanel,
      padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 20),
      child: Center(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AqarIcon(AqarIconType.camera, size: 44, color: appGold),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: gateMuted,
                  fontSize: 12.5,
                  height: 1.7,
                ),
              ),
              if (issue != ScannerIssue.unsupported) ...[
                const SizedBox(height: 16),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: appGold, width: 1.2),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 22,
                      vertical: 10,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  onPressed: onRetry,
                  child: Text(
                    ar ? 'إعادة المحاولة' : 'Try again',
                    style: const TextStyle(
                      color: appGold,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The Figma 15 viewport: dark rounded panel, live camera, gold corner
/// brackets, scan line and hint. The camera only runs while [active] (tab
/// visible, route current) **and** the app is in the foreground, so a hidden
/// IndexedStack tab or a pushed result screen never keeps the camera on.
class GateScannerView extends StatefulWidget {
  /// Whether the camera should be running right now.
  final bool active;

  /// When false the live preview is replaced by the idle placeholder (web,
  /// desktop, tests) — manual entry stays available in the parent.
  final bool cameraEnabled;

  /// Called with the raw QR text. The parent owns validation, locking and the
  /// backend call; nothing here retains the payload.
  final ValueChanged<String> onPayload;

  const GateScannerView({
    super.key,
    required this.active,
    required this.onPayload,
    this.cameraEnabled = true,
  });

  @override
  State<GateScannerView> createState() => _GateScannerViewState();
}

class _GateScannerViewState extends State<GateScannerView>
    with WidgetsBindingObserver {
  MobileScannerController? _controller;
  bool _appResumed = true;
  bool _running = false;
  Future<void> _ops = Future<void>.value();

  @override
  void initState() {
    super.initState();
    if (widget.cameraEnabled) {
      _controller = MobileScannerController(
        // The widget does not own lifecycle when given a controller, so
        // start/stop is driven explicitly by _sync().
        autoStart: false,
        formats: const [BarcodeFormat.qrCode],
        facing: CameraFacing.back,
        detectionSpeed: DetectionSpeed.normal,
      );
      WidgetsBinding.instance.addObserver(this);
      WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
    }
  }

  @override
  void didUpdateWidget(covariant GateScannerView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active != widget.active) _sync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appResumed = state == AppLifecycleState.resumed;
    // Returning from system Settings re-runs start(), so a permission the
    // operator just granted takes effect without extra taps.
    _sync();
  }

  void _sync() {
    final controller = _controller;
    if (controller == null || !mounted) return;
    final shouldRun = widget.active && _appResumed;
    if (shouldRun == _running) return;
    _running = shouldRun;
    _ops = _ops.then((_) async {
      try {
        if (shouldRun) {
          await controller.start();
        } else {
          await controller.stop();
        }
      } catch (_) {
        // Failures (permission, no camera) are surfaced by the error builder
        // through controller.value.error — never rethrown into the zone.
      }
    });
  }

  void _retry() {
    final controller = _controller;
    if (controller == null) return;
    _ops = _ops.then((_) async {
      try {
        await controller.stop();
      } catch (_) {}
      try {
        if (widget.active && _appResumed) await controller.start();
      } catch (_) {}
    });
  }

  Future<void> _toggleTorch() async {
    try {
      await _controller?.toggleTorch();
    } catch (_) {}
  }

  void _onDetect(BarcodeCapture capture) {
    if (!widget.active) return;
    final payload = firstQrPayload(capture.barcodes);
    if (payload != null) widget.onPayload(payload);
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null) {
      WidgetsBinding.instance.removeObserver(this);
      // Stop and release the camera only after any in-flight start/stop.
      unawaited(_ops.then((_) async {
        try {
          await controller.stop();
        } catch (_) {}
        await controller.dispose();
      }));
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ar = AppLabels(Localizations.localeOf(context)).ar;
    final controller = _controller;
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: gatePanel,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: gatePanelBorder),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (controller != null)
              MobileScanner(
                controller: controller,
                onDetect: _onDetect,
                fit: BoxFit.cover,
                tapToFocus: true,
                placeholderBuilder: (_) => const ColoredBox(color: gatePanel),
                errorBuilder: (context, error) => ScannerIssuePanel(
                  issue: mapScannerError(error),
                  onRetry: _retry,
                ),
              )
            else
              const _IdleViewport(),
            // Scrim + frame + scan line + hint. Hidden while the issue panel
            // is showing so the gold frame never paints over it.
            if (controller != null)
              ValueListenableBuilder<MobileScannerState>(
                valueListenable: controller,
                builder: (context, state, _) => state.error != null
                    ? const SizedBox.shrink()
                    : _FrameOverlay(ar: ar, dimPreview: true),
              )
            else
              _FrameOverlay(ar: ar, dimPreview: false),
            if (controller != null)
              PositionedDirectional(
                top: 14,
                end: 14,
                child: ValueListenableBuilder<MobileScannerState>(
                  valueListenable: controller,
                  builder: (context, state, _) {
                    // Hidden when the hardware has no torch (front camera,
                    // tablets) or the camera is not running.
                    final supported = state.isRunning &&
                        state.torchState != TorchState.unavailable;
                    if (!supported) return const SizedBox.shrink();
                    final on = state.torchState == TorchState.on;
                    return Semantics(
                      button: true,
                      label: ar
                          ? (on ? 'إطفاء الفلاش' : 'تشغيل الفلاش')
                          : (on ? 'Turn flash off' : 'Turn flash on'),
                      child: InkWell(
                        key: const ValueKey('gate-flash-toggle'),
                        onTap: _toggleTorch,
                        borderRadius: BorderRadius.circular(22),
                        child: Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: on ? appGold : const Color(0x99042434),
                            shape: BoxShape.circle,
                            border: Border.all(color: appGold, width: 1.2),
                          ),
                          child: Center(
                            child: AqarIcon(
                              AqarIconType.flash,
                              size: 22,
                              color: on ? gateDark : appGold,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Frame, scan line and hint over the preview (Figma 15).
class _FrameOverlay extends StatelessWidget {
  final bool ar;
  final bool dimPreview;
  const _FrameOverlay({required this.ar, required this.dimPreview});

  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (dimPreview) const ColoredBox(color: Color(0x1F000000)),
            const Positioned.fill(
              child: CustomPaint(painter: GateScanFramePainter()),
            ),
            Center(
              child: Container(
                width: 240,
                height: 2.5,
                decoration: BoxDecoration(
                  color: appGold.withAlpha(230),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 18,
              child: Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0x99042434),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    ar
                        ? 'وجّه الكاميرا نحو رمز التصريح'
                        : 'Point the camera at the pass QR',
                    style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      );
}

/// Idle placeholder used when no live camera is available (web/desktop/tests).
class _IdleViewport extends StatelessWidget {
  const _IdleViewport();
  @override
  Widget build(BuildContext context) => const Center(
        child: AqarIcon(AqarIconType.qr, size: 72, color: Color(0xFF1B5775)),
      );
}

/// Gold L-brackets at the four corners (Figma 15).
class GateScanFramePainter extends CustomPainter {
  const GateScanFramePainter();
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = appGold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;
    const inset = 20.0, len = 34.0, radius = 12.0;
    final w = size.width, h = size.height;
    Path corner(double sx, double sy, double dx, double dy) => Path()
      ..moveTo(sx + dx * len, sy)
      ..lineTo(sx + dx * radius, sy)
      ..quadraticBezierTo(sx, sy, sx, sy + dy * radius)
      ..lineTo(sx, sy + dy * len);
    canvas.drawPath(corner(inset, inset, 1, 1), paint);
    canvas.drawPath(corner(w - inset, inset, -1, 1), paint);
    canvas.drawPath(corner(w - inset, h - inset, -1, -1), paint);
    canvas.drawPath(corner(inset, h - inset, 1, -1), paint);
  }

  @override
  bool shouldRepaint(GateScanFramePainter oldDelegate) => false;
}
