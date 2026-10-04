import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The trusted gate device issued by `redeem_gate_device_enrollment`.
///
/// The backend binds a device to exactly one gate and an allowed direction
/// (`ENTRY` / `EXIT` / `BOTH`); every scan must present the device id and the
/// raw device credential (the server compares its SHA-256 to the enrolled
/// hash). The credential is a long-lived bearer secret, so it is only ever
/// kept in the platform secure store — never in SharedPreferences, logs, or
/// UI state.
class GateDevice {
  final String deviceId, gateId, allowedDirection, displayName;
  final String credential;
  const GateDevice({
    required this.deviceId,
    required this.gateId,
    required this.allowedDirection,
    required this.displayName,
    required this.credential,
  });

  /// Directions this device may scan, in display order.
  List<String> get directions =>
      allowedDirection == 'BOTH' ? const ['ENTRY', 'EXIT'] : [allowedDirection];

  Map<String, dynamic> toJson() => {
        'deviceId': deviceId,
        'gateId': gateId,
        'allowedDirection': allowedDirection,
        'displayName': displayName,
        'credential': credential,
      };

  /// Returns null for any malformed record so a corrupted store reads as
  /// "not enrolled" instead of crashing or scanning with partial data.
  static GateDevice? tryParse(Object? decoded) {
    if (decoded is! Map) return null;
    final deviceId = decoded['deviceId'];
    final gateId = decoded['gateId'];
    final direction = decoded['allowedDirection'];
    final name = decoded['displayName'];
    final credential = decoded['credential'];
    if (deviceId is! String ||
        gateId is! String ||
        direction is! String ||
        name is! String ||
        credential is! String) {
      return null;
    }
    if (!_uuid.hasMatch(deviceId) || !_uuid.hasMatch(gateId)) return null;
    if (!const {'ENTRY', 'EXIT', 'BOTH'}.contains(direction)) return null;
    if (credential.length < 32) return null;
    return GateDevice(
      deviceId: deviceId,
      gateId: gateId,
      allowedDirection: direction,
      displayName: name,
      credential: credential,
    );
  }

  /// Redacted on purpose: the credential must never reach a log line.
  @override
  String toString() => 'GateDevice($deviceId, gate: $gateId, $allowedDirection)';
}

final _uuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

abstract class GateDeviceStore {
  Future<GateDevice?> read();
  Future<void> save(GateDevice device);
  Future<void> clear();
}

class SecureGateDeviceStore implements GateDeviceStore {
  static const _key = 'aqarbooks.gate_device.v1';
  final FlutterSecureStorage _storage;

  const SecureGateDeviceStore([
    this._storage = const FlutterSecureStorage(
      // Keep the credential on this physical device: no iCloud Keychain sync
      // or restore onto another phone (a trusted device must not be cloneable).
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
    ),
  ]);

  @override
  Future<GateDevice?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      return GateDevice.tryParse(jsonDecode(raw));
    } catch (_) {
      // Unreadable (e.g. Keystore key invalidated) means not trusted; the
      // operator re-activates with a fresh enrollment from the manager.
      return null;
    }
  }

  @override
  Future<void> save(GateDevice device) =>
      _storage.write(key: _key, value: jsonEncode(device.toJson()));

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

final gateDeviceStoreProvider =
    Provider<GateDeviceStore>((ref) => const SecureGateDeviceStore());

/// The enrolled device, or null when this phone is not a trusted gate device.
final gateDeviceProvider = FutureProvider.autoDispose<GateDevice?>(
  (ref) => ref.watch(gateDeviceStoreProvider).read(),
);

final gateEnrolledProvider = FutureProvider.autoDispose<bool>(
  (ref) async => (await ref.watch(gateDeviceProvider.future)) != null,
);
