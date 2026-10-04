import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Normalises an Egyptian phone number to international digits without the
/// plus sign (`201001234567`), or null when it is not a usable number.
///
/// Handles the shapes found in real data: `010 0123 4567`, `+20 100 123 4567`,
/// `0020100…`, `(010) 0123-4567`, and already-international `20100…`.
String? normalizeEgyptPhone(String? raw) {
  if (raw == null) return null;
  var digits = raw.replaceAll(RegExp(r'[^0-9+]'), '');
  if (digits.isEmpty) return null;
  if (digits.startsWith('+')) {
    digits = digits.substring(1);
  } else if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }
  digits = digits.replaceAll('+', '');
  if (digits.startsWith('0')) {
    // National format: 01xxxxxxxxx (mobile) or 02/03… (landline).
    digits = '20${digits.substring(1)}';
  }
  if (!digits.startsWith('20')) return null;
  // Country code + 9–10 national digits.
  if (digits.length < 11 || digits.length > 12) return null;
  return digits;
}

Uri? telUri(String? raw) {
  final n = normalizeEgyptPhone(raw);
  return n == null ? null : Uri(scheme: 'tel', path: '+$n');
}

Uri? whatsappUri(String? raw, {String? message}) {
  final n = normalizeEgyptPhone(raw);
  if (n == null) return null;
  return Uri.https('wa.me', '/$n', {
    if (message != null && message.isNotEmpty) 'text': message,
  });
}

/// How external links (tel:, WhatsApp) are opened; overridable in tests.
final externalOpenerProvider =
    Provider<Future<bool> Function(Uri?)>((ref) => openExternal);

/// Opens [uri] in the platform handler. Returns false instead of throwing so
/// callers can show a friendly message.
Future<bool> openExternal(Uri? uri) async {
  if (uri == null) return false;
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}
