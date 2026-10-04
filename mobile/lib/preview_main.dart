// Dev-only visual QA gallery — renders the 16 approved Figma screens with
// canned data for pixel comparison. Never imported by lib/main.dart and
// never shipped: run with  flutter run -t lib/preview_main.dart -d chrome
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import 'core/app_core.dart';
import 'data/gate_device_store.dart';
import 'data/repository.dart';
import 'screens/app_screens.dart';
import 'widgets/aqar_icons.dart';
import 'widgets/gate_scanner_view.dart';
import 'widgets/ui_kit.dart';

void main() => runApp(const PreviewGalleryApp());

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
  Future<List<VisitorItem>> visitors() async => [
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
        transactionId: 'txn-1',
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
  Future<ManagerAttention> managerAttention(String? organizationId) async =>
      ManagerAttention(
        todayCollections: 45200,
        totalOverdue: 320500,
        openMaintenance: 14,
        visitorsInside: 6,
        items: [
          AttentionItem(
            kind: AttentionKind.overdue,
            title: 'B-07',
            amount: 48000,
            date: _iso(_now.subtract(const Duration(days: 45))),
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

List<Override> _overrides(AppSession session) => [
      repositoryProvider.overrideWithValue(const PreviewRepository()),
      sessionProvider.overrideWith((ref) async => session),
      savedPassesProvider.overrideWith((ref) async => [
            SavedPass(
              id: 'v1',
              guestName: 'محمد سامي',
              validUntil:
                  _iso(DateTime(_now.year, _now.month, _now.day, 23, 59)),
              payload: 'AQP1.v1.preview-secret',
              unitCode: 'A-12',
            ),
          ]),
      gateDeviceStoreProvider.overrideWithValue(_PreviewDeviceStore()),
      gateCameraEnabledProvider.overrideWithValue(false),
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
              guestName: 'محمد سامي',
              unitCode: 'A-12',
              validUntil:
                  _iso(DateTime(_now.year, _now.month, _now.day, 23, 59)),
              payload: 'AQP1.v1.preview-secret',
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
              guestName: 'محمد سامي',
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
