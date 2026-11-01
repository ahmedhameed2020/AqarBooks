// Dev-only visual QA harness. Never imported by lib/main.dart and never
// shipped. Two modes:
//
//   flutter run -t lib/preview_main.dart -d chrome
//       the horizontal gallery of the approved Figma screens (default);
//
//   flutter run -t lib/preview_main.dart -d <android-device> \
//       --dart-define=STORE_SCREEN=resident-home
//       one genuine production screen, full-screen, for Google Play store
//       screenshots. All eight keys are listed in `storeScreenshotKeys`; the
//       key `cycle` walks all eight in one run, so a single install (no rebuild
//       between shots, no camera permission) yields every capture.
//
// Both modes run on `PreviewRepository` overrides only: no backend, no
// Supabase credentials, synthetic data.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import 'core/app_core.dart';
import 'core/shell_nav.dart';
import 'data/gate_device_store.dart';
import 'data/repository.dart';
import 'data/visitor_pass_store.dart';
import 'screens/app_screens.dart';
import 'screens/feature_screens.dart' show MaintenanceDetailScreen;
import 'widgets/aqar_icons.dart';
import 'widgets/gate_scanner_view.dart';
import 'widgets/ui_kit.dart';

/// The Play store screenshot keys, in listing order. The first value is the
/// `--dart-define=STORE_SCREEN=` key, the second the file name stem written to
/// `store-assets/screenshots/ar/`.
const storeScreenshotKeys = <(String, String)>[
  ('resident-home', '01-resident-home'),
  ('payments-dues', '02-payments-dues'),
  ('fawry-payment', '03-fawry-payment'),
  ('visitor-qr-pass', '04-visitor-qr-pass'),
  ('maintenance-request', '05-maintenance-request'),
  ('technician-dashboard', '06-technician-dashboard'),
  ('gate-scanner', '07-gate-scanner'),
  ('manager-dashboard', '08-manager-dashboard'),
];

/// `--dart-define=STORE_SCREEN=<key>` — empty in gallery mode.
const _storeScreenDefine = String.fromEnvironment('STORE_SCREEN');

/// Optional override of the auto-advance, for a single manual capture:
/// `--dart-define=STORE_SCREEN_AT=<seconds>`.
const _storeScreenAt = int.fromEnvironment('STORE_SCREEN_AT', defaultValue: -1);

/// How long each screen is left on the device before the harness advances to
/// the next one (override with `--dart-define=STORE_DWELL_SECONDS=<n>`). Long
/// enough for the synthetic futures to settle, so no skeleton is ever on screen
/// when `adb exec-out screencap` fires.
const storeScreenDwell = Duration(
  seconds: int.fromEnvironment('STORE_DWELL_SECONDS', defaultValue: 6),
);

/// Extra settle time before announcing a screen to the capture runner. The
/// Android window goes blank for a moment while a new subtree is laid out, and
/// a shot taken during that window lands either on a blank frame or on the
/// app's own fade-in (a washed-out screenshot). Neither is usable, so the
/// marker — and therefore the shot — waits until the screen has fully settled.
const storeScreenSettle = Duration(milliseconds: 2500);

void main() {
  final entries = storeScreenshotEntries();
  if (entries == null) {
    runApp(const PreviewGalleryApp());
    return;
  }
  runApp(PreviewCaptureApp(entries: entries));
}

/// Null in gallery mode; otherwise the screens to drive. An unknown value fails
/// loudly instead of silently capturing the wrong screen.
List<(StoreScreenshot, String)>? storeScreenshotEntries() {
  if (_storeScreenDefine.isEmpty) return null;
  if (_storeScreenDefine == 'all' || _storeScreenDefine == 'cycle') {
    return [for (final e in storeScreenshotKeys) (storeScreenshot(e.$1), e.$2)];
  }
  for (final e in storeScreenshotKeys) {
    if (e.$1 == _storeScreenDefine) return [(storeScreenshot(e.$1), e.$2)];
  }
  stderr.writeln(
    'STORE_SCREEN="$_storeScreenDefine" is not a known key. '
    'Known keys: ${storeScreenshotKeys.map((e) => e.$1).join(', ')}, all',
  );
  exit(2);
}

User _mockUser(String name) => User.fromJson({
      'id': name,
      'aud': 'authenticated',
      'role': 'authenticated',
      'email': '$name@aqarbooks.app',
      'created_at': '2026-01-01T00:00:00Z',
    })!;

AppSession _session(String name, Set<String> caps) => AppSession(
      user: _mockUser(name),
      organizationId: 'org-1',
      organizationName: 'مجموعة النخيل العقارية',
      propertyNames: const ['كمبوند النخيل'],
      capabilities: caps,
    );

final residentSession = _session('ahmed', {'portal.maintenance.read'});
final managerSession = _session('karim', {
  'operations.maintenance.manage',
  'operations.work_orders.assign',
  'operations.visitors.manage',
  'finance.dues.read',
});
final collectorSession = _session('samy', {
  'receivables.payments.create',
  'cashier.sessions.open',
  'cashier.sessions.close',
});
final technicianSession = _session('hassan', {
  'operations.work_orders.view',
  'operations.work_orders.manage',
  'operations.work_orders.complete',
});
final gateSession = _session('gate1', {
  'operations.gates.scan',
  'operations.gates.exceptions.create',
});

String _iso(DateTime d) => d.toIso8601String();
final _now = DateTime.now();

// ── store-capture fixtures ────────────────────────────────────────────────
// Everything below is synthetic and unmistakably marked as such: the fictional
// compound/units, a placeholder guest name, and a visitor credential that is
// deliberately not a valid pass payload, so no capture can leak a usable one.

/// Stored visitor-pass payload for previews. Shape-valid (the parser accepts
/// the `AQP1.v1.<secret>` form) but the secret is a fixed, documented
/// placeholder that no server ever issued — it cannot scan through.
const syntheticVisitorPassPayload =
    'AQP1.v1.NOT-A-REAL-PASS-STORE-SCREENSHOT-SAMPLE';

/// Placeholder guest name for previews and captures. Deliberately not a real
/// name: the pass screen must never look like it holds a live invitation.
const syntheticGuestName = 'ضيف تجريبي';

/// What the on-device pass store gets in preview/capture mode, so no capture
/// depends on age encryption or a real signed-in user.
class _PreviewPassStore implements VisitorPassStore {
  List<SavedPass> _passes = const [];
  @override
  Future<List<SavedPass>> read(String userId) async => _passes;
  @override
  Future<void> save(String userId, SavedPass pass) async => _passes = [pass];
}

/// The screen a capture should show, with the session and overrides it needs.
class StoreScreenshot {
  final String key;
  final AppSession session;
  final Widget Function() build;

  /// Shell tab to select for shell-based screens (resident/technician/manager).
  final int? shellTab;
  const StoreScreenshot({
    required this.key,
    required this.session,
    required this.build,
    this.shellTab,
  });
}

StoreScreenshot storeScreenshot(String key) => switch (key) {
      // Resident shell · tab 0 — the real ResidentHomeScreen, unmodified.
      'resident-home' => StoreScreenshot(
          key: key,
          session: residentSession,
          shellTab: 0,
          build: () => AppShell(session: residentSession),
        ),
      // Resident shell · tab 2 — the real PaymentsTabScreen (dues/paid).
      'payments-dues' => StoreScreenshot(
          key: key,
          session: residentSession,
          shellTab: 2,
          build: () => AppShell(session: residentSession),
        ),
      // Pushed route, exactly as the dues card opens it. `createFawryCheckout`
      // is the PreviewRepository override, so the reference code is synthetic.
      'fawry-payment' => StoreScreenshot(
          key: key,
          session: residentSession,
          build: () => FawryCodeScreen(
            due: DueItem(
              id: 'd1',
              description: 'قسط صيانة أكتوبر',
              amount: 3500,
              paid: 0,
              outstanding: 3500,
              dueDate: _iso(_now.add(const Duration(days: 11))),
              unitCode: 'A-12',
              memberId: 'm1',
            ),
            settings: const {'id': 'ps1', 'provider': 'FAWRY', 'environment': 'TEST'},
          ),
        ),
      // Pushed route with the deliberate placeholder payload above.
      'visitor-qr-pass' => StoreScreenshot(
          key: key,
          session: residentSession,
          build: () => VisitorPassScreen(
            guestName: syntheticGuestName,
            unitCode: 'A-12',
            validUntil: _iso(_now.add(const Duration(hours: 8))),
            payload: syntheticVisitorPassPayload,
            invitationId: 'preview-invitation',
            alreadySaved: true,
          ),
        ),
      // Pushed route over the synthetic maintenance request in
      // PreviewRepository.maintenanceDetail.
      'maintenance-request' => StoreScreenshot(
          key: key,
          session: residentSession,
          build: () => const MaintenanceDetailScreen(id: 'mr1'),
        ),
      // Technician shell · tab 0.
      'technician-dashboard' => StoreScreenshot(
          key: key,
          session: technicianSession,
          shellTab: 0,
          build: () => AppShell(session: technicianSession),
        ),
      // Gate shell · tab 0, live camera off: the approved idle scanner UI
      // renders and no camera permission dialog can appear.
      'gate-scanner' => StoreScreenshot(
          key: key,
          session: gateSession,
          shellTab: 0,
          build: () => AppShell(session: gateSession),
        ),
      // Manager shell · tab 0.
      'manager-dashboard' => StoreScreenshot(
          key: key,
          session: managerSession,
          shellTab: 0,
          build: () => AppShell(session: managerSession),
        ),
      _ => throw ArgumentError('unknown store screenshot key: $key'),
    };

class _PreviewDeviceStore implements GateDeviceStore {
  GateDevice? _device = const GateDevice(
    deviceId: '11111111-1111-4111-8111-111111111111',
    gateId: 'g1',
    allowedDirection: 'BOTH',
    displayName: 'Preview gate',
    credential: 'preview-credential-preview-credential-0000',
  );
  @override
  Future<GateDevice?> read() async => _device;
  @override
  Future<void> save(GateDevice device) async => _device = device;
  @override
  Future<void> clear() async => _device = null;
}

class PreviewRepository extends AqarRepository {
  const PreviewRepository() : super(null);

  @override
  Future<HomeSummary> homeSummary() async =>
      const HomeSummary(balance: 12500, units: 1, openMaintenance: 1);

  @override
  Future<List<UnitItem>> units() async => const [
        UnitItem(
          id: 'u1',
          code: 'A-12 — برج ١',
          balance: 12500,
          type: 'APARTMENT',
          leaseStatus: 'ACTIVE',
        ),
      ];

  @override
  Future<List<DueItem>> dues() async => [
        DueItem(
          id: 'd1',
          description: 'قسط صيانة سبتمبر',
          amount: 3500,
          paid: 0,
          outstanding: 3500,
          dueDate: _iso(_now.subtract(const Duration(days: 18))),
          unitCode: 'A-12',
          memberId: 'm1',
        ),
        DueItem(
          id: 'd2',
          description: 'قسط صيانة أكتوبر',
          amount: 3500,
          paid: 0,
          outstanding: 3500,
          dueDate: _iso(_now.add(const Duration(days: 11))),
          unitCode: 'A-12',
          memberId: 'm1',
        ),
        DueItem(
          id: 'd3',
          description: 'وديعة صيانة سنوية',
          amount: 5500,
          paid: 0,
          outstanding: 5500,
          dueDate: _iso(_now.add(const Duration(days: 58))),
          unitCode: 'A-12',
          memberId: 'm1',
        ),
      ];

  @override
  Future<List<PaymentItem>> payments() async => [
        PaymentItem(
          id: 'p1',
          receipt: '00451',
          date: _iso(_now.subtract(const Duration(days: 31))),
          method: 'CASH',
          amount: 3500,
        ),
      ];

  @override
  Future<List<MaintenanceItem>> maintenance() async => [
        MaintenanceItem(
          id: 'mr1',
          requestNo: 'MR-118',
          title: 'تسريب مياه — مطبخ',
          status: 'IN_PROGRESS',
          priority: 'HIGH',
          submittedAt: _iso(_now.subtract(const Duration(hours: 2))),
          unitCode: 'A-12',
        ),
      ];

  @override
  Future<List<VisitorItem>> myVisitors() => visitors();

  @override
  Future<List<VisitorItem>> visitors({List<String>? unitIds}) async => [
        VisitorItem(
          id: 'v1',
          number: 'INV-204',
          guestName: 'محمد سامي',
          validFrom: _iso(_now),
          validUntil: _iso(DateTime(_now.year, _now.month, _now.day, 23, 59)),
          status: 'ACTIVE',
          unitCode: 'A-12',
          usagePolicy: 'SINGLE_USE',
        ),
      ];

  @override
  Future<List<NotificationItem>> notifications() async => [
        NotificationItem(
          id: 'n1',
          titleAr: 'صيانة مجدولة للمصعد — برج ١، غدًا ٩:٠٠ ص',
          titleEn: 'Scheduled elevator maintenance — Tower 1, 9 AM tomorrow',
          bodyAr: '',
          bodyEn: '',
          priority: 'HIGH',
          createdAt: _iso(_now),
          isRead: false,
        ),
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenanceCategories() async => const [
        {'id': 'c1', 'name_ar': 'سباكة', 'name_en': 'Plumbing'},
        {'id': 'c2', 'name_ar': 'كهرباء', 'name_en': 'Electrical'},
        {'id': 'c3', 'name_ar': 'تكييف', 'name_en': 'HVAC'},
      ];

  @override
  Future<Map<String, dynamic>?> fawrySettings() async =>
      {'id': 'ps1', 'provider': 'FAWRY', 'environment': 'TEST', 'enabled': true};

  @override
  Future<FawryCheckout> createFawryCheckout({
    required List<String> dueIds,
    required Map<String, dynamic> settings,
    required String clientRequestId,
  }) async =>
      const FawryCheckout(
        // Synthetic TEST-environment reference — never a live Fawry code.
        transactionId: 'preview-transaction',
        amount: 3500,
        reference: '928451736',
      );

  @override
  Future<CashierSessionInfo?> activeCashierSession() async =>
      CashierSessionInfo(
        id: 'cs1',
        cashboxId: 'box1',
        openedAt: _iso(DateTime(_now.year, _now.month, _now.day, 8, 30)),
        openingBalance: 2000,
      );

  @override
  Future<List<PaymentItem>> myCollectionsToday() async => [
        PaymentItem(
          id: 'c1',
          receipt: '00483',
          date: _iso(_now),
          method: 'CASH',
          amount: 9500,
        ),
        PaymentItem(
          id: 'c2',
          receipt: '00481',
          date: _iso(_now),
          method: 'CASH',
          amount: 4500,
        ),
        PaymentItem(
          id: 'c3',
          receipt: '00480',
          date: _iso(_now),
          method: 'BANK_TRANSFER',
          amount: 3250,
        ),
      ];

  @override
  Future<List<DueItem>> unitOpenDues(String unitId) async => [
        DueItem(
          id: 'd1',
          description: 'قسط سبتمبر',
          amount: 4500,
          paid: 0,
          outstanding: 4500,
          dueDate: _iso(_now.subtract(const Duration(days: 20))),
          memberId: 'm2',
        ),
        DueItem(
          id: 'd2',
          description: 'قسط أكتوبر',
          amount: 5000,
          paid: 0,
          outstanding: 5000,
          dueDate: _iso(_now.add(const Duration(days: 10))),
          memberId: 'm2',
        ),
        DueItem(
          id: 'd3',
          description: 'وديعة نوفمبر',
          amount: 2000,
          paid: 0,
          outstanding: 2000,
          dueDate: _iso(_now.add(const Duration(days: 40))),
          memberId: 'm2',
        ),
      ];

  @override
  Future<List<OverdueItem>> overdueDues({int limit = 1000}) async => [
        OverdueItem(
          dueId: 'o1',
          unitId: 'u-b07',
          unitCode: 'B-07',
          description: 'قسط صيانة يوليو',
          dueDate: _iso(_now.subtract(const Duration(days: 75))),
          outstanding: 24000,
          ownerId: 'm-b07',
          ownerName: 'محمد عبد الرحمن',
          ownerPhone: '010 0123 4567',
        ),
        OverdueItem(
          dueId: 'o2',
          unitId: 'u-b07',
          unitCode: 'B-07',
          description: 'قسط صيانة أغسطس',
          dueDate: _iso(_now.subtract(const Duration(days: 45))),
          outstanding: 24000,
          ownerId: 'm-b07',
          ownerName: 'محمد عبد الرحمن',
          ownerPhone: '010 0123 4567',
        ),
        OverdueItem(
          dueId: 'o3',
          unitId: 'u-a03',
          unitCode: 'A-03',
          description: 'قسط صيانة سبتمبر',
          dueDate: _iso(_now.subtract(const Duration(days: 18))),
          outstanding: 3250,
          ownerId: 'm-a03',
          ownerName: 'هالة مصطفى',
          ownerPhone: '+20 111 222 3344',
        ),
        OverdueItem(
          dueId: 'o4',
          unitId: 'u-c11',
          unitCode: 'C-11',
          description: 'قسط صيانة يونيو',
          dueDate: _iso(_now.subtract(const Duration(days: 120))),
          outstanding: 61250,
          ownerId: 'm-c11',
          ownerName: 'شريف حسن',
        ),
        OverdueItem(
          dueId: 'o5',
          unitId: 'u-d02',
          unitCode: 'D-02',
          description: 'قسط صيانة سبتمبر',
          dueDate: _iso(_now.subtract(const Duration(days: 12))),
          outstanding: 8000,
          ownerId: 'm-d02',
          ownerName: 'ياسمين كمال',
          ownerPhone: '01551234567',
        ),
      ];

  @override
  Future<ManagerAttention> managerAttention(
    String? organizationId, {
    List<OverdueItem> overdue = const [],
    bool overdueFailed = false,
  }) async {
    final largest = [...overdue]
      ..sort((a, b) => b.outstanding.compareTo(a.outstanding));
    return ManagerAttention(
      todayCollections: 45200,
      totalOverdue: overdue.fold<double>(0, (s, d) => s + d.outstanding),
      overdueUnitCount: overdue.map((d) => d.unitId).toSet().length,
      overdueFailed: overdueFailed,
      openMaintenance: 14,
      visitorsInside: 6,
      items: [
        for (final d in largest.take(2))
          AttentionItem(
            kind: AttentionKind.overdue,
            title: d.unitCode,
            amount: d.outstanding,
            date: d.dueDate,
            refId: d.unitId,
          ),
        AttentionItem(
          kind: AttentionKind.slaBreach,
          title: 'WO-124',
          date: _iso(_now.subtract(const Duration(hours: 6))),
          refId: 'wo1',
        ),
        AttentionItem(
          kind: AttentionKind.cheque,
          title: 'DEPOSITED',
          amount: 25000,
          date: _iso(_now.subtract(const Duration(days: 5))),
        ),
        AttentionItem(
          kind: AttentionKind.leaseEnding,
          title: 'C-02',
          date: _iso(_now.add(const Duration(days: 28))),
        ),
        AttentionItem(
          kind: AttentionKind.gateException,
          title: '',
          date: _iso(_now.subtract(const Duration(minutes: 20))),
        ),
      ],
    );
  }

  @override
  Future<List<MaintenanceItem>> assignQueue() async => [
        MaintenanceItem(
          id: 'mr1',
          requestNo: 'MR-118',
          title: 'تسريب مياه — مطبخ',
          status: 'TRIAGED',
          priority: 'HIGH',
          submittedAt: _iso(_now.subtract(const Duration(hours: 3))),
          unitCode: 'A-12',
        ),
        MaintenanceItem(
          id: 'mr2',
          requestNo: 'MR-119',
          title: 'عطل إنارة — جراج برج ٢',
          status: 'TRIAGED',
          priority: 'NORMAL',
          submittedAt: _iso(_now.subtract(const Duration(hours: 5))),
          unitCode: 'M-01',
        ),
        MaintenanceItem(
          id: 'mr3',
          requestNo: 'MR-120',
          title: 'باب مدخل لا يُغلق — برج ١',
          status: 'SUBMITTED',
          priority: 'LOW',
          submittedAt: _iso(_now.subtract(const Duration(days: 1))),
          unitCode: 'T1',
        ),
      ];

  @override
  Future<MaintenanceDetail> maintenanceDetail(String id) async {
    if (id != 'mr1') {
      throw const AppRepositoryException('preview_unknown_maintenance_request');
    }
    return MaintenanceDetail(
      request: MaintenanceItem(
        id: 'mr1',
        requestNo: 'MR-118',
        title: 'تسريب مياه — مطبخ',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        submittedAt: _iso(_now.subtract(const Duration(days: 2))),
        unitCode: 'A-12',
      ),
      description:
          'تسريب من وصلة الحوض أسفل المطبخ — المياه تتجمع على الأرضية عند الاستخدام.',
      categoryId: 'c1',
      updates: [
        {
          'resulting_status': '',
          'note': 'جارٍ تغيير وصلة الحوض',
          'visibility': 'MEMBER_VISIBLE',
          'created_at': _iso(_now.subtract(const Duration(hours: 1))),
        },
        {
          'resulting_status': 'IN_PROGRESS',
          'note': '',
          'visibility': 'MEMBER_VISIBLE',
          'created_at': _iso(_now.subtract(const Duration(hours: 5))),
        },
        {
          'resulting_status': 'TRIAGED',
          'note': 'تم التصنيف وإسناد الطلب لفريق السباكة',
          'visibility': 'MEMBER_VISIBLE',
          'created_at': _iso(_now.subtract(const Duration(days: 1))),
        },
        {
          'resulting_status': 'SUBMITTED',
          'note': '',
          'visibility': 'MEMBER_VISIBLE',
          'created_at': _iso(_now.subtract(const Duration(days: 2))),
        },
      ],
      attachments: const [
        {'original_file_name': 'صورة-التسريب.jpg', 'kind': 'ISSUE'},
      ],
      workOrders: const [],
    );
  }

  @override
  Future<List<WorkOrderItem>> workOrders() async => [
        WorkOrderItem(
          id: 'wo0',
          number: 'WO-123',
          title: 'تسريب مياه — مطبخ',
          status: 'IN_PROGRESS',
          unitCode: 'A-12',
          dueAt: _iso(_now.add(const Duration(hours: 4))),
        ),
        WorkOrderItem(
          id: 'wo1',
          number: 'WO-124',
          title: 'عطل مصعد — برج ٢',
          status: 'ASSIGNED',
          unitCode: 'M-01',
          dueAt: _iso(_now.subtract(const Duration(hours: 6))),
        ),
        WorkOrderItem(
          id: 'wo2',
          number: 'WO-125',
          title: 'صيانة تكييف — B-05',
          status: 'SCHEDULED',
          unitCode: 'B-05',
          dueAt: _iso(_now.add(const Duration(hours: 7))),
        ),
        WorkOrderItem(
          id: 'wo3',
          number: 'WO-126',
          title: 'استبدال كشاف — ممر الدور ٥',
          status: 'ASSIGNED',
          unitCode: 'T1',
        ),
      ];

  @override
  Future<WorkOrderDetail> workOrderDetail(String id) async => WorkOrderDetail(
        requestId: 'mr1',
        workOrder: WorkOrderItem(
          id: 'wo0',
          number: 'WO-124',
          title: 'تسريب مياه — مطبخ',
          status: 'IN_PROGRESS',
          unitCode: 'A-12 · برج ١ — الدور ٣',
          dueAt: _iso(_now.add(const Duration(hours: 4))),
        ),
        updates: [
          {
            'resulting_status': '',
            'note': 'جارٍ تغيير وصلة الحوض',
            'visibility': 'MEMBER_VISIBLE',
            'created_at': _iso(_now.subtract(const Duration(hours: 1))),
          },
          {
            'resulting_status': 'IN_PROGRESS',
            'note': '',
            'visibility': 'STAFF_ONLY',
            'created_at': _iso(_now.subtract(const Duration(hours: 2))),
          },
          {
            'resulting_status': 'ASSIGNED',
            'note': 'أُسند إلى حسن علي',
            'visibility': 'STAFF_ONLY',
            'created_at': _iso(_now.subtract(const Duration(days: 1))),
          },
        ],
        attachments: const [
          {'original_file_name': 'قبل-الإصلاح.jpg'},
        ],
      );

  @override
  Future<List<Map<String, dynamic>>> gates() async => const [
        {
          'id': 'g1',
          'code': 'G1',
          'name_ar': 'بوابة ١ — الرئيسية',
          'name_en': 'Gate 1 — Main',
          'direction_mode': 'BOTH',
          'is_active': true,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> gateCurrentVisitors(
          String organizationId) async =>
      [
        {
          'guest_name': 'محمد سامي',
          'unit_code': 'A-12',
          'entered_at': _iso(_now.subtract(const Duration(minutes: 40))),
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> todayAccessEvents() async => [
        {
          'direction': 'ENTRY',
          'decision': 'ALLOW',
          'reason_code': null,
          'occurred_at': _iso(_now.subtract(const Duration(minutes: 40))),
        },
        {
          'direction': 'ENTRY',
          'decision': 'DENY',
          'reason_code': 'EXPIRED',
          'occurred_at': _iso(_now.subtract(const Duration(hours: 2))),
        },
      ];
}

List<Override> _overrides(AppSession session, {int? shellTab}) => [
      repositoryProvider.overrideWithValue(const PreviewRepository()),
      sessionProvider.overrideWith((ref) async => session),
      savedPassesProvider.overrideWith((ref) async => [
            SavedPass(
              id: 'v1',
              guestName: syntheticGuestName,
              validUntil:
                  _iso(DateTime(_now.year, _now.month, _now.day, 23, 59)),
              payload: syntheticVisitorPassPayload,
              unitCode: 'A-12',
            ),
          ]),
      visitorPassStoreProvider.overrideWithValue(_PreviewPassStore()),
      gateDeviceStoreProvider.overrideWithValue(_PreviewDeviceStore()),
      gateCameraEnabledProvider.overrideWithValue(false),
      if (shellTab != null)
        shellTabProvider.overrideWith((ref) => shellTab),
    ];

class PreviewGalleryApp extends StatelessWidget {
  const PreviewGalleryApp({super.key});
  @override
  Widget build(BuildContext context) {
    final tiles = <(String, AppSession, Widget Function())>[
      ('01 تسجيل الدخول', residentSession, () => const LoginScreen()),
      (
        '02 الرئيسية — ساكن',
        residentSession,
        () => _shellTab(
              residentSession,
              0,
              ResidentHomeScreen(session: residentSession),
            )
      ),
      (
        '03 المدفوعات',
        residentSession,
        () => _shellTab(residentSession, 2, const PaymentsTabScreen())
      ),
      (
        '04 كود فوري',
        residentSession,
        () => FawryCodeScreen(
              due: DueItem(
                id: 'd1',
                description: 'قسط صيانة أكتوبر',
                amount: 3500,
                paid: 0,
                outstanding: 3500,
                dueDate: _iso(_now),
              ),
              settings: const {'id': 'ps1', 'environment': 'TEST'},
            )
      ),
      (
        '05 طلب صيانة جديد',
        residentSession,
        () => const NewMaintenanceRequestScreen()
      ),
      (
        '06 تصريح زائر QR',
        residentSession,
        () => VisitorPassScreen(
              guestName: syntheticGuestName,
              unitCode: 'A-12',
              validUntil:
                  _iso(DateTime(_now.year, _now.month, _now.day, 23, 59)),
              payload: syntheticVisitorPassPayload,
              invitationId: 'v1',
            )
      ),
      (
        '07 الرئيسية — مدير',
        managerSession,
        () => _shellTab(
              managerSession,
              0,
              ManagerHomeScreen(session: managerSession),
            )
      ),
      (
        '07ب التحصيلات — مدير',
        managerSession,
        () => _shellTab(managerSession, 1, const ManagerCollectionsScreen())
      ),
      (
        '08 الصيانة — إسناد',
        managerSession,
        () => _shellTab(managerSession, 2, const ManagerMaintenanceScreen())
      ),
      (
        '09 اليوم — محصّل',
        collectorSession,
        () => _shellTab(
              collectorSession,
              0,
              CollectorTodayScreen(session: collectorSession),
            )
      ),
      (
        '10 خطوة التحصيل',
        collectorSession,
        () => const CollectStepScreen(
              unitId: 'u2',
              unitCode: 'B-07',
              balance: 9500,
            )
      ),
      (
        '11 إيصال النجاح',
        collectorSession,
        () => const ReceiptSuccessScreen(
              amount: 9500,
              method: 'CASH',
              unitCode: 'B-07',
            )
      ),
      (
        '12 اليوم — فني',
        technicianSession,
        () => _shellTab(
              technicianSession,
              0,
              TechnicianTodayScreen(session: technicianSession),
            )
      ),
      (
        '13 تفاصيل أمر شغل',
        technicianSession,
        () => const WorkOrderDetailScreen(id: 'wo0')
      ),
      ('14 تفعيل جهاز البوابة', gateSession, () => const GateActivationScreen()),
      (
        '15 المسح — بوابة',
        gateSession,
        () => _shellTab(
              gateSession,
              0,
              GateScanScreen(session: gateSession),
              dark: true,
            )
      ),
      (
        '15ب المسح — الكاميرا مرفوضة',
        gateSession,
        () => Container(
              color: gateDark,
              child: Padding(
                padding: const EdgeInsets.all(30),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: ScannerIssuePanel(
                    issue: ScannerIssue.permissionDenied,
                    onRetry: () {},
                  ),
                ),
              ),
            )
      ),
      (
        '16 نتيجة خضراء',
        gateSession,
        () => const GateResultScreen(
              decision: 'ALLOW',
              guestName: syntheticGuestName,
              unitCode: 'A-12',
              direction: 'ENTRY',
              gateName: 'بوابة ١',
              canCreateException: true,
            )
      ),
    ];
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Directionality(
        textDirection: TextDirection.rtl,
        child: Scaffold(
          backgroundColor: const Color(0xFFDDE3EA),
          body: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(24),
            children: [
              for (final (label, session, builder) in tiles)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 28),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: appInk,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Container(
                          width: 390,
                          decoration: BoxDecoration(
                            border: Border.all(color: appGrey, width: 1),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(17),
                            child: MediaQuery(
                              data: MediaQuery.of(context).copyWith(
                                size: const Size(390, 844),
                                padding: EdgeInsets.zero,
                                viewPadding: EdgeInsets.zero,
                              ),
                              child: ProviderScope(
                                overrides: _overrides(session),
                                child: builder(),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _shellTab(
    AppSession session,
    int index,
    Widget body, {
    bool dark = false,
  }) {
    final t = const AppLabels(Locale('ar'));
    final items = switch (session.persona) {
      Persona.manager => [
          AqarNavItem(t.home, AqarIconType.home),
          AqarNavItem(t.collections, AqarIconType.cash),
          AqarNavItem(t.maintenance, AqarIconType.wrench),
          AqarNavItem(t.operations, AqarIconType.gear),
          AqarNavItem(t.more, AqarIconType.more),
        ],
      Persona.collector => [
          AqarNavItem(t.today, AqarIconType.sun),
          AqarNavItem(t.search, AqarIconType.search),
          AqarNavItem(t.collect, AqarIconType.cash),
          AqarNavItem(t.receipts, AqarIconType.receipt),
          AqarNavItem(t.more, AqarIconType.more),
        ],
      Persona.technician => [
          AqarNavItem(t.today, AqarIconType.sun),
          AqarNavItem(t.myTasks, AqarIconType.tasks),
          AqarNavItem(t.history, AqarIconType.historyClock),
          AqarNavItem(t.notifications, AqarIconType.bell),
          AqarNavItem(t.profile, AqarIconType.user),
        ],
      Persona.gate => [
          AqarNavItem(t.gateScan, AqarIconType.qr),
          AqarNavItem(t.visitors, AqarIconType.people),
          AqarNavItem(t.currentVisitors, AqarIconType.inside),
          AqarNavItem(t.events, AqarIconType.calendar),
          AqarNavItem(t.more, AqarIconType.more),
        ],
      Persona.resident => [
          AqarNavItem(t.home, AqarIconType.home),
          AqarNavItem(t.units, AqarIconType.building),
          AqarNavItem(t.payments, AqarIconType.wallet),
          AqarNavItem(t.maintenance, AqarIconType.wrench),
          AqarNavItem(t.more, AqarIconType.more),
        ],
    };
    return Scaffold(
      backgroundColor: dark ? gateDark : appSurface,
      body: SafeArea(child: body),
      bottomNavigationBar: AqarBottomNav(
        items: items,
        index: index,
        dark: dark,
        centerIndex: session.persona == Persona.collector ? 2 : null,
        onTap: (_) {},
      ),
    );
  }
}

// ───────────────────────── store-screenshot capture host ─────────────────────

/// Drives one genuine production screen at a time, full-screen, for Play store
/// captures. No chrome of its own: what lands in the screenshot is the screen
/// the app actually shows, at the device's real resolution.
class PreviewCaptureApp extends StatelessWidget {
  final List<(StoreScreenshot, String)> entries;
  const PreviewCaptureApp({super.key, required this.entries});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) => Directionality(
          textDirection: TextDirection.rtl,
          child: child ?? const SizedBox.shrink(),
        ),
        home: _CaptureRoot(entries: entries),
      );
}

class _CaptureRoot extends StatefulWidget {
  final List<(StoreScreenshot, String)> entries;
  const _CaptureRoot({required this.entries});

  @override
  State<_CaptureRoot> createState() => _CaptureRootState();
}

class _CaptureRootState extends State<_CaptureRoot> {
  late final List<(StoreScreenshot, String)> _entries;
  Timer? _timer;
  int _index = 0;
  int _shot = 0;
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _entries = widget.entries;
    if (_storeScreenAt >= 0) {
      _index = _storeScreenAt < _entries.length ? _storeScreenAt : 0;
      _started = true; // single manual capture — leave it on screen
      return;
    }
  }

  /// Waits until the screen is actually on the surface before starting the
  /// dwell, so capture 1 is never the still-blank engine window.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started || _entries.length < 2) return;
    _started = true;
    final binding = WidgetsBinding.instance;
    binding.waitUntilFirstFrameRasterized.then((_) {
      if (mounted) _cycle();
    });
  }

  /// Advances on a timer so the whole set is captured from one install: no
  /// rebuild between shots and no camera permission dialog involved.
  void _cycle() {
    _timer?.cancel();
    _timer = Timer(storeScreenDwell, () {
      if (!mounted) return;
      setState(_next);
      _cycle();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final (story, stem) = _entries[_index];
    final shot = _shot;
    // The capture runner (store-assets/capture_play_screenshots.ps1) takes a
    // shot only after this line appears, so it is emitted once the screen is
    // mounted *and* the blank window blink is over.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || shot != _shot) return;
      Future<void>.delayed(storeScreenSettle, () {
        if (!mounted || shot != _shot) return;
        debugPrint('STORE_CYCLE $shot ${story.key} $stem');
      });
    });
    return _CaptureSurface(
      key: ValueKey('shot-$_shot'),
      story: story,
    );
  }

  void _next() {
    _shot++;
    _index = (_index + 1) % _entries.length;
  }
}

/// The production screen plus the synthetic repository/session overrides it
/// needs. The screen widget itself is imported unchanged from `lib/screens`.
class _CaptureSurface extends StatelessWidget {
  final StoreScreenshot story;
  const _CaptureSurface({super.key, required this.story});

  @override
  Widget build(BuildContext context) => ProviderScope(
        overrides: _overrides(story.session, shellTab: story.shellTab),
        child: story.build(),
      );
}
