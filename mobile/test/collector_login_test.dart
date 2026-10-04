import 'dart:async';

import 'package:aqarbooks_mobile/core/plural.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:aqarbooks_mobile/widgets/aqar_icons.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

User _user() => User.fromJson({
      'id': 'collector',
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': 'samy@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

String _in(int days) => DateTime.now()
    .add(Duration(days: days))
    .toIso8601String()
    .substring(0, 10);

class _Repo extends AqarRepository {
  _Repo() : super(null);

  // --- search -----------------------------------------------------------------
  final searches = <String>[];
  Future<List<CollectTarget>> Function(String)? onSearch;
  @override
  Future<List<CollectTarget>> searchCollectTargets(String query) {
    searches.add(query);
    return onSearch?.call(query) ?? Future.value(const []);
  }

  // --- dues & collection ------------------------------------------------------
  int dueLoads = 0;
  bool failFirstDueLoad = false;
  @override
  Future<List<DueItem>> unitOpenDues(String unitId) async {
    dueLoads++;
    if (failFirstDueLoad && dueLoads == 1) throw Exception('network down');
    return [
      DueItem(
        id: 'd1',
        description: 'September dues',
        amount: 4500,
        paid: 0,
        outstanding: 4500,
        dueDate: _in(-20),
      ),
      DueItem(
        id: 'd2',
        description: 'October dues',
        amount: 5000,
        paid: 0,
        outstanding: 5000,
        dueDate: _in(10),
      ),
      DueItem(
        id: 'd3',
        description: 'Deposit',
        amount: 2000,
        paid: 0,
        outstanding: 2000,
        dueDate: _in(45),
      ),
    ];
  }

  final recorded = <Map<String, dynamic>>[];
  @override
  Future<void> recordCollection({
    required String unitId,
    required String memberId,
    required double amount,
    required String method,
    required Map<String, double> allocations,
    required String idempotencyKey,
    CashierSessionInfo? session,
  }) async {
    recorded.add({
      'unitId': unitId,
      'memberId': memberId,
      'amount': amount,
      'method': method,
      'allocations': allocations,
    });
  }

  // --- login --------------------------------------------------------------------
  final signIns = <(String, String)>[];
  @override
  Future<void> signIn(String email, String password) async =>
      signIns.add((email, password));
}

Widget _app(_Repo repo, Widget home, {List<Override> extra = const []}) =>
    ProviderScope(
      overrides: [
        repositoryProvider.overrideWithValue(repo),
        sessionProvider.overrideWith(
          (ref) async => AppSession(
            user: _user(),
            capabilities: const {'receivables.payments.create'},
          ),
        ),
        cashierSessionProvider.overrideWith((ref) async => null),
        myCollectionsTodayProvider.overrideWith((ref) async => const []),
        ...extra,
      ],
      child: MaterialApp(locale: const Locale('en'), home: home),
    );

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('collection step', () {
    testWidgets('records a collection against the owner with the right dues',
        (tester) async {
      _tall(tester);
      final repo = _Repo();
      await tester.pumpWidget(_app(
        repo,
        const CollectStepScreen(
          unitId: 'u1',
          unitCode: 'B-07',
          balance: 11500,
          memberId: 'm1',
          ownerName: 'Mohamed Abdelrahman',
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
      expect(find.text('Unit B-07'), findsOneWidget);
      // Overdue and near-term dues are preselected, the far-future deposit is not.
      expect(find.text('9,500 EGP'), findsWidgets);
      await tester.tap(find.text('Continue to confirm'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(repo.recorded, hasLength(1));
      final call = repo.recorded.single;
      expect(call['memberId'], 'm1');
      expect(call['amount'], 9500);
      expect(call['method'], 'CASH');
      expect((call['allocations'] as Map).keys, unorderedEquals(['d1', 'd2']));
      expect(find.text('Collection recorded'), findsOneWidget);
    });

    testWidgets('a unit without an owner cannot be collected on',
        (tester) async {
      _tall(tester);
      final repo = _Repo();
      await tester.pumpWidget(_app(
        repo,
        const CollectStepScreen(unitId: 'u1', unitCode: 'B-07', balance: 100),
      ));
      await tester.pumpAndSettle();
      expect(find.textContaining('no registered owner'), findsOneWidget);
      final button = tester.widget<FilledButton>(find.ancestor(
        of: find.text('Continue to confirm'),
        matching: find.byType(FilledButton),
      ));
      expect(button.onPressed, isNull);
      expect(repo.recorded, isEmpty);
    });

    testWidgets('a failed load is an error with retry, not "no dues"',
        (tester) async {
      _tall(tester);
      final repo = _Repo()..failFirstDueLoad = true;
      await tester.pumpWidget(_app(
        repo,
        const CollectStepScreen(
          unitId: 'u1',
          unitCode: 'B-07',
          balance: 100,
          memberId: 'm1',
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text('No open dues on this unit ✓'), findsNothing);
      expect(find.text('Could not load — try again'), findsOneWidget);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('September dues'), findsOneWidget);
      expect(repo.dueLoads, 2);
    });
  });

  group('collector search', () {
    CollectTarget target(String unit, String owner) => CollectTarget(
          unitId: 'u-$unit',
          unitCode: unit,
          memberId: 'm-$unit',
          ownerName: owner,
          balance: 9500,
        );

    testWidgets('typing is debounced into one query', (tester) async {
      _tall(tester);
      final repo = _Repo()
        ..onSearch = (q) async => [target('B-07', 'Mohamed Abdelrahman')];
      await tester.pumpWidget(_app(repo, const CollectSearchScreen(push: true)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'B');
      await tester.pump(const Duration(milliseconds: 400));
      expect(repo.searches, isEmpty, reason: 'one character is too short');
      await tester.enterText(find.byType(TextField), 'B-0');
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(find.byType(TextField), 'B-07');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(repo.searches, ['B-07']);
      expect(find.text('B-07'), findsWidgets);
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
    });

    testWidgets('a slow earlier answer never overwrites the latest one',
        (tester) async {
      _tall(tester);
      final slow = Completer<List<CollectTarget>>();
      final repo = _Repo()
        ..onSearch = (q) => q == 'B-0'
            ? slow.future
            : Future.value([target('B-07', 'Mohamed Abdelrahman')]);
      await tester.pumpWidget(_app(repo, const CollectSearchScreen(push: true)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'B-0');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.enterText(find.byType(TextField), 'B-07');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump();
      slow.complete([target('B-01', 'Stale Result')]);
      await tester.pumpAndSettle();
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
      expect(find.text('Stale Result'), findsNothing);
    });

    testWidgets('a failed search says so and can be retried', (tester) async {
      _tall(tester);
      var calls = 0;
      final repo = _Repo()
        ..onSearch = (q) async {
          calls++;
          if (calls == 1) throw Exception('offline');
          return [target('B-07', 'Mohamed Abdelrahman')];
        };
      await tester.pumpWidget(_app(repo, const CollectSearchScreen(push: true)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'B-07');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      expect(find.text('Could not load — try again'), findsOneWidget);
      expect(find.textContaining('No results'), findsNothing);
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Mohamed Abdelrahman'), findsOneWidget);
    });

    testWidgets('choosing a result opens that unit with its owner',
        (tester) async {
      _tall(tester);
      final repo = _Repo()
        ..onSearch = (q) async => [target('B-07', 'Mohamed Abdelrahman')];
      await tester.pumpWidget(_app(repo, const CollectSearchScreen(push: true)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'B-07');
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mohamed Abdelrahman'));
      await tester.pumpAndSettle();
      expect(find.text('Collect — unit B-07'), findsOneWidget);
    });
  });

  group('login', () {
    testWidgets('the password is hidden until the eye is pressed',
        (tester) async {
      final handle = tester.ensureSemantics();
      final repo = _Repo();
      await tester.pumpWidget(_app(repo, const LoginScreen()));
      await tester.pumpAndSettle();
      TextField password() =>
          tester.widget<TextField>(find.byType(TextField).at(1));
      expect(password().obscureText, isTrue);
      await tester.tap(find.bySemanticsLabel('Show password'));
      await tester.pump();
      expect(password().obscureText, isFalse);
      expect(find.bySemanticsLabel('Hide password'), findsOneWidget);
      await tester.tap(find.bySemanticsLabel('Hide password'));
      await tester.pump();
      expect(password().obscureText, isTrue);
      handle.dispose();
    });

    testWidgets('password managers get the right hints', (tester) async {
      await tester.pumpWidget(_app(_Repo(), const LoginScreen()));
      await tester.pumpAndSettle();
      final email = tester.widget<TextField>(find.byType(TextField).first);
      final password = tester.widget<TextField>(find.byType(TextField).at(1));
      expect(email.autofillHints, contains(AutofillHints.username));
      expect(password.autofillHints, contains(AutofillHints.password));
      expect(email.textInputAction, TextInputAction.next);
      expect(password.textInputAction, TextInputAction.done);
    });

    testWidgets('empty credentials are refused before any request',
        (tester) async {
      final repo = _Repo();
      await tester.pumpWidget(_app(repo, const LoginScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign in'));
      await tester.pump();
      expect(find.text('Enter your email and password.'), findsOneWidget);
      expect(repo.signIns, isEmpty);
    });
  });

  group('Arabic and English counts', () {
    const ar = Locale('ar'), en = Locale('en');
    String units(int n, Locale l) => countText(n, l,
        ar: unitNoun, enOne: 'unit', enOther: 'units');

    test('Arabic uses the dual and the 3–10 plural, singular from 11', () {
      expect(units(1, ar), 'وحدة واحدة');
      expect(units(2, ar), 'وحدتان');
      expect(units(3, ar), '٣ وحدات');
      expect(units(10, ar), '١٠ وحدات');
      expect(units(11, ar), '١١ وحدة');
      expect(units(99, ar), '٩٩ وحدة');
      expect(units(103, ar), '١٠٣ وحدات');
      expect(units(111, ar), '١١١ وحدة');
      expect(
        countText(15, ar,
            ar: dayNoun, enOne: 'day', enOther: 'days'),
        '١٥ يومًا',
      );
    });

    test('English is singular only for exactly one', () {
      expect(units(1, en), '1 unit');
      expect(units(0, en), '0 units');
      expect(units(4, en), '4 units');
    });
  });

  group('direction-aware arrows', () {
    Widget host(TextDirection d, AqarIconType type) => Directionality(
          textDirection: d,
          child: AqarIcon(type),
        );
    Finder flipped() => find.descendant(
          of: find.byType(AqarIcon),
          matching: find.byType(Transform),
        );

    testWidgets('chevron and back mirror only under LTR', (tester) async {
      for (final type in [AqarIconType.chevron, AqarIconType.back]) {
        await tester.pumpWidget(host(TextDirection.rtl, type));
        expect(flipped(), findsNothing, reason: '$type in RTL');
        await tester.pumpWidget(host(TextDirection.ltr, type));
        expect(flipped(), findsOneWidget, reason: '$type in LTR');
      }
    });

    testWidgets('symmetric icons never mirror', (tester) async {
      await tester.pumpWidget(host(TextDirection.ltr, AqarIconType.wallet));
      expect(flipped(), findsNothing);
    });
  });
}
