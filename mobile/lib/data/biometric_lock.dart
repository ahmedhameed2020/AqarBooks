import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

/// Device biometrics (fingerprint / face), behind an interface so tests can
/// fake it.
abstract class BiometricAuthenticator {
  /// True only when the device has biometrics enrolled and usable.
  Future<bool> isSupported();

  /// Prompts the user; false when failed, cancelled or unavailable.
  Future<bool> authenticate(String reason);
}

class LocalAuthBiometricAuthenticator implements BiometricAuthenticator {
  final LocalAuthentication _auth;
  LocalAuthBiometricAuthenticator([LocalAuthentication? auth])
      : _auth = auth ?? LocalAuthentication();

  @override
  Future<bool> isSupported() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      return (await _auth.getAvailableBiometrics()).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> authenticate(String reason) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
      );
    } catch (_) {
      return false;
    }
  }
}

final biometricAuthenticatorProvider = Provider<BiometricAuthenticator>(
  (ref) => LocalAuthBiometricAuthenticator(),
);

/// Whether the per-user biometric app lock is switched on. Stored per user id
/// so one phone can hold several accounts without leaking the choice.
abstract class BiometricFlagStore {
  Future<bool> isEnabled(String userId);
  Future<void> setEnabled(String userId, bool enabled);
  Future<void> clear(String userId);
}

class SecureBiometricFlagStore implements BiometricFlagStore {
  final FlutterSecureStorage _storage;
  const SecureBiometricFlagStore([
    this._storage = const FlutterSecureStorage(
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
    ),
  ]);

  static String _key(String userId) => 'aqarbooks.biometric_lock.v1.$userId';

  @override
  Future<bool> isEnabled(String userId) async {
    try {
      return (await _storage.read(key: _key(userId))) == '1';
    } catch (_) {
      // Unreadable store: not enabled (never lock someone out of a broken
      // keystore; the account password still protects the data).
      return false;
    }
  }

  @override
  Future<void> setEnabled(String userId, bool enabled) => enabled
      ? _storage.write(key: _key(userId), value: '1')
      : _storage.delete(key: _key(userId));

  @override
  Future<void> clear(String userId) async {
    try {
      await _storage.delete(key: _key(userId));
    } catch (_) {}
  }
}

final biometricFlagStoreProvider = Provider<BiometricFlagStore>(
  (ref) => const SecureBiometricFlagStore(),
);

/// Users who proved themselves during this app run (fresh password sign-in or
/// a successful biometric unlock). The lock only applies at cold start, so an
/// empty set at launch means "locked" for users who enabled it.
final unlockedUsersProvider = StateProvider<Set<String>>((ref) => const {});

/// Whether the biometric toggle should be shown on this device.
final biometricSupportedProvider = FutureProvider.autoDispose<bool>(
  (ref) => ref.watch(biometricAuthenticatorProvider).isSupported(),
);

/// The lock flag for one user (reads the store; invalidate after a change).
final biometricEnabledProvider = FutureProvider.autoDispose
    .family<bool, String>(
  (ref, userId) => ref.watch(biometricFlagStoreProvider).isEnabled(userId),
);
