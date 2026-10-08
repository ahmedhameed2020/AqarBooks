import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// AqarBooks Mobile — Egypt V1, locked design system from the approved Figma
// file (loiK5MXFdMhkbvBvYCPHOJ): Deep Navy primary, Petrol Blue, restrained
// Royal Purple accent, gold hairline, Soft Cloud background, white cards,
// radius 16, IBM Plex Sans Arabic.
const appNavy = Color(0xFF07425D);
const appNavyDark = Color(0xFF042434);
const appBlue = Color(0xFF1B60B9); // Petrol Blue
const appPurple = Color(0xFF7E1898); // Royal Purple accent — active states only
const appPurpleLight = Color(0xFFF4E9F7);
const appGold = Color(0xFFC5A880); // gold hairline
const appInk = Color(0xFF0F172A);
const appGrey = Color(0xFF64748B);
const appSurface = Color(0xFFF4F6F9); // Soft Cloud
const appCardBorder = Color(0xFFE2E8F0);
const appSuccess = Color(0xFF1A7F4E);
const appSuccessBg = Color(0xFFE8F5EE);
const appDanger = Color(0xFFB42318);
const appDangerBg = Color(0xFFFBEAE8);
const appAmber = Color(0xFFB54708);
const appAmberBg = Color(0xFFFDF2E3);
const appPetrolBg = Color(0xFFEBF1FA);
const appNavyBg = Color(0xFFE3EBF0);
// Dark gate theme (screen 15)
const gateDark = Color(0xFF042434);
const gatePanel = Color(0xFF06303F);
const gatePanelBorder = Color(0xFF0E4A5F);
const gateMuted = Color(0xFF8FA6B2);
const gateAllow = Color(0xFF157A47);

const appFontFamily = 'IBM Plex Sans Arabic';

class AppConfig {
  static const url = String.fromEnvironment('SUPABASE_URL');
  static const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static bool get isReady =>
      url.startsWith('https://') &&
      anonKey.isNotEmpty &&
      !anonKey.contains('YOUR_');
}

// Live production host for the web dues portal. The old
// `app.aqarbooks.com` subdomain has no DNS record, so links built on it were
// dead; the portal is served from the main domain.
const paymentPortalHost = 'aqarbooks.com';

Uri duesPortalUri(Locale locale) {
  final language = locale.languageCode == 'ar' ? 'ar' : 'en';
  return Uri(
    scheme: 'https',
    host: paymentPortalHost,
    path: '/$language/portal/dues',
  );
}

bool isAllowedDuesPortalUri(Uri uri) =>
    uri.scheme == 'https' &&
    uri.host == paymentPortalHost &&
    (uri.port == 0 || uri.port == 443) &&
    uri.userInfo.isEmpty &&
    uri.query.isEmpty &&
    uri.fragment.isEmpty &&
    (uri.path == '/ar/portal/dues' || uri.path == '/en/portal/dues');

const _localePrefKey = 'app_locale';

/// Locale is Arabic-first and persisted between launches (blueprint shared
/// rule: the previous build reset to Arabic every run).
final localeProvider = StateProvider<Locale>((ref) => const Locale('ar'));

Future<Locale> loadSavedLocale() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(_localePrefKey);
    if (code == 'en') return const Locale('en');
  } catch (_) {}
  return const Locale('ar');
}

Future<void> persistLocale(Locale locale) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_localePrefKey, locale.languageCode);
  } catch (_) {}
}

/// Lists always accept a pull, even when they are shorter than the screen —
/// otherwise pull-to-refresh silently does nothing on a short list.
class AqarScrollBehavior extends MaterialScrollBehavior {
  const AqarScrollBehavior();
  @override
  ScrollPhysics getScrollPhysics(BuildContext context) =>
      AlwaysScrollableScrollPhysics(parent: super.getScrollPhysics(context));
}

final supabaseProvider = Provider<SupabaseClient?>((ref) {
  if (!AppConfig.isReady) return null;
  return Supabase.instance.client;
});

/// Unified user-facing error copy (blueprint: never surface raw Supabase
/// errors, permission strings, RPC names, or UUIDs).
String friendlyError(Object error, Locale locale, {bool loading = false}) {
  final ar = locale.languageCode == 'ar';
  final text = error.toString();
  if (text.contains('42501') || text.contains('FORBIDDEN')) {
    return ar
        ? 'ليست لديك صلاحية لهذا الإجراء'
        : 'You do not have permission for this action';
  }
  if (text.contains('SocketException') ||
      text.contains('Failed host lookup') ||
      text.contains('Connection')) {
    return ar ? 'تعذر الاتصال — أعد المحاولة' : 'Connection failed — try again';
  }
  if (text.contains('JWT') || text.contains('session')) {
    return ar
        ? 'انتهت الجلسة — سجّل الدخول مرة أخرى'
        : 'Session expired — sign in again';
  }
  if (loading) return loadErrorMessage(locale);
  return ar ? 'لم يكتمل الإجراء — أعد المحاولة' : 'Action did not complete — try again';
}

/// Copy for a list/detail that failed to load (never reads as "empty").
String loadErrorMessage(Locale locale) => locale.languageCode == 'ar'
    ? 'تعذر التحميل — أعد المحاولة'
    : 'Could not load — try again';

class AppLabels {
  final Locale locale;
  const AppLabels(this.locale);
  bool get ar => locale.languageCode == 'ar';
  // Brand rule: the brand is always written "AqarBooks" in Latin letters,
  // in Arabic and English UI alike.
  String get appName => 'AqarBooks';
  String get email => ar ? 'البريد الإلكتروني' : 'Email address';
  String get emailOrClientId =>
      ar ? 'البريد الإلكتروني أو رقم العميل' : 'Email or Client ID';
  String get password => ar ? 'كلمة المرور' : 'Password';
  String get signIn => ar ? 'تسجيل الدخول' : 'Sign in';
  String get resetPassword => ar ? 'نسيت كلمة المرور؟' : 'Forgot password?';
  String get emailAndPasswordRequired => ar
      ? 'أدخل البريد الإلكتروني وكلمة المرور.'
      : 'Enter your email and password.';
  String get signInFailed => ar
      ? 'تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.'
      : 'Sign in failed. Check your credentials and try again.';
  String get emailRequired =>
      ar ? 'أدخل بريدك الإلكتروني أولاً.' : 'Enter your email first.';
  String get resetRequested => ar
      ? 'تم طلب رسالة إعادة تعيين كلمة المرور.'
      : 'Password reset email requested.';
  String get resetFailed =>
      ar ? 'تعذر طلب رسالة إعادة التعيين.' : 'Could not request a reset email.';
  String get configMessage => ar
      ? 'التطبيق غير مهيأ للاتصال بعد. تواصل مع فريق الدعم لتهيئة بيئة التشغيل.'
      : 'The app is not configured yet. Contact support to set up this environment.';
  String get loading => ar ? 'جارٍ التحميل…' : 'Loading…';
  String get signOut => ar ? 'تسجيل الخروج' : 'Sign out';
  String get retry => ar ? 'إعادة المحاولة' : 'Retry';
  String get unavailable =>
      ar ? 'هذه الوظيفة غير متاحة حالياً' : 'This feature is not available yet';
  String get home => ar ? 'الرئيسية' : 'Home';
  String get dashboard => home;
  String get maintenance => ar ? 'الصيانة' : 'Maintenance';
  String get payments => ar ? 'المدفوعات' : 'Payments';
  String get more => ar ? 'المزيد' : 'More';
  String get profile => ar ? 'حسابي' : 'Profile';
  String get dues => ar ? 'المستحقات' : 'Dues';
  String get units => ar ? 'وحداتي' : 'My Units';
  String get visitors => ar ? 'الزوار' : 'Visitors';
  String get vehicles => ar ? 'المركبات' : 'Vehicles';
  String get documents => ar ? 'المستندات' : 'Documents';
  String get notifications => ar ? 'الإشعارات' : 'Notifications';
  String get workOrders => ar ? 'أوامر الشغل' : 'Work orders';
  String get today => ar ? 'اليوم' : 'Today';
  String get search => ar ? 'بحث' : 'Search';
  String get collect => ar ? 'تحصيل' : 'Collect';
  String get receipts => ar ? 'إيصالات' : 'Receipts';
  String get myTasks => ar ? 'مهامي' : 'My Tasks';
  String get history => ar ? 'السجل' : 'History';
  String get collections => ar ? 'التحصيلات' : 'Collections';
  String get operations => ar ? 'التشغيل' : 'Operations';
  String get gateScan => ar ? 'المسح' : 'Scan';
  String get currentVisitors => ar ? 'الموجودون الآن' : 'Inside now';
  String get events => ar ? 'الأحداث' : 'Events';
  String get currencyLabel => ar ? 'ج.م' : 'EGP';
  String get cancel => ar ? 'إلغاء' : 'Cancel';
  String get confirm => ar ? 'تأكيد' : 'Confirm';
  String get close => ar ? 'إغلاق' : 'Close';
  String get done => ar ? 'تم' : 'Done';
  String get overdue => ar ? 'متأخر' : 'Overdue';
}

TextTheme _plexTextTheme(TextTheme base) => base.apply(
      fontFamily: appFontFamily,
      bodyColor: appInk,
      displayColor: appInk,
    );

ThemeData buildTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: appNavy,
        brightness: Brightness.light,
      ).copyWith(
        primary: appNavy,
        secondary: appPurple,
        onPrimary: Colors.white,
        surface: appSurface,
        error: appDanger,
      );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  return base.copyWith(
    // Native-feeling transitions: iOS slide (mirrors in RTL automatically),
    // Android fade-forward instead of the abrupt default.
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
    scaffoldBackgroundColor: appSurface,
    textTheme: _plexTextTheme(base.textTheme),
    appBarTheme: const AppBarTheme(
      backgroundColor: appSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      foregroundColor: appInk,
      titleTextStyle: TextStyle(
        fontFamily: appFontFamily,
        fontWeight: FontWeight.w700,
        fontSize: 18,
        color: appInk,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      hintStyle: const TextStyle(color: appGrey, fontWeight: FontWeight.w400),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: appCardBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: appCardBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: appNavy, width: 1.4),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: appCardBorder, width: 1),
      ),
    ),
    dividerTheme: const DividerThemeData(color: appCardBorder, thickness: 1),
  );
}

class AppError extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const AppError({super.key, required this.message, this.onRetry});
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.cloud_off_outlined, size: 42, color: appGrey),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          if (onRetry != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(
              onPressed: onRetry,
              child: Text(AppLabels(Localizations.localeOf(context)).retry),
            ),
          ],
        ],
      ),
    ),
  );
}

/// Domain-specific empty state: what the emptiness means + a CTA only when
/// it is actionable (blueprint bans the generic "no data yet").
class EmptyState extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? ctaLabel;
  final VoidCallback? onCta;
  const EmptyState({
    super.key,
    required this.title,
    this.icon = Icons.inbox_outlined,
    this.ctaLabel,
    this.onCta,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: const BoxDecoration(
            color: appNavyBg,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 32, color: appNavy.withAlpha(190)),
        ),
        const SizedBox(height: 14),
        Text(
          title,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: appGrey,
                fontWeight: FontWeight.w500,
              ),
        ),
        if (ctaLabel != null && onCta != null) ...[
          const SizedBox(height: 16),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: appNavy),
            onPressed: onCta,
            child: Text(ctaLabel!),
          ),
        ],
      ],
    ),
  );
}

class SectionTitle extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionTitle({super.key, required this.title, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10, top: 4),
    child: Row(
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: appInk,
              ),
        ),
        const Spacer(),
        ?trailing,
      ],
    ),
  );
}
