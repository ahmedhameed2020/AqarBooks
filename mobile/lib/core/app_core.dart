import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const appNavy = Color(0xFF0B1F3A);
const appBlue = Color(0xFF1769E0);
const appInk = Color(0xFF17243A);

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
      ar ? 'إدارة عقارك، من مكان واحد.' : 'Your property, in one calm place.';
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
}

ThemeData buildTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: appBlue,
        brightness: Brightness.light,
      ).copyWith(
        primary: appBlue,
        onPrimary: Colors.white,
        surface: const Color(0xFFF7F9FC),
      );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    fontFamily: 'Arial',
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      foregroundColor: appInk,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE1E7F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: appBlue, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFFE8ECF2)),
      ),
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
    padding: const EdgeInsets.only(bottom: 12),
    child: Row(
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium
              ?.copyWith(fontWeight: FontWeight.w800, color: appInk),
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
    this.color = appBlue,
  });
  @override
  Widget build(BuildContext context) => Expanded(
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withAlpha(22),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(height: 14),
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge
                  ?.copyWith(fontWeight: FontWeight.w800, color: appInk),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(color: Colors.blueGrey),
            ),
          ],
        ),
      ),
    ),
  );
}
