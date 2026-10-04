import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/app_core.dart';
import 'data/repository.dart';
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
      overrides: [localeProvider.overrideWith((ref) => savedLocale)],
      child: const AqarBooksApp(),
    ),
  );
}

class AqarBooksApp extends ConsumerWidget {
  const AqarBooksApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp(
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
          child: child ?? const SizedBox.shrink(),
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
    final t = AppLabels(Localizations.localeOf(context));
    if (!AppConfig.isReady) return const ConfigScreen();
    final auth = ref.watch(authStateProvider);
    return AuthRouteGuard(
      child: auth.when(
        data: (_) {
          final session = ref.watch(sessionProvider);
          return session.when(
            data: (value) =>
                value == null ? const LoginScreen() : AppShell(session: value),
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
