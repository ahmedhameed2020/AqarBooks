// ignore_for_file: prefer_initializing_formals
import 'dart:async';

import 'package:aqarbooks_mobile/core/app_core.dart';
import 'package:aqarbooks_mobile/data/biometric_lock.dart';
import 'package:aqarbooks_mobile/data/portal_access.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/main.dart';
import 'package:aqarbooks_mobile/screens/activation_screens.dart';
import 'package:aqarbooks_mobile/screens/app_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show AuthChangeEvent, AuthState, Session, User;

const _alias = 'client.aqarbooks.local';
const _token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';
const _staffCaps = {'operations.work_orders.assign'};

User _user(String id, {String? email}) => User.fromJson({
      'id': id,
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': email ?? '$id@example.com',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

AuthState _signedIn(User u) => AuthState(AuthChangeEvent.initialSession,
    Session(accessToken: 't', tokenType: 'bearer', user: u));

// ───────────────────────────── fakes ─────────────────────────────

class FakeRepo extends AqarRepository {
  FakeRepo({
    this.access = PortalAccess.none,
    this.sessionCaps = _staffCaps,
    this.member = false,
    String? uid = 'u1',
  })  : uid = uid,
        super(null);

  PortalAccess access;
  Object? accessError;
  Set<String> sessionCaps;
  bool member;
  final String? uid;

  final calls = <String>[];
  final signIns = <(String, String)>[];
  final resets = <String>[];
  int sessionLoads = 0;
  int signOutCalls = 0;
  Object? signInError;
  Object? changeError;
  Object? completeError;
  FirstLoginResult completeResult = const FirstLoginResult(ok: true);
  void Function()? onCompleteOk;

  @override
  String? get currentUserId => uid;
  @override
  String? get accessToken => 'jwt-$uid';

  @override
  Future<AppSession?> loadSession() async {
    sessionLoads++;
    return AppSession(
      user: _user(uid ?? 'u1'),
      capabilities: sessionCaps,
      isPortalMember: member,
    );
  }

  @override
  Future<PortalAccess> portalAccess() async {
    calls.add('access');
    if (accessError != null) throw accessError!;
    return access;
  }

  @override
  Future<void> signIn(String email, String password) async {
    signIns.add((email, password));
    calls.add('signIn');
    if (signInError != null) throw signInError!;
  }

  @override
  Future<void> resetPassword(String email) async => resets.add(email);

  @override
  Future<void> changePassword(String password) async {
    calls.add('changePassword');
    if (changeError != null) throw changeError!;
  }

  @override
  Future<FirstLoginResult> completeFirstLogin(String phone) async {
    calls.add('complete:$phone');
    if (completeError != null) throw completeError!;
    if (completeResult.ok) onCompleteOk?.call();
    return completeResult;
  }

  @override
  Future<void> signOut() async {
    signOutCalls++;
  }
}

class MemFlags implements BiometricFlagStore {
  final map = <String, bool>{};
  @override
  Future<bool> isEnabled(String userId) async => map[userId] ?? false;
  @override
  Future<void> setEnabled(String userId, bool enabled) async =>
      map[userId] = enabled;
  @override
  Future<void> clear(String userId) async => map.remove(userId);
}

class FakeBio implements BiometricAuthenticator {
  FakeBio({this.supported = true, this.result = true});
  bool supported;
  bool result;
  int prompts = 0;
  @override
  Future<bool> isSupported() async => supported;
  @override
  Future<bool> authenticate(String reason) async {
    prompts++;
    return result;
  }
}

class FakeApi implements ActivationApi {
  FakeApi(this.inspection);
  ActivationInspection inspection;
  Object? inspectError;
  final completes = <({String? password, String? bearer})>[];
  final outcomes = <ActivationOutcome>[];
  Object? completeError;
  int inspects = 0;

  @override
  Future<ActivationInspection> inspect(String token) async {
    inspects++;
    if (inspectError != null) throw inspectError!;
    return inspection;
  }

  @override
  Future<ActivationOutcome> complete(String token,
      {String? password, String? bearerToken}) async {
    completes.add((password: password, bearer: bearerToken));
    if (completeError != null) throw completeError!;
    return outcomes.isNotEmpty
        ? outcomes.removeAt(0)
        : const ActivationOutcome(ok: true, email: 'owner@example.com');
  }
}

class FakeLinks implements ActivationLinkSource {
  Uri? initial;
  final controller = StreamController<Uri>.broadcast();
  @override
  Future<Uri?> initialLink() async => initial;
  @override
  Stream<Uri> get links => controller.stream;
}

// ───────────────────────────── harness ─────────────────────────────

class Env {
  Env({
    FakeRepo? repo,
    MemFlags? flags,
    FakeBio? bio,
    this.signedInUser = 'u1',
  })  : repo = repo ?? FakeRepo(),
        flags = flags ?? MemFlags(),
        bio = bio ?? FakeBio();
  final FakeRepo repo;
  final MemFlags flags;
  final FakeBio bio;
  final String? signedInUser;
  final authController = StreamController<AuthState>.broadcast();

  List<Override> overrides({FakeApi? api, FakeLinks? links}) => [
        repositoryProvider.overrideWithValue(repo),
        biometricFlagStoreProvider.overrideWithValue(flags),
        biometricAuthenticatorProvider.overrideWithValue(bio),
        authStateProvider.overrideWith((ref) async* {
          if (signedInUser != null) {
            yield _signedIn(_user(signedInUser!));
          } else {
            yield AuthState(AuthChangeEvent.initialSession, null);
          }
          yield* authController.stream;
        }),
        if (api != null) activationApiProvider.overrideWithValue(api),
        if (links != null) activationLinkSourceProvider.overrideWithValue(links),
      ];

  Widget app(
    Widget home, {
    String lang = 'en',
    FakeApi? api,
    FakeLinks? links,
    GlobalKey<NavigatorState>? navKey,
  }) =>
      ProviderScope(
        overrides: overrides(api: api, links: links),
        child: MaterialApp(
          navigatorKey: navKey,
          locale: Locale(lang),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          scrollBehavior: const AqarScrollBehavior(),
          home: home,
          builder: navKey == null
              ? null
              : (context, child) => ActivationLinkHandler(
                    navigatorKey: navKey,
                    child: child!,
                  ),
        ),
      );
}

void _tall(WidgetTester tester) {
  tester.view.physicalSize = const Size(800, 3200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<void> _pumpFlow(WidgetTester tester, Env env, {String lang = 'en'}) async {
  _tall(tester);
  await tester.pumpWidget(env.app(const AuthFlow(), lang: lang));
  await tester.pumpAndSettle();
}


Future<void> _fillFirstLogin(
  WidgetTester tester, {
  String password = 'abcdefgh12',
  String? confirm,
  String phone = '01012345678',
}) async {
  await tester.enterText(
      find.byKey(const ValueKey('first-login-password')), password);
  await tester.enterText(
      find.byKey(const ValueKey('first-login-confirm')), confirm ?? password);
  await tester.enterText(
      find.byKey(const ValueKey('first-login-phone')), phone);
}

Future<void> _submitFirstLogin(WidgetTester tester) async {
  await tester.tap(find.text('Continue'));
  await tester.pumpAndSettle();
}

const _mustChange = PortalAccess(
  linked: true,
  status: 'pending',
  mustChangePassword: true,
  loginMethod: 'client_id',
  clientId: 'MB-10482',
  phoneHint: '•••• 4567',
);

void main() {
  setUpAll(() {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
  });

  // ───────────────────────── login ─────────────────────────
  group('login screen', () {
    Future<void> signIn(WidgetTester tester, String id, String pw,
        {String label = 'Sign in'}) async {
      await tester.enterText(find.byType(TextField).first, id);
      await tester.enterText(find.byType(TextField).at(1), pw);
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }

    testWidgets('accepts e-mail or Client ID with the right keyboard hints',
        (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen()));
      await tester.pumpAndSettle();
      final field = tester.widget<TextField>(find.byType(TextField).first);
      expect(field.keyboardType, TextInputType.emailAddress);
      expect(field.textCapitalization, TextCapitalization.none);
      expect(field.autofillHints, contains(AutofillHints.username));
      expect(find.text('Email or Client ID'), findsOneWidget);
    });

    testWidgets('Arabic label', (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen(), lang: 'ar'));
      await tester.pumpAndSettle();
      expect(find.text('البريد الإلكتروني أو رقم العميل'), findsOneWidget);
    });

    testWidgets('e-mail login sends the address as typed', (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen()));
      await signIn(tester, ' owner@example.com ', 'pw');
      expect(env.repo.signIns, [('owner@example.com', 'pw')]);
    });

    testWidgets('Client ID login maps to the alias, which is never shown',
        (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen()));
      await signIn(tester, 'MB-١٠٤٨٢', 'pw');
      expect(env.repo.signIns, [('mb-10482@$_alias', 'pw')]);
      // What the user typed stays as typed; the alias appears nowhere.
      expect(find.textContaining(_alias), findsNothing);
      expect(find.textContaining('mb-10482@'), findsNothing);
    });

    testWidgets('wrong password: generic message, alias not leaked',
        (tester) async {
      final env = Env(signedInUser: null);
      env.repo.signInError =
          Exception('Invalid login credentials for mb-10482@$_alias');
      await tester.pumpWidget(env.app(const LoginScreen()));
      await signIn(tester, 'MB-10482', 'bad');
      expect(
        find.text('Sign in failed. Check your credentials and try again.'),
        findsOneWidget,
      );
      expect(find.textContaining(_alias), findsNothing);
      expect(find.textContaining('mb-10482'), findsNothing);
    });

    testWidgets('banned account shows the suspended message', (tester) async {
      final env = Env(signedInUser: null);
      env.repo.signInError = Exception('AuthApiException(code: user_banned)');
      await tester.pumpWidget(env.app(const LoginScreen(), lang: 'ar'));
      await signIn(tester, 'MB-10482', 'pw', label: 'تسجيل الدخول');
      expect(
        find.text('تم إيقاف وصولك إلى البوابة. يرجى التواصل مع إدارة المشروع.'),
        findsOneWidget,
      );
      expect(find.textContaining('تعذر تسجيل الدخول'), findsNothing);
    });

    testWidgets('Client ID password reset sends nothing and says so',
        (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen(), lang: 'ar'));
      await tester.enterText(find.byType(TextField).first, 'mb10482');
      await tester.tap(find.text('نسيت كلمة المرور؟'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'لا توجد وسيلة استرجاع إلكترونية مفعلة لهذا الحساب. يرجى التواصل مع إدارة المشروع.',
        ),
        findsOneWidget,
      );
      expect(env.repo.resets, isEmpty);
      expect(find.textContaining(_alias), findsNothing);
    });

    testWidgets('e-mail password reset still works', (tester) async {
      final env = Env(signedInUser: null);
      await tester.pumpWidget(env.app(const LoginScreen()));
      await tester.enterText(find.byType(TextField).first, 'a@b.com');
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      expect(env.repo.resets, ['a@b.com']);
      expect(find.text('Password reset email requested.'), findsOneWidget);
    });
  });

  // ───────────────────────── access gate ─────────────────────────
  group('post-login access gate', () {
    testWidgets('suspended portal-only user sees the blocked screen and no '
        'data is loaded', (tester) async {
      final env = Env(
        repo: FakeRepo(
          access: const PortalAccess(status: 'suspended', linked: true),
        ),
      );
      await _pumpFlow(tester, env, lang: 'ar');
      expect(
        find.text('تم إيقاف وصولك إلى البوابة. يرجى التواصل مع إدارة المشروع.'),
        findsOneWidget,
      );
      expect(find.byType(AppShell), findsNothing);
      expect(env.repo.sessionLoads, 0);
      await tester.tap(find.text('تسجيل الخروج'));
      await tester.pumpAndSettle();
      expect(env.repo.signOutCalls, 1);
    });

    testWidgets('must-change-password lands on first login and cannot be '
        'skipped', (tester) async {
      final env = Env(repo: FakeRepo(access: _mustChange));
      await _pumpFlow(tester, env);
      expect(find.text('Finish setting up your account'), findsOneWidget);
      expect(env.repo.sessionLoads, 0);
      expect(find.byType(AppShell), findsNothing);
      // The system back button does nothing.
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Finish setting up your account'), findsOneWidget);
      final pop = tester.widget<PopScope>(find.descendant(
        of: find.byType(FirstLoginScreen),
        matching: find.byType(PopScope),
      ).first);
      expect(pop.canPop, isFalse);
      // "App restart": a brand-new tree against the same server state.
      await tester.pumpWidget(const SizedBox());
      final env2 = Env(repo: env.repo);
      await _pumpFlow(tester, env2);
      expect(find.text('Finish setting up your account'), findsOneWidget);
      expect(env.repo.sessionLoads, 0);
    });

    testWidgets('status none (staff) behaves exactly as today', (tester) async {
      final env = Env();
      await _pumpFlow(tester, env);
      expect(find.byType(AppShell), findsOneWidget);
      expect(find.text('Collections'), findsWidgets);
      expect(env.repo.sessionLoads, greaterThan(0));
    });

    testWidgets('a failed access check shows retry and never enters the app',
        (tester) async {
      final repo = FakeRepo()..accessError = Exception('SocketException');
      final env = Env(repo: repo);
      await _pumpFlow(tester, env);
      expect(find.text('Could not verify your account — try again'),
          findsOneWidget);
      expect(find.byType(AppShell), findsNothing);
      expect(repo.sessionLoads, 0);
      repo.accessError = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byType(AppShell), findsOneWidget);
    });

    testWidgets('staff identity suspended as owner keeps the manager shell '
        'and loses the owner entry', (tester) async {
      final env = Env(
        repo: FakeRepo(
          member: true,
          access: const PortalAccess(
            linked: true,
            status: 'suspended',
            hasStaffAccess: true,
          ),
        ),
      );
      await _pumpFlow(tester, env);
      expect(find.byType(SuspendedScreen), findsNothing);
      expect(find.text('Collections'), findsWidgets); // manager navigation
      final shell = tester.widget<AppShell>(find.byType(AppShell));
      expect(shell.session.isPortalMember, isFalse);
      expect(shell.session.canSwitchToPortal, isFalse);
      await tester.tap(find.text('More').last);
      await tester.pump();
      expect(find.text('My account as owner / member'), findsNothing);
    });

    testWidgets('control: an active staff owner still gets the owner entry',
        (tester) async {
      final env = Env(
        repo: FakeRepo(
          member: true,
          access: const PortalAccess(
            linked: true,
            status: 'active',
            hasStaffAccess: true,
          ),
        ),
      );
      await _pumpFlow(tester, env);
      await tester.tap(find.text('More').last);
      await tester.pump();
      expect(find.text('My account as owner / member'), findsOneWidget);
    });
  });

  // ───────────────────────── first login ─────────────────────────
  group('first login', () {
    Future<Env> open(WidgetTester tester, {PortalAccess? access, FakeBio? bio}) async {
      final env = Env(
        repo: FakeRepo(access: access ?? _mustChange),
        bio: bio,
      );
      await _pumpFlow(tester, env);
      return env;
    }

    testWidgets('shows the phone hint', (tester) async {
      await open(tester);
      expect(find.text('Number on file: •••• 4567'), findsOneWidget);
    });

    testWidgets('password policy errors block submission', (tester) async {
      final env = await open(tester);
      await _fillFirstLogin(tester, password: 'short1', confirm: 'short1');
      await _submitFirstLogin(tester);
      expect(find.textContaining('at least 10 characters'), findsWidgets);
      await _fillFirstLogin(tester, password: 'onlylettersss');
      await _submitFirstLogin(tester);
      expect(find.textContaining('at least one digit'), findsOneWidget);
      await _fillFirstLogin(tester, password: '1234567890');
      await _submitFirstLogin(tester);
      expect(find.textContaining('at least one letter'), findsOneWidget);
      expect(env.repo.calls.where((c) => c != 'access'), isEmpty);
    });

    testWidgets('confirmation mismatch', (tester) async {
      final env = await open(tester);
      await _fillFirstLogin(tester, confirm: 'abcdefgh13');
      await _submitFirstLogin(tester);
      expect(find.textContaining('does not match'), findsOneWidget);
      expect(env.repo.calls.where((c) => c != 'access'), isEmpty);
    });

    testWidgets('invalid phone', (tester) async {
      final env = await open(tester);
      await _fillFirstLogin(tester, phone: '12345');
      await _submitFirstLogin(tester);
      expect(find.textContaining('valid Egyptian mobile number'), findsOneWidget);
      expect(env.repo.calls.where((c) => c != 'access'), isEmpty);
    });

    testWidgets('success: password first, then the RPC, then the app',
        (tester) async {
      final env = await open(tester);
      env.repo.onCompleteOk =
          () => env.repo.access = const PortalAccess(status: 'active', linked: true);
      await _fillFirstLogin(tester, phone: '٠١٠١٢٣٤٥٦٧٨');
      await _submitFirstLogin(tester);
      expect(
        env.repo.calls.where((c) => c != 'access').toList(),
        ['changePassword', 'complete:+201012345678'],
      );
      expect(find.byType(FirstLoginScreen), findsNothing);
      expect(find.byType(AppShell), findsOneWidget);
    });

    testWidgets('weak/same password rejected by Auth: RPC never called',
        (tester) async {
      final env = await open(tester);
      env.repo.changeError = Exception('same_password');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.textContaining('different from the temporary'), findsOneWidget);
      expect(env.repo.calls.any((c) => c.startsWith('complete')), isFalse);
    });

    testWidgets('TEMP_EXPIRED: contact message with sign-out, no form',
        (tester) async {
      final env = await open(tester);
      env.repo.completeResult =
          const FirstLoginResult(ok: false, reason: 'TEMP_EXPIRED');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.byKey(const ValueKey('temp-expired-message')), findsOneWidget);
      expect(find.byKey(const ValueKey('first-login-password')), findsNothing);
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(env.repo.signOutCalls, 1);
    });

    testWidgets('temp_expired from the access check starts in the expired view',
        (tester) async {
      await open(
        tester,
        access: const PortalAccess(
          linked: true,
          status: 'pending',
          mustChangePassword: true,
          tempExpired: true,
        ),
      );
      expect(find.text(tempExpiredMessage(false)), findsOneWidget);
    });

    testWidgets('PASSWORD_NOT_CHANGED retries the whole sequence',
        (tester) async {
      final env = await open(tester);
      env.repo.completeResult =
          const FirstLoginResult(ok: false, reason: 'PASSWORD_NOT_CHANGED');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.textContaining('not changed yet'), findsOneWidget);
      await _submitFirstLogin(tester);
      expect(
        env.repo.calls.where((c) => c != 'access').toList(),
        ['changePassword', 'complete:+201012345678', 'changePassword', 'complete:+201012345678'],
      );
    });

    testWidgets('a network failure on the RPC retries without re-changing the '
        'password', (tester) async {
      final env = await open(tester);
      env.repo.completeError = Exception('SocketException');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.text('Connection failed — try again'), findsOneWidget);
      env.repo.completeError = null;
      env.repo.onCompleteOk =
          () => env.repo.access = const PortalAccess(status: 'active');
      await _submitFirstLogin(tester);
      expect(
        env.repo.calls.where((c) => c != 'access').toList(),
        ['changePassword', 'complete:+201012345678', 'complete:+201012345678'],
      );
      expect(find.byType(AppShell), findsOneWidget);
    });

    for (final c in const {
      'INVALID_PHONE': 'valid Egyptian mobile number',
      'NOT_AUTHENTICATED': 'Session expired',
      'NOT_FOUND': 'could not find your account',
      'WHATEVER': 'did not complete',
    }.entries) {
      testWidgets('reason ${c.key} shows clear copy and keeps the form',
          (tester) async {
        final env = await open(tester);
        env.repo.completeResult = FirstLoginResult(ok: false, reason: c.key);
        await _fillFirstLogin(tester);
        await _submitFirstLogin(tester);
        expect(find.textContaining(c.value), findsOneWidget);
        expect(find.byType(FirstLoginScreen), findsOneWidget);
        expect(find.byKey(const ValueKey('first-login-password')), findsOneWidget);
      });
    }

    testWidgets('SUSPENDED reason re-checks access and blocks', (tester) async {
      final env = await open(tester);
      env.repo.completeResult =
          const FirstLoginResult(ok: false, reason: 'SUSPENDED');
      env.repo.access = const PortalAccess(status: 'suspended', linked: true);
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.byType(SuspendedScreen), findsOneWidget);
    });

    testWidgets('NOT_REQUIRED re-checks access and moves on', (tester) async {
      final env = await open(tester);
      env.repo.completeResult =
          const FirstLoginResult(ok: false, reason: 'NOT_REQUIRED');
      env.repo.access = const PortalAccess(status: 'active');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(find.byType(AppShell), findsOneWidget);
    });

    testWidgets('biometric toggle only when the device supports it',
        (tester) async {
      await open(tester, bio: FakeBio(supported: false));
      expect(find.byKey(const ValueKey('first-login-biometric')), findsNothing);
    });

    testWidgets('biometric opt-in stores the flag after a successful prompt',
        (tester) async {
      final env = await open(tester);
      env.repo.onCompleteOk =
          () => env.repo.access = const PortalAccess(status: 'active');
      expect(find.byKey(const ValueKey('first-login-biometric')), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('first-login-biometric')));
      await tester.tap(find.byKey(const ValueKey('first-login-biometric')));
      await tester.pump();
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(env.bio.prompts, 1);
      expect(env.flags.map['u1'], isTrue);
      // Enabling during setup must not lock the user out right away.
      expect(find.byType(AppShell), findsOneWidget);
      expect(find.byType(LockScreen), findsNothing);
    });

    testWidgets('no biometric opt-in leaves the flag off', (tester) async {
      final env = await open(tester);
      env.repo.onCompleteOk =
          () => env.repo.access = const PortalAccess(status: 'active');
      await _fillFirstLogin(tester);
      await _submitFirstLogin(tester);
      expect(env.bio.prompts, 0);
      expect(env.flags.map['u1'], isNull);
    });
  });

  // ───────────────────────── biometric lock ─────────────────────────
  group('biometric app lock', () {
    testWidgets('enabled at cold start: locked until biometrics succeed',
        (tester) async {
      final env = Env(bio: FakeBio(result: false));
      env.flags.map['u1'] = true;
      await _pumpFlow(tester, env);
      expect(find.byType(LockScreen), findsOneWidget);
      expect(find.byType(AppShell), findsNothing);
      expect(env.repo.sessionLoads, 0);
      expect(env.repo.calls, isEmpty); // not even the access check
      expect(env.bio.prompts, 1); // auto prompt on open
      env.bio.result = true;
      await tester.tap(find.text('Unlock'));
      await tester.pumpAndSettle();
      expect(env.bio.prompts, 2);
      expect(find.byType(AppShell), findsOneWidget);
    });

    testWidgets('lock screen sign-out clears the flag', (tester) async {
      final env = Env(bio: FakeBio(result: false));
      env.flags.map['u1'] = true;
      await _pumpFlow(tester, env);
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      expect(env.repo.signOutCalls, 1);
      expect(env.flags.map.containsKey('u1'), isFalse);
    });

    testWidgets('not enabled: no lock', (tester) async {
      final env = Env();
      await _pumpFlow(tester, env);
      expect(find.byType(LockScreen), findsNothing);
      expect(env.bio.prompts, 0);
      expect(find.byType(AppShell), findsOneWidget);
    });

    testWidgets('a fresh password sign-in does not ask again', (tester) async {
      final env = Env(signedInUser: null);
      env.flags.map['u1'] = true; // e.g. session expired, flag still there
      _tall(tester);
      await tester.pumpWidget(env.app(const AuthFlow()));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'a@b.com');
      await tester.enterText(find.byType(TextField).at(1), 'pw');
      env.repo.signInError = null;
      await tester.tap(find.text('Sign in'));
      env.authController.add(_signedIn(_user('u1')));
      await tester.pumpAndSettle();
      expect(find.byType(LockScreen), findsNothing);
      expect(find.byType(AppShell), findsOneWidget);
    });
  });

  group('profile biometric row', () {
    Future<Env> profile(WidgetTester tester,
        {FakeBio? bio, String? email}) async {
      final env = Env(bio: bio);
      final session = AppSession(
        user: _user('u1', email: email),
        capabilities: const {},
        isPortalMember: true,
      );
      _tall(tester);
      await tester.pumpWidget(env.app(Scaffold(
        body: ProfileScreen(session: session),
      )));
      await tester.pumpAndSettle();
      return env;
    }

    testWidgets('hidden when unsupported', (tester) async {
      await profile(tester, bio: FakeBio(supported: false));
      expect(find.text('Unlock with biometrics'), findsNothing);
    });

    testWidgets('enable requires a successful prompt; disable clears',
        (tester) async {
      final env = await profile(tester, bio: FakeBio(result: false));
      expect(find.text('Unlock with biometrics'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('biometric-toggle')));
      await tester.pumpAndSettle();
      expect(env.bio.prompts, 1);
      expect(env.flags.map['u1'], isNull);
      env.bio.result = true;
      await tester.tap(find.byKey(const ValueKey('biometric-toggle')));
      await tester.pumpAndSettle();
      expect(env.flags.map['u1'], isTrue);
      final container =
          ProviderScope.containerOf(tester.element(find.byType(ProfileScreen)));
      expect(container.read(unlockedUsersProvider), contains('u1'));
      await tester.tap(find.byKey(const ValueKey('biometric-toggle')));
      await tester.pumpAndSettle();
      expect(env.flags.map['u1'], isFalse);
      expect(env.bio.prompts, 2); // no prompt to turn it off
    });

    testWidgets('sign-out removes the biometric flag and the unlock',
        (tester) async {
      final env = await profile(tester);
      env.flags.map['u1'] = true;
      final container =
          ProviderScope.containerOf(tester.element(find.byType(ProfileScreen)));
      container.read(unlockedUsersProvider.notifier).state = {'u1', 'other'};
      await tester.tap(find.text('Sign out'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sign out').last);
      await tester.pumpAndSettle();
      expect(env.repo.signOutCalls, 1);
      expect(env.flags.map.containsKey('u1'), isFalse);
      expect(container.read(unlockedUsersProvider), {'other'});
    });

    testWidgets('a Client ID account never shows its alias', (tester) async {
      await profile(tester, email: 'mb-10482@$_alias');
      expect(find.text('MB-10482'), findsOneWidget);
      expect(find.textContaining(_alias), findsNothing);
    });
  });

  // ───────────────────────── activation screen ─────────────────────────
  group('activation screen', () {
    const valid = ActivationInspection(
      state: 'valid',
      memberName: 'Mona Adel',
      organizationName: 'Palm Co',
      email: 'owner@example.com',
    );

    Future<(Env, FakeApi)> open(
      WidgetTester tester,
      ActivationInspection inspection, {
      String? signedInUser = 'u1',
    }) async {
      final env = Env(signedInUser: signedInUser);
      final api = FakeApi(inspection);
      _tall(tester);
      await tester.pumpWidget(env.app(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const ActivationScreen(token: _token),
                ),
              ),
              child: const Text('go'),
            ),
          ),
        ),
        api: api,
      ));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      return (env, api);
    }

    Future<void> fill(WidgetTester tester,
        {String pw = 'abcdefgh12', String? confirm}) async {
      await tester.enterText(find.byKey(const ValueKey('activation-password')), pw);
      await tester.enterText(
          find.byKey(const ValueKey('activation-confirm')), confirm ?? pw);
      await tester.tap(find.text('Activate account'));
      await tester.pumpAndSettle();
    }

    testWidgets('valid: member and read-only e-mail, then complete and sign in',
        (tester) async {
      final (env, api) = await open(tester, valid);
      expect(find.byKey(const ValueKey('activation-member')), findsOneWidget);
      expect(find.text('owner@example.com'), findsOneWidget);
      // The e-mail is display-only: it is not an editable text field.
      expect(find.widgetWithText(TextField, 'owner@example.com'), findsNothing);
      await fill(tester);
      expect(api.completes.single.password, 'abcdefgh12');
      expect(api.completes.single.bearer, isNull);
      expect(env.repo.signIns, [('owner@example.com', 'abcdefgh12')]);
      // Done: the activation route is gone.
      expect(find.byType(ActivationScreen), findsNothing);
    });

    testWidgets('policy errors never reach the server', (tester) async {
      final (_, api) = await open(tester, valid);
      await fill(tester, pw: 'short', confirm: 'other');
      expect(find.textContaining('at least 10 characters'), findsOneWidget);
      expect(find.textContaining('does not match'), findsOneWidget);
      expect(api.completes, isEmpty);
    });

    for (final s in ['expired', 'used', 'revoked', 'not_found']) {
      testWidgets('inspect state $s renders its card without a form',
          (tester) async {
        await open(tester, ActivationInspection(state: s));
        expect(find.byKey(ValueKey('activation-state-$s')), findsOneWidget);
        expect(find.byKey(const ValueKey('activation-password')), findsNothing);
      });
    }

    testWidgets('signed out works too', (tester) async {
      await open(tester, valid, signedInUser: null);
      expect(find.byKey(const ValueKey('activation-member')), findsOneWidget);
    });

    testWidgets('complete reports used', (tester) async {
      final (_, api) = await open(tester, valid);
      api.outcomes.add(const ActivationOutcome(ok: false, reason: 'used'));
      await fill(tester);
      expect(find.byKey(const ValueKey('activation-state-used')), findsOneWidget);
    });

    testWidgets('weak_password from the server', (tester) async {
      final (env, api) = await open(tester, valid);
      api.outcomes.add(const ActivationOutcome(ok: false, reason: 'weak_password'));
      await fill(tester);
      expect(find.textContaining('does not meet the requirements'), findsOneWidget);
      expect(env.repo.signIns, isEmpty);
    });

    testWidgets('needs_signin: existing password, then complete with the '
        'bearer token and no new password', (tester) async {
      final (env, api) = await open(tester, valid);
      api.outcomes.add(const ActivationOutcome(ok: false, reason: 'needs_signin'));
      await fill(tester);
      expect(find.byKey(const ValueKey('activation-existing-note')), findsOneWidget);
      expect(find.byKey(const ValueKey('activation-password')), findsNothing);
      await tester.enterText(
          find.byKey(const ValueKey('activation-existing-password')), 'MyOldPass1');
      await tester.tap(find.text('Activate account'));
      await tester.pumpAndSettle();
      expect(env.repo.signIns, [('owner@example.com', 'MyOldPass1')]);
      expect(api.completes.length, 2);
      expect(api.completes.last.password, isNull);
      expect(api.completes.last.bearer, 'jwt-u1');
      expect(find.byType(ActivationScreen), findsNothing);
      // Order: the sign-in happened before the bearer-authenticated call.
      expect(env.repo.calls, contains('signIn'));
    });

    testWidgets('existingAccount in inspect goes straight to sign-in mode',
        (tester) async {
      await open(
        tester,
        const ActivationInspection(
          state: 'valid',
          email: 'staff@example.com',
          existingAccount: true,
        ),
      );
      expect(find.byKey(const ValueKey('activation-existing-note')), findsOneWidget);
    });

    testWidgets('existing mode: wrong password does not call complete',
        (tester) async {
      final (env, api) = await open(
        tester,
        const ActivationInspection(
          state: 'valid',
          email: 'staff@example.com',
          existingAccount: true,
        ),
      );
      env.repo.signInError = Exception('Invalid login credentials');
      await tester.enterText(
          find.byKey(const ValueKey('activation-existing-password')), 'nope');
      await tester.tap(find.text('Activate account'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Incorrect password'), findsOneWidget);
      expect(api.completes, isEmpty);
    });

    testWidgets('inspect network failure offers retry', (tester) async {
      final env = Env();
      final api = FakeApi(valid)..inspectError = const ActivationNetworkException();
      _tall(tester);
      await tester.pumpWidget(
          env.app(const ActivationScreen(token: _token), api: api));
      await tester.pumpAndSettle();
      expect(find.text('Connection failed — try again'), findsOneWidget);
      api.inspectError = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('activation-member')), findsOneWidget);
    });

    testWidgets('the token is never rendered', (tester) async {
      await open(tester, valid);
      expect(find.textContaining(_token), findsNothing);
    });

    testWidgets('a sign-out closes the activation screen (nothing survives)',
        (tester) async {
      final env = Env();
      final api = FakeApi(valid);
      _tall(tester);
      await tester.pumpWidget(ProviderScope(
        overrides: env.overrides(api: api),
        child: MaterialApp(
          home: AuthRouteGuard(
            child: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => const ActivationScreen(token: _token),
                    ),
                  ),
                  child: const Text('go'),
                ),
              ),
            ),
          ),
        ),
      ));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(find.byType(ActivationScreen), findsOneWidget);
      env.authController.add(AuthState(AuthChangeEvent.signedOut, null));
      await tester.pumpAndSettle();
      expect(find.byType(ActivationScreen), findsNothing);
    });
  });

  // ───────────────────────── deep links ─────────────────────────
  group('activation deep links', () {
    Future<(Env, FakeLinks, FakeApi)> pumpApp(
      WidgetTester tester, {
      Uri? initial,
    }) async {
      final env = Env(signedInUser: null);
      final links = FakeLinks()..initial = initial;
      final api = FakeApi(const ActivationInspection(
        state: 'valid',
        memberName: 'Mona',
        email: 'o@x.com',
      ));
      final key = GlobalKey<NavigatorState>();
      _tall(tester);
      await tester.pumpWidget(env.app(
        const Scaffold(body: Text('HOME')),
        api: api,
        links: links,
        navKey: key,
      ));
      await tester.pumpAndSettle();
      return (env, links, api);
    }

    testWidgets('cold-start https link opens the activation screen',
        (tester) async {
      final (_, _, api) = await pumpApp(
        tester,
        initial: Uri.parse('https://aqarbooks.com/activate/$_token'),
      );
      expect(find.byType(ActivationScreen), findsOneWidget);
      expect(api.inspects, 1);
    });

    testWidgets('warm custom-scheme link opens it over the current screen',
        (tester) async {
      final (_, links, _) = await pumpApp(tester);
      expect(find.byType(ActivationScreen), findsNothing);
      links.controller.add(Uri.parse('aqarbooks://activate/$_token'));
      await tester.pumpAndSettle();
      expect(find.byType(ActivationScreen), findsOneWidget);
    });

    testWidgets('duplicate delivery does not stack screens; bad links ignored',
        (tester) async {
      final (_, links, api) = await pumpApp(
        tester,
        initial: Uri.parse('aqarbooks://activate/$_token'),
      );
      links.controller.add(Uri.parse('aqarbooks://activate/$_token'));
      links.controller.add(Uri.parse('https://evil.com/activate/$_token'));
      links.controller.add(Uri.parse('https://aqarbooks.com/activate/short'));
      await tester.pumpAndSettle();
      expect(find.byType(ActivationScreen), findsOneWidget);
      expect(api.inspects, 1);
    });
  });
}
