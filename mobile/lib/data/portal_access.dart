import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import 'repository.dart';

/// Result of the `my_portal_access()` RPC. Callable even when the account is
/// suspended or a password change is pending (everything else is blocked by
/// RLS in those states), so the app asks it right after sign-in.
class PortalAccess {
  final bool linked;

  /// 'none' | 'pending' | 'active' | 'suspended'
  final String status;
  final bool mustChangePassword;
  final bool tempExpired;

  /// 'email' | 'client_id' | null
  final String? loginMethod;
  final String? clientId;

  /// Masked mobile number, e.g. "•••• 4567".
  final String? phoneHint;
  final bool hasRecoveryEmail;

  /// True when this identity also belongs to an organization as staff (the
  /// shared staff + owner identity). Suspension of the owner portal then never
  /// locks the user out of work mode.
  final bool hasStaffAccess;

  const PortalAccess({
    this.linked = false,
    this.status = 'none',
    this.mustChangePassword = false,
    this.tempExpired = false,
    this.loginMethod,
    this.clientId,
    this.phoneHint,
    this.hasRecoveryEmail = false,
    this.hasStaffAccess = false,
  });

  /// A staff (or unlinked) user: the app behaves exactly as before.
  static const none = PortalAccess();

  /// Portal-only identity whose access is suspended: blocks everything.
  bool get blocksAccess => status == 'suspended' && !hasStaffAccess;

  /// Staff identity whose *owner portal* is suspended: work mode continues,
  /// but the owner portal entry must disappear.
  bool get portalSuspendedForStaff => status == 'suspended' && hasStaffAccess;

  /// Only portal-only identities are ever forced through first login.
  bool get requiresFirstLogin => mustChangePassword && !hasStaffAccess;

  factory PortalAccess.fromJson(Object? raw) {
    var value = raw;
    if (value is List && value.isNotEmpty) value = value.first;
    if (value is String) {
      try {
        value = jsonDecode(value);
      } catch (_) {}
    }
    if (value is! Map) return PortalAccess.none;
    final map = Map<String, dynamic>.from(value);
    String? text(String key) {
      final v = map[key];
      return v is String && v.isNotEmpty ? v : null;
    }

    return PortalAccess(
      linked: map['linked'] == true,
      status: text('status') ?? 'none',
      mustChangePassword: map['must_change_password'] == true,
      tempExpired: map['temp_expired'] == true,
      loginMethod: text('login_method'),
      clientId: text('client_id'),
      phoneHint: text('phone_hint'),
      hasRecoveryEmail: map['has_recovery_email'] == true,
      hasStaffAccess: map['has_staff_access'] == true,
    );
  }
}

/// Result of `complete_portal_first_login(p_phone)`.
class FirstLoginResult {
  final bool ok;

  /// NOT_AUTHENTICATED | NOT_FOUND | SUSPENDED | NOT_REQUIRED | TEMP_EXPIRED |
  /// PASSWORD_NOT_CHANGED | INVALID_PHONE
  final String? reason;
  const FirstLoginResult({required this.ok, this.reason});

  factory FirstLoginResult.fromJson(Object? raw) {
    var value = raw;
    if (value is List && value.isNotEmpty) value = value.first;
    if (value is Map) {
      final reason = value['reason'];
      return FirstLoginResult(
        ok: value['ok'] == true,
        reason: reason is String ? reason : null,
      );
    }
    return const FirstLoginResult(ok: false, reason: 'UNKNOWN');
  }
}

/// Null while signed out. An error means "could not tell": the app shows a
/// retry screen and never falls through into the portal.
final portalAccessProvider = FutureProvider.autoDispose<PortalAccess?>((
  ref,
) async {
  final uid = ref.watch(
    authStateProvider.select((a) => a.valueOrNull?.session?.user.id),
  );
  if (uid == null) return null;
  return ref.watch(repositoryProvider).portalAccess();
});

// ───────────────────────── activation web API ─────────────────────────

const _webBase = String.fromEnvironment(
  'AQAR_WEB_BASE',
  defaultValue: 'https://aqarbooks.com',
);

final activationBaseUrlProvider = Provider<String>((ref) => _webBase);

/// 'valid' | 'expired' | 'used' | 'revoked' | 'not_found'
class ActivationInspection {
  final String state;
  final String? memberName, organizationName, email;
  final bool existingAccount;
  const ActivationInspection({
    required this.state,
    this.memberName,
    this.organizationName,
    this.email,
    this.existingAccount = false,
  });
  bool get isValid => state == 'valid';

  factory ActivationInspection.fromJson(Map<String, dynamic> json) {
    String? text(String key) {
      final v = json[key];
      return v is String && v.isNotEmpty ? v : null;
    }

    const known = {'valid', 'expired', 'used', 'revoked', 'not_found'};
    final state = text('state');
    return ActivationInspection(
      state: state != null && known.contains(state) ? state : 'not_found',
      memberName: text('memberName'),
      organizationName: text('organizationName'),
      email: text('email'),
      existingAccount: json['existingAccount'] == true,
    );
  }
}

/// invalid_token | expired | used | revoked | weak_password | needs_signin |
/// email_mismatch | server_error
class ActivationOutcome {
  final bool ok;
  final String? email;
  final String? reason;
  const ActivationOutcome({required this.ok, this.email, this.reason});
}

/// Thrown when the activation service cannot be reached or answers garbage.
class ActivationNetworkException implements Exception {
  const ActivationNetworkException();
  @override
  String toString() => 'ActivationNetworkException';
}

abstract class ActivationApi {
  Future<ActivationInspection> inspect(String token);

  /// [password] is omitted for an existing account that signed in first;
  /// then [bearerToken] carries that session's access token.
  Future<ActivationOutcome> complete(
    String token, {
    String? password,
    String? bearerToken,
  });
}

class HttpActivationApi implements ActivationApi {
  final String baseUrl;
  final http.Client _client;
  final Duration timeout;
  HttpActivationApi(
    this.baseUrl,
    this._client, {
    this.timeout = const Duration(seconds: 20),
  });

  Uri _uri(String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return Uri.parse('$base$path');
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body, {
    String? bearer,
  }) async {
    try {
      final response = await _client
          .post(
            _uri(path),
            headers: {
              'content-type': 'application/json',
              'accept': 'application/json',
              if (bearer != null) 'authorization': 'Bearer $bearer',
            },
            body: jsonEncode(body),
          )
          .timeout(timeout);
      final decoded = jsonDecode(utf8.decode(response.bodyBytes));
      if (decoded is! Map) throw const ActivationNetworkException();
      return Map<String, dynamic>.from(decoded);
    } on ActivationNetworkException {
      rethrow;
    } catch (_) {
      // Deliberately swallow the original error: it may embed the URL/body.
      throw const ActivationNetworkException();
    }
  }

  @override
  Future<ActivationInspection> inspect(String token) async =>
      ActivationInspection.fromJson(
        await _post('/api/portal-activation/inspect', {'token': token}),
      );

  @override
  Future<ActivationOutcome> complete(
    String token, {
    String? password,
    String? bearerToken,
  }) async {
    final json = await _post(
      '/api/portal-activation/complete',
      {'token': token, 'password': ?password},
      bearer: bearerToken,
    );
    if (json['ok'] == true) {
      final email = json['email'];
      return ActivationOutcome(ok: true, email: email is String ? email : null);
    }
    final reason = json['reason'];
    return ActivationOutcome(
      ok: false,
      reason: reason is String ? reason : 'server_error',
    );
  }
}

final activationApiProvider = Provider<ActivationApi>(
  (ref) => HttpActivationApi(
    ref.watch(activationBaseUrlProvider),
    http.Client(),
  ),
);
