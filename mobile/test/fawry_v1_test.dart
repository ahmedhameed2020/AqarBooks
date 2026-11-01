import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/collector_screens.dart';
import 'package:aqarbooks_mobile/screens/resident_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const _due = DueItem(
  id: 'due-demo',
  description: 'Administrative dues',
  amount: 2500,
  paid: 0,
  outstanding: 2500,
  dueDate: '2026-01-01',
);
const _payment = PaymentItem(
  id: 'payment-demo',
  amount: 1500,
  date: '2026-01-02',
  method: 'CASH',
  receipt: 'QA-0001',
  unitId: 'unit-demo',
  unitCode: 'A-12',
);

class _ConfiguredRepo extends AqarRepository {
  _ConfiguredRepo() : super(null);
  int checkoutCalls = 0;
  @override
  Future<Map<String, dynamic>?> fawrySettings() async => {
    'id': 'enabled-setting',
    'enabled': true,
    'environment': 'PRODUCTION',
  };
  @override
  Future<FawryCheckout> createFawryCheckout({
    required List<String> dueIds,
    required Map<String, dynamic> settings,
    required String clientRequestId,
  }) async {
    checkoutCalls++;
    return const FawryCheckout(
      transactionId: 'old',
      amount: 2500,
      reference: 'old-reference',
    );
  }
}

Widget _app(Widget child, _ConfiguredRepo repo) => ProviderScope(
  overrides: [
    repositoryProvider.overrideWithValue(repo),
    duesProvider.overrideWith((ref) async => [_due]),
    paymentsProvider.overrideWith((ref) async => [_payment]),
  ],
  child: MaterialApp(home: child),
);

void main() {
  test(
    'V1 refuses configured checkout and replay before any network request',
    () async {
      final calls = <http.Request>[];
      final client = SupabaseClient(
        'https://fake.invalid',
        'fake-key',
        httpClient: MockClient((request) async {
          calls.add(request);
          throw StateError('V1 must not contact the backend for Fawry');
        }),
      );
      addTearDown(client.dispose);
      final repo = AqarRepository(client);
      expect(await repo.fawrySettings(), isNull);
      for (final environment in ['PRODUCTION', 'SANDBOX']) {
        await expectLater(
          repo.createFawryCheckout(
            dueIds: ['due-demo'],
            settings: {'id': 'enabled', 'environment': environment},
            clientRequestId: 'existing-request',
          ),
          throwsA(
            isA<AppRepositoryException>().having(
              (e) => e.message,
              'reason',
              'online_payments_unavailable',
            ),
          ),
        );
      }
      expect(calls, isEmpty);
    },
  );

  testWidgets(
    'dues and history remain while configured Fawry cannot render a CTA',
    (tester) async {
      final repo = _ConfiguredRepo();
      await tester.pumpWidget(
        _app(const Scaffold(body: PaymentsTabScreen()), repo),
      );
      await tester.pumpAndSettle();
      expect(find.text('Administrative dues'), findsOneWidget);
      expect(
        find.text('Pay with the collector or at the office'),
        findsOneWidget,
      );
      expect(find.text('Pay with Fawry'), findsNothing);
      await tester.tap(find.text('Paid'));
      await tester.pumpAndSettle();
      expect(find.textContaining('QA-0001'), findsOneWidget);
      expect(repo.checkoutCalls, 0);
    },
  );

  testWidgets(
    'direct legacy Fawry route never initiates checkout or displays a reference',
    (tester) async {
      final repo = _ConfiguredRepo();
      await tester.pumpWidget(
        _app(
          const FawryCodeScreen(due: _due, settings: {'id': 'enabled'}),
          repo,
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Pay with the collector or at the office'),
        findsOneWidget,
      );
      expect(find.text('old-reference'), findsNothing);
      expect(repo.checkoutCalls, 0);
    },
  );

  testWidgets('existing administrative receipt stays readable', (tester) async {
    final repo = _ConfiguredRepo();
    await tester.pumpWidget(
      _app(const ReceiptDetailScreen(payment: _payment), repo),
    );
    await tester.pumpAndSettle();
    expect(find.text('Receipt details'), findsOneWidget);
    expect(find.text('QA-0001'), findsOneWidget);
    expect(find.text('A-12'), findsOneWidget);
    expect(find.text('Share receipt again'), findsOneWidget);
    expect(repo.checkoutCalls, 0);
  });
}
