import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/app_core.dart';
import 'repository.dart';

/// A visitor pass kept on this device. The server stores only a hash of the
/// secret and can never show the QR again, so the raw [payload] is a bearer
/// secret: it lives only in the platform secure store, under the owner's user
/// id, never in SharedPreferences, logs or UI state.
class SavedPass {
  final String id, guestName, validUntil, payload, unitCode;
  const SavedPass({
    required this.id,
    required this.guestName,
    required this.validUntil,
    required this.payload,
    required this.unitCode,
  });
  Map<String, dynamic> toJson() => {
        'id': id,
        'guestName': guestName,
        'validUntil': validUntil,
        'payload': payload,
        'unitCode': unitCode,
      };
  static SavedPass fromJson(Map<String, dynamic> m) => SavedPass(
        id: m['id'] ?? '',
        guestName: m['guestName'] ?? '',
        validUntil: m['validUntil'] ?? '',
        payload: m['payload'] ?? '',
        unitCode: m['unitCode'] ?? '',
      );

  /// Redacted on purpose: the payload must never reach a log line.
  @override
  String toString() => 'SavedPass($id, $unitCode)';
}

abstract class VisitorPassStore {
  /// Passes saved by [userId]; expired ones are dropped.
  Future<List<SavedPass>> read(String userId);
  Future<void> save(String userId, SavedPass pass);
}

const _legacyPrefKey = 'saved_visitor_passes';
const _maxPasses = 20;

class SecureVisitorPassStore implements VisitorPassStore {
  final FlutterSecureStorage _storage;
  final DateTime Function() _now;
  const SecureVisitorPassStore([
    this._storage = const FlutterSecureStorage(
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
    ),
    this._now = DateTime.now,
  ]);

  static String _key(String userId) => 'aqarbooks.visitor_passes.v1.$userId';

  @override
  Future<List<SavedPass>> read(String userId) async {
    if (userId.isEmpty) return const [];
    await _migrateLegacy(userId);
    try {
      final raw = await _storage.read(key: _key(userId));
      if (raw == null) return const [];
      final cutoff = _now().subtract(const Duration(days: 1));
      return [
        for (final item in jsonDecode(raw) as List)
          if (item is Map)
            if (SavedPass.fromJson(Map<String, dynamic>.from(item))
                case final pass
                when (DateTime.tryParse(pass.validUntil) ?? cutoff)
                    .isAfter(cutoff))
              pass,
      ];
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<void> save(String userId, SavedPass pass) async {
    if (userId.isEmpty) return;
    final existing = await read(userId);
    final updated = [pass, ...existing.where((p) => p.id != pass.id)];
    await _storage.write(
      key: _key(userId),
      value: jsonEncode([
        for (final p in updated.take(_maxPasses)) p.toJson(),
      ]),
    );
  }

  /// Older builds kept passes in plain SharedPreferences. Move them into the
  /// secure store for the current user once, then delete the plaintext copy.
  Future<void> _migrateLegacy(String userId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_legacyPrefKey);
      if (raw == null) return;
      final legacy = [
        for (final item in jsonDecode(raw) as List)
          if (item is Map) SavedPass.fromJson(Map<String, dynamic>.from(item)),
      ];
      final current = await _storage.read(key: _key(userId));
      final merged = <SavedPass>[
        if (current != null)
          for (final item in jsonDecode(current) as List)
            SavedPass.fromJson(Map<String, dynamic>.from(item as Map)),
      ];
      for (final p in legacy) {
        if (merged.every((m) => m.id != p.id)) merged.add(p);
      }
      await _storage.write(
        key: _key(userId),
        value: jsonEncode([for (final p in merged.take(_maxPasses)) p.toJson()]),
      );
      await prefs.remove(_legacyPrefKey);
    } catch (_) {}
  }
}

final visitorPassStoreProvider =
    Provider<VisitorPassStore>((ref) => const SecureVisitorPassStore());

final savedPassesProvider = FutureProvider.autoDispose<List<SavedPass>>((
  ref,
) {
  final signedIn = ref.watch(
    authStateProvider.select((a) => a.valueOrNull?.session?.user.id),
  );
  final uid =
      signedIn ?? ref.watch(supabaseProvider)?.auth.currentUser?.id ?? '';
  return ref.watch(visitorPassStoreProvider).read(uid);
});
