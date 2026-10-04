import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:aqarbooks_mobile/core/app_core.dart';
import 'package:aqarbooks_mobile/core/formatting.dart';
import 'package:aqarbooks_mobile/data/gate_device_store.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:aqarbooks_mobile/screens/feature_screens.dart';

Widget _testApp(Widget child) => ProviderScope(child: MaterialApp(home: child));

User _user(String id) => User.fromJson({
  'id': id,
  'aud': 'authenticated',
  'role': 'authenticated',
  'email': '$id@example.com',
  'created_at': '2026-01-01T00:00:00Z',
})!;


class _MemoryGateStore implements GateDeviceStore {
  GateDevice? device;
  _MemoryGateStore([this.device]);
  @override
  Future<GateDevice?> read() async => device;
  @override
  Future<void> save(GateDevice d) async => device = d;
  @override
  Future<void> clear() async => device = null;
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  test('capability routing does not rely on a role name', () {
    final session = AppSession(
      user: _user('user-1'),
      capabilities: const {'operations.work_orders.view'},
    );
    expect(session.isStaff, isTrue);
    expect(session.isManager, isFalse);
    expect(session.can('operations.work_orders.complete'), isFalse);
  });

  test('personas resolve strictly from permission keys with precedence', () {
    final user = _user('u');
    expect(
      AppSession(user: user, capabilities: const {
        'operations.work_orders.assign',
        'receivables.payments.create',
      }).persona,
      Persona.manager,
    );
    expect(
      AppSession(user: user, capabilities: const {
        'receivables.payments.create',
        'operations.gates.scan',
      }).persona,
      Persona.collector,
    );
    expect(
      AppSession(user: user, capabilities: const {
        'operations.work_orders.view',
      }).persona,
      Persona.technician,
    );
    expect(
      AppSession(user: user, capabilities: const {'operations.gates.scan'})
          .persona,
      Persona.gate,
    );
    expect(AppSession(user: user).persona, Persona.resident);
  });

  test('manager is defined by operations keys, not finance reporting', () {
    final user = _user('u');
    // finance.reports.read belongs to back-office web personas.
    expect(
      AppSession(user: user, capabilities: const {'finance.reports.read'})
          .isManager,
      isFalse,
    );
    expect(
      AppSession(
        user: user,
        capabilities: const {'operations.maintenance.manage'},
      ).isManager,
      isTrue,
    );
  });

  test('header context shows company and project, with safe fallbacks', () {
    final user = _user('u');
    const ar = Locale('ar'), en = Locale('en');
    expect(AppSession(user: user).contextLabel(ar), 'AqarBooks');
    expect(
      AppSession(user: user, organizationName: 'MA').contextLabel(ar),
      'MA',
    );
    expect(
      AppSession(
        user: user,
        organizationName: ' MA ',
        propertyNames: const ['Palm Compound'],
      ).contextLabel(en),
      'MA · Palm Compound',
    );
    final multi = AppSession(
      user: user,
      organizationName: 'MA',
      propertyNames: const ['A', 'B', 'C'],
    );
    expect(multi.contextLabel(ar), 'MA · ٣ مشاريع');
    expect(multi.contextLabel(en), 'MA · 3 projects');
    // A blank company name never renders an empty header.
    expect(
      AppSession(user: user, organizationName: '  ').contextLabel(en),
      'AqarBooks',
    );
  });

  test('outstanding dues never become negative after over-allocation', () {
    expect(outstandingAmount(100, 40), 60);
    expect(outstandingAmount(100, 120), 0);
  });

  test('history separates terminal work-order statuses from assignments', () {
    expect(isHistoryWorkOrderStatus('COMPLETED'), isTrue);
    expect(isHistoryWorkOrderStatus('CANCELLED'), isTrue);
    expect(isHistoryWorkOrderStatus('IN_PROGRESS'), isFalse);
  });

  test('work-order actions mirror the DB transition matrix literally', () {
    expect(canTransitionWorkOrder('ASSIGNED', 'IN_PROGRESS'), isTrue);
    expect(canTransitionWorkOrder('COMPLETED', 'IN_PROGRESS'), isFalse);
    expect(canTransitionWorkOrder('WAITING', 'IN_PROGRESS'), isTrue);
    // Cancel is only legal from DRAFT/ASSIGNED/SCHEDULED — the server
    // rejects cancelling an in-progress or waiting order.
    expect(canTransitionWorkOrder('IN_PROGRESS', 'CANCELLED'), isFalse);
    expect(canTransitionWorkOrder('WAITING', 'CANCELLED'), isFalse);
    expect(canTransitionWorkOrder('ASSIGNED', 'CANCELLED'), isTrue);
    expect(canTransitionWorkOrder('SCHEDULED', 'CANCELLED'), isTrue);
  });

  test('work-order mutation controls stay hidden without capabilities', () {
    final session = AppSession(
      user: _user('u'),
      capabilities: const {'operations.work_orders.view'},
    );
    expect(canUseWorkOrderAction(session, 'manage'), isFalse);
    expect(canUseWorkOrderAction(session, 'complete'), isFalse);
    expect(canUseWorkOrderAction(null, 'evidence'), isFalse);
    final privileged = AppSession(
      user: session.user,
      capabilities: const {
        'operations.work_orders.manage',
        'operations.work_orders.complete',
      },
    );
    expect(canUseWorkOrderAction(privileged, 'manage'), isTrue);
    expect(canUseWorkOrderAction(privileged, 'complete'), isTrue);
  });

  test('Arabic labels remain Arabic and English labels remain LTR copy', () {
    expect(const AppLabels(Locale('ar')).dues, 'المستحقات');
    expect(const AppLabels(Locale('en')).dues, 'Dues');
  });

  test('Egypt formatting: Arabic-Indic digits, thousands, single source', () {
    expect(formatMoney(12500, const Locale('ar')), '١٢٬٥٠٠ ج.م');
    expect(formatMoney(12500.5, const Locale('ar')), '١٢٬٥٠٠٫٥٠ ج.م');
    expect(formatMoney(3500, const Locale('en')), '3,500 EGP');
    expect(formatDate('2026-10-15', const Locale('ar'), relative: false),
        '١٥ أكتوبر ٢٠٢٦');
  });

  test('dues portal URI stays allowlisted (legacy web handoff)', () {
    final arabic = duesPortalUri(const Locale('ar'));
    expect(arabic.toString(), 'https://app.aqarbooks.com/ar/portal/dues');
    expect(isAllowedDuesPortalUri(arabic), isTrue);
    expect(
      isAllowedDuesPortalUri(Uri.parse('https://evil.example/en/portal/dues')),
      isFalse,
    );
  });

  testWidgets('payments tab shows settled empty state without network', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          duesProvider.overrideWith((ref) async => const <DueItem>[]),
          paymentsProvider.overrideWith((ref) async => const <PaymentItem>[]),
          fawrySettingsProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(
          locale: Locale('en'),
          home: Scaffold(body: PaymentsTabScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('No open dues — you are all settled ✓'), findsOneWidget);
  });

  testWidgets('new visitor pass stays a one-time QR view', (tester) async {
    await tester.pumpWidget(
      _testApp(
        const VisitorPassDialog(
          payload: 'AQP1.invitation.secret',
          guestName: 'Guest',
        ),
      ),
    );
    expect(find.byKey(const ValueKey('visitor-pass-qr')), findsOneWidget);
    expect(find.textContaining('one-time'), findsOneWidget);
    expect(find.textContaining('AQP1.invitation.secret'), findsNothing);
  });

  testWidgets('resident shell exposes the approved five tabs', (tester) async {
    final session = AppSession(
      user: _user('resident'),
      capabilities: const {'portal.maintenance.read'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: session)));
    await tester.pump();
    expect(find.text('Home'), findsWidgets);
    expect(find.text('My Units'), findsWidgets);
    expect(find.text('Payments'), findsWidgets);
    expect(find.text('Maintenance'), findsWidgets);
    expect(find.text('More'), findsWidgets);
    await tester.pumpWidget(_testApp(Scaffold(body: MoreHubScreen(session: session))));
    await tester.pump();
    expect(find.text('Visitors'), findsOneWidget);
    expect(find.text('Vehicles'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets('technician shell shows task-first navigation', (tester) async {
    final session = AppSession(
      user: _user('tech'),
      capabilities: const {'operations.work_orders.view'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: session)));
    await tester.pump();
    expect(find.text('Today'), findsWidgets);
    expect(find.text('My Tasks'), findsWidgets);
    expect(find.text('History'), findsWidgets);
    expect(find.text('My Units'), findsNothing);
  });

  testWidgets('manager shell shows the operations navigation', (tester) async {
    final session = AppSession(
      user: _user('manager'),
      capabilities: const {'operations.work_orders.assign'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: session)));
    await tester.pump();
    expect(find.text('Collections'), findsWidgets);
    expect(find.text('Operations'), findsWidgets);
    expect(find.text('Maintenance'), findsWidgets);
    expect(find.text('My Units'), findsNothing);
  });

  testWidgets('collector shell centers the collect action', (tester) async {
    final session = AppSession(
      user: _user('collector'),
      capabilities: const {'receivables.payments.create'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: session)));
    await tester.pump();
    expect(find.text('Collect'), findsWidgets);
    expect(find.text('Receipts'), findsWidgets);
    expect(find.text('Search'), findsWidgets);
  });

  testWidgets('gate persona requires device activation before scanning', (
    tester,
  ) async {
    final session = AppSession(
      user: _user('gate'),
      capabilities: const {'operations.gates.scan'},
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          gateDeviceStoreProvider.overrideWithValue(_MemoryGateStore()),
          gateCameraEnabledProvider.overrideWithValue(false),
        ],
        child: MaterialApp(home: AppShell(session: session)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Activate gate device'), findsOneWidget);
    expect(find.text('Scan'), findsNothing);
  });

  testWidgets('an enrolled gate device gets the scanner navigation', (
    tester,
  ) async {
    final session = AppSession(
      user: _user('gate'),
      capabilities: const {'operations.gates.scan'},
    );
    final device = GateDevice(
      deviceId: '11111111-1111-4111-8111-111111111111',
      gateId: '22222222-2222-4222-8222-222222222222',
      allowedDirection: 'BOTH',
      displayName: 'Main gate phone',
      credential: 'device-credential-device-credential-0123456789',
    );
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          gateDeviceStoreProvider.overrideWithValue(_MemoryGateStore(device)),
          gateCameraEnabledProvider.overrideWithValue(false),
        ],
        child: MaterialApp(home: AppShell(session: session)),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Activate gate device'), findsNothing);
    expect(find.text('Scan'), findsWidgets);
    expect(find.text('Trusted device ✓'), findsOneWidget);
  });
}
