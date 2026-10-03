import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:aqarbooks_mobile/core/app_core.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';

Widget _testApp(Widget child) => ProviderScope(child: MaterialApp(home: child));

void main() {
  test('capability routing does not rely on a role name', () {
    final session = AppSession(
      user: User.fromJson({
        'id': 'user-1',
        'aud': 'authenticated',
        'role': 'authenticated',
        'email': 'resident@example.com',
        'created_at': '2026-01-01T00:00:00Z',
      })!,
      capabilities: const {'operations.work_orders.view'},
    );
    expect(session.isStaff, isTrue);
    expect(session.isManager, isFalse);
    expect(session.can('operations.work_orders.complete'), isFalse);
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

  test('work-order actions only expose valid server transitions', () {
    expect(canTransitionWorkOrder('ASSIGNED', 'IN_PROGRESS'), isTrue);
    expect(canTransitionWorkOrder('COMPLETED', 'IN_PROGRESS'), isFalse);
    expect(canTransitionWorkOrder('WAITING', 'IN_PROGRESS'), isTrue);
  });

  test('manager capability is hidden without manager permissions', () {
    final resident = AppSession(
      user: User.fromJson({
        'id': 'u',
        'aud': 'authenticated',
        'role': 'authenticated',
        'created_at': '2026-01-01T00:00:00Z',
      })!,
      capabilities: const {'portal.maintenance.read'},
    );
    final manager = AppSession(
      user: resident.user,
      capabilities: const {'finance.reports.read'},
    );
    expect(resident.isManager, isFalse);
    expect(manager.isManager, isTrue);
  });

  test('work-order mutation controls stay hidden without capabilities', () {
    final session = AppSession(
      user: User.fromJson({
        'id': 'u',
        'aud': 'authenticated',
        'role': 'authenticated',
        'created_at': '2026-01-01T00:00:00Z',
      })!,
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

  testWidgets('resident shell exposes resident tabs and More routes', (
    tester,
  ) async {
    final session = AppSession(
      user: User.fromJson({
        'id': 'resident',
        'aud': 'authenticated',
        'role': 'authenticated',
        'created_at': '2026-01-01T00:00:00Z',
      })!,
      capabilities: const {'portal.maintenance.read'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: session)));
    expect(find.text('Units'), findsWidgets);
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('Maintenance'), findsOneWidget);
    expect(find.text('Request maintenance'), findsOneWidget);
    expect(find.text('Invite visitor'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    await tester.pumpWidget(_testApp(MoreHubScreen(session: session)));
    expect(find.text('Visitors'), findsOneWidget);
    expect(find.text('Vehicles'), findsOneWidget);
    expect(find.text('Documents'), findsOneWidget);
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.text('Profile'), findsOneWidget);
  });

  testWidgets('staff and manager shells hide resident-only routes', (
    tester,
  ) async {
    final user = User.fromJson({
      'id': 'operator',
      'aud': 'authenticated',
      'role': 'authenticated',
      'created_at': '2026-01-01T00:00:00Z',
    })!;
    final staff = AppSession(
      user: user,
      capabilities: const {'operations.work_orders.view'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: staff)));
    expect(find.text('History'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Units'), findsNothing);
    await tester.pumpWidget(_testApp(StaffHomeSummary(session: staff)));
    expect(find.text('Request maintenance'), findsNothing);
    expect(find.text('Open balance'), findsNothing);
    expect(find.text('Quick actions'), findsNothing);
    await tester.pumpWidget(_testApp(MoreHubScreen(session: staff)));
    expect(find.text('Visitors'), findsNothing);
    expect(find.text('Vehicles'), findsNothing);
    expect(find.text('Profile'), findsOneWidget);
    final manager = AppSession(
      user: user,
      capabilities: const {'finance.reports.read'},
    );
    await tester.pumpWidget(_testApp(AppShell(session: manager)));
    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('Operations'), findsOneWidget);
    expect(find.text('Maintenance'), findsOneWidget);
    expect(find.text('Alerts'), findsOneWidget);
    expect(find.text('More'), findsOneWidget);
    expect(find.text('Units'), findsNothing);
  });
}
