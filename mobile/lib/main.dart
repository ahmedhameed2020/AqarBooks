import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
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
  runApp(const ProviderScope(child: AqarBooksApp()));
}

class AqarBooksApp extends ConsumerWidget {
  const AqarBooksApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => MaterialApp(
    title: 'AqarBooks',
    debugShowCheckedModeBanner: false,
    theme: buildTheme(),
    locale: ref.watch(localeProvider),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      DefaultMaterialLocalizations.delegate,
      DefaultWidgetsLocalizations.delegate,
      DefaultCupertinoLocalizations.delegate,
    ],
    builder: (context, child) => Directionality(
      textDirection: ref.watch(localeProvider).languageCode == 'ar'
          ? TextDirection.rtl
          : TextDirection.ltr,
      child: child ?? const SizedBox.shrink(),
    ),
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
    return auth.when(
      data: (_) {
        final session = ref.watch(sessionProvider);
        return session.when(
          data: (value) =>
              value == null ? const LoginScreen() : AppShell(session: value),
          loading: () => const LoadingScreen(),
          error: (e, _) => AppError(
            message: t.ar
                ? 'تعذر تحميل جلستك بأمان.'
                : 'Could not load your session safely.',
          ),
        );
      },
      loading: () => const LoadingScreen(),
      error: (e, _) => AppError(
        message: t.ar
            ? 'خدمة المصادقة غير متاحة حالياً.'
            : 'Authentication service unavailable.',
      ),
    );
  }
}
