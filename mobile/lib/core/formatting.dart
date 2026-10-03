import 'dart:ui';

/// Egypt-first formatting: Arabic-Indic digits, thousands separators,
/// `ج.م` currency label, and Egyptian short dates. No raw ISO strings
/// and no hardcoded `EGP` next to Arabic copy (UX blueprint shared rules).
const _arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const _arabicThousands = '٬'; // ٬
const _arabicDecimal = '٫'; // ٫

String _toArabicDigits(String input) {
  final buffer = StringBuffer();
  for (final code in input.runes) {
    if (code >= 0x30 && code <= 0x39) {
      buffer.write(_arabicDigits[code - 0x30]);
    } else {
      buffer.writeCharCode(code);
    }
  }
  return buffer.toString();
}

String _groupThousands(String digits, String separator) {
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    final fromEnd = digits.length - i;
    out.write(digits[i]);
    if (fromEnd > 1 && fromEnd % 3 == 1) out.write(separator);
  }
  return out.toString();
}

/// `١٢٬٥٠٠٫٥٠` in Arabic, `12,500.50` in English. Fraction digits are
/// omitted for whole amounts to match the approved Figma screens.
String formatNumber(num value, Locale locale, {bool forceDecimals = false}) {
  final ar = locale.languageCode == 'ar';
  final isWhole = value == value.roundToDouble();
  final fixed = (isWhole && !forceDecimals)
      ? value.round().abs().toString()
      : value.abs().toStringAsFixed(2);
  final parts = fixed.split('.');
  final grouped = _groupThousands(parts[0], ar ? _arabicThousands : ',');
  final sign = value < 0 ? '-' : '';
  final joined = parts.length == 1
      ? grouped
      : '$grouped${ar ? _arabicDecimal : '.'}${parts[1]}';
  final text = '$sign$joined';
  return ar ? _toArabicDigits(text) : text;
}

/// `١٢٬٥٠٠ ج.م` / `12,500 EGP` from the single currency label source.
String formatMoney(num value, Locale locale) {
  final ar = locale.languageCode == 'ar';
  return '${formatNumber(value, locale)} ${ar ? 'ج.م' : 'EGP'}';
}

String localizedDigits(String value, Locale locale) =>
    locale.languageCode == 'ar' ? _toArabicDigits(value) : value;

const _arMonths = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const _enMonths = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const _arWeekdays = [
  'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد',
];

DateTime? parseServerDate(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  return DateTime.tryParse(raw)?.toLocal();
}

/// Egyptian short date: `١٥ أكتوبر ٢٠٢٦`, with relative wording for the
/// near past/future (`اليوم ٣:٣٠ م`, `منذ ساعتين`).
String formatDate(String? raw, Locale locale, {bool relative = true}) {
  final date = parseServerDate(raw);
  if (date == null) return '—';
  final ar = locale.languageCode == 'ar';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(date.year, date.month, date.day);
  final diff = day.difference(today).inDays;
  if (relative && diff == 0) {
    return ar ? 'اليوم ${formatTime(raw, locale)}' : 'Today ${formatTime(raw, locale)}';
  }
  if (relative && diff == 1) return ar ? 'غدًا' : 'Tomorrow';
  if (relative && diff == -1) return ar ? 'أمس' : 'Yesterday';
  final month = ar ? _arMonths[date.month - 1] : _enMonths[date.month - 1];
  final text = '${date.day} $month ${date.year}';
  return ar ? _toArabicDigits(text) : text;
}

String formatWeekdayDate(DateTime date, Locale locale) {
  final ar = locale.languageCode == 'ar';
  if (!ar) {
    return '${_enMonths[date.month - 1]} ${date.day}, ${date.year}';
  }
  final text =
      '${_arWeekdays[date.weekday - 1]} ${date.day} ${_arMonths[date.month - 1]} ${date.year}';
  return _toArabicDigits(text);
}

String formatTime(String? raw, Locale locale) {
  final date = parseServerDate(raw);
  if (date == null) return '—';
  final ar = locale.languageCode == 'ar';
  final hour12 = date.hour % 12 == 0 ? 12 : date.hour % 12;
  final minutes = date.minute.toString().padLeft(2, '0');
  final suffix = ar ? (date.hour >= 12 ? 'م' : 'ص') : (date.hour >= 12 ? 'PM' : 'AM');
  final text = '$hour12:$minutes $suffix';
  return ar ? _toArabicDigits(text) : text;
}

String relativeFrom(String? raw, Locale locale) {
  final date = parseServerDate(raw);
  if (date == null) return '—';
  final ar = locale.languageCode == 'ar';
  final delta = DateTime.now().difference(date);
  if (delta.inMinutes < 2) return ar ? 'الآن' : 'now';
  if (delta.inMinutes < 60) {
    return ar
        ? 'منذ ${_toArabicDigits('${delta.inMinutes}')} دقيقة'
        : '${delta.inMinutes}m ago';
  }
  if (delta.inHours < 24) {
    if (ar) {
      if (delta.inHours == 1) return 'منذ ساعة';
      if (delta.inHours == 2) return 'منذ ساعتين';
      return 'منذ ${_toArabicDigits('${delta.inHours}')} ساعات';
    }
    return '${delta.inHours}h ago';
  }
  return formatDate(raw, locale);
}

/// Days a due is late: positive means overdue (blueprint: overdue is
/// computed from `due_date < today`, never from the stored status).
int overdueDays(String? dueDate) {
  final date = parseServerDate(dueDate);
  if (date == null) return 0;
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day)
      .difference(DateTime(date.year, date.month, date.day))
      .inDays;
}
