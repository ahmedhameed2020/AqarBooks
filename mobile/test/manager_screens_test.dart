import 'package:aqarbooks_mobile/core/contact.dart';
import 'package:aqarbooks_mobile/core/shell_nav.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:aqarbooks_mobile/screens/feature_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

String _ago(int days) => DateTime.now()
    .subtract(Duration(days: days))
    .toIso8601String()
    .substring(0, 10);

OverdueItem _due(
  String id,
  String unit,
  double amount,
  int daysAgo, {
  String? owner,
  String? phone,
  String description = 'Maintenance',
}) =>
    OverdueItem(
      dueId: id,
      unitId: 'u-$unit',
      unitCode: unit,
      description: description,
      dueDate: _ago(daysAgo),
      outstanding: amount,
      ownerId: owner == null ? null : 'm-$unit',
      ownerName: owner,
      ownerPhone: phone,
    );

final _sample = [
  _due('1', 'B-07', 24000, 75,
      owner: 'Mohamed Abdelrahman', phone: '010 0123 4567', description: 'July dues'),
  _due('2', 'B-07', 24000, 45,
      owner: 'Mohamed Abdelrahman', phone: '010 0123 4567', description: 'August dues'),
  _due('3', 'A-03', 3250, 18, owner: 'Hala Mostafa', phone: '+20 111 222 3344'),
  _due('4', 'C-11', 61250, 120, owner: 'Sherif Hassan'),
  _due('5', 'D-02', 8000, 12, owner: 'Yasmin Kamal', phone: '01551234567'),
];

User _user() => User.fromJson({
      'id': 'manager',
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': 'karim@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Widget _app(ProviderContainer container, Widget home) =>
    UncontrolledProviderScope(
      container: container,
      child: MaterialApp(locale: const Locale('en'), home: Scaffold(body: home)),
    );

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('Collections tab', () {
    ProviderContainer containerFor(Future<List<OverdueItem>> Function() load) =>
        ProviderContainer(overrides: [
          overdueProvider.overrideWith((ref) => load()),
        ]);

    testWidgets('shows the true total, units and aging buckets', (tester) async {
      _tall(tester);
      final container = containerFor(() async => _sample);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Total overdue'), findsOneWidget);
      expect(find.text('120,500 EGP'), findsWidgets);
      expect(find.text('4 units'), findsOneWidget);
      for (final chip in ['All', '1–30 days', '31–60 days', '61–90 days', '90+ days']) {
        expect(find.text(chip), findsOneWidget, reason: chip);
      }
    });

    testWidgets('owners are grouped and ordered by what they owe',
        (tester) async {
      _tall(tester);
      final container = containerFor(() async => _sample);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      double top(String name) => tester.getTopLeft(find.text(name)).dy;
      expect(top('Sherif Hassan'), lessThan(top('Mohamed Abdelrahman')));
      expect(top('Mohamed Abdelrahman'), lessThan(top('Yasmin Kamal')));
      expect(top('Yasmin Kamal'), lessThan(top('Hala Mostafa')));
      // B-07 has two dues but appears once, summed.
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
      expect(find.text('48,000 EGP'), findsOneWidget);
    });

    testWidgets('tapping a bucket filters the list to that age range',
        (tester) async {
      _tall(tester);
      final container = containerFor(() async => _sample);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('31–60 days'));
      await tester.pumpAndSettle();
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
      expect(find.text('24,000 EGP'), findsWidgets);
      expect(find.text('Sherif Hassan'), findsNothing);
      expect(find.text('Hala Mostafa'), findsNothing);
    });

    testWidgets('a card expands to the dues behind the balance',
        (tester) async {
      _tall(tester);
      final container = containerFor(() async => _sample);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('July dues'), findsNothing);
      await tester.tap(find.text('Mohamed Abdelrahman'));
      await tester.pumpAndSettle();
      expect(find.text('July dues'), findsOneWidget);
      expect(find.text('August dues'), findsOneWidget);
    });

    testWidgets('owners with a phone can be called; without one it says so',
        (tester) async {
      _tall(tester);
      final container = containerFor(() async => _sample);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('Call'), findsNWidgets(3));
      expect(find.text('WhatsApp'), findsNWidgets(3));
      expect(find.text('No phone number on file for the owner'), findsOneWidget);
    });

    ProviderContainer openerContainer(
      List<Uri?> opened, {
      bool succeeds = true,
    }) =>
        ProviderContainer(overrides: [
          overdueProvider.overrideWith((ref) async => _sample),
          externalOpenerProvider.overrideWithValue((uri) async {
            opened.add(uri);
            return succeeds;
          }),
        ]);

    testWidgets('Call dials the owner and WhatsApp carries a reminder',
        (tester) async {
      _tall(tester);
      final opened = <Uri?>[];
      final container = openerContainer(opened);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      // Sherif has no phone, so the first Call button belongs to Mohamed.
      await tester.tap(find.text('Call').first);
      await tester.pump();
      expect(opened.single.toString(), 'tel:+201001234567');
      await tester.tap(find.text('WhatsApp').first);
      await tester.pump();
      final wa = opened.last!;
      expect(wa.host, 'wa.me');
      expect(wa.path, '/201001234567');
      final text = wa.queryParameters['text']!;
      expect(text, contains('B-07'));
      expect(text, contains('48,000 EGP'));
      expect(text, contains('Mohamed Abdelrahman'));
    });

    testWidgets('a call that cannot be placed fails politely', (tester) async {
      _tall(tester);
      final opened = <Uri?>[];
      final container = openerContainer(opened, succeeds: false);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Call').first);
      await tester.pumpAndSettle();
      expect(find.text('Could not open the app on this device'), findsOneWidget);
    });

    testWidgets('nothing overdue is a clear all-clear', (tester) async {
      _tall(tester);
      final container = containerFor(() async => const []);
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('No overdue balances ✓'), findsOneWidget);
    });

    testWidgets('a failed load is an error with retry, never an all-clear',
        (tester) async {
      _tall(tester);
      var attempts = 0;
      final container = containerFor(() async {
        attempts++;
        if (attempts == 1) throw Exception('boom');
        return _sample;
      });
      addTearDown(container.dispose);
      await tester.pumpWidget(_app(container, const ManagerCollectionsScreen()));
      await tester.pumpAndSettle();
      expect(find.text('No overdue balances ✓'), findsNothing);
      expect(find.text('Could not load — try again'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Sherif Hassan'), findsOneWidget);
    });
  });

  group('Manager home', () {
    final session = AppSession(user: _user(), organizationName: 'MA');

    ProviderContainer containerFor(ManagerAttention attention,
            {List<NotificationItem> notifications = const []}) =>
        ProviderContainer(overrides: [
          managerAttentionProvider.overrideWith((ref) async => attention),
          notificationsProvider.overrideWith((ref) async => notifications),
        ]);

    final loaded = ManagerAttention(
      todayCollections: 45200,
      totalOverdue: 120500,
      overdueUnitCount: 4,
      openMaintenance: 14,
      visitorsInside: 6,
      items: [
        AttentionItem(
          kind: AttentionKind.overdue,
          title: 'C-11',
          amount: 61250,
          date: _ago(120),
        ),
        AttentionItem(
          kind: AttentionKind.cheque,
          title: 'DEPOSITED',
          amount: 25000,
          date: _ago(5),
        ),
      ],
    );

    testWidgets('overdue is the headline number and opens Collections',
        (tester) async {
      _tall(tester);
      final container = containerFor(loaded);
      addTearDown(container.dispose);
      container.listen(shellTabProvider, (_, __) {});
      await tester.pumpWidget(_app(container, ManagerHomeScreen(session: session)));
      await tester.pumpAndSettle();
      expect(find.text('Total overdue'), findsOneWidget);
      expect(find.text('120,500 EGP'), findsOneWidget);
      expect(find.text('Across 4 units — tap for details'), findsOneWidget);
      await tester.tap(find.text('Total overdue'));
      await tester.pump();
      expect(container.read(shellTabProvider), managerTabCollections);
    });

    testWidgets('maintenance and visitor tiles open their tabs; cash does not',
        (tester) async {
      _tall(tester);
      final container = containerFor(loaded);
      addTearDown(container.dispose);
      container.listen(shellTabProvider, (_, __) {});
      await tester.pumpWidget(_app(container, ManagerHomeScreen(session: session)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open maintenance'));
      await tester.pump();
      expect(container.read(shellTabProvider), managerTabMaintenance);
      await tester.tap(find.text('Visitors inside'));
      await tester.pump();
      expect(container.read(shellTabProvider), managerTabOperations);
      container.read(shellTabProvider.notifier).state = 0;
      await tester.tap(find.text("Today's collections"));
      await tester.pump();
      expect(container.read(shellTabProvider), 0,
          reason: 'there is no destination for it, so it must not navigate');
    });

    testWidgets('an overdue attention row jumps to Collections', (tester) async {
      _tall(tester);
      final container = containerFor(loaded);
      addTearDown(container.dispose);
      container.listen(shellTabProvider, (_, __) {});
      await tester.pumpWidget(_app(container, ManagerHomeScreen(session: session)));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Large overdue'));
      await tester.pump();
      expect(container.read(shellTabProvider), managerTabCollections);
    });

    testWidgets('an unknown overdue total is never shown as zero',
        (tester) async {
      _tall(tester);
      final container = containerFor(
          const ManagerAttention(overdueFailed: true, todayCollections: 1234));
      addTearDown(container.dispose);
      container.listen(shellTabProvider, (_, __) {});
      await tester.pumpWidget(_app(container, ManagerHomeScreen(session: session)));
      await tester.pumpAndSettle();
      expect(find.text('—'), findsOneWidget);
      expect(find.textContaining('Could not load overdue balances'), findsOneWidget);
      expect(find.text('0 EGP'), findsNothing);
      await tester.tap(find.text('Total overdue'));
      await tester.pump();
      expect(container.read(shellTabProvider), 0);
    });

    testWidgets('a clean ledger says so and is not tappable', (tester) async {
      _tall(tester);
      final container = containerFor(const ManagerAttention());
      addTearDown(container.dispose);
      container.listen(shellTabProvider, (_, __) {});
      await tester.pumpWidget(_app(container, ManagerHomeScreen(session: session)));
      await tester.pumpAndSettle();
      expect(find.text('No overdue balances ✓'), findsOneWidget);
      await tester.tap(find.text('Total overdue'));
      await tester.pump();
      expect(container.read(shellTabProvider), 0);
    });

    NotificationItem note(bool read) => NotificationItem(
          id: '$read',
          titleAr: 'عنوان',
          titleEn: 'Title',
          bodyAr: '',
          bodyEn: '',
          priority: 'HIGH',
          createdAt: DateTime.now().toIso8601String(),
          isRead: read,
        );

    for (final entry in <(String, List<bool>, bool)>[
      ('no notifications', const [], false),
      ('everything read', const [true], false),
      ('something unread', const [true, false], true),
    ]) {
      testWidgets('bell dot: ${entry.$1}', (tester) async {
        _tall(tester);
        final container = containerFor(
          loaded,
          notifications: [for (final read in entry.$2) note(read)],
        );
        addTearDown(container.dispose);
        await tester.pumpWidget(
            _app(container, ManagerHomeScreen(session: session)));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('bell-unread-dot')),
            entry.$3 ? findsOneWidget : findsNothing);
      });
    }
  });

  group('Shell', () {
    testWidgets('tabs are built lazily, on first visit', (tester) async {
      _tall(tester);
      var queueLoads = 0;
      final container = ProviderContainer(overrides: [
        managerAttentionProvider
            .overrideWith((ref) async => const ManagerAttention()),
        notificationsProvider.overrideWith((ref) async => const []),
        overdueProvider.overrideWith((ref) async => const []),
        assignQueueProvider.overrideWith((ref) async {
          queueLoads++;
          return const <MaintenanceItem>[];
        }),
      ]);
      addTearDown(container.dispose);
      final session = AppSession(
        user: _user(),
        capabilities: const {'operations.work_orders.assign'},
      );
      await tester.pumpWidget(UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          locale: const Locale('en'),
          home: AppShell(session: session),
        ),
      ));
      await tester.pumpAndSettle();
      expect(queueLoads, 0, reason: 'Maintenance has not been opened yet');
      await tester.tap(find.text('Maintenance').last);
      await tester.pumpAndSettle();
      expect(queueLoads, 1);
    });
  });
}
