import 'repository.dart' show OverdueItem;

/// Receivables aging buckets for the manager's collections view. Overdue only:
/// anything not yet past its due date is "current" and not listed here.
enum AgingBucket { all, d1to30, d31to60, d61to90, d90plus }

/// Whole days past [dueDate] (`yyyy-MM-dd`), counted by calendar date so the
/// time of day never shifts a due into the next bucket.
int daysLate(String dueDate, DateTime now) {
  final due = DateTime.tryParse(dueDate);
  if (due == null) return 0;
  return DateTime(now.year, now.month, now.day)
      .difference(DateTime(due.year, due.month, due.day))
      .inDays;
}

AgingBucket agingBucketOf(int days) {
  if (days <= 30) return AgingBucket.d1to30;
  if (days <= 60) return AgingBucket.d31to60;
  if (days <= 90) return AgingBucket.d61to90;
  return AgingBucket.d90plus;
}

class AgingSummary {
  final Map<AgingBucket, double> amount;
  final Map<AgingBucket, int> units;
  const AgingSummary(this.amount, this.units);

  double get total => amount[AgingBucket.all] ?? 0;
}

AgingSummary summarizeAging(Iterable<OverdueItem> items, DateTime now) {
  final amount = {for (final b in AgingBucket.values) b: 0.0};
  final unitSets = {for (final b in AgingBucket.values) b: <String>{}};
  for (final item in items) {
    final bucket = agingBucketOf(daysLate(item.dueDate, now));
    for (final key in [AgingBucket.all, bucket]) {
      amount[key] = amount[key]! + item.outstanding;
      unitSets[key]!.add(item.unitId);
    }
  }
  return AgingSummary(amount, {
    for (final entry in unitSets.entries) entry.key: entry.value.length,
  });
}

/// All overdue dues of one unit, with its owner for follow-up.
class OverdueGroup {
  final String unitId, unitCode;
  final String? ownerName, ownerPhone;
  final List<OverdueItem> items;
  const OverdueGroup({
    required this.unitId,
    required this.unitCode,
    required this.items,
    this.ownerName,
    this.ownerPhone,
  });

  double get total => items.fold(0, (sum, d) => sum + d.outstanding);

  int oldestDays(DateTime now) => items
      .map((d) => daysLate(d.dueDate, now))
      .fold(0, (a, b) => a > b ? a : b);
}

/// Groups overdue dues by unit, largest balance first; each group's dues are
/// oldest first.
List<OverdueGroup> groupOverdue(Iterable<OverdueItem> items) {
  final byUnit = <String, List<OverdueItem>>{};
  for (final item in items) {
    byUnit.putIfAbsent(item.unitId, () => []).add(item);
  }
  final groups = [
    for (final entry in byUnit.entries)
      OverdueGroup(
        unitId: entry.key,
        unitCode: entry.value.first.unitCode,
        ownerName: entry.value.first.ownerName,
        ownerPhone: entry.value.first.ownerPhone,
        items: [...entry.value]
          ..sort((a, b) => a.dueDate.compareTo(b.dueDate)),
      ),
  ];
  groups.sort((a, b) => b.total.compareTo(a.total));
  return groups;
}
