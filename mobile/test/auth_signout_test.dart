import 'dart:async';

import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show AuthChangeEvent, AuthState, Session, User;

User _user(String id) => User.fromJson({
      'id': id,
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': '$id@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

Session _sessionFor(User user) =>
    Session(accessToken: 'token', tokenType: 'bearer', user: user);

class _FakeRepo extends AqarRepository {
  _FakeRepo({this.onLoad, this.failSignOut = false}) : super(null);
  final AppSession? Function()? onLoad;
  final bool failSignOut;
  int signOutCalls = 0;

  @override
  Future<AppSession?> loadSession() async => onLoad?.call();

  @override
  Future<void> signOut() async {
    signOutCalls++;
    if (failSignOut) {
      // What the SDK throws after it has already dropped the local session
      // when the /logout call cannot reach the server.
      throw Exception('ClientException: Failed host lookup');
    }
  }
}

Future<void> _settle() async {
  for (var i = 0; i < 4; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  group('sessionProvider follows the signed-in user', () {
    test('reloads on sign-in/sign-out, ignores token refreshes', () async {
      final controller = StreamController<AuthState>();
      addTearDown(controller.close);
      final alice = _user('alice');
      AppSession? current;
      var loads = 0;
      final repo = _FakeRepo(onLoad: () {
        loads++;
        return current;
      });
      final container = ProviderContainer(overrides: [
        authStateProvider.overrideWith((ref) => controller.stream),
        repositoryProvider.overrideWithValue(repo),
      ]);
      addTearDown(container.dispose);
      container.listen(sessionProvider, (_, __) {});
      await _settle();
      final initialLoads = loads;
      expect(await container.read(sessionProvider.future), isNull);

      current = AppSession(user: alice, organizationName: 'MA');
      controller.add(AuthState(AuthChangeEvent.signedIn, _sessionFor(alice)));
      await _settle();
      expect((await container.read(sessionProvider.future))?.user.id, 'alice');
      expect(loads, initialLoads + 1);

      // Hourly token refresh: same user, must not reload (it would flash the
      // loading screen and reset navigation).
      controller.add(
        AuthState(AuthChangeEvent.tokenRefreshed, _sessionFor(alice)),
      );
      await _settle();
      expect(loads, initialLoads + 1);

      // Sign-out with NO manual invalidate: the UI must still leave the app.
      current = null;
      controller.add(AuthState(AuthChangeEvent.signedOut, null));
      await _settle();
      expect(await container.read(sessionProvider.future), isNull);
      expect(loads, initialLoads + 2);
    });

    test('switching users reloads the session for the new user', () async {
      final controller = StreamController<AuthState>();
      addTearDown(controller.close);
      final alice = _user('alice'), bob = _user('bob');
      late AppSession current;
      final container = ProviderContainer(overrides: [
        authStateProvider.overrideWith((ref) => controller.stream),
        repositoryProvider
            .overrideWithValue(_FakeRepo(onLoad: () => current)),
      ]);
      addTearDown(container.dispose);
      container.listen(sessionProvider, (_, __) {});
      current = AppSession(user: alice);
      controller.add(AuthState(AuthChangeEvent.signedIn, _sessionFor(alice)));
      await _settle();
      expect((await container.read(sessionProvider.future))?.user.id, 'alice');
      current = AppSession(user: bob);
      controller.add(AuthState(AuthChangeEvent.signedIn, _sessionFor(bob)));
      await _settle();
      expect((await container.read(sessionProvider.future))?.user.id, 'bob');
    });
  });

  group('AuthRouteGuard', () {
    Future<StreamController<AuthState>> pumpWithPushedPage(
      WidgetTester tester,
    ) async {
      final controller = StreamController<AuthState>.broadcast();
      addTearDown(controller.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith((ref) => controller.stream),
          ],
          child: MaterialApp(
            home: AuthRouteGuard(
              child: Builder(
                builder: (context) => Scaffold(
                  body: TextButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const Scaffold(
                          body: Text('PROFILE PAGE'),
                        ),
                      ),
                    ),
                    child: const Text('open'),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      expect(find.text('PROFILE PAGE'), findsOneWidget);
      return controller;
    }

    testWidgets('a sign-out closes pushed pages instead of leaving them up',
        (tester) async {
      final controller = await pumpWithPushedPage(tester);
      controller.add(AuthState(AuthChangeEvent.signedOut, null));
      await tester.pumpAndSettle();
      expect(find.text('PROFILE PAGE'), findsNothing);
      expect(find.text('open'), findsOneWidget);
    });

    testWidgets('other auth events leave the open page alone', (tester) async {
      final controller = await pumpWithPushedPage(tester);
      controller.add(
        AuthState(AuthChangeEvent.tokenRefreshed, _sessionFor(_user('a'))),
      );
      await tester.pumpAndSettle();
      expect(find.text('PROFILE PAGE'), findsOneWidget);
    });
  });

  group('Profile sign-out', () {
    Future<_FakeRepo> pumpProfile(
      WidgetTester tester, {
      required bool failSignOut,
      required void Function() onSessionBuild,
    }) async {
      final repo = _FakeRepo(failSignOut: failSignOut);
      final session = AppSession(user: _user('hassam'), organizationName: 'MA');
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            repositoryProvider.overrideWithValue(repo),
            sessionProvider.overrideWith((ref) async {
              onSessionBuild();
              return session;
            }),
          ],
          child: MaterialApp(
            locale: const Locale('en'),
            home: Scaffold(
              body: Consumer(
                builder: (context, ref, _) {
                  ref.watch(sessionProvider); // keeps the provider alive
                  return ProfileScreen(session: session);
                },
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      return repo;
    }

    testWidgets('signs out and refreshes the session', (tester) async {
      var builds = 0;
      final repo = await pumpProfile(
        tester,
        failSignOut: false,
        onSessionBuild: () => builds++,
      );
      expect(builds, 1);
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out').last); // dialog confirm
      await tester.pumpAndSettle();
      expect(repo.signOutCalls, 1);
      expect(builds, 2);
    });

    testWidgets('a failing logout request still refreshes the session',
        (tester) async {
      var builds = 0;
      final repo = await pumpProfile(
        tester,
        failSignOut: true,
        onSessionBuild: () => builds++,
      );
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out').last);
      await tester.pumpAndSettle();
      expect(repo.signOutCalls, 1);
      expect(builds, 2,
          reason: 'the UI must not stay signed in when the server call fails');
      expect(tester.takeException(), isNull);
    });
  });
}
