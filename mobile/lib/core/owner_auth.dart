// Pure rules for owner sign-in and activation. No Flutter, no network, so
// every rule here is unit-tested directly.

/// Supabase only knows e-mail addresses, so an owner's Client ID is mapped to
/// a hidden alias address. The alias is an implementation detail: it must
/// never be shown to the user (fields, errors, snackbars, logs, profile).
const clientAliasDomain = 'client.aqarbooks.local';

final _clientIdPattern = RegExp(r'^mb[-\s]?(\d{4,9})$', caseSensitive: false);

/// Converts Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits to ASCII.
String normalizeDigits(String input) {
  final out = StringBuffer();
  for (final unit in input.runes) {
    if (unit >= 0x0660 && unit <= 0x0669) {
      out.writeCharCode(0x30 + unit - 0x0660);
    } else if (unit >= 0x06F0 && unit <= 0x06F9) {
      out.writeCharCode(0x30 + unit - 0x06F0);
    } else {
      out.writeCharCode(unit);
    }
  }
  return out.toString();
}

/// The digits of a Client ID (`MB-10482`, `mb10482`, `MB 10482`, with Arabic
/// digits too), or null when [input] is not a Client ID.
String? clientIdDigits(String input) {
  final normalized = normalizeDigits(input.trim());
  return _clientIdPattern.firstMatch(normalized)?.group(1);
}

bool isClientIdentifier(String input) => clientIdDigits(input) != null;

/// The e-mail Supabase Auth must receive for what the user typed: the hidden
/// alias for a Client ID, the trimmed address otherwise.
String authEmailForIdentifier(String input) {
  final digits = clientIdDigits(input);
  if (digits != null) return 'mb-$digits@$clientAliasDomain';
  return input.trim();
}

/// True for a hidden Client ID alias address (never display such a value).
bool isClientAliasEmail(String? email) =>
    email != null && email.toLowerCase().endsWith('@$clientAliasDomain');

/// What may be shown for an account's login name: the real e-mail, or the
/// Client ID (`MB-10482`) for alias accounts — never the alias itself.
String displayLoginName(String? email, {String? clientId}) {
  if (email == null || email.isEmpty) return clientId ?? '—';
  if (!isClientAliasEmail(email)) return email;
  if (clientId != null && clientId.isNotEmpty) return clientId;
  final local = email.split('@').first; // mb-10482
  final digits = RegExp(r'\d+').firstMatch(local)?.group(0);
  return digits == null ? '—' : 'MB-$digits';
}

/// Short name for greetings: the e-mail's local part, or the Client ID for a
/// hidden alias account (never the alias).
String userGreetingName(String? email) {
  if (email == null || email.isEmpty) return '';
  if (isClientAliasEmail(email)) return displayLoginName(email);
  return email.split('@').first;
}

/// True when a sign-in failure means the account is suspended (banned in
/// Auth) rather than wrong credentials.
bool isBannedAuthError(Object error) {
  final text = error.toString().toLowerCase();
  if (text.contains('user_banned') || text.contains('banned')) return true;
  try {
    final code = (error as dynamic).code;
    if (code is String && code.toLowerCase().contains('banned')) return true;
    final message = (error as dynamic).message;
    if (message is String && message.toLowerCase().contains('banned')) {
      return true;
    }
  } catch (_) {}
  return false;
}

// ───────────────────────── password policy ─────────────────────────

enum PasswordIssue { tooShort, needsLetter, needsDigit, mismatch }

const minPasswordLength = 10;

/// >= 10 characters, at least one letter and one digit, and the confirmation
/// must match. Returned in a stable order; empty means the password is valid.
List<PasswordIssue> validateNewPassword(String password, String confirm) => [
      if (password.length < minPasswordLength) PasswordIssue.tooShort,
      if (!RegExp(r'\p{L}', unicode: true).hasMatch(password))
        PasswordIssue.needsLetter,
      if (!RegExp(r'[0-9]').hasMatch(password)) PasswordIssue.needsDigit,
      if (password != confirm) PasswordIssue.mismatch,
    ];

String passwordIssueText(PasswordIssue issue, {required bool ar}) =>
    switch (issue) {
      PasswordIssue.tooShort => ar
          ? 'كلمة المرور يجب ألا تقل عن ١٠ أحرف.'
          : 'The password must be at least 10 characters.',
      PasswordIssue.needsLetter => ar
          ? 'يجب أن تحتوي كلمة المرور على حرف واحد على الأقل.'
          : 'The password must contain at least one letter.',
      PasswordIssue.needsDigit => ar
          ? 'يجب أن تحتوي كلمة المرور على رقم واحد على الأقل.'
          : 'The password must contain at least one digit.',
      PasswordIssue.mismatch => ar
          ? 'تأكيد كلمة المرور غير مطابق.'
          : 'The password confirmation does not match.',
    };

// ───────────────────────── Egyptian mobile number ─────────────────────────

/// Normalises an Egyptian mobile number (`01012345678`, `+201012345678`,
/// `00201012345678`, Arabic digits, spaces/dashes) to the international form
/// `+201XXXXXXXXX`. Returns null when it is not a valid Egyptian mobile.
String? normalizeEgyptianPhone(String input) {
  var s = normalizeDigits(input).replaceAll(RegExp(r'[\s\-().]'), '');
  if (s.startsWith('+')) {
    s = s.substring(1);
  } else if (s.startsWith('00')) {
    s = s.substring(2);
  }
  if (s.startsWith('20')) {
    s = s.substring(2);
  } else if (s.startsWith('0')) {
    s = s.substring(1);
  } else {
    return null;
  }
  // National significant number: 1[0125]XXXXXXXX (10 digits).
  if (!RegExp(r'^1[0125]\d{8}$').hasMatch(s)) return null;
  return '+20$s';
}

// ───────────────────────── activation links ─────────────────────────

final _tokenPattern = RegExp(r'^[A-Za-z0-9_-]{20,128}$');

bool isValidActivationToken(String token) => _tokenPattern.hasMatch(token);

/// Extracts the activation token from `https://aqarbooks.com/activate/<token>`
/// or `aqarbooks://activate/<token>`; null for anything else or a malformed
/// token. The token is a bearer secret: never log it.
String? parseActivationToken(Uri uri) {
  String? candidate;
  final scheme = uri.scheme.toLowerCase();
  final host = uri.host.toLowerCase();
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (scheme == 'https' && (host == 'aqarbooks.com' || host == 'www.aqarbooks.com')) {
    if (segments.length == 2 && segments[0] == 'activate') {
      candidate = segments[1];
    }
  } else if (scheme == 'aqarbooks' && host == 'activate') {
    if (segments.length == 1) candidate = segments[0];
  }
  if (candidate == null || !isValidActivationToken(candidate)) return null;
  return candidate;
}
