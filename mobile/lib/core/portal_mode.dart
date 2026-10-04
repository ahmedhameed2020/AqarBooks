import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/repository.dart';

/// Id of the signed-in user. Providers below watch it, so every sign-in,
/// sign-out or account switch starts from a clean state.
final _userIdProvider = Provider<String?>(
  (ref) => ref.watch(
    authStateProvider.select((a) => a.valueOrNull?.session?.user.id),
  ),
);

/// True while a staff user who is also an owner uses their personal portal.
/// Always false after any change of signed-in user.
final portalModeProvider = StateProvider<bool>((ref) {
  ref.watch(_userIdProvider);
  return false;
});

/// The unit the owner portal home is focused on (null = first unit).
final selectedUnitProvider = StateProvider<String?>((ref) {
  ref.watch(_userIdProvider);
  return null;
});

/// The persona whose shell is shown: the owner portal when a staff member
/// who owns units has switched into it, otherwise the permission-derived one.
Persona effectivePersona(AppSession session, {required bool ownerMode}) =>
    ownerMode && session.canSwitchToPortal ? Persona.resident : session.persona;
