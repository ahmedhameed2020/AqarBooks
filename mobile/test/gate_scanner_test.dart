import 'dart:async';
import 'dart:convert';

import 'package:aqarbooks_mobile/data/gate_device_store.dart';
import 'package:aqarbooks_mobile/data/gate_scan_logic.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/gate_screens.dart';
import 'package:aqarbooks_mobile/widgets/gate_scanner_view.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

const _passId = '3f2b8c1e-5a4d-4e6f-9a1b-2c3d4e5f6a7b';
final _passSecret = base64UrlEncode(List<int>.generate(32, (i) => i + 1));
final _payload = 'AQP1.$_passId.$_passSecret';
const _otherId = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
final _otherPayload = 'AQP1.$_otherId.$_passSecret';

const _gateId = '22222222-2222-4222-8222-222222222222';
GateDevice _device({String direction = 'BOTH'}) => GateDevice(
      deviceId: '11111111-1111-4111-8111-111111111111',
      gateId: _gateId,
      allowedDirection: direction,
      displayName: 'Main gate phone',
      credential: 'device-credential-device-credential-0123456789',
    );

class _FakeStore implements GateDeviceStore {
  GateDevice? device;
  _FakeStore(this.device);
  @override
  Future<GateDevice?> read() async => device;
  @override
  Future<void> save(GateDevice d) async => device = d;
  @override
  Future<void> clear() async => device = null;
}

class _FakeRepo extends AqarRepository {
  _FakeRepo() : super(null);
  final calls = <Map<String, dynamic>>[];
  Completer<Map<String, dynamic>>? hold;
  Object? failWith;
  Map<String, dynamic> response = {
    'decision': 'ALLOW',
    'reason_code': 'VALID_ENTRY',
    'guest_name': 'Mohamed Samy',
    'unit_code': 'A-12',
  };

  @override
  Future<List<Map<String, dynamic>>> gates() async => [
        {'id': _gateId, 'name_ar': 'بوابة ١', 'name_en': 'Gate 1'},
      ];

  @override
  Future<Map<String, dynamic>> processGateScan({
    required GateDevice device,
    required String invitationId,
    required String rawSecret,
    required String direction,
    required String clientScanId,
  }) {
    calls.add({
      'deviceId': device.deviceId,
      'credential': device.credential,
      'gateId': device.gateId,
      'invitationId': invitationId,
      'rawSecret': rawSecret,
      'direction': direction,
      'clientScanId': clientScanId,
    });
    if (failWith != null) return Future.error(failWith!);
    return hold?.future ?? Future.value(response);
  }
}

User _user() => User.fromJson({
      'id': 'gate-operator',
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': 'gate@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

final _gateSession = AppSession(
  user: _user(),
  capabilities: const {'operations.gates.scan'},
);

/// Wall-clock the coordinator sees in widget tests; advanced explicitly.
DateTime _testNow = DateTime(2026, 10, 4, 12);

Future<void> _pumpScan(
  WidgetTester tester, {
  required _FakeStore store,
  required _FakeRepo repo,
  Locale locale = const Locale('en'),
}) async {
  _testNow = DateTime(2026, 10, 4, 12);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        gateDeviceStoreProvider.overrideWithValue(store),
        repositoryProvider.overrideWithValue(repo),
        gateCameraEnabledProvider.overrideWithValue(false),
        scanCoordinatorFactoryProvider
            .overrideWithValue(() => ScanCoordinator(clock: () => _testNow)),
      ],
      child: MaterialApp(
        locale: locale,
        home: Scaffold(body: GateScanScreen(session: _gateSession)),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _submitManual(WidgetTester tester, String value) async {
  await tester.enterText(find.byKey(const ValueKey('gate-manual-entry')), value);
  await tester.testTextInput.receiveAction(TextInputAction.done);
  await tester.pump();
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('parsePassPayload', () {
    test('accepts a well-formed pass and trims whitespace', () {
      final pass = parsePassPayload('  $_payload \n');
      expect(pass, isNotNull);
      expect(pass!.invitationId, _passId);
      expect(pass.secret, _passSecret);
    });

    test('rejects anything that is not an AqarBooks pass', () {
      expect(parsePassPayload(''), isNull);
      expect(parsePassPayload('https://example.com/menu'), isNull);
      expect(parsePassPayload('AQP2.$_passId.$_passSecret'), isNull);
      expect(parsePassPayload('AQP1.not-a-uuid.$_passSecret'), isNull);
      expect(parsePassPayload('AQP1.$_passId'), isNull);
      expect(parsePassPayload('AQP1.$_passId.short'), isNull);
      expect(parsePassPayload('AQP1.$_passId.${'A' * 400}'), isNull);
    });

    test('never reveals the secret when printed', () {
      final pass = parsePassPayload(_payload)!;
      expect(pass.toString(), isNot(contains(_passSecret)));
    });
  });

  group('ScanCoordinator (duplicate-scan protection)', () {
    late DateTime now;
    late ScanCoordinator coordinator;
    late int counter;

    setUp(() {
      now = DateTime(2026, 10, 4, 12);
      counter = 0;
      coordinator = ScanCoordinator(
        clock: () => now,
        idFactory: () => 'scan-${++counter}',
      );
    });

    test('only one scan can be in flight, however long it takes', () {
      final first = coordinator.tryBegin(_payload, 'ENTRY');
      expect(first, isNotNull);
      expect(coordinator.isBusy, isTrue);
      // Well past both the minimum gap and the repeat window: only the
      // in-flight lock can be what blocks these.
      now = now.add(const Duration(seconds: 30));
      expect(coordinator.tryBegin(_otherPayload, 'ENTRY'), isNull);
      expect(coordinator.tryBegin(_payload, 'ENTRY'), isNull);
      coordinator.complete(first!, delivered: true);
      expect(coordinator.isBusy, isFalse);
    });

    test('a QR that stays in frame is not re-processed within the window', () {
      final first = coordinator.tryBegin(_payload, 'ENTRY')!;
      coordinator.complete(first, delivered: true);
      now = now.add(const Duration(seconds: 1));
      expect(coordinator.tryBegin(_payload, 'ENTRY'), isNull);
      now = now.add(const Duration(seconds: 3));
      expect(coordinator.tryBegin(_payload, 'ENTRY'), isNotNull);
    });

    test('a different pass is accepted after the minimum gap', () {
      final first = coordinator.tryBegin(_payload, 'ENTRY')!;
      coordinator.complete(first, delivered: true);
      now = now.add(const Duration(milliseconds: 100));
      expect(coordinator.tryBegin(_otherPayload, 'ENTRY'), isNull);
      now = now.add(const Duration(milliseconds: 600));
      expect(coordinator.tryBegin(_otherPayload, 'ENTRY'), isNotNull);
    });

    test('a failed delivery keeps the client scan id for an idempotent retry',
        () {
      final first = coordinator.tryBegin(_payload, 'ENTRY')!;
      coordinator.complete(first, delivered: false);
      now = now.add(const Duration(seconds: 4));
      final retry = coordinator.tryBegin(_payload, 'ENTRY')!;
      expect(retry.clientScanId, first.clientScanId);
    });

    test('a delivered scan never reuses its client scan id', () {
      final first = coordinator.tryBegin(_payload, 'ENTRY')!;
      coordinator.complete(first, delivered: true);
      now = now.add(const Duration(seconds: 4));
      final second = coordinator.tryBegin(_payload, 'ENTRY')!;
      expect(second.clientScanId, isNot(first.clientScanId));
    });

    test('client scan ids are scoped per direction and expire', () {
      final entry = coordinator.tryBegin(_payload, 'ENTRY')!;
      coordinator.complete(entry, delivered: false);
      now = now.add(const Duration(seconds: 4));
      final exit = coordinator.tryBegin(_payload, 'EXIT')!;
      expect(exit.clientScanId, isNot(entry.clientScanId));
      coordinator.complete(exit, delivered: false);
      now = now.add(const Duration(minutes: 3));
      final later = coordinator.tryBegin(_payload, 'ENTRY')!;
      expect(later.clientScanId, isNot(entry.clientScanId));
    });

    test('only a hash of the payload is ever remembered', () {
      final fingerprint = ScanCoordinator.fingerprintOf(_payload);
      expect(fingerprint, hasLength(64));
      expect(fingerprint, isNot(contains(_passSecret)));
      expect(fingerprint, isNot(_payload));
    });
  });

  group('scan result + camera error mapping', () {
    test('ALLOW / DENY / needs-attention classification', () {
      expect(classifyScanResult('ALLOW', 'VALID_ENTRY'), GateOutcome.allow);
      expect(classifyScanResult('DENY', 'EXPIRED'), GateOutcome.deny);
      expect(classifyScanResult('DENY', 'PASS_ALREADY_USED'), GateOutcome.deny);
      expect(
          classifyScanResult('DENY', 'ALREADY_INSIDE'), GateOutcome.attention);
      expect(classifyScanResult('DENY', 'NOT_INSIDE'), GateOutcome.attention);
      expect(classifyScanResult('RECONCILE', null), GateOutcome.attention);
    });

    test('plugin errors map to operator-safe issues', () {
      expect(
        mapScannerError(const MobileScannerException(
            errorCode: MobileScannerErrorCode.permissionDenied)),
        ScannerIssue.permissionDenied,
      );
      expect(
        mapScannerError(const MobileScannerException(
            errorCode: MobileScannerErrorCode.unsupported)),
        ScannerIssue.unsupported,
      );
      expect(
        mapScannerError(const MobileScannerException(
            errorCode: MobileScannerErrorCode.genericError)),
        ScannerIssue.failed,
      );
    });

    test('first non-empty QR payload is taken from a capture', () {
      final capture = BarcodeCapture(barcodes: const [
        Barcode(rawValue: null),
        Barcode(rawValue: ''),
        Barcode(rawValue: 'first'),
        Barcode(rawValue: 'second'),
      ]);
      expect(firstQrPayload(capture.barcodes), 'first');
      expect(firstQrPayload(const <Barcode>[]), isNull);
    });

    test('device-trust failures use the blueprint wording, not raw errors', () {
      final ar = gateErrorMessage(
        Exception('DEVICE_BINDING_NOT_AUTHORIZED'),
        const Locale('ar'),
      );
      expect(ar, 'هذا الجهاز غير مفعّل — راجع الإدارة');
      final en = gateErrorMessage(
        Exception('GATE_TRUSTED_DEVICE_REQUIRED'),
        const Locale('en'),
      );
      expect(en, isNot(contains('GATE_TRUSTED')));
    });
  });

  group('camera permission denied state', () {
    testWidgets('explains how to recover and offers retry', (tester) async {
      var retries = 0;
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          home: Scaffold(
            body: ScannerIssuePanel(
              issue: ScannerIssue.permissionDenied,
              onRetry: () => retries++,
            ),
          ),
        ),
      );
      expect(find.text('Camera access is off'), findsOneWidget);
      expect(find.textContaining('Settings'), findsOneWidget);
      expect(find.textContaining('manually'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retries, 1);
    });

    testWidgets('shows Arabic copy and iOS-specific settings path',
        (tester) async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: ScannerIssuePanel(
              issue: ScannerIssue.permissionDenied,
              onRetry: () {},
            ),
          ),
        ),
      );
      expect(find.text('الكاميرا غير مسموح بها'), findsOneWidget);
      expect(find.textContaining('الإعدادات ← AqarBooks ← الكاميرا'),
          findsOneWidget);
      // Flutter verifies foundation overrides right after the test body, so
      // the platform override must be cleared here rather than in tearDown.
      debugDefaultTargetPlatformOverride = null;
    });

    testWidgets('no-camera state has no pointless retry', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('en'),
          home: Scaffold(
            body: ScannerIssuePanel(
              issue: ScannerIssue.unsupported,
              onRetry: () {},
            ),
          ),
        ),
      );
      expect(find.text('No camera available'), findsOneWidget);
      expect(find.text('Try again'), findsNothing);
    });
  });

  group('GateScanScreen — trusted device enforcement', () {
    testWidgets('an un-enrolled device cannot scan, camera or manual',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(null), repo: repo);
      expect(find.text('This device is not activated'), findsOneWidget);
      expect(find.byType(GateScannerView), findsNothing);
      expect(find.byKey(const ValueKey('gate-manual-entry')), findsNothing);
      expect(repo.calls, isEmpty);
    });

    testWidgets('trust revoked after render stops the scan before the backend',
        (tester) async {
      final store = _FakeStore(_device());
      final repo = _FakeRepo();
      await _pumpScan(tester, store: store, repo: repo);
      store.device = null; // credential cleared/unreadable at the moment of use
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, isEmpty);
    });

    testWidgets('scans present the device id, credential and bound gate',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      expect(find.byType(GateScannerView), findsOneWidget);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(1));
      final call = repo.calls.single;
      expect(call['deviceId'], '11111111-1111-4111-8111-111111111111');
      expect(call['credential'], startsWith('device-credential'));
      expect(call['gateId'], _gateId);
      expect(call['invitationId'], _passId);
      expect(call['rawSecret'], _passSecret);
      expect(call['direction'], 'ENTRY');
    });

    testWidgets('an ENTRY-only device offers no exit direction',
        (tester) async {
      await _pumpScan(
        tester,
        store: _FakeStore(_device(direction: 'ENTRY')),
        repo: _FakeRepo(),
      );
      expect(find.text('In'), findsOneWidget);
      expect(find.text('Out'), findsNothing);
    });

    testWidgets('a BOTH device can switch to EXIT and scans as EXIT',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await tester.tap(find.text('Out'));
      await tester.pump();
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls.single['direction'], 'EXIT');
    });
  });

  group('GateScanScreen — result screens', () {
    testWidgets('ALLOW shows the green result and the field is cleared',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(find.text('Entry allowed'), findsOneWidget);
      expect(find.text('Mohamed Samy'), findsOneWidget);
      await tester.tap(find.text('Done — scan next'));
      await tester.pumpAndSettle();
      final field = tester.widget<TextField>(
        find.byKey(const ValueKey('gate-manual-entry')),
      );
      expect(field.controller!.text, isEmpty,
          reason: 'a pass secret must not linger in the manual field');
    });

    testWidgets('DENY shows the translated reason, not the raw code',
        (tester) async {
      final repo = _FakeRepo()
        ..response = {'decision': 'DENY', 'reason_code': 'EXPIRED'};
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(find.text('Denied'), findsOneWidget);
      expect(find.text('Pass expired'), findsOneWidget);
      expect(find.text('EXPIRED'), findsNothing);
    });

    testWidgets('ALREADY_INSIDE is the amber needs-attention state',
        (tester) async {
      final repo = _FakeRepo()
        ..response = {'decision': 'DENY', 'reason_code': 'ALREADY_INSIDE'};
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(find.text('Needs attention'), findsOneWidget);
      expect(find.text('Already inside'), findsOneWidget);
    });

    testWidgets('a non-pass QR is denied locally without touching the backend',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, 'https://example.com/not-a-pass');
      await tester.pumpAndSettle();
      expect(repo.calls, isEmpty);
      expect(find.text('Denied'), findsOneWidget);
      expect(find.text('Invalid pass'), findsOneWidget);
    });

    testWidgets('a device-binding failure shows safe copy and no result screen',
        (tester) async {
      final repo = _FakeRepo()
        ..failWith = Exception('DEVICE_BINDING_NOT_AUTHORIZED 42501');
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(find.text('This device is not activated — contact the office'),
          findsOneWidget);
      expect(find.textContaining('DEVICE_BINDING'), findsNothing);
      expect(find.text('Entry allowed'), findsNothing);
    });
  });

  group('GateScanScreen — duplicate-scan protection', () {
    testWidgets('detections during a slow scan are ignored by the lock alone',
        (tester) async {
      final repo = _FakeRepo()..hold = Completer<Map<String, dynamic>>();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      expect(repo.calls, hasLength(1));
      // The request is still in flight 30 s later (far beyond the min gap
      // and the repeat window): the same and a different pass are refused.
      _testNow = _testNow.add(const Duration(seconds: 30));
      await _submitManual(tester, _payload);
      await _submitManual(tester, _otherPayload);
      await tester.pump();
      expect(repo.calls, hasLength(1));
      repo.hold!.complete(repo.response);
      await tester.pumpAndSettle();
      expect(find.text('Entry allowed'), findsOneWidget);
      expect(repo.calls, hasLength(1));
    });

    testWidgets('the same pass is refused inside the repeat window only',
        (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done — scan next'));
      await tester.pumpAndSettle();

      // 1 s later: past the min gap, still inside the 3 s repeat window.
      _testNow = _testNow.add(const Duration(seconds: 1));
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(1));

      // A different pass is not affected by the repeat window.
      await _submitManual(tester, _otherPayload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(2));
      await tester.tap(find.text('Done — scan next'));
      await tester.pumpAndSettle();

      // Once the window has passed the first pass can be scanned again.
      _testNow = _testNow.add(const Duration(seconds: 5));
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(3));
    });

    testWidgets('a retry after a transport failure reuses the client scan id',
        (tester) async {
      final repo = _FakeRepo()..failWith = Exception('SocketException');
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(1));

      repo.failWith = null;
      _testNow = _testNow.add(const Duration(seconds: 5));
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(2));
      expect(repo.calls[1]['clientScanId'], repo.calls[0]['clientScanId'],
          reason: 'idempotent replay must not create a second ledger event');
    });
  });

  group('manual fallback', () {
    testWidgets('stays available when the camera is off', (tester) async {
      final repo = _FakeRepo();
      await _pumpScan(tester, store: _FakeStore(_device()), repo: repo);
      expect(find.byKey(const ValueKey('gate-manual-entry')), findsOneWidget);
      await _submitManual(tester, _payload);
      await tester.pumpAndSettle();
      expect(repo.calls, hasLength(1));
    });
  });
}
