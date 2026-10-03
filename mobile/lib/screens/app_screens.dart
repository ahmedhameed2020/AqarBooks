import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_core.dart';
import '../data/repository.dart';
import '../widgets/aqar_icons.dart';
import '../widgets/ui_kit.dart';
import 'collector_screens.dart';
import 'feature_screens.dart';
import 'gate_screens.dart';
import 'manager_screens.dart';
import 'resident_screens.dart';
import 'technician_screens.dart';

export 'collector_screens.dart';
export 'gate_screens.dart';
export 'manager_screens.dart';
export 'resident_screens.dart';
export 'technician_screens.dart';

/// Polite, end-user-safe configuration screen (the previous build printed
/// CLI commands to end users — removed per UX blueprint §8.13).
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
              SizedBox(
                width: 72,
                height: 75,
                child:
                    Image.asset('assets/images/logo.png', fit: BoxFit.contain),
              ),
              const SizedBox(height: 18),
              const Text(
                'AqarBooks',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: appNavy,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                t.configMessage,
                textAlign: TextAlign.center,
                style: const TextStyle(color: appGrey),
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
  Widget build(BuildContext context) => const Scaffold(
        body: SafeArea(child: SkeletonList(rows: 5)),
      );
}

// ───────────────────────── 01 · Login ─────────────────────────

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginState();
}

class _LoginState extends ConsumerState<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  bool obscure = true;
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
      if (mounted) showFeedback(context, t.resetRequested);
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
      backgroundColor: appSurface,
      body: SafeArea(
        child: Column(
          children: [
            // Language chip — top corner, navy pill.
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Align(
                alignment: AlignmentDirectional.centerEnd,
                child: InkWell(
                  key: const ValueKey('login-language-toggle'),
                  borderRadius: BorderRadius.circular(16),
                  onTap: () {
                    final current = ref.read(localeProvider);
                    final next = current.languageCode == 'ar'
                        ? const Locale('en')
                        : const Locale('ar');
                    ref.read(localeProvider.notifier).state = next;
                    persistLocale(next);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: appNavy,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      t.ar ? 'العربية | EN' : 'EN | العربية',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 20, vertical: 16),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: Column(
                      children: [
                        SizedBox(
                          width: 108,
                          height: 112,
                          child: Image.asset('assets/images/logo.png',
                              fit: BoxFit.contain),
                        ),
                        const SizedBox(height: 14),
                        // Brand rule: always Latin "AqarBooks".
                        const Text(
                          'AqarBooks',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w600,
                            color: appNavy,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 26),
                        // Gold hairline form card.
                        AqarCard(
                          gold: true,
                          padding: const EdgeInsets.all(20),
                          child: Column(
                            children: [
                              TextField(
                                controller: email,
                                keyboardType: TextInputType.emailAddress,
                                decoration: InputDecoration(
                                  hintText: t.email,
                                  suffixIcon: const Padding(
                                    padding: EdgeInsets.all(12),
                                    child: AqarIcon(AqarIconType.mail,
                                        size: 20),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 14),
                              TextField(
                                controller: password,
                                obscureText: obscure,
                                onSubmitted: (_) => submit(),
                                decoration: InputDecoration(
                                  hintText: t.password,
                                  suffixIcon: InkWell(
                                    onTap: () =>
                                        setState(() => obscure = !obscure),
                                    child: const Padding(
                                      padding: EdgeInsets.all(12),
                                      child: AqarIcon(AqarIconType.eye,
                                          size: 20),
                                    ),
                                  ),
                                ),
                              ),
                              if (error != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 12),
                                  child: Row(
                                    children: [
                                      const AqarIcon(AqarIconType.warning,
                                          size: 15, color: appDanger),
                                      const SizedBox(width: 6),
                                      Expanded(
                                        child: Text(
                                          error!,
                                          style: const TextStyle(
                                            color: appDanger,
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              const SizedBox(height: 16),
                              AqarButton(
                                t.signIn,
                                busy: busy,
                                onPressed: submit,
                              ),
                              const SizedBox(height: 10),
                              TextButton(
                                onPressed: busy ? null : reset,
                                child: Text(
                                  t.resetPassword,
                                  style: const TextStyle(
                                    color: appGold,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    decoration: TextDecoration.underline,
                                    decorationColor: appGold,
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
          ],
        ),
      ),
    );
  }
}

// ───────────────────────── App shell — 5 personas ─────────────────────────

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
    final persona = widget.session.persona;

    // Gate operator must enroll the device before anything else.
    if (persona == Persona.gate) {
      final enrolled = ref.watch(gateEnrolledProvider);
      return enrolled.when(
        data: (ok) =>
            ok ? _buildShell(context, t, persona) : const GateActivationScreen(),
        loading: () => const LoadingScreen(),
        error: (_, __) => const GateActivationScreen(),
      );
    }
    return _buildShell(context, t, persona);
  }

  Widget _buildShell(BuildContext context, AppLabels t, Persona persona) {
    final (tabs, items, dark, centerIndex) = switch (persona) {
      Persona.manager => (
          <Widget>[
            ManagerHomeScreen(session: widget.session),
            const ManagerCollectionsScreen(),
            const ManagerMaintenanceScreen(),
            const ManagerOperationsScreen(),
            MoreHubScreen(session: widget.session),
          ],
          [
            AqarNavItem(t.home, AqarIconType.home),
            AqarNavItem(t.collections, AqarIconType.cash),
            AqarNavItem(t.maintenance, AqarIconType.wrench),
            AqarNavItem(t.operations, AqarIconType.gear),
            AqarNavItem(t.more, AqarIconType.more),
          ],
          false,
          null,
        ),
      Persona.collector => (
          <Widget>[
            CollectorTodayScreen(session: widget.session),
            const CollectSearchScreen(),
            const SizedBox.shrink(), // center action pushes the flow
            const ReceiptsScreen(),
            MoreHubScreen(session: widget.session),
          ],
          [
            AqarNavItem(t.today, AqarIconType.sun),
            AqarNavItem(t.search, AqarIconType.search),
            AqarNavItem(t.collect, AqarIconType.cash),
            AqarNavItem(t.receipts, AqarIconType.receipt),
            AqarNavItem(t.more, AqarIconType.more),
          ],
          false,
          2,
        ),
      Persona.technician => (
          <Widget>[
            TechnicianTodayScreen(session: widget.session),
            const TechnicianTasksScreen(),
            const TechnicianTasksScreen(history: true),
            const NotificationsScreen(embedded: true),
            ProfileScreen(session: widget.session),
          ],
          [
            AqarNavItem(t.today, AqarIconType.sun),
            AqarNavItem(t.myTasks, AqarIconType.tasks),
            AqarNavItem(t.history, AqarIconType.historyClock),
            AqarNavItem(t.notifications, AqarIconType.bell),
            AqarNavItem(t.profile, AqarIconType.user),
          ],
          false,
          null,
        ),
      Persona.gate => (
          <Widget>[
            GateScanScreen(session: widget.session),
            const GateVisitorsScreen(),
            const GateInsideScreen(),
            const GateEventsScreen(),
            MoreHubScreen(session: widget.session, dark: true),
          ],
          [
            AqarNavItem(t.gateScan, AqarIconType.qr),
            AqarNavItem(t.visitors, AqarIconType.people),
            AqarNavItem(t.currentVisitors, AqarIconType.inside),
            AqarNavItem(t.events, AqarIconType.calendar),
            AqarNavItem(t.more, AqarIconType.more),
          ],
          true,
          null,
        ),
      Persona.resident => (
          <Widget>[
            ResidentHomeScreen(session: widget.session),
            const UnitsScreen(),
            const PaymentsTabScreen(),
            MaintenanceListScreen(session: widget.session),
            MoreHubScreen(session: widget.session),
          ],
          [
            AqarNavItem(t.home, AqarIconType.home),
            AqarNavItem(t.units, AqarIconType.building),
            AqarNavItem(t.payments, AqarIconType.wallet),
            AqarNavItem(t.maintenance, AqarIconType.wrench),
            AqarNavItem(t.more, AqarIconType.more),
          ],
          false,
          null,
        ),
    };
    final safeIndex = index < tabs.length ? index : 0;
    return PopScope<void>(
      canPop: safeIndex == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && safeIndex != 0 && mounted) {
          setState(() => index = 0);
        }
      },
      child: Scaffold(
        backgroundColor: dark ? gateDark : appSurface,
        body: SafeArea(child: IndexedStack(index: safeIndex, children: tabs)),
        bottomNavigationBar: AqarBottomNav(
          items: items,
          index: safeIndex,
          dark: dark,
          centerIndex: centerIndex,
          onTap: (v) {
            if (centerIndex == v) {
              startCollectFlow(context);
              return;
            }
            setState(() => index = v);
          },
        ),
      ),
    );
  }
}

// ───────────────────────── More hub (per persona) ─────────────────────────

class MoreHubScreen extends ConsumerWidget {
  final AppSession session;
  final bool dark;
  const MoreHubScreen({super.key, required this.session, this.dark = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final persona = session.persona;
    final resident = persona == Persona.resident;
    final rows = <Widget>[
      // Resident-only destinations (owner-backed features).
      if (resident) ...[
        _row(context, AqarIconType.people, t.visitors,
            () => _push(context, const VisitorsScreen())),
        _row(context, AqarIconType.gate, t.vehicles,
            () => _push(context, const VehiclesScreen())),
      ],
      // Notifications never duplicates a tab (blueprint rule).
      if (persona != Persona.technician)
        _row(context, AqarIconType.bell, t.notifications,
            () => _push(context, const NotificationsScreen())),
      if (persona != Persona.technician)
        _row(context, AqarIconType.user, t.profile,
            () => _push(context, ProfileScreen(session: session, push: true))),
      if (persona == Persona.manager)
        _row(
          context,
          AqarIconType.document,
          t.ar ? 'المهام المكتبية على الويب' : 'Back-office tasks on the web',
          () => showFeedback(
            context,
            t.ar
                ? 'القيود والتقارير والإعدادات تُدار من AqarBooks على الويب'
                : 'Journals, reports and settings are managed in AqarBooks on the web',
          ),
        ),
    ];
    final content = ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          t.more,
          style: TextStyle(
            fontSize: 19,
            fontWeight: FontWeight.w700,
            color: dark ? Colors.white : appInk,
          ),
        ),
        const SizedBox(height: 12),
        ...rows,
      ],
    );
    return dark ? Container(color: gateDark, child: content) : content;
  }

  void _push(BuildContext context, Widget screen) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  Widget _row(
    BuildContext context,
    AqarIconType icon,
    String label,
    VoidCallback onTap,
  ) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: dark
            ? InkWell(
                onTap: onTap,
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 13),
                  decoration: BoxDecoration(
                    color: gatePanel,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: gatePanelBorder),
                  ),
                  child: Row(
                    children: [
                      AqarIcon(icon, size: 20, color: Colors.white),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          label,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const AqarIcon(AqarIconType.chevron,
                          size: 16, color: gateMuted),
                    ],
                  ),
                ),
              )
            : ListRowCard(icon: icon, title: label, onTap: onTap),
      );
}

// ───────────────────────── Profile ─────────────────────────

class ProfileScreen extends ConsumerWidget {
  final AppSession session;
  final bool push;
  const ProfileScreen({super.key, required this.session, this.push = false});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = AppLabels(Localizations.localeOf(context));
    final email = session.user.email ?? '—';
    final personaTitle = switch (session.persona) {
      Persona.manager => t.ar ? 'مدير التشغيل' : 'Operations manager',
      Persona.collector =>
        session.can('cashier.sessions.open')
            ? (t.ar ? 'أمين خزينة' : 'Cashier')
            : (t.ar ? 'محصّل' : 'Collector'),
      Persona.technician => t.ar ? 'فني صيانة' : 'Maintenance technician',
      Persona.gate => t.ar ? 'مشغّل بوابة' : 'Gate operator',
      Persona.resident => t.ar ? 'مالك / ساكن' : 'Owner / resident',
    };
    final body = ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (!push)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              t.profile,
              style: const TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w700,
                color: appInk,
              ),
            ),
          ),
        AqarCard(
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: const BoxDecoration(
                  color: appNavy,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    email.substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      email,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: appInk,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${session.organizationName ?? 'AqarBooks'} · $personaTitle',
                      style: const TextStyle(fontSize: 12, color: appGrey),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        ListRowCard(
          icon: AqarIconType.language,
          title: t.ar ? 'لغة التطبيق' : 'App language',
          subtitle: t.ar ? 'العربية (مصر)' : 'English',
          trailing: StatusChip(
            t.ar ? 'English' : 'العربية',
            fg: appNavy,
            bg: appNavyBg,
            fontSize: 12,
          ),
          onTap: () {
            final next =
                t.ar ? const Locale('en') : const Locale('ar');
            ref.read(localeProvider.notifier).state = next;
            persistLocale(next);
          },
        ),
        const SizedBox(height: 10),
        AqarCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          onTap: () async {
            final confirmed = await confirmDestructive(
              context,
              title: t.signOut,
              message: t.ar
                  ? 'هل تريد تسجيل الخروج من هذا الجهاز؟'
                  : 'Sign out of this device?',
              confirmLabel: t.signOut,
            );
            if (!confirmed) return;
            await ref.read(repositoryProvider).signOut();
            ref.invalidate(sessionProvider);
          },
          child: Row(
            children: [
              const IconBadge(AqarIconType.logout,
                  fg: appDanger, bg: appDangerBg),
              const SizedBox(width: 10),
              Text(
                t.signOut,
                style: const TextStyle(
                  color: appDanger,
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
    return push
        ? Scaffold(
            body: SafeArea(
              child: Column(
                children: [
                  ScreenHeader(title: t.profile),
                  Expanded(child: body),
                ],
              ),
            ),
          )
        : body;
  }
}
