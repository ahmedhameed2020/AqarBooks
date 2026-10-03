import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// AqarBooks Mobile — Egypt Luxury V3 Palette
// Deep Teal / Navy primary with Royal Purple accent, Soft Cloud background, and White premium cards
const appNavy = Color(0xFF07425D); // Deep Teal / Navy
const appNavyDark = Color(0xFF042434);
const appBlue = Color(0xFF1B60B9); // Petrol Blue
const appPurple = Color(0xFF7E1898); // Royal Purple Accent
const appPurpleLight = Color(0xFFF3E8FF); // Soft Purple Tint
const appPurpleMuted = Color(0xFF9333EA);
const appGold = Color(0xFFC5A880);
const appInk = Color(0xFF0F172A); // High-contrast readable ink
const appSurface = Color(0xFFF4F6F9); // Soft cloud background
const appCardBorder = Color(0xFFE2E8F0); // Subtle elegant card border

class AppConfig {
  static const url = String.fromEnvironment('SUPABASE_URL');
  static const anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static bool get isReady =>
      url.startsWith('https://') &&
      anonKey.isNotEmpty &&
      !anonKey.contains('YOUR_');
}

const paymentPortalHost = 'app.aqarbooks.com';

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

final localeProvider = StateProvider<Locale>((ref) => const Locale('ar'));

final supabaseProvider = Provider<SupabaseClient?>((ref) {
  if (!AppConfig.isReady) return null;
  return Supabase.instance.client;
});

class AppLabels {
  final Locale locale;
  const AppLabels(this.locale);
  bool get ar => locale.languageCode == 'ar';
  String get appName => 'AqarBooks';
  String get welcome => ar ? 'أهلاً بك في عقار بوكس' : 'Welcome to AqarBooks';
  String get signInSubtitle =>
      ar ? 'إدارة عقارك في مصر، من مكان واحد.' : 'Your property in Egypt, in one calm place.';
  String get email => ar ? 'البريد الإلكتروني' : 'Email address';
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
      ? 'أضف SUPABASE_URL وSUPABASE_ANON_KEY عبر --dart-define قبل الاتصال.'
      : 'Configure SUPABASE_URL and SUPABASE_ANON_KEY with --dart-define before connecting this app.';
  String get loading => ar ? 'جارٍ التحميل…' : 'Loading…';
  String get signOut => ar ? 'تسجيل الخروج' : 'Sign out';
  String get retry => ar ? 'إعادة المحاولة' : 'Retry';
  String get unavailable =>
      ar ? 'هذه الوظيفة غير متاحة حالياً' : 'This feature is not available yet';
  String get noData => ar ? 'لا توجد بيانات بعد' : 'No data yet';
  String get dashboard => ar ? 'الرئيسية' : 'Home';
  String get maintenance => ar ? 'الصيانة' : 'Maintenance';
  String get payments => ar ? 'المدفوعات' : 'Payments';
  String get openDuesInBrowser =>
      ar ? 'فتح المستحقات في المتصفح' : 'View dues in browser';
  String get duesBrowserHint => ar
      ? 'سيتم فتح بوابة الويب لإتمام السداد. قد تحتاج إلى تسجيل الدخول مرة أخرى في المتصفح.'
      : 'The web portal will open for payment. You may need to sign in again in your browser.';
  String get browserOpenFailed => ar
      ? 'تعذر فتح بوابة المستحقات. حاول مرة أخرى.'
      : 'Could not open the dues portal. Please try again.';
  String get profile => ar ? 'حسابي' : 'Profile';
  String get dues => ar ? 'المستحقات' : 'Dues';
  String get units => ar ? 'الوحدات' : 'Units';
  String get visitors => ar ? 'الزوار' : 'Visitors';
  String get vehicles => ar ? 'المركبات' : 'Vehicles';
  String get documents => ar ? 'المستندات' : 'Documents';
  String get notifications => ar ? 'الإشعارات' : 'Notifications';
  String get workOrders => ar ? 'أوامر العمل' : 'Work orders';
  String get managerOverview => ar ? 'ملخص الإدارة' : 'Executive overview';
  String get quickActions => ar ? 'إجراءات سريعة' : 'Quick actions';
  String get openBalance => ar ? 'الرصيد المستحق' : 'Open balance';
  String get activeUnits => ar ? 'الوحدات النشطة' : 'Active units';
  String get recentActivity => ar ? 'آخر النشاطات' : 'Recent activity';
  String get currencyLabel => ar ? 'ج.م' : 'EGP';
}

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
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: appSurface,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      foregroundColor: appInk,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: appCardBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: appCardBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: appNavy, width: 1.6),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: appCardBorder, width: 1),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      elevation: 4,
      indicatorColor: appPurpleLight,
      iconTheme: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const IconThemeData(color: appPurple);
        }
        return const IconThemeData(color: Color(0xFF64748B));
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: appPurple,
          );
        }
        return const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: Color(0xFF64748B),
        );
      }),
    ),
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
          const Icon(
            Icons.cloud_off_outlined,
            size: 42,
            color: Colors.blueGrey,
          ),
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

class EmptyState extends StatelessWidget {
  final String title;
  final IconData icon;
  const EmptyState({
    super.key,
    required this.title,
    this.icon = Icons.inbox_outlined,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 36),
    child: Column(
      children: [
        Icon(icon, size: 38, color: Colors.blueGrey.shade300),
        const SizedBox(height: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.bodyLarge
              ?.copyWith(color: Colors.blueGrey),
        ),
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
    padding: const EdgeInsets.only(bottom: 14, top: 4),
    child: Row(
      children: [
        Container(
          width: 4,
          height: 18,
          decoration: BoxDecoration(
            color: appPurple,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w900, color: appNavy, letterSpacing: -0.2),
        ),
        const Spacer(),
        if (trailing != null) ...[trailing!],
      ],
    ),
  );
}

class MetricCard extends StatelessWidget {
  final String label, value;
  final IconData icon;
  final Color color;
  const MetricCard({
    super.key,
    required this.label,
    required this.value,
    required this.icon,
    this.color = appNavy,
  });
  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: appCardBorder),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withAlpha(8),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: color.withAlpha(20),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: color),
            ),
            const SizedBox(height: 14),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w900, color: appNavy, letterSpacing: -0.3),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: const Color(0xFF64748B), fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    ),
  );
}
