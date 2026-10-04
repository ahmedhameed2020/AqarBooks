import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart'
    show AuthWeakPasswordException;

import '../core/app_core.dart';
import '../core/owner_auth.dart';
import '../data/biometric_lock.dart';
import '../data/portal_access.dart';
import '../data/repository.dart';
import '../widgets/ui_kit.dart';

// ───────────────────────── shared helpers ─────────────────────────

String? currentUserIdOf(WidgetRef ref) =>
    ref.read(authStateProvider).valueOrNull?.session?.user.id ??
    ref.read(repositoryProvider).currentUserId;

/// Marks the signed-in user as having proven themselves in this app run, so a
/// biometric lock enabled earlier does not ask again right after a password.
void trustCurrentUser(WidgetRef ref) {
  final uid = currentUserIdOf(ref);
  if (uid == null) return;
  final set = ref.read(unlockedUsersProvider);
  if (!set.contains(uid)) {
    ref.read(unlockedUsersProvider.notifier).state = {...set, uid};
  }
}

/// Signs out and removes everything tied to the user: the biometric flag and
/// the in-memory unlock. Works from a [ProviderContainer] so it stays valid
/// after the calling widget has been replaced by the login screen.
Future<void> performSignOut(ProviderContainer container) async {
  final repo = container.read(repositoryProvider);
  final uid = container.read(authStateProvider).valueOrNull?.session?.user.id ??
      repo.currentUserId;
  final store = container.read(biometricFlagStoreProvider);
  if (uid != null) {
    try {
      await store.clear(uid);
    } catch (_) {}
    final set = container.read(unlockedUsersProvider);
    if (set.contains(uid)) {
      container.read(unlockedUsersProvider.notifier).state = {
        for (final u in set)
          if (u != uid) u,
      };
    }
  }
  try {
    await repo.signOut();
  } catch (_) {}
  container.invalidate(sessionProvider);
  container.invalidate(portalAccessProvider);
}

const _contactAdminAr = 'يرجى التواصل مع إدارة المشروع.';

String suspendedMessage(bool ar) => ar
    ? 'تم إيقاف وصولك إلى البوابة. $_contactAdminAr'
    : 'Your portal access has been suspended. Please contact the project management.';

String clientIdResetMessage(bool ar) => ar
    ? 'لا توجد وسيلة استرجاع إلكترونية مفعلة لهذا الحساب. $_contactAdminAr'
    : 'No electronic recovery method is enabled for this account. Please contact the project management.';

String tempExpiredMessage(bool ar) => ar
    ? 'انتهت صلاحية كلمة المرور المؤقتة. تواصل مع إدارة المشروع لإصدار بيانات جديدة.'
    : 'Your temporary password has expired. Contact the project management to get new credentials.';

Widget _brandHeader() => Column(
      children: [
        SizedBox(
          width: 72,
          height: 75,
          child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
        ),
        const SizedBox(height: 10),
        const Text(
          'AqarBooks',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w600,
            color: appNavy,
          ),
        ),
        const SizedBox(height: 18),
      ],
    );

Widget _centered(Widget child) => Scaffold(
      backgroundColor: appSurface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: child,
            ),
          ),
        ),
      ),
    );

Widget _errorBox(String message) => Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: appDangerBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        message,
        key: const ValueKey('inline-error'),
        style: const TextStyle(color: appDanger, fontSize: 13),
      ),
    );

// ───────────────────────── biometric app lock gate ─────────────────────────

/// Requires a biometric check at cold start when the signed-in user enabled
/// the lock. Wraps everything that loads or shows data.
class AppLockGate extends ConsumerStatefulWidget {
  final String userId;
  final Widget child;
  const AppLockGate({super.key, required this.userId, required this.child});
  @override
  ConsumerState<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends ConsumerState<AppLockGate> {
  bool? _enabled;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    bool enabled;
    try {
      enabled = await ref.read(biometricFlagStoreProvider).isEnabled(
            widget.userId,
          );
    } catch (_) {
      enabled = false;
    }
    if (mounted) setState(() => _enabled = enabled);
  }

  @override
  Widget build(BuildContext context) {
    final unlocked = ref.watch(unlockedUsersProvider);
    final enabled = _enabled;
    if (enabled == null) {
      return const Scaffold(body: SafeArea(child: SkeletonList(rows: 5)));
    }
    if (enabled && !unlocked.contains(widget.userId)) {
      return LockScreen(userId: widget.userId);
    }
    return widget.child;
  }
}

class LockScreen extends ConsumerStatefulWidget {
  final String userId;
  const LockScreen({super.key, required this.userId});
  @override
  ConsumerState<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends ConsumerState<LockScreen> {
  bool _busy = false;
  bool _started = false;

  Future<void> _unlock() async {
    if (_busy) return;
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final auth = ref.read(biometricAuthenticatorProvider);
    final notifier = ref.read(unlockedUsersProvider.notifier);
    final current = ref.read(unlockedUsersProvider);
    setState(() => _busy = true);
    final ok = await auth.authenticate(
      ar ? 'افتح AqarBooks' : 'Unlock AqarBooks',
    );
    if (ok) {
      notifier.state = {...current, widget.userId};
      return;
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _unlock();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    return PopScope(
      canPop: false,
      child: _centered(
        Column(
          children: [
            _brandHeader(),
            const Icon(Icons.lock_outline, size: 44, color: appNavy),
            const SizedBox(height: 12),
            Text(
              ar ? 'التطبيق مقفل' : 'App locked',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              ar
                  ? 'استخدم البصمة أو بصمة الوجه لفتح التطبيق.'
                  : 'Use your fingerprint or face to unlock the app.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: appGrey),
            ),
            const SizedBox(height: 22),
            AqarButton(
              ar ? 'فتح' : 'Unlock',
              busy: _busy,
              onPressed: _unlock,
            ),
            const SizedBox(height: 10),
            AqarButton(
              ar ? 'تسجيل الخروج' : 'Sign out',
              secondary: true,
              onPressed: () =>
                  performSignOut(ProviderScope.containerOf(context)),
            ),
          ],
        ),
      ),
    );
  }
}

// ───────────────────────── portal access gate ─────────────────────────

/// After a session exists and before anything loads: asks the server what the
/// account may do. Suspended portal-only users and users who must still
/// finish first login never reach the portal; a failed check shows a retry
/// screen instead of falling through.
class PortalAccessGate extends ConsumerWidget {
  final Widget Function(BuildContext context, PortalAccess access) builder;
  const PortalAccessGate({super.key, required this.builder});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final access = ref.watch(portalAccessProvider);
    return access.when(
      loading: () => const Scaffold(body: SafeArea(child: SkeletonList(rows: 5))),
      error: (_, __) => Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Expanded(
                child: AppError(
                  message: ar
                      ? 'تعذر التحقق من حسابك — أعد المحاولة'
                      : 'Could not verify your account — try again',
                  onRetry: () => ref.invalidate(portalAccessProvider),
                ),
              ),
              TextButton(
                onPressed: () =>
                    performSignOut(ProviderScope.containerOf(context)),
                child: Text(ar ? 'تسجيل الخروج' : 'Sign out'),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
      data: (value) {
        if (value == null) {
          return const Scaffold(body: SafeArea(child: SkeletonList(rows: 5)));
        }
        if (value.blocksAccess) return const SuspendedScreen();
        if (value.requiresFirstLogin) return FirstLoginScreen(access: value);
        return builder(context, value);
      },
    );
  }
}

class SuspendedScreen extends StatelessWidget {
  const SuspendedScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    return PopScope(
      canPop: false,
      child: _centered(
        Column(
          children: [
            _brandHeader(),
            const Icon(Icons.block_outlined, size: 44, color: appDanger),
            const SizedBox(height: 14),
            Text(
              suspendedMessage(ar),
              key: const ValueKey('suspended-message'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, height: 1.5),
            ),
            const SizedBox(height: 24),
            Consumer(
              builder: (context, ref, _) => AqarButton(
                ar ? 'تسجيل الخروج' : 'Sign out',
                secondary: true,
                onPressed: () =>
                    performSignOut(ProviderScope.containerOf(context)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ───────────────────────── first login ─────────────────────────

class FirstLoginScreen extends ConsumerStatefulWidget {
  final PortalAccess access;
  const FirstLoginScreen({super.key, required this.access});
  @override
  ConsumerState<FirstLoginScreen> createState() => _FirstLoginState();
}

class _FirstLoginState extends ConsumerState<FirstLoginScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _phone = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  bool _biometric = false;
  bool _expired = false;
  String? _error;

  /// The password the server already holds. A retry after a failed second
  /// step must not call updateUser again with the same value (Auth rejects
  /// an unchanged password).
  String? _changedTo;

  @override
  void initState() {
    super.initState();
    _expired = widget.access.tempExpired;
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _fail(String message) {
    if (mounted) {
      setState(() {
        _error = message;
        _busy = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final issues = validateNewPassword(_password.text, _confirm.text);
    if (issues.isNotEmpty) {
      setState(() => _error = [
            for (final i in issues) passwordIssueText(i, ar: ar),
          ].join('\n'));
      return;
    }
    final phone = normalizeEgyptianPhone(_phone.text);
    if (phone == null) {
      setState(() => _error = _phoneInvalid(ar));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(repositoryProvider);
    final password = _password.text;
    if (_changedTo != password) {
      try {
        await repo.changePassword(password);
        _changedTo = password;
      } catch (e) {
        _fail(_changePasswordError(e, ar));
        return;
      }
    }
    final FirstLoginResult result;
    try {
      result = await repo.completeFirstLogin(phone);
    } catch (e) {
      _fail(friendlyError(e, Localizations.localeOf(context)));
      return;
    }
    if (!mounted) return;
    if (result.ok) {
      await _finish();
      return;
    }
    switch (result.reason) {
      case 'TEMP_EXPIRED':
        setState(() {
          _expired = true;
          _busy = false;
        });
      case 'SUSPENDED':
      case 'NOT_REQUIRED':
        // The server state changed under us: let the gate decide again.
        ref.invalidate(portalAccessProvider);
      case 'PASSWORD_NOT_CHANGED':
        _changedTo = null; // run updateUser again on the retry
        _fail(ar
            ? 'لم يتم تغيير كلمة المرور بعد. أعد المحاولة.'
            : 'Your password was not changed yet. Please try again.');
      case 'INVALID_PHONE':
        _fail(_phoneInvalid(ar));
      case 'NOT_AUTHENTICATED':
        _fail(ar
            ? 'انتهت الجلسة — سجّل الدخول مرة أخرى'
            : 'Session expired — sign in again');
      case 'NOT_FOUND':
        _fail(ar
            ? 'تعذر العثور على حسابك. $_contactAdminAr'
            : 'We could not find your account. Please contact the project management.');
      default:
        _fail(ar
            ? 'لم يكتمل الإجراء — أعد المحاولة'
            : 'Action did not complete — try again');
    }
  }

  Future<void> _finish() async {
    final uid = currentUserIdOf(ref);
    final container = ProviderScope.containerOf(context);
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    if (_biometric && uid != null) {
      final auth = container.read(biometricAuthenticatorProvider);
      final ok = await auth.authenticate(
        ar ? 'تفعيل الفتح بالبصمة' : 'Enable biometric unlock',
      );
      if (ok) {
        await container.read(biometricFlagStoreProvider).setEnabled(uid, true);
      }
    }
    if (uid != null) {
      final set = container.read(unlockedUsersProvider);
      container.read(unlockedUsersProvider.notifier).state = {...set, uid};
    }
    container.invalidate(portalAccessProvider);
    container.invalidate(sessionProvider);
  }

  String _phoneInvalid(bool ar) => ar
      ? 'أدخل رقم موبايل مصري صحيحًا (مثال: 01012345678).'
      : 'Enter a valid Egyptian mobile number (e.g. 01012345678).';

  String _changePasswordError(Object e, bool ar) {
    final text = e.toString().toLowerCase();
    if (text.contains('same_password') || text.contains('different from the old')) {
      return ar
          ? 'اختر كلمة مرور مختلفة عن كلمة المرور المؤقتة.'
          : 'Choose a password different from the temporary one.';
    }
    if (text.contains('weak_password') || e is AuthWeakPasswordException) {
      return ar
          ? 'كلمة المرور ضعيفة. استخدم ١٠ أحرف على الأقل بحروف وأرقام.'
          : 'That password is too weak. Use at least 10 characters with letters and digits.';
    }
    return friendlyError(e, Localizations.localeOf(context));
  }

  @override
  Widget build(BuildContext context) {
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    final supported = ref.watch(biometricSupportedProvider).valueOrNull ?? false;
    final hint = widget.access.phoneHint;
    Widget body;
    if (_expired) {
      body = Column(
        children: [
          _brandHeader(),
          const Icon(Icons.timer_off_outlined, size: 44, color: appAmber),
          const SizedBox(height: 14),
          Text(
            tempExpiredMessage(ar),
            key: const ValueKey('temp-expired-message'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, height: 1.5),
          ),
          const SizedBox(height: 24),
          AqarButton(
            ar ? 'تسجيل الخروج' : 'Sign out',
            secondary: true,
            onPressed: () => performSignOut(ProviderScope.containerOf(context)),
          ),
        ],
      );
    } else {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _brandHeader(),
          Text(
            ar ? 'أكمل إعداد حسابك' : 'Finish setting up your account',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            ar
                ? 'اختر كلمة مرور جديدة وأكّد رقم موبايلك للمتابعة.'
                : 'Choose a new password and confirm your mobile number to continue.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: appGrey),
          ),
          const SizedBox(height: 18),
          AqarCard(
            gold: true,
            padding: const EdgeInsets.all(18),
            child: AutofillGroup(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_error != null) _errorBox(_error!),
                  TextField(
                    key: const ValueKey('first-login-password'),
                    controller: _password,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.newPassword],
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      hintText: ar ? 'كلمة المرور الجديدة' : 'New password',
                      suffixIcon: IconButton(
                        tooltip: _obscure
                            ? (ar ? 'إظهار كلمة المرور' : 'Show password')
                            : (ar ? 'إخفاء كلمة المرور' : 'Hide password'),
                        icon: Icon(_obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('first-login-confirm'),
                    controller: _confirm,
                    obscureText: _obscure,
                    autofillHints: const [AutofillHints.newPassword],
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      hintText: ar ? 'تأكيد كلمة المرور' : 'Confirm password',
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 12),
                    child: Text(
                      ar
                          ? '١٠ أحرف على الأقل، وتحتوي على حرف ورقم.'
                          : 'At least 10 characters, with a letter and a digit.',
                      style: const TextStyle(fontSize: 12, color: appGrey),
                    ),
                  ),
                  TextField(
                    key: const ValueKey('first-login-phone'),
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    autofillHints: const [AutofillHints.telephoneNumber],
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      hintText: ar
                          ? 'رقم الموبايل (01XXXXXXXXX)'
                          : 'Mobile number (01XXXXXXXXX)',
                    ),
                  ),
                  if (hint != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        ar
                            ? 'الرقم المسجل لدينا: $hint'
                            : 'Number on file: $hint',
                        key: const ValueKey('phone-hint'),
                        style: const TextStyle(fontSize: 12, color: appGrey),
                      ),
                    ),
                  if (supported) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            ar
                                ? 'فتح التطبيق بالبصمة'
                                : 'Unlock with biometrics',
                            style: const TextStyle(fontSize: 14),
                          ),
                        ),
                        Switch(
                          key: const ValueKey('first-login-biometric'),
                          value: _biometric,
                          onChanged: (v) => setState(() => _biometric = v),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          AqarButton(
            ar ? 'متابعة' : 'Continue',
            busy: _busy,
            onPressed: _submit,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _busy
                ? null
                : () => performSignOut(ProviderScope.containerOf(context)),
            child: Text(ar ? 'تسجيل الخروج' : 'Sign out'),
          ),
        ],
      );
    }
    // Not skippable: shown by the gate (nothing underneath to go back to) and
    // the system back button is swallowed.
    return PopScope(canPop: false, child: _centered(body));
  }
}

// ───────────────────────── activation deep links ─────────────────────────

abstract class ActivationLinkSource {
  Future<Uri?> initialLink();
  Stream<Uri> get links;
}

final activationLinkSourceProvider = Provider<ActivationLinkSource?>(
  (ref) => null,
);

/// Opens the activation screen over everything for cold-start and warm links.
/// The token only ever lives inside the pushed route; it is never logged.
class ActivationLinkHandler extends ConsumerStatefulWidget {
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;
  const ActivationLinkHandler({
    super.key,
    required this.navigatorKey,
    required this.child,
  });
  @override
  ConsumerState<ActivationLinkHandler> createState() => _LinkHandlerState();
}

class _LinkHandlerState extends ConsumerState<ActivationLinkHandler> {
  StreamSubscription<Uri>? _sub;
  String? _openToken;

  @override
  void initState() {
    super.initState();
    final source = ref.read(activationLinkSourceProvider);
    if (source != null) _start(source);
  }

  Future<void> _start(ActivationLinkSource source) async {
    try {
      _sub = source.links.listen(_handle, onError: (_) {});
      final initial = await source.initialLink();
      if (initial != null) _handle(initial);
    } catch (_) {}
  }

  void _handle(Uri uri) {
    final token = parseActivationToken(uri);
    if (token == null || token == _openToken) return;
    _push(token, attempts: 0);
  }

  void _push(String token, {required int attempts}) {
    if (!mounted) return;
    final nav = widget.navigatorKey.currentState;
    if (nav == null) {
      if (attempts < 20) {
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _push(token, attempts: attempts + 1),
        );
      }
      return;
    }
    _openToken = token;
    nav
        .push(MaterialPageRoute<void>(
          builder: (_) => ActivationScreen(token: token),
        ))
        .whenComplete(() {
      if (_openToken == token) _openToken = null;
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

// ───────────────────────── activation screen ─────────────────────────

class ActivationScreen extends ConsumerStatefulWidget {
  final String token;
  const ActivationScreen({super.key, required this.token});
  @override
  ConsumerState<ActivationScreen> createState() => _ActivationState();
}

class _ActivationState extends ConsumerState<ActivationScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _existing = TextEditingController();
  ActivationInspection? _inspection;
  bool _loading = true;
  bool _loadFailed = false;
  bool _busy = false;
  bool _obscure = true;
  bool _existingMode = false;
  String? _error;

  /// Terminal state learned from the `complete` call (overrides the form).
  String? _terminal;

  @override
  void initState() {
    super.initState();
    _inspect();
  }

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    _existing.dispose();
    super.dispose();
  }

  Future<void> _inspect() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    try {
      final result = await ref.read(activationApiProvider).inspect(widget.token);
      if (!mounted) return;
      setState(() {
        _inspection = result;
        _existingMode = result.isValid && result.existingAccount;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadFailed = true;
        });
      }
    }
  }

  bool get _ar => Localizations.localeOf(context).languageCode == 'ar';

  void _fail(String message) {
    if (mounted) {
      setState(() {
        _error = message;
        _busy = false;
      });
    }
  }

  String _networkText() =>
      _ar ? 'تعذر الاتصال — أعد المحاولة' : 'Connection failed — try again';

  Future<void> _submit() async {
    if (_busy) return;
    final inspection = _inspection;
    if (inspection == null) return;
    final ar = _ar;
    if (!_existingMode) {
      final issues = validateNewPassword(_password.text, _confirm.text);
      if (issues.isNotEmpty) {
        setState(() => _error = [
              for (final i in issues) passwordIssueText(i, ar: ar),
            ].join('\n'));
        return;
      }
    } else if (_existing.text.isEmpty) {
      setState(() => _error = ar
          ? 'أدخل كلمة مرور حسابك الحالي.'
          : 'Enter your current account password.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final repo = ref.read(repositoryProvider);
    final api = ref.read(activationApiProvider);
    try {
      if (_existingMode) {
        final email = inspection.email;
        if (email == null) {
          _fail(_networkText());
          return;
        }
        try {
          await repo.signIn(email, _existing.text);
        } catch (e) {
          _fail(isBannedAuthError(e)
              ? suspendedMessage(ar)
              : (ar
                  ? 'كلمة المرور غير صحيحة. حاول مرة أخرى.'
                  : 'Incorrect password. Please try again.'));
          return;
        }
        final outcome = await api.complete(
          widget.token,
          bearerToken: repo.accessToken,
        );
        if (outcome.ok) {
          await _finish();
        } else {
          _handleFailure(outcome.reason);
        }
        return;
      }
      final outcome = await api.complete(
        widget.token,
        password: _password.text,
      );
      if (!outcome.ok) {
        _handleFailure(outcome.reason);
        return;
      }
      final email = outcome.email ?? inspection.email;
      if (email == null) {
        _fail(_networkText());
        return;
      }
      try {
        await repo.signIn(email, _password.text);
      } catch (e) {
        _fail(isBannedAuthError(e)
            ? suspendedMessage(ar)
            : (ar
                ? 'تم تفعيل حسابك. سجّل الدخول بكلمة المرور الجديدة.'
                : 'Your account is activated. Sign in with your new password.'));
        return;
      }
      await _finish();
    } on ActivationNetworkException {
      _fail(_networkText());
    } catch (_) {
      _fail(_networkText());
    }
  }

  void _handleFailure(String? reason) {
    final ar = _ar;
    switch (reason) {
      case 'needs_signin':
        setState(() {
          _existingMode = true;
          _busy = false;
          _error = null;
        });
      case 'weak_password':
        _fail(ar
            ? 'كلمة المرور لا تحقق الشروط. استخدم ١٠ أحرف على الأقل بحروف وأرقام.'
            : 'The password does not meet the requirements. Use at least 10 characters with letters and digits.');
      case 'email_mismatch':
        _fail(ar
            ? 'هذا الرابط مخصص لبريد إلكتروني مختلف عن حسابك. $_contactAdminAr'
            : 'This link was issued for a different email than your account. Please contact the project management.');
      case 'already_linked':
      case 'identity_in_use':
        _fail(ar
            ? 'تعذّر ربط هذا الحساب بالبريد الإلكتروني. $_contactAdminAr'
            : 'This account could not be linked to that email. Please contact the project management.');
      case 'invalid_token':
        setState(() {
          _terminal = 'not_found';
          _busy = false;
        });
      case 'expired':
      case 'used':
      case 'revoked':
        setState(() {
          _terminal = reason;
          _busy = false;
        });
      default:
        _fail(ar
            ? 'لم يكتمل التفعيل — أعد المحاولة'
            : 'Activation did not complete — try again');
    }
  }

  Future<void> _finish() async {
    if (!mounted) return;
    final container = ProviderScope.containerOf(context);
    final navigator = Navigator.of(context);
    final uid = container.read(repositoryProvider).currentUserId ??
        container.read(authStateProvider).valueOrNull?.session?.user.id;
    if (uid != null) {
      final set = container.read(unlockedUsersProvider);
      container.read(unlockedUsersProvider.notifier).state = {...set, uid};
    }
    container.invalidate(portalAccessProvider);
    container.invalidate(sessionProvider);
    navigator.popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final ar = _ar;
    final Widget body;
    final state = _terminal ?? _inspection?.state;
    if (_loading) {
      body = const Padding(
        padding: EdgeInsets.all(40),
        child: Center(child: CircularProgressIndicator()),
      );
    } else if (_loadFailed) {
      body = AppError(message: _networkText(), onRetry: _inspect);
    } else if (state != null && state != 'valid') {
      body = _stateCard(state, ar);
    } else {
      body = _form(ar);
    }
    return Scaffold(
      backgroundColor: appSurface,
      body: SafeArea(
        child: Column(
          children: [
            ScreenHeader(title: ar ? 'تفعيل الحساب' : 'Activate your account'),
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(20),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(children: [_brandHeader(), body]),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _stateCard(String state, bool ar) {
    final (icon, text) = switch (state) {
      'expired' => (
          Icons.timer_off_outlined,
          ar
              ? 'انتهت صلاحية رابط التفعيل. اطلب رابطًا جديدًا من إدارة المشروع.'
              : 'This activation link has expired. Ask the project management for a new one.',
        ),
      'used' => (
          Icons.check_circle_outline,
          ar
              ? 'تم استخدام رابط التفعيل هذا من قبل. سجّل الدخول بحسابك.'
              : 'This activation link was already used. Sign in with your account.',
        ),
      'revoked' => (
          Icons.block_outlined,
          ar
              ? 'تم إلغاء رابط التفعيل هذا. $_contactAdminAr'
              : 'This activation link was cancelled. Please contact the project management.',
        ),
      _ => (
          Icons.link_off,
          ar
              ? 'رابط التفعيل غير صحيح. تأكد من الرابط أو تواصل مع إدارة المشروع.'
              : 'This activation link is not valid. Check the link or contact the project management.',
        ),
    };
    return AqarCard(
      child: Column(
        children: [
          Icon(icon, size: 40, color: appNavy),
          const SizedBox(height: 12),
          Text(
            text,
            key: ValueKey('activation-state-$state'),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, height: 1.5),
          ),
          const SizedBox(height: 18),
          AqarButton(
            ar ? 'إغلاق' : 'Close',
            secondary: true,
            onPressed: () => Navigator.maybePop(context),
          ),
        ],
      ),
    );
  }

  Widget _form(bool ar) {
    final inspection = _inspection!;
    final greeting = inspection.memberName;
    return AqarCard(
      gold: true,
      padding: const EdgeInsets.all(18),
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (greeting != null)
              Text(
                ar ? 'أهلاً $greeting' : 'Welcome, $greeting',
                key: const ValueKey('activation-member'),
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
            if (inspection.organizationName != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  inspection.organizationName!,
                  style: const TextStyle(color: appGrey, fontSize: 13),
                ),
              ),
            const SizedBox(height: 14),
            if (inspection.email != null)
              InputDecorator(
                decoration: InputDecoration(
                  labelText: ar ? 'البريد الإلكتروني' : 'Email',
                ),
                child: Text(
                  inspection.email!,
                  key: const ValueKey('activation-email'),
                  textDirection: TextDirection.ltr,
                ),
              ),
            const SizedBox(height: 12),
            if (_error != null) _errorBox(_error!),
            if (_existingMode) ...[
              Text(
                ar
                    ? 'هذا البريد لديه حساب في AqarBooks. أدخل كلمة مرور حسابك الحالية للمتابعة.'
                    : 'This email already has an AqarBooks account. Enter your current password to continue.',
                key: const ValueKey('activation-existing-note'),
                style: const TextStyle(fontSize: 13, color: appGrey),
              ),
              const SizedBox(height: 10),
              TextField(
                key: const ValueKey('activation-existing-password'),
                controller: _existing,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.password],
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: ar ? 'كلمة المرور الحالية' : 'Current password',
                ),
              ),
            ] else ...[
              TextField(
                key: const ValueKey('activation-password'),
                controller: _password,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.newPassword],
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  hintText: ar ? 'كلمة المرور الجديدة' : 'New password',
                  suffixIcon: IconButton(
                    icon: Icon(_obscure
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('activation-confirm'),
                controller: _confirm,
                obscureText: _obscure,
                autofillHints: const [AutofillHints.newPassword],
                onSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  hintText: ar ? 'تأكيد كلمة المرور' : 'Confirm password',
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  ar
                      ? '١٠ أحرف على الأقل، وتحتوي على حرف ورقم.'
                      : 'At least 10 characters, with a letter and a digit.',
                  style: const TextStyle(fontSize: 12, color: appGrey),
                ),
              ),
            ],
            const SizedBox(height: 16),
            AqarButton(
              ar ? 'تفعيل الحساب' : 'Activate account',
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}
