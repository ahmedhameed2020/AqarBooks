import 'package:aqarbooks_mobile/core/contact.dart';
import 'package:aqarbooks_mobile/data/overdue_aging.dart';
import 'package:aqarbooks_mobile/data/repository.dart' show OverdueItem;
import 'package:flutter_test/flutter_test.dart';

OverdueItem _due(
  String id,
  String unit,
  double amount,
  String dueDate, {
  String? owner,
  String? phone,
}) =>
    OverdueItem(
      dueId: id,
      unitId: 'u-$unit',
      unitCode: unit,
      description: 'due $id',
      dueDate: dueDate,
      outstanding: amount,
      ownerId: owner == null ? null : 'm-$unit',
      ownerName: owner,
      ownerPhone: phone,
    );

void main() {
  group('normalizeEgyptPhone', () {
    test('accepts every shape found in real data', () {
      const expected = '201001234567';
      for (final raw in [
        '01001234567',
        '010 0123 4567',
        '(010) 0123-4567',
        '+20 100 123 4567',
        '+201001234567',
        '00201001234567',
        '201001234567',
      ]) {
        expect(normalizeEgyptPhone(raw), expected, reason: raw);
      }
    });

    test('accepts a Cairo landline', () {
      expect(normalizeEgyptPhone('02 2345 6789'), '20223456789');
    });

    test('rejects unusable numbers instead of dialling garbage', () {
      for (final raw in [null, '', '   ', 'abc', '123', '0100', '+44 20 7946 0958']) {
        expect(normalizeEgyptPhone(raw), isNull, reason: '$raw');
      }
    });

    test('builds tel and WhatsApp links with a prefilled message', () {
      expect(telUri('010 0123 4567').toString(), 'tel:+201001234567');
      final wa = whatsappUri('01001234567', message: 'مرحبا بكم');
      expect(wa!.host, 'wa.me');
      expect(wa.path, '/201001234567');
      expect(wa.queryParameters['text'], 'مرحبا بكم');
      expect(whatsappUri('oops'), isNull);
      expect(telUri(null), isNull);
    });
  });

  group('aging buckets', () {
    final now = DateTime(2026, 10, 4, 15, 30);

    test('days late are counted by calendar date, not time of day', () {
      expect(daysLate('2026-10-03', now), 1);
      expect(daysLate('2026-10-04', DateTime(2026, 10, 4, 23, 59)), 0);
      expect(daysLate('garbage', now), 0);
    });

    test('bucket boundaries', () {
      expect(agingBucketOf(1), AgingBucket.d1to30);
      expect(agingBucketOf(30), AgingBucket.d1to30);
      expect(agingBucketOf(31), AgingBucket.d31to60);
      expect(agingBucketOf(60), AgingBucket.d31to60);
      expect(agingBucketOf(61), AgingBucket.d61to90);
      expect(agingBucketOf(90), AgingBucket.d61to90);
      expect(agingBucketOf(91), AgingBucket.d90plus);
      expect(agingBucketOf(400), AgingBucket.d90plus);
    });

    test('summary totals add up and count distinct units', () {
      final items = [
        _due('1', 'B-07', 24000, '2026-07-21'), // 75 days
        _due('2', 'B-07', 24000, '2026-08-20'), // 45 days
        _due('3', 'A-03', 3250, '2026-09-16'), // 18 days
        _due('4', 'C-11', 61250, '2026-06-06'), // 120 days
        _due('5', 'D-02', 8000, '2026-09-22'), // 12 days
      ];
      final summary = summarizeAging(items, now);
      expect(summary.total, 120500);
      expect(summary.amount[AgingBucket.d1to30], 11250);
      expect(summary.amount[AgingBucket.d31to60], 24000);
      expect(summary.amount[AgingBucket.d61to90], 24000);
      expect(summary.amount[AgingBucket.d90plus], 61250);
      expect(summary.units[AgingBucket.all], 4);
      expect(summary.units[AgingBucket.d1to30], 2);
      // The buckets partition the total exactly.
      final parts = [
        for (final b in AgingBucket.values)
          if (b != AgingBucket.all) summary.amount[b]!,
      ].fold<double>(0, (a, b) => a + b);
      expect(parts, summary.total);
    });
  });

  group('groupOverdue', () {
    test('groups by unit, largest balance first, oldest due first inside', () {
      final groups = groupOverdue([
        _due('1', 'A-03', 3250, '2026-09-16', owner: 'Hala', phone: '0111'),
        _due('2', 'B-07', 24000, '2026-08-20', owner: 'Mohamed'),
        _due('3', 'B-07', 24000, '2026-07-21', owner: 'Mohamed'),
        _due('4', 'C-11', 61250, '2026-06-06', owner: 'Sherif'),
      ]);
      expect(groups.map((g) => g.unitCode), ['C-11', 'B-07', 'A-03']);
      final b07 = groups[1];
      expect(b07.total, 48000);
      expect(b07.items.map((d) => d.dueId), ['3', '2']);
      expect(b07.ownerName, 'Mohamed');
      expect(b07.oldestDays(DateTime(2026, 10, 4)), 75);
      expect(groups.last.ownerPhone, '0111');
    });

    test('empty input gives no groups', () {
      expect(groupOverdue(const []), isEmpty);
    });
  });
}
