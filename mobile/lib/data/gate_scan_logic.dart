import 'dart:math';

import 'package:crypto/crypto.dart';
import 'dart:convert';

/// A visitor pass decoded from a QR payload: `AQP1.<invitation uuid>.<secret>`.
///
/// The secret is the raw pass secret the server only stores a hash of. It is
/// held in memory just long enough to call the scan RPC: it is never
/// persisted, logged, or included in `toString`.
class ParsedPass {
  final String invitationId;
  final String secret;
  const ParsedPass(this.invitationId, this.secret);

  @override
  String toString() => 'ParsedPass($invitationId, <redacted>)';
}

final _passUuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);
// base64url of 32 random bytes (44 chars with '=' padding) — see
// AqarRepository.createVisitor. Bounds keep arbitrary QR junk out.
final _passSecret = RegExp(r'^[A-Za-z0-9_\-]{32,64}={0,2}$');

const maxPassPayloadLength = 200;

/// Validates the payload shape locally so non-AqarBooks QR codes never hit
/// the backend. Returns null for anything that is not a well-formed pass.
ParsedPass? parsePassPayload(String raw) {
  final payload = raw.trim();
  if (payload.isEmpty || payload.length > maxPassPayloadLength) return null;
  final first = payload.indexOf('.');
  if (first < 0 || payload.substring(0, first) != 'AQP1') return null;
  final second = payload.indexOf('.', first + 1);
  if (second < 0) return null;
  final id = payload.substring(first + 1, second);
  final secret = payload.substring(second + 1);
  if (!_passUuid.hasMatch(id) || !_passSecret.hasMatch(secret)) return null;
  return ParsedPass(id.toLowerCase(), secret);
}

String generateUuidV4([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int start, int end) => bytes
      .sublist(start, end)
      .map((b) => b.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
}

/// Permission to process one detected QR code.
class ScanTicket {
  final String fingerprint;
  final String direction;

  /// Sent as `p_client_scan_id`. Reused when the same pass is retried after a
  /// failed attempt so a lost response replays server-side instead of
  /// creating a second ledger event.
  final String clientScanId;
  const ScanTicket._(this.fingerprint, this.direction, this.clientScanId);
}

/// Serialises camera/manual detections into at most one in-flight scan and
/// suppresses the same QR code being re-detected while it is still in frame.
///
/// Only a SHA-256 fingerprint of each payload is remembered (in memory); the
/// raw payload and its secret are never stored here.
class ScanCoordinator {
  final Duration repeatWindow;
  final Duration minGap;
  final Duration pendingIdTtl;
  final DateTime Function() _now;
  final String Function() _newId;

  ScanCoordinator({
    this.repeatWindow = const Duration(seconds: 3),
    this.minGap = const Duration(milliseconds: 500),
    this.pendingIdTtl = const Duration(minutes: 2),
    DateTime Function()? clock,
    String Function()? idFactory,
  })  : _now = clock ?? DateTime.now,
        _newId = idFactory ?? generateUuidV4;

  bool _busy = false;
  String? _lastFingerprint;
  DateTime? _lastFinishedAt;
  DateTime? _lastAttemptAt;
  final _pending = <String, _PendingId>{};

  bool get isBusy => _busy;

  static String fingerprintOf(String payload) =>
      sha256.convert(utf8.encode(payload.trim())).toString();

  /// Must be called synchronously from the detection callback, before any
  /// `await`, so two detections in the same frame cannot both pass.
  ScanTicket? tryBegin(String payload, String direction) {
    if (_busy) return null;
    final now = _now();
    final lastAttempt = _lastAttemptAt;
    if (lastAttempt != null && now.difference(lastAttempt) < minGap) {
      return null;
    }
    final fingerprint = fingerprintOf(payload);
    final lastFinished = _lastFinishedAt;
    if (fingerprint == _lastFingerprint &&
        lastFinished != null &&
        now.difference(lastFinished) < repeatWindow) {
      return null;
    }
    _busy = true;
    _lastAttemptAt = now;
    _pending.removeWhere(
      (_, entry) => now.difference(entry.createdAt) > pendingIdTtl,
    );
    final key = '$direction|$fingerprint';
    final id = (_pending[key] ??= _PendingId(_newId(), now)).id;
    // Bounded: the oldest entries go first.
    while (_pending.length > 8) {
      _pending.remove(_pending.keys.first);
    }
    return ScanTicket._(fingerprint, direction, id);
  }

  /// Releases the lock. [delivered] is true once the backend answered (any
  /// decision) or the payload was rejected locally; on a transport failure it
  /// is false and the client scan id is kept for an idempotent retry.
  void complete(ScanTicket ticket, {required bool delivered}) {
    _busy = false;
    _lastFingerprint = ticket.fingerprint;
    _lastFinishedAt = _now();
    if (delivered) _pending.remove('${ticket.direction}|${ticket.fingerprint}');
  }

  void reset() {
    _busy = false;
    _lastFingerprint = null;
    _lastFinishedAt = null;
    _lastAttemptAt = null;
    _pending.clear();
  }
}

class _PendingId {
  final String id;
  final DateTime createdAt;
  _PendingId(this.id, this.createdAt);
}

/// Decisions the UI distinguishes. The scan RPC only returns ALLOW/DENY;
/// the amber "needs attention" state comes from reason codes (and a
/// defensive RECONCILE decision should the backend ever add one).
enum GateOutcome { allow, deny, attention }

GateOutcome classifyScanResult(String decision, String? reasonCode) {
  if (decision == 'ALLOW') return GateOutcome.allow;
  if (decision == 'RECONCILE' ||
      reasonCode == 'ALREADY_INSIDE' ||
      reasonCode == 'NOT_INSIDE') {
    return GateOutcome.attention;
  }
  return GateOutcome.deny;
}
