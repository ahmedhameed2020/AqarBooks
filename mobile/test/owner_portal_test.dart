// ignore_for_file: prefer_initializing_formals
import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:aqarbooks_mobile/core/app_core.dart';
import 'package:aqarbooks_mobile/core/contact.dart';
import 'package:aqarbooks_mobile/core/formatting.dart';
import 'package:aqarbooks_mobile/core/portal_mode.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/data/visitor_pass_store.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:aqarbooks_mobile/screens/feature_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show AuthChangeEvent, AuthState, Session, SupabaseClient, User;

User _user(String id) => User.fromJson({
      'id': id,
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': '$id@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

// ───────────────────────── pure eligibility rules ─────────────────────────

Map<String, dynamic> _own(String unit,
        {String member = 'm1', String? start, String? end}) =>
    {
      'unit_id': unit,
      'member_id': member,
      'start_date': start ?? '2020-01-01',
      'end_date': end,
    };

MemberPortal _portal({
  List<Map<String, dynamic>> members = const [
    {'id': 'm1'}
  ],
  List<Map<String, dynamic>> ownerships = const [],
  List<Map<String, dynamic>> leases = const [],
}) =>
    MemberPortal.fromRows(
      members: members,
      ownerships: ownerships,
      leases: leases,
      today: DateTime(2026, 6, 15),
    );

// ───────────────────────── fake Supabase over HTTP ─────────────────────────

String _jwt(String uid) {
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'HS256', 'typ': 'JWT'})}.'
      '${b64({
        'sub': uid,
        'role': 'authenticated',
        'exp': DateTime.now().add(const Duration(hours: 1)).millisecondsSinceEpoch ~/ 1000,
      })}.sig';
}

class _Backend {
  final requests = <Uri>[];
  Map<String, List<Map<String, dynamic>>> tables;
  _Backend(this.tables);

  http.Client get client => MockClient((req) async {
        requests.add(req.url);
        if (req.url.path.endsWith('/auth/v1/logout')) {
          return http.Response('', 204, request: req);
        }
        final table = req.url.pathSegments.last;
        return http.Response(
          jsonEncode(tables[table] ?? const []),
          200,
          headers: {'content-type': 'application/json'},
          request: req,
        );
      });

  List<Uri> to(String table) =>
      requests.where((u) => u.pathSegments.last == table).toList();
}

Future<SupabaseClient> _clientFor(String uid, _Backend backend) async {
  final client = SupabaseClient(
    'http://fake.supabase.local',
    'anon-key',
    httpClient: backend.client,
  );
  await client.auth.recoverSession(jsonEncode({
    'access_token': _jwt(uid),
    'token_type': 'bearer',
    'expires_in': 3600,
    'refresh_token': 'r-$uid',
    'user': {
      'id': uid,
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': '$uid@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    },
  }));
  return client;
}

// ───────────────────────── fake repository for widget tests ───────────────

class _Repo extends AqarRepository {
  _Repo({
    List<UnitItem> units = const [],
    List<DueItem> dues = const [],
    List<MaintenanceItem> requests = const [],
    List<PaymentItem> payments = const [],
    this.authorized,
  })  : _units = units,
        _dues = dues,
        _requests = requests,
        _payments = payments,
        super(null);
  final List<UnitItem> _units;
  final List<DueItem> _dues;
  final List<MaintenanceItem> _requests;
  final List<PaymentItem> _payments;
  final List<UnitItem>? authorized;

  final created = <Map<String, Object?>>[];
  final uploads = <String>[];
  final invitations = <Map<String, Object?>>[];

  @override
  Future<MemberPortal> memberPortal({bool force = false}) async =>
      MemberPortal(
        memberIds: const {'m1'},
        ownedUnitIds: {for (final u in _units) u.id},
      );
  @override
  Future<HomeSummary> homeSummary() async => const HomeSummary();
  @override
  Future<List<UnitItem>> units() async => _units;
  @override
  Future<List<UnitItem>> authorizedUnits() async => authorized ?? _units;
  @override
  Future<List<DueItem>> dues() async => _dues;
  @override
  Future<List<PaymentItem>> payments() async => _payments;
  @override
  Future<List<MaintenanceItem>> maintenance() async => _requests;
  @override
  Future<List<Map<String, dynamic>>> maintenanceCategories() async => [
        {'id': 'cat1', 'name_en': 'Plumbing', 'name_ar': 'سباكة'},
      ];
  @override
  Future<List<NotificationItem>> notifications() async => const [];
  @override
  Future<Map<String, dynamic>?> fawrySettings() async => null;
  @override
  Future<String> createMaintenance({
    required String unitId,
    required String categoryId,
    required String title,
    required String description,
    required String priority,
  }) async {
    created.add({
      'unitId': unitId,
      'categoryId': categoryId,
      'description': description,
    });
    return 'req-new';
  }

  @override
  Future<void> uploadMaintenanceAttachment({
    required String requestId,
    required String fileName,
    required String mimeType,
    required Uint8List bytes,
    String kind = 'ISSUE',
    String visibility = 'MEMBER_VISIBLE',
  }) async =>
      uploads.add('$requestId:$fileName');
  @override
  Future<MaintenanceDetail> maintenanceDetail(String id) async =>
      MaintenanceDetail(
        request: const MaintenanceItem(
          id: 'req-new',
          requestNo: 'MR-1',
          title: 'Plumbing',
          status: 'SUBMITTED',
          priority: 'NORMAL',
          submittedAt: '2026-06-15T10:00:00Z',
          unitCode: 'A-12',
        ),
        description: 'Leak',
        categoryId: 'cat1',
        updates: const [],
        attachments: const [],
        workOrders: const [],
      );
  @override
  Future<VisitorCreateResult> createVisitor({
    required String unitId,
    required String guestName,
    String? phone,
    String? note,
    required String from,
    required String until,
    required String usage,
  }) async {
    invitations.add({'unitId': unitId, 'guest': guestName, 'usage': usage});
    return const VisitorCreateResult('inv-1', 'AQP1.inv-1.secret');
  }

  @override
  Future<List<VisitorItem>> myVisitors() async => const [];
}

class _MemStore implements VisitorPassStore {
  final data = <String, List<SavedPass>>{};
  @override
  Future<List<SavedPass>> read(String userId) async => data[userId] ?? const [];
  @override
  Future<void> save(String userId, SavedPass pass) async =>
      data[userId] = [pass, ...?data[userId]];
}

const _unitA = UnitItem(id: 'uA', code: 'A-12', balance: 2500, type: 'APARTMENT');
const _unitB = UnitItem(id: 'uB', code: 'B-07', balance: 0, type: 'VILLA');

DueItem _due(String unit, String desc, double amt, String date) => DueItem(
      id: 'd-$unit-$desc',
      description: desc,
      amount: amt,
      paid: 0,
      outstanding: amt,
      dueDate: date,
      unitCode: unit,
    );

Widget _app(
  _Repo repo,
  Widget home, {
  VisitorPassStore? passes,
  List<Override> extra = const [],
}) =>
    ProviderScope(
      overrides: [
        repositoryProvider.overrideWithValue(repo),
        visitorPassStoreProvider.overrideWithValue(passes ?? _MemStore()),
        ...extra,
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        scrollBehavior: const AqarScrollBehavior(),
        home: home,
      ),
    );

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('member portal eligibility', () {
    test('a linked member who owns a unit is eligible', () {
      final p = _portal(ownerships: [_own('uA')]);
      expect(p.eligible, isTrue);
      expect(p.ownedUnitIds, {'uA'});
    });

    test('a user with no member record is not eligible', () {
      final p = _portal(members: const [], ownerships: [_own('uA')]);
      expect(p.eligible, isFalse);
      expect(p.readableUnitIds, isEmpty);
    });

    test('a member without ownership is not eligible', () {
      expect(_portal().eligible, isFalse);
    });

    test('ended and not-yet-started ownerships do not count', () {
      final p = _portal(ownerships: [
        _own('ended', end: '2026-06-14'),
        _own('future', start: '2026-06-16'),
        _own('endsToday', end: '2026-06-15'),
      ]);
      expect(p.ownedUnitIds, {'endsToday'});
    });

    test('a lessee is not an owner: read access only, no portal entry', () {
      final p = _portal(leases: [
        {'unit_id': 'uL', 'tenant_member_id': 'm1', 'status': 'ACTIVE'},
        {'unit_id': 'uOld', 'tenant_member_id': 'm1', 'status': 'ENDED'},
      ]);
      expect(p.eligible, isFalse);
      expect(p.ownedUnitIds, isEmpty);
      expect(p.leasedUnitIds, {'uL'});
      expect(p.readableUnitIds, {'uL'});
      expect(p.owns('uL'), isFalse);
    });

    test("another member's ownerships and leases are ignored", () {
      final p = _portal(
        ownerships: [_own('uMine'), _own('uTheirs', member: 'm2')],
        leases: [
          {'unit_id': 'uRent', 'tenant_member_id': 'm2', 'status': 'ACTIVE'},
        ],
      );
      expect(p.ownedUnitIds, {'uMine'});
      expect(p.readableUnitIds, {'uMine'});
    });

    test('owning a unit that is also leased keeps it owned only', () {
      final p = _portal(
        ownerships: [_own('uA')],
        leases: [
          {'unit_id': 'uA', 'tenant_member_id': 'm1', 'status': 'ACTIVE'},
        ],
      );
      expect(p.leasedUnitIds, isEmpty);
      expect(p.ownedUnitIds, {'uA'});
    });
  });

  group('isolation against a staff-wide backend', () {
    // The fake backend returns rows regardless of filters, exactly like RLS
    // does for staff. What matters is what the app ASKS for.
    Future<_Backend> run(
      String uid,
      Future<void> Function(AqarRepository repo, _Backend backend) body, {
      List<Map<String, dynamic>> ownerships = const [],
      List<Map<String, dynamic>> leases = const [],
    }) async {
      final backend = _Backend({
        'members': [
          {'id': 'm-$uid'},
        ],
        'unit_ownerships': ownerships,
        'unit_leases': leases,
      });
      final repo = AqarRepository(await _clientFor(uid, backend));
      await body(repo, backend);
      return backend;
    }

    String filterOf(Uri u, String column) => u.queryParameters[column] ?? '';

    test('every portal list is restricted to the member\'s own units',
        () async {
      final backend = await run(
        'owner1',
        (repo, backend) async {
          await repo.units();
          await repo.dues();
          await repo.maintenance();
          await repo.vehicles();
          await repo.myVisitors();
        },
        ownerships: [
          {'unit_id': 'uOwned', 'member_id': 'm-owner1', 'start_date': '2020-01-01', 'end_date': null},
        ],
        leases: [
          {'unit_id': 'uRented', 'tenant_member_id': 'm-owner1', 'status': 'ACTIVE'},
        ],
      );
      final units = filterOf(backend.to('units_with_financials').single, 'id');
      expect(units, allOf(contains('uOwned'), contains('uRented')));
      final dues = filterOf(backend.to('dues').first, 'unit_id');
      expect(dues, allOf(contains('uOwned'), contains('uRented')));
      // Owner-only features never include rented units.
      for (final table in ['maintenance_requests', 'vehicles', 'visitor_invitations']) {
        final filter = filterOf(backend.to(table).first, 'unit_id');
        expect(filter, contains('uOwned'), reason: table);
        expect(filter, isNot(contains('uRented')), reason: table);
      }
    });

    test('a user with no units never queries unit data at all', () async {
      final backend = await run('nobody', (repo, backend) async {
        expect(await repo.units(), isEmpty);
        expect(await repo.dues(), isEmpty);
        expect(await repo.maintenance(), isEmpty);
        expect(await repo.vehicles(), isEmpty);
        expect(await repo.myVisitors(), isEmpty);
        expect(await repo.authorizedUnits(), isEmpty);
      });
      for (final table in [
        'units_with_financials',
        'dues',
        'maintenance_requests',
        'vehicles',
        'visitor_invitations',
      ]) {
        expect(backend.to(table), isEmpty, reason: table);
      }
    });

    test('a lessee cannot create requests, invitations or vehicles', () async {
      await run(
        'tenant',
        (repo, backend) async {
          expect(await repo.authorizedUnits(), isEmpty);
          expect((await repo.memberPortal()).eligible, isFalse);
        },
        leases: [
          {'unit_id': 'uRented', 'tenant_member_id': 'm-tenant', 'status': 'ACTIVE'},
        ],
      );
    });

    test('gate staff still see every invitation (unscoped visitors())',
        () async {
      final backend = await run('gate', (repo, backend) async {
        await repo.visitors();
      });
      expect(filterOf(backend.to('visitor_invitations').single, 'unit_id'), '');
    });

    test('sign-out clears the cached scope: the next user starts clean',
        () async {
      final backend = _Backend({
        'members': [
          {'id': 'm-a'},
        ],
        'unit_ownerships': [
          {'unit_id': 'uA', 'member_id': 'm-a', 'start_date': '2020-01-01', 'end_date': null},
        ],
        'unit_leases': const [],
      });
      final client = await _clientFor('alice', backend);
      final repo = AqarRepository(client);
      expect((await repo.memberPortal()).ownedUnitIds, {'uA'});
      final before = backend.to('members').length;
      await repo.memberPortal(); // served from the short-lived memo
      expect(backend.to('members').length, before);

      await repo.signOut();
      expect(client.auth.currentUser, isNull);
      expect(await repo.memberPortal(), same(MemberPortal.none));

      // A different user on the same repository must not see Alice's scope.
      backend.tables = {
        'members': [
          {'id': 'm-b'},
        ],
        'unit_ownerships': [
          {'unit_id': 'uB', 'member_id': 'm-b', 'start_date': '2020-01-01', 'end_date': null},
        ],
        'unit_leases': const [],
      };
      await client.auth.recoverSession(jsonEncode({
        'access_token': _jwt('bob'),
        'token_type': 'bearer',
        'expires_in': 3600,
        'refresh_token': 'r-bob',
        'user': {
          'id': 'bob',
          'aud': 'authenticated',
          'role': 'authenticated',
          'created_at': '2026-01-01T00:00:00Z',
        },
      }));
      expect((await repo.memberPortal()).ownedUnitIds, {'uB'});
    });
  });

  group('staff who are also owners', () {
    Widget shell(AppSession s) => _app(
          _Repo(units: const [_unitA]),
          AppShell(session: s),
        );

    testWidgets('can switch into the owner portal and back', (tester) async {
      _tall(tester);
      final session = AppSession(
        user: _user('boss'),
        capabilities: const {'operations.work_orders.assign'},
        isPortalMember: true,
      );
      await tester.pumpWidget(shell(session));
      await tester.pump();
      // Work mode first: manager navigation, no owner tabs.
      expect(find.text('Collections'), findsWidgets);
      expect(find.text('My Units'), findsNothing);

      await tester.tap(find.text('More').last);
      await tester.pump();
      await tester.tap(find.text('My account as owner / member'));
      await tester.pump(const Duration(milliseconds: 300));
      // Now the owner portal navigation.
      expect(find.text('My Units'), findsWidgets);
      expect(find.text('Payments'), findsWidgets);
      expect(find.text('Collections'), findsNothing);

      await tester.tap(find.text('More').last);
      await tester.pump();
      expect(find.text('Visitors'), findsOneWidget);
      expect(find.text('Vehicles'), findsOneWidget);
      await tester.tap(find.text('Back to work mode'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Collections'), findsWidgets);
      expect(find.text('My Units'), findsNothing);
    });

    testWidgets('staff who own nothing get no owner entry', (tester) async {
      _tall(tester);
      final session = AppSession(
        user: _user('boss'),
        capabilities: const {'operations.work_orders.assign'},
      );
      await tester.pumpWidget(shell(session));
      await tester.pump();
      await tester.tap(find.text('More').last);
      await tester.pump();
      expect(find.text('My account as owner / member'), findsNothing);
      expect(find.text('Visitors'), findsNothing);
    });

    testWidgets('an owner without staff permissions lands in the portal '
        'with no switch rows', (tester) async {
      _tall(tester);
      final session = AppSession(user: _user('owner'), isPortalMember: true);
      await tester.pumpWidget(shell(session));
      await tester.pump();
      for (final tab in ['Home', 'My Units', 'Payments', 'Maintenance', 'More']) {
        expect(find.text(tab), findsWidgets, reason: tab);
      }
      await tester.tap(find.text('More').last);
      await tester.pump();
      for (final row in [
        'Visitors',
        'Vehicles',
        'Documents — not available yet',
        'Notifications',
        'Profile',
        'Support',
      ]) {
        expect(find.text(row), findsOneWidget, reason: row);
      }
      expect(find.text('My account as owner / member'), findsNothing);
      expect(find.text('Back to work mode'), findsNothing);
    });

    test('owner mode resets whenever the signed-in user changes', () async {
      final auth = StreamController<AuthState>();
      addTearDown(auth.close);
      final container = ProviderContainer(overrides: [
        authStateProvider.overrideWith((ref) => auth.stream),
      ]);
      addTearDown(container.dispose);
      final sub = container.listen(portalModeProvider, (_, __) {});
      final sub2 = container.listen(selectedUnitProvider, (_, __) {});
      addTearDown(sub.close);
      addTearDown(sub2.close);

      auth.add(AuthState(AuthChangeEvent.signedIn,
          Session(accessToken: 't', tokenType: 'bearer', user: _user('alice'))));
      await Future<void>.delayed(Duration.zero);
      container.read(portalModeProvider.notifier).state = true;
      container.read(selectedUnitProvider.notifier).state = 'uA';
      expect(container.read(portalModeProvider), isTrue);

      auth.add(const AuthState(AuthChangeEvent.signedOut, null));
      await Future<void>.delayed(Duration.zero);
      expect(container.read(portalModeProvider), isFalse);
      expect(container.read(selectedUnitProvider), isNull);
    });
  });

  group('owner home and dues', () {
    testWidgets('shows only the focused unit and switches between units',
        (tester) async {
      _tall(tester);
      final repo = _Repo(
        units: const [_unitA, _unitB],
        dues: [
          _due('A-12', 'Maintenance fee A', 2500, '2099-01-10'),
          _due('B-07', 'Garden fee B', 700, '2099-02-01'),
        ],
        payments: const [
          PaymentItem(
              id: 'p1',
              receipt: 'REC-1',
              date: '2026-05-01',
              method: 'CASH',
              amount: 1200,
              unitId: 'uA'),
          PaymentItem(
              id: 'p2',
              receipt: 'REC-2',
              date: '2026-05-02',
              method: 'CASH',
              amount: 999,
              unitId: 'uB'),
        ],
      );
      final session = AppSession(user: _user('owner'), isPortalMember: true);
      await tester.pumpWidget(_app(repo, Scaffold(body: ResidentHomeScreen(session: session))));
      await tester.pumpAndSettle();
      // Unit A first: its balance, due and payment — not unit B's.
      expect(find.text(ltr('A-12')), findsOneWidget);
      expect(find.textContaining('2,500'), findsWidgets);
      expect(find.text('Maintenance fee A'), findsOneWidget);
      expect(find.text('Garden fee B'), findsNothing);
      expect(find.textContaining('1,200'), findsOneWidget);
      expect(find.textContaining('999'), findsNothing);

      await tester.tap(find.byKey(const Key('unit-switcher')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(ltr('B-07')));
      await tester.pumpAndSettle();
      expect(find.text('Settled ✓'), findsOneWidget);
      expect(find.text('Garden fee B'), findsOneWidget);
      expect(find.text('Maintenance fee A'), findsNothing);
      expect(find.textContaining('999'), findsOneWidget);
    });

    testWidgets('no unit switcher for a single unit', (tester) async {
      _tall(tester);
      final repo = _Repo(units: const [_unitA]);
      final session = AppSession(user: _user('owner'), isPortalMember: true);
      await tester.pumpWidget(_app(repo, Scaffold(body: ResidentHomeScreen(session: session))));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('unit-switcher')), findsNothing);
    });

    testWidgets('unit details show business facts and never internal ids',
        (tester) async {
      _tall(tester);
      final repo = _Repo(
        units: const [_unitA],
        dues: [_due('A-12', 'Maintenance fee A', 2500, '2000-01-10')],
      );
      await tester.pumpWidget(_app(repo, const UnitDetailScreen(unit: _unitA)));
      await tester.pumpAndSettle();
      expect(find.text('Owner'), findsOneWidget);
      expect(find.text('Open dues'), findsOneWidget);
      expect(find.text('Of which overdue'), findsOneWidget);
      expect(find.textContaining('No lease'), findsOneWidget);
      expect(find.textContaining('uA'), findsNothing);
    });
  });

  group('maintenance', () {
    testWidgets('an owner creates a request for an owned unit with a file',
        (tester) async {
      _tall(tester);
      final repo = _Repo(units: const [_unitA]);
      await tester.pumpWidget(_app(
        repo,
        const NewMaintenanceRequestScreen(),
        extra: [
          attachmentPickerProvider.overrideWithValue(() async => [
                PickedFile('leak.jpg', 'image/jpeg', Uint8List(2048)),
              ]),
        ],
      ));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Kitchen tap leaks');
      await tester.tap(find.byKey(const Key('add-attachments')));
      await tester.pumpAndSettle();
      expect(find.text('leak.jpg'), findsOneWidget);
      await tester.tap(find.text('Submit request'));
      await tester.pumpAndSettle();
      expect(repo.created, hasLength(1));
      expect(repo.created.single['unitId'], 'uA');
      expect(repo.created.single['description'], 'Kitchen tap leaks');
      expect(repo.uploads, ['req-new:leak.jpg']);
      // Lands on the request, where the timeline lives.
      expect(find.textContaining('MR-1'), findsWidgets);
    });

    testWidgets('oversized files are rejected before submit', (tester) async {
      _tall(tester);
      final repo = _Repo(units: const [_unitA]);
      await tester.pumpWidget(_app(
        repo,
        const NewMaintenanceRequestScreen(),
        extra: [
          attachmentPickerProvider.overrideWithValue(() async => [
                PickedFile('huge.pdf', 'application/pdf',
                    Uint8List(maxAttachmentBytes + 1)),
              ]),
        ],
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('add-attachments')));
      await tester.pumpAndSettle();
      expect(find.text('huge.pdf'), findsNothing);
      expect(find.textContaining('10 MB'), findsWidgets);
    });

    testWidgets('a user without an owned unit has nothing to file against',
        (tester) async {
      _tall(tester);
      final repo = _Repo(authorized: const []);
      await tester.pumpWidget(_app(repo, const NewMaintenanceRequestScreen()));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Anything');
      await tester.tap(find.text('Submit request'));
      await tester.pumpAndSettle();
      expect(repo.created, isEmpty);
    });
  });

  group('visitors', () {
    testWidgets('an invitation shows the save-now warning and keeps the '
        'secret only in the secure store', (tester) async {
      _tall(tester);
      final repo = _Repo(units: const [_unitA]);
      final store = _MemStore();
      await tester.pumpWidget(_app(repo, const NewVisitorScreen(), passes: store));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'Mohamed Guest');
      await tester.tap(find.text('Create pass'));
      await tester.pumpAndSettle();
      expect(repo.invitations.single['unitId'], 'uA');
      expect(repo.invitations.single['guest'], 'Mohamed Guest');
      expect(find.textContaining('Save'), findsWidgets);
      expect(find.textContaining('cannot be retrieved later'), findsWidgets);
      // The raw secret is never rendered as text.
      expect(find.textContaining('AQP1.inv-1.secret'), findsNothing);
    });

    test('passes are kept per user in secure storage and expire', () async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({
        'saved_visitor_passes': jsonEncode([
          {
            'id': 'legacy',
            'guestName': 'Old',
            'validUntil': '2999-01-01T00:00:00Z',
            'payload': 'AQP1.legacy.secret',
            'unitCode': 'A-12',
          },
        ]),
      });
      final store = SecureVisitorPassStore(
        const FlutterSecureStorage(),
        () => DateTime(2026, 6, 15),
      );
      // The plaintext legacy copy is moved to secure storage and removed.
      expect((await store.read('alice')).map((p) => p.id), ['legacy']);
      expect((await SharedPreferences.getInstance()).getString('saved_visitor_passes'), isNull);

      await store.save(
        'alice',
        const SavedPass(
            id: 'new',
            guestName: 'G',
            validUntil: '2999-01-01T00:00:00Z',
            payload: 'AQP1.new.secret',
            unitCode: 'A-12'),
      );
      await store.save(
        'alice',
        const SavedPass(
            id: 'expired',
            guestName: 'E',
            validUntil: '2020-01-01T00:00:00Z',
            payload: 'AQP1.expired.secret',
            unitCode: 'A-12'),
      );
      expect((await store.read('alice')).map((p) => p.id), ['new', 'legacy']);
      // Another account on the same device sees none of them.
      expect(await store.read('bob'), isEmpty);
      expect(await store.read(''), isEmpty);
    });
  });

  group('notifications and support', () {
    testWidgets('notifications load on open and reload on refresh',
        (tester) async {
      _tall(tester);
      var loads = 0;
      final repo = _CountingNotifications(() => loads++);
      await tester.pumpWidget(_app(repo, const NotificationsScreen()));
      await tester.pumpAndSettle();
      expect(loads, 1);
      unawaited(tester
          .state<RefreshIndicatorState>(find.byType(RefreshIndicator))
          .show());
      await tester.pumpAndSettle();
      expect(loads, 2);
      expect(find.text('Heads up'), findsOneWidget);
    });

    testWidgets('an empty inbox can still be pulled to refresh',
        (tester) async {
      _tall(tester);
      await tester.pumpWidget(_app(_Repo(), const NotificationsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Nothing new'), findsOneWidget);
      expect(find.byType(RefreshIndicator), findsOneWidget);
    });

    testWidgets('short lists accept a pull on every platform', (tester) async {
      late BuildContext ctx;
      await tester.pumpWidget(MaterialApp(
        home: Builder(builder: (c) {
          ctx = c;
          return const SizedBox();
        }),
      ));
      expect(
        const AqarScrollBehavior().getScrollPhysics(ctx),
        isA<AlwaysScrollableScrollPhysics>(),
      );
    });

    testWidgets('support opens the published support address',
        (tester) async {
      _tall(tester);
      final opened = <Uri?>[];
      final session = AppSession(user: _user('owner'), isPortalMember: true);
      await tester.pumpWidget(_app(
        _Repo(units: const [_unitA]),
        Scaffold(body: MoreHubScreen(session: session)),
        extra: [
          externalOpenerProvider.overrideWithValue((uri) async {
            opened.add(uri);
            return true;
          }),
        ],
      ));
      await tester.pump();
      await tester.tap(find.text('Support'));
      await tester.pump();
      expect(opened.single.toString(), 'mailto:support@aqarbooks.com');
    });

    testWidgets('documents are shown as unavailable, never as a dead link',
        (tester) async {
      _tall(tester);
      final session = AppSession(user: _user('owner'), isPortalMember: true);
      await tester.pumpWidget(_app(
        _Repo(units: const [_unitA]),
        Scaffold(body: MoreHubScreen(session: session)),
      ));
      await tester.pump();
      await tester.tap(find.text('Documents — not available yet'));
      await tester.pump();
      expect(find.textContaining('not available in the app yet'), findsOneWidget);
    });
  });
}

class _CountingNotifications extends _Repo {
  _CountingNotifications(this.onLoad) : super(units: const [_unitA]);
  final void Function() onLoad;
  @override
  Future<List<NotificationItem>> notifications() async {
    onLoad();
    return const [
      NotificationItem(
        id: 'n1',
        titleAr: 'تنبيه',
        titleEn: 'Heads up',
        bodyAr: '',
        bodyEn: 'Body',
        priority: 'NORMAL',
        createdAt: '2026-06-15T10:00:00Z',
        isRead: false,
      ),
    ];
  }
}
