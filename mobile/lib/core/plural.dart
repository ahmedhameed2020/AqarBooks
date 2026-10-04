import 'dart:ui';

import 'formatting.dart';

/// An Arabic counted noun in its four forms. Arabic is not "singular/plural":
/// 1 and 2 use dedicated forms (and drop the numeral), 3–10 take the plural,
/// and 11+ take the singular accusative ("١١ وحدة", "١٥ يومًا").
class ArNoun {
  final String one, two, few, many;
  const ArNoun(this.one, this.two, this.few, this.many);
}

const unitNoun = ArNoun('وحدة واحدة', 'وحدتان', 'وحدات', 'وحدة');
const dueNoun = ArNoun('استحقاق واحد', 'استحقاقان', 'استحقاقات', 'استحقاقًا');
const dayNoun = ArNoun('يوم واحد', 'يومان', 'أيام', 'يومًا');
const projectNoun = ArNoun('مشروع واحد', 'مشروعان', 'مشاريع', 'مشروعًا');
const taskNoun = ArNoun('مهمة واحدة', 'مهمتان', 'مهام', 'مهمة');
const operationNoun = ArNoun('عملية واحدة', 'عمليتان', 'عمليات', 'عملية');

/// "وحدة واحدة" · "وحدتان" · "٣ وحدات" · "١١ وحدة" — or "1 unit" · "4 units".
String countText(
  int n,
  Locale locale, {
  required ArNoun ar,
  required String enOne,
  required String enOther,
}) {
  if (locale.languageCode != 'ar') return n == 1 ? '1 $enOne' : '$n $enOther';
  if (n == 1) return ar.one;
  if (n == 2) return ar.two;
  final digits = formatNumber(n, locale);
  final r = n % 100; // CLDR: 103–110 take the plural, 111–199 the singular.
  final form = (r >= 3 && r <= 10) ? ar.few : ar.many;
  return '$digits $form';
}
