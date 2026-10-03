import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_core.dart';
import '../data/repository.dart';
import 'feature_screens.dart';

class ConfigScreen extends StatelessWidget {
  const ConfigScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 48, color: appBlue),
              const SizedBox(height: 18),
              Text(
                'AqarBooks Mobile',
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 10),
              Text(t.configMessage, textAlign: TextAlign.center),
              const SizedBox(height: 18),
              const SelectableText(
                'flutter run --dart-define=SUPABASE_URL=https://your-project.supabase.co --dart-define=SUPABASE_ANON_KEY=your_publishable_key',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.blueGrey),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LoadingScreen extends StatelessWidget {
  const LoadingScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(t.loading),
          ],
        ),
      ),
    );
  }
}

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;
  Future<void> submit() async {
    final t = AppLabels(Localizations.localeOf(context));
    if (email.text.trim().isEmpty || password.text.isEmpty) {
      setState(() => error = t.emailAndPasswordRequired);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await ref.read(repositoryProvider).signIn(email.text, password.text);
      ref.invalidate(sessionProvider);
    } catch (_) {
      if (mounted) setState(() => error = t.signInFailed);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> reset() async {
    final t = AppLabels(Localizations.localeOf(context));
    if (email.text.trim().isEmpty) {
      setState(() => error = t.emailRequired);
      return;
    }
    try {
      await ref.read(repositoryProvider).resetPassword(email.text);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(t.resetRequested)));
      }
    } catch (_) {
      if (mounted) setState(() => error = t.resetFailed);
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Background ambient soft luxury glow
          Positioned(
            top: -120,
            right: t.ar ? -120 : null,
            left: t.ar ? null : -120,
            child: Container(
              width: 380,
              height: 380,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    appPurpleLight.withAlpha(120),
                    const Color(0xFFF1F5F9).withAlpha(50),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            bottom: -150,
            left: t.ar ? -100 : null,
            right: t.ar ? null : -100,
            child: Container(
              width: 420,
              height: 420,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFFE2E8F0).withAlpha(100),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 36),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(32),
                      border: Border.all(
                        color: appCardBorder,
                        width: 1.2,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF0F172A).withAlpha(15),
                          blurRadius: 36,
                          offset: const Offset(0, 14),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Container(
                              width: 64,
                              height: 64,
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: appCardBorder),
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF07425D).withAlpha(18),
                                    blurRadius: 16,
                                    offset: const Offset(0, 6),
                                  ),
                                ],
                              ),
                              child: Image.asset(
                                'assets/images/logo.png',
                                fit: BoxFit.contain,
                              ),
                            ),
                            Container(
                              decoration: BoxDecoration(
                                color: appSurface,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(
                                  color: appCardBorder,
                                ),
                              ),
                              child: TextButton.icon(
                                key: const ValueKey('login-language-toggle'),
                                onPressed: () {
                                  final current = ref.read(localeProvider);
                                  ref.read(localeProvider.notifier).state =
                                      current.languageCode == 'ar'
                                          ? const Locale('en')
                                          : const Locale('ar');
                                },
                                style: TextButton.styleFrom(
                                  foregroundColor: appNavy,
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 8,
                                  ),
                                ),
                                icon: const Icon(Icons.language_rounded, size: 18, color: appPurple),
                                label: Text(
                                  t.ar ? 'English' : 'العربية',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 28),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: appPurpleLight,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                t.ar ? 'عقار بوكس مصر' : 'AQARBOOKS EGYPT',
                                style: const TextStyle(
                                  color: appPurple,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          t.welcome,
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(
                                fontWeight: FontWeight.w900,
                                color: appNavy,
                                letterSpacing: -0.6,
                              ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          t.signInSubtitle,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(
                                color: const Color(0xFF64748B),
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                        ),
                        const SizedBox(height: 28),
                        Text(
                          t.email,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: appNavy,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: email,
                          style: const TextStyle(color: appInk, fontWeight: FontWeight.w600),
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            hintText: 'name@example.com',
                            hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
                            prefixIcon: const Icon(
                              Icons.mail_outline_rounded,
                              color: Color(0xFF64748B),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: appCardBorder,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: appNavy,
                                width: 1.8,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 18),
                        Text(
                          t.password,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: appNavy,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: password,
                          obscureText: true,
                          style: const TextStyle(color: appInk, fontWeight: FontWeight.w600),
                          onSubmitted: (_) => submit(),
                          decoration: InputDecoration(
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            prefixIcon: const Icon(
                              Icons.lock_outline_rounded,
                              color: Color(0xFF64748B),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: appCardBorder,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(16),
                              borderSide: const BorderSide(
                                color: appNavy,
                                width: 1.8,
                              ),
                            ),
                          ),
                        ),
                        if (error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 14),
                            child: Row(
                              children: [
                                const Icon(
                                  Icons.error_outline_rounded,
                                  color: Color(0xFFDC2626),
                                  size: 16,
                                ),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    error!,
                                    style: const TextStyle(
                                      color: Color(0xFFDC2626),
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        const SizedBox(height: 24),
                        Container(
                          width: double.infinity,
                          height: 54,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                Color(0xFF07425D),
                                Color(0xFF042434),
                              ],
                            ),
                            borderRadius: BorderRadius.circular(16),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF07425D).withAlpha(70),
                                blurRadius: 18,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
                          child: ElevatedButton(
                            onPressed: busy ? null : submit,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Colors.transparent,
                              shadowColor: Colors.transparent,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: busy
                                ? const SizedBox(
                                    height: 22,
                                    width: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.2,
                                      color: Colors.white,
                                    ),
                                  )
                                : Text(
                                    t.signIn,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 16,
                                    ),
                                  ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Align(
                          alignment: AlignmentDirectional.centerEnd,
                          child: TextButton(
                            onPressed: busy ? null : reset,
                            style: TextButton.styleFrom(
                              foregroundColor: appPurple,
                            ),
                            child: Text(
                              t.resetPassword,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Center(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                Icons.shield_outlined,
                                size: 14,
                                color: const Color(0xFF64748B),
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  t.ar
                                      ? 'جلسة محمية ومشفرة بمعايير مؤسسية'
                                      : 'Enterprise-grade encrypted authentication',
                                  style: const TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class MoreHubScreen extends StatelessWidget {
  final AppSession session;
  const MoreHubScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    final resident = !session.isStaff && !session.isManager;
    final items = <Widget>[
      if (resident) ...[
        ListTile(
          leading: const Icon(Icons.people_outline),
          title: Text(t.visitors),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const VisitorsScreen()),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.directions_car_outlined),
          title: Text(t.vehicles),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const VehiclesScreen()),
          ),
        ),
        ListTile(
          leading: const Icon(Icons.folder_outlined),
          title: Text(t.documents),
          onTap: () => _unsupported(context, t.documents),
        ),
      ],
      ListTile(
        leading: const Icon(Icons.notifications_none),
        title: Text(t.notifications),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => const NotificationsScreen()),
        ),
      ),
      ListTile(
        leading: const Icon(Icons.person_outline),
        title: Text(t.profile),
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => ProfileScreen(session: session)),
        ),
      ),
    ];
    return Scaffold(
      appBar: AppBar(title: Text(t.ar ? 'المزيد' : 'More')),
      body: ListView(padding: const EdgeInsets.all(16), children: items),
    );
  }
}

class ManagerMetricsScreen extends ConsumerWidget {
  final String title;
  final String section;
  const ManagerMetricsScreen({
    super.key,
    required this.title,
    required this.section,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ref
          .watch(managerProvider)
          .when(
            data: (s) {
              final rows = section == 'maintenance'
                  ? [
                      (
                        ar ? 'طلبات الصيانة المفتوحة' : 'Open maintenance',
                        '${s.openMaintenance}',
                        Icons.build_outlined,
                      ),
                      (
                        ar ? 'أوامر العمل المفتوحة' : 'Open work orders',
                        '${s.openWorkOrders}',
                        Icons.handyman_outlined,
                      ),
                    ]
                  : section == 'alerts'
                  ? [
                      (
                        ar ? 'التنبيهات غير المقروءة' : 'Unread alerts',
                        '${s.unreadAlerts}',
                        Icons.notifications_none,
                      ),
                      (
                        ar ? 'البوابة' : 'Gate activity',
                        ar ? 'غير متاح للموبايل' : 'Unavailable to mobile',
                        Icons.lock_outline,
                      ),
                    ]
                  : [
                      (
                        ar ? 'الإشغال' : 'Occupancy',
                        '${s.occupiedUnits}/${s.totalUnits}',
                        Icons.home_work_outlined,
                      ),
                      (
                        ar ? 'الزوار النشطون' : 'Active visitors',
                        '${s.activeVisitors}',
                        Icons.people_outline,
                      ),
                      (
                        ar ? 'التحصيلات' : 'Collections',
                        s.collections.toStringAsFixed(2),
                        Icons.payments_outlined,
                      ),
                    ];
              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  for (final row in rows)
                    Card(
                      child: ListTile(
                        leading: Icon(row.$3, color: appBlue),
                        title: Text(row.$1),
                        trailing: Text(row.$2.toString()),
                      ),
                    ),
                ],
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(managerProvider),
            ),
          ),
    );
  }
}

class HistoryScreen extends StatelessWidget {
  final AppSession session;
  const HistoryScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context) => WorkOrdersScreen(
    session: session,
    title: Localizations.localeOf(context).languageCode == 'ar'
        ? 'السجل'
        : 'History',
    history: true,
  );
}

class AppShell extends ConsumerStatefulWidget {
  final AppSession session;
  const AppShell({super.key, required this.session});
  @override
  ConsumerState<AppShell> createState() => _ShellState();
}

class _ShellState extends ConsumerState<AppShell> {
  int index = 0;
  @override
  Widget build(BuildContext context) {
    final t = AppLabels(Localizations.localeOf(context));
    final isStaff = widget.session.isStaff;
    final isManager = widget.session.isManager;
    final tabs = isManager
        ? <Widget>[
            const ManagerOverviewScreen(),
            const ManagerMetricsScreen(
              title: 'Operations',
              section: 'operations',
            ),
            const ManagerMetricsScreen(
              title: 'Maintenance',
              section: 'maintenance',
            ),
            const NotificationsScreen(),
            MoreHubScreen(session: widget.session),
          ]
        : isStaff
        ? <Widget>[
            HomeScreen(session: widget.session),
            WorkOrdersScreen(session: widget.session),
            HistoryScreen(session: widget.session),
            MoreHubScreen(session: widget.session),
          ]
        : <Widget>[
            HomeScreen(session: widget.session),
            const UnitsScreen(),
            const PaymentsScreen(),
            MaintenanceHubScreen(session: widget.session),
            MoreHubScreen(session: widget.session),
          ];
    final labels = isManager
        ? <String>['Overview', 'Operations', 'Maintenance', 'Alerts', 'More']
        : isStaff
        ? <String>[t.dashboard, t.workOrders, 'History', 'More']
        : <String>[t.dashboard, t.units, t.payments, t.maintenance, 'More'];
    final icons = isManager
        ? <IconData>[
            Icons.insights_outlined,
            Icons.settings_input_component_outlined,
            Icons.build_outlined,
            Icons.notifications_none,
            Icons.more_horiz,
          ]
        : isStaff
        ? <IconData>[
            Icons.grid_view_rounded,
            Icons.handyman_outlined,
            Icons.history,
            Icons.more_horiz,
          ]
        : <IconData>[
            Icons.grid_view_rounded,
            Icons.home_work_outlined,
            Icons.receipt_long_outlined,
            Icons.build_outlined,
            Icons.more_horiz,
          ];
    final safeIndex = index < tabs.length ? index : 0;
    if (safeIndex != index)
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => index = safeIndex);
      });
    return PopScope<void>(
      canPop: safeIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && safeIndex != 0 && mounted) {
          setState(() => index = 0);
        }
      },
      child: Scaffold(
        body: SafeArea(
          child: IndexedStack(index: safeIndex, children: tabs),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: safeIndex,
          onDestinationSelected: (v) => setState(() => index = v),
          destinations: [
            for (var i = 0; i < labels.length; i++)
              NavigationDestination(icon: Icon(icons[i]), label: labels[i]),
          ],
        ),
      ),
    );
  }
}

final homeProvider = FutureProvider.autoDispose<HomeSummary>(
  (ref) => ref.watch(repositoryProvider).homeSummary(),
);

class StaffHomeSummary extends ConsumerWidget {
  final AppSession session;
  const StaffHomeSummary({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    return Scaffold(
      appBar: AppBar(title: Text(ar ? 'لوحة التشغيل' : 'Operations home')),
      body: ref
          .watch(workOrdersProvider)
          .when(
            data: (items) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  session.organizationName ?? 'AqarBooks',
                  style: Theme.of(context).textTheme.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
                const SizedBox(height: 20),
                MetricCard(
                  label: ar ? 'أوامر العمل النشطة' : 'Active work orders',
                  value: '${items.length}',
                  icon: Icons.handyman_outlined,
                ),
                const SizedBox(height: 16),
                Text(
                  ar
                      ? 'افتح أوامر العمل من الشريط السفلي. لا تعرض هذه الصفحة أرصدة الملاك أو إجراءات المقيمين.'
                      : 'Open work orders from the navigation below. This surface does not expose owner balances or resident actions.',
                ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => AppError(
              message: ar ? 'تعذر التحميل' : 'Could not load',
              onRetry: () => ref.invalidate(workOrdersProvider),
            ),
          ),
    );
  }
}

class HomeScreen extends ConsumerWidget {
  final AppSession session;
  const HomeScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (session.isManager) return const ManagerOverviewScreen();
    if (session.isStaff) return StaffHomeSummary(session: session);
    final t = AppLabels(Localizations.localeOf(context));
    final summary = ref.watch(homeProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(homeProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 30),
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [appNavy, appNavyDark],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: appNavy.withAlpha(40),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(Icons.apartment_rounded, color: Colors.white, size: 24),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.dashboard,
                      style: const TextStyle(
                        color: appPurple,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      session.organizationName ?? 'AqarBooks',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(
                            fontWeight: FontWeight.w900,
                            color: appNavy,
                            letterSpacing: -0.3,
                          ),
                    ),
                  ],
                ),
              ),
              Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: appPurple.withAlpha(50), width: 1.5),
                ),
                child: CircleAvatar(
                  radius: 20,
                  backgroundColor: appPurpleLight,
                  child: Text(
                    (session.user.email ?? 'A').substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      color: appPurple,
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          summary.when(
            data: (s) => _summary(context, t, s),
            loading: () => const Padding(
              padding: EdgeInsets.all(36),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, _) => AppError(
              message: t.ar
                  ? 'تعذر تحميل ملخص الحساب.'
                  : 'Could not load account summary.',
              onRetry: () => ref.invalidate(homeProvider),
            ),
          ),
          const SizedBox(height: 26),
          if (!session.isStaff && !session.isManager) ...[
            SectionTitle(title: t.quickActions),
            _actionGrid(context, t, session),
          ],
          if (session.isManager) ...[
            const SizedBox(height: 24),
            SectionTitle(title: t.managerOverview),
            _infoCard(context, t.managerOverview, Icons.insights_outlined),
          ],
          if (session.isStaff) ...[
            const SizedBox(height: 24),
            SectionTitle(title: t.workOrders),
            _infoCard(
              context,
              t.workOrders,
              Icons.handyman_outlined,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => WorkOrdersScreen(session: session),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _summary(BuildContext context, AppLabels t, HomeSummary s) => Column(
    children: [
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF07425D),
              Color(0xFF052B3D),
              Color(0xFF031A26),
            ],
          ),
          borderRadius: BorderRadius.circular(26),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF07425D).withAlpha(80),
              blurRadius: 28,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: Stack(
          children: [
            Positioned(
              top: -30,
              right: t.ar ? null : -30,
              left: t.ar ? -30 : null,
              child: Container(
                width: 140,
                height: 140,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: appPurple.withAlpha(35),
                ),
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF34D399),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          t.openBalance,
                          style: const TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withAlpha(25),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        t.currencyLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      s.balance.toStringAsFixed(2),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      t.currencyLabel,
                      style: TextStyle(
                        color: Colors.white.withAlpha(190),
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withAlpha(40),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        s.balance > 0 ? Icons.info_outline : Icons.check_circle_outline,
                        size: 14,
                        color: s.balance > 0 ? const Color(0xFFFDE047) : const Color(0xFF86EFAC),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        s.balance > 0
                            ? (t.ar ? 'راجع تفاصيل المستحقات للسداد' : 'Review your open dues')
                            : (t.ar ? 'حسابك محدث بالكامل ولا توجد متأخرات' : 'Your account is up to date'),
                        style: const TextStyle(
                          color: Color(0xFFE2E8F0),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      Row(
        children: [
          MetricCard(
            label: t.activeUnits,
            value: '${s.units}',
            icon: Icons.home_work_outlined,
            color: appNavy,
          ),
          const SizedBox(width: 10),
          MetricCard(
            label: t.maintenance,
            value: '${s.openMaintenance}',
            icon: Icons.build_outlined,
            color: appPurple,
          ),
        ],
      ),
    ],
  );
  Widget _actionGrid(BuildContext context, AppLabels t, AppSession session) =>
      Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          _Action(
            icon: Icons.build_outlined,
            label: t.ar ? 'طلب صيانة' : 'Request maintenance',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => MaintenanceHubScreen(session: session),
              ),
            ),
          ),
          _Action(
            icon: Icons.person_add_alt_1_outlined,
            label: t.ar ? 'دعوة زائر' : 'Invite visitor',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const VisitorsScreen()),
            ),
          ),
          _Action(
            icon: Icons.account_balance_wallet_outlined,
            label: t.dues,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const DuesScreen()),
            ),
          ),
          _Action(
            icon: Icons.home_work_outlined,
            label: t.units,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const UnitsScreen()),
            ),
          ),
          _Action(
            icon: Icons.directions_car_outlined,
            label: t.vehicles,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const VehiclesScreen()),
            ),
          ),
          _Action(
            icon: Icons.folder_outlined,
            label: t.documents,
            onTap: () => _unsupported(context, t.documents),
          ),
          _Action(
            icon: Icons.notifications_none,
            label: t.notifications,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const NotificationsScreen()),
            ),
          ),
        ],
      );
  Widget _infoCard(
    BuildContext context,
    String title,
    IconData icon, {
    VoidCallback? onTap,
  }) => Card(
    child: ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xFFE8F0FF),
        child: Icon(icon, color: appBlue),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: const Text(
        'Available according to your effective capabilities.',
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap ?? () => _unsupported(context, title),
    ),
  );
}

void _unsupported(BuildContext context, String name) => showModalBottomSheet(
  context: context,
  builder: (_) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.info_outline, size: 34, color: appBlue),
        const SizedBox(height: 12),
        Text(
          name,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          AppLabels(Localizations.localeOf(context)).unavailable,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 12),
      ],
    ),
  ),
);

class _Action extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _Action({required this.icon, required this.label, required this.onTap});
  @override
  Widget build(BuildContext context) => SizedBox(
    width: (MediaQuery.sizeOf(context).width - 62) / 3,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: appCardBorder),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0F172A).withAlpha(8),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: appPurpleLight,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: appPurple, size: 22),
            ),
            const SizedBox(height: 10),
            Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: appNavy,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

final maintenanceProvider = FutureProvider.autoDispose<List<MaintenanceItem>>(
  (ref) => ref.watch(repositoryProvider).maintenance(),
);

class MaintenanceScreen extends ConsumerWidget {
  final AppSession session;
  const MaintenanceScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _AsyncList<MaintenanceItem>(
        title: AppLabels(Localizations.localeOf(context)).maintenance,
        provider: maintenanceProvider,
        icon: Icons.build_outlined,
        empty: AppLabels(Localizations.localeOf(context)).noData,
        item: (m) => ListTile(
          leading: const CircleAvatar(child: Icon(Icons.build_outlined)),
          title: Text(
            m.title,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          subtitle: Text('${m.requestNo} · ${m.unitCode}'),
          trailing: _Status(m.status),
        ),
      );
}

final paymentsProvider = FutureProvider.autoDispose<List<PaymentItem>>(
  (ref) => ref.watch(repositoryProvider).payments(),
);

class PaymentsScreen extends ConsumerWidget {
  const PaymentsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => _AsyncList<PaymentItem>(
    title: AppLabels(Localizations.localeOf(context)).payments,
    provider: paymentsProvider,
    icon: Icons.receipt_long_outlined,
    empty: AppLabels(Localizations.localeOf(context)).noData,
    item: (p) => ListTile(
      leading: const CircleAvatar(child: Icon(Icons.receipt_long_outlined)),
      title: Text(
        '${p.amount.toStringAsFixed(2)} EGP',
        style: const TextStyle(fontWeight: FontWeight.w800),
      ),
      subtitle: Text('${p.receipt} · ${p.date}'),
      trailing: Text(p.method),
      onTap: () => showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: Text(
            AppLabels(Localizations.localeOf(context)).ar
                ? 'تفاصيل السداد'
                : 'Payment details',
          ),
          content: Text(
            '${p.receipt}\n${p.date}\n${p.method}\n${p.amount.toStringAsFixed(2)} EGP',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                AppLabels(Localizations.localeOf(context)).ar
                    ? 'إغلاق'
                    : 'Close',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

final duesProvider = FutureProvider.autoDispose<List<DueItem>>(
  (ref) => ref.watch(repositoryProvider).dues(),
);

Future<void> _openDuesPortal(BuildContext context) async {
  final t = AppLabels(Localizations.localeOf(context));
  final uri = duesPortalUri(Localizations.localeOf(context));
  try {
    if (!isAllowedDuesPortalUri(uri) ||
        !await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      throw StateError('Dues portal could not be opened');
    }
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(t.browserOpenFailed)));
    }
  }
}

class DuesScreen extends ConsumerWidget {
  const DuesScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    return _AsyncList<DueItem>(
      title: t.dues,
      provider: duesProvider,
      icon: Icons.account_balance_wallet_outlined,
      empty: t.noData,
      header: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t.duesBrowserHint),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: () => _openDuesPortal(context),
              icon: const Icon(Icons.open_in_browser_outlined),
              label: Text(t.openDuesInBrowser),
            ),
          ],
        ),
      ),
      item: (d) => ListTile(
        leading: const CircleAvatar(child: Icon(Icons.schedule_outlined)),
        title: Text(
          d.description,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text('${d.unitCode ?? '—'} · ${d.dueDate}'),
        trailing: Text(
          '${d.outstanding.toStringAsFixed(2)} EGP',
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: Colors.red,
          ),
        ),
      ),
    );
  }
}

final unitsProvider = FutureProvider.autoDispose<List<UnitItem>>(
  (ref) => ref.watch(repositoryProvider).units(),
);

class UnitsScreen extends ConsumerWidget {
  const UnitsScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => _AsyncList<UnitItem>(
    title: AppLabels(Localizations.localeOf(context)).units,
    provider: unitsProvider,
    icon: Icons.home_work_outlined,
    empty: AppLabels(Localizations.localeOf(context)).noData,
    item: (u) => ListTile(
      leading: const CircleAvatar(child: Icon(Icons.home_work_outlined)),
      title: Text(u.code, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Text(
        '${u.type ?? 'Unit'} · ${u.leaseStatus ?? 'No lease'}\n${u.leaseStartsOn ?? '—'} → ${u.leaseEndsOn ?? '—'}',
      ),
      trailing: Text('${u.balance.toStringAsFixed(2)} EGP'),
    ),
  );
}

final workOrdersProvider = FutureProvider.autoDispose<List<WorkOrderItem>>(
  (ref) => ref.watch(repositoryProvider).workOrders(),
);
final historyWorkOrdersProvider =
    FutureProvider.autoDispose<List<WorkOrderItem>>(
      (ref) => ref.watch(repositoryProvider).workOrderHistory(),
    );

class WorkOrdersScreen extends ConsumerWidget {
  final AppSession session;
  final String? title;
  final bool history;
  const WorkOrdersScreen({
    super.key,
    required this.session,
    this.title,
    this.history = false,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      _AsyncList<WorkOrderItem>(
        title: title ?? AppLabels(Localizations.localeOf(context)).workOrders,
        provider: history ? historyWorkOrdersProvider : workOrdersProvider,
        icon: Icons.handyman_outlined,
        empty: AppLabels(Localizations.localeOf(context)).noData,
        item: (w) => ListTile(
          leading: const CircleAvatar(child: Icon(Icons.handyman_outlined)),
          title: Text(
            w.title,
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          subtitle: Text('${w.number} · ${w.unitCode}'),
          trailing: _Status(w.status),
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => WorkOrderDetailScreen(id: w.id)),
          ),
        ),
      );
}

class _AsyncList<T> extends ConsumerWidget {
  final String title, empty;
  final IconData icon;
  final AutoDisposeFutureProvider<List<T>> provider;
  final Widget Function(T) item;
  final Widget? header;
  const _AsyncList({
    required this.title,
    required this.provider,
    required this.item,
    required this.icon,
    required this.empty,
    this.header,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(provider);
    final content = data.when(
      data: (items) => items.isEmpty
          ? EmptyState(title: empty, icon: icon)
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(provider);
              },
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: items.length,
                separatorBuilder: (_, index) => const SizedBox(height: 8),
                itemBuilder: (_, i) => Card(child: item(items[i])),
              ),
            ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (_, _) => AppError(
        message: 'Could not load this list.',
        onRetry: () => ref.invalidate(provider),
      ),
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      ),
      body: header == null
          ? content
          : Column(
              children: [
                header!,
                Expanded(child: content),
              ],
            ),
    );
  }
}

class _Status extends StatelessWidget {
  final String value;
  const _Status(this.value);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
    decoration: BoxDecoration(
      color: appBlue.withAlpha(18),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      value,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        color: appBlue,
      ),
    ),
  );
}

class ProfileScreen extends ConsumerWidget {
  final AppSession session;
  const ProfileScreen({super.key, required this.session});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final email = session.user.email ?? '—';
    final org = session.organizationName ?? 'AqarBooks Egypt';
    final roleTitle = session.isManager
        ? (t.ar ? 'مدير العمليات والإدارة' : 'Operations Manager')
        : session.isStaff
        ? (t.ar ? 'فريق الصيانة الميدانية' : 'Field Operations')
        : (t.ar ? 'مالك / مقيم عقاري' : 'Property Resident / Owner');

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          t.profile,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w900, color: appNavy, letterSpacing: -0.5),
        ),
        const SizedBox(height: 18),
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [appNavy, appNavyDark],
            ),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: appNavy.withAlpha(50),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [appPurple, Color(0xFFA855F7)],
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: appPurple.withAlpha(70),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Center(
                  child: Text(
                    email.substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      email,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withAlpha(25),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        org,
                        style: const TextStyle(
                          color: Color(0xFFE2E8F0),
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      roleTitle,
                      style: const TextStyle(
                        color: Color(0xFFCBD5E1),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        SectionTitle(title: t.ar ? 'إعدادات الحساب' : 'Account Settings'),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: appPurpleLight,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.language, color: appPurple, size: 20),
                ),
                title: Text(
                  t.ar ? 'لغة التطبيق' : 'App Language',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: appNavy),
                ),
                subtitle: Text(t.ar ? 'العربية (مصر)' : 'English (US)'),
                trailing: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: appSurface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: appCardBorder),
                  ),
                  child: Text(
                    t.ar ? 'تغيير' : 'Change',
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: appPurple,
                    ),
                  ),
                ),
                onTap: () => ref.read(localeProvider.notifier).state = t.ar
                    ? const Locale('en')
                    : const Locale('ar'),
              ),
              const Divider(height: 1, indent: 16, endIndent: 16),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDCFCE7),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.verified_user_outlined, color: Color(0xFF166534), size: 20),
                ),
                title: Text(
                  t.ar ? 'حالة الأمان' : 'Security Status',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: appNavy),
                ),
                subtitle: Text(
                  t.ar ? 'حساب موثق وجلسة نشطة آمنة' : 'Verified session with enterprise protection',
                  style: const TextStyle(fontSize: 12),
                ),
                trailing: const Icon(Icons.check_circle, color: Color(0xFF166534), size: 18),
              ),
              const Divider(height: 1, indent: 16, endIndent: 16),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEE2E2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.logout_rounded, color: Color(0xFFDC2626), size: 20),
                ),
                title: Text(
                  t.signOut,
                  style: const TextStyle(
                    color: Color(0xFFDC2626),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                onTap: () async {
                  await ref.read(repositoryProvider).signOut();
                  ref.invalidate(sessionProvider);
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
