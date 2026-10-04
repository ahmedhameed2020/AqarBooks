import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_core.dart';
import 'data/app_links_source.dart';
import 'data/repository.dart';
import 'screens/activation_screens.dart';
import 'screens/app_screens.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (AppConfig.isReady) {
    await Supabase.initialize(
      url: AppConfig.url,
      publishableKey: AppConfig.anonKey,
    );
  }
  // Arabic-first, and the chosen language persists between launches.
  final savedLocale = await loadSavedLocale();
  runApp(
    ProviderScope(
      overrides: [
        localeProvider.overrideWith((ref) => savedLocale),
        activationLinkSourceProvider.overrideWithValue(
          PlatformActivationLinkSource(),
        ),
      ],
      child: const AqarBooksApp(),
    ),
  );
}

final appNavigatorKey = GlobalKey<NavigatorState>();

class AqarBooksApp extends ConsumerWidget {
  const AqarBooksApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp(
    navigatorKey: appNavigatorKey,
    title: 'AqarBooks',
    debugShowCheckedModeBanner: false,
    theme: buildTheme(),
    scrollBehavior: const AqarScrollBehavior(),
    locale: ref.watch(localeProvider),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    builder: (context, child) {
      final media = MediaQuery.of(context);
      return MediaQuery(
        // Large system fonts are honoured up to 130%; beyond that the fixed
        // financial layouts (amounts, bottom bar) would start to clip.
        data: media.copyWith(
          textScaler: media.textScaler.clamp(
            minScaleFactor: 0.9,
            maxScaleFactor: 1.3,
          ),
        ),
        child: Directionality(
          textDirection: ref.watch(localeProvider).languageCode == 'ar'
              ? TextDirection.rtl
              : TextDirection.ltr,
          child: ActivationLinkHandler(
            navigatorKey: appNavigatorKey,
            child: child ?? const SizedBox.shrink(),
          ),
        ),
      );
    },
    home: const AuthGate(),
  );
}

class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!AppConfig.isReady) return const ConfigScreen();
    return const AuthFlow();
  }
}

/// Sign-in state machine (separate from [AuthGate] so tests can drive it
/// without a configured Supabase environment).
class AuthFlow extends ConsumerWidget {
  const AuthFlow({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final auth = ref.watch(authStateProvider);
    return AuthRouteGuard(
      child: auth.when(
        data: (state) {
          final user = state.session?.user;
          if (user == null) return const LoginScreen();
          // Order matters: biometric lock (local) -> portal access check
          // (suspended / first login) -> only then the session and shell.
          return AppLockGate(
            key: ValueKey('lock-${user.id}'),
            userId: user.id,
            child: PortalAccessGate(
              builder: (context, access) => SessionFlow(
                key: ValueKey('flow-${user.id}'),
                portalSuspendedForStaff: access.portalSuspendedForStaff,
              ),
            ),
          );
        },
        loading: () => const LoadingScreen(),
        error: (e, _) => Scaffold(
          body: AppError(
            message: t.ar
                ? 'خدمة المصادقة غير متاحة حاليًا'
                : 'Authentication service unavailable',
            onRetry: () => ref.invalidate(authStateProvider),
          ),
        ),
      ),
    );
  }
}

/// Loads the capability session once access has been cleared.
class SessionFlow extends ConsumerWidget {
  /// A staff identity whose owner portal is suspended keeps work mode but
  /// loses every owner-portal entry point.
  final bool portalSuspendedForStaff;
  const SessionFlow({super.key, this.portalSuspendedForStaff = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final session = ref.watch(sessionProvider);
    return session.when(
      data: (value) {
        if (value == null) return const LoginScreen();
        return AppShell(
          session:
              portalSuspendedForStaff ? value.withoutPortalMembership() : value,
        );
      },
      loading: () => const LoadingScreen(),
      // Failing to load capabilities never silently falls back to the
      // resident shell (UX blueprint §2): show a retryable error.
      error: (e, _) => Scaffold(
        body: AppError(
          message: t.ar
              ? 'تعذر تحميل حسابك — أعد المحاولة'
              : 'Could not load your account — try again',
          onRetry: () => ref.invalidate(sessionProvider),
        ),
      ),
    );
  }
}
