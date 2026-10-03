import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/app_core.dart';

double outstandingAmount(double amount, double paid) =>
    (amount - paid).clamp(0, double.infinity);

bool canUseWorkOrderAction(AppSession? session, String action) {
  if (session == null) return false;
  const capabilities = <String, String>{
    'manage': 'operations.work_orders.manage',
    'complete': 'operations.work_orders.complete',
    'evidence': 'maintenance.attachments.manage',
  };
  final capability = capabilities[action];
  return capability != null && session.can(capability);
}

bool isHistoryWorkOrderStatus(String status) =>
    status == 'COMPLETED' || status == 'CANCELLED';

bool canTransitionWorkOrder(String current, String next) {
  const transitions = <String, Set<String>>{
    'ASSIGNED': {'IN_PROGRESS', 'CANCELLED'},
    'SCHEDULED': {'IN_PROGRESS', 'CANCELLED'},
    'IN_PROGRESS': {'WAITING', 'COMPLETED', 'CANCELLED'},
    'WAITING': {'IN_PROGRESS', 'CANCELLED'},
  };
  return transitions[current]?.contains(next) ?? false;
}

class AppSession {
  final User user;
  final String? organizationId;
  final String? organizationName;
  final Set<String> capabilities;
  const AppSession({
    required this.user,
    this.organizationId,
    this.organizationName,
    this.capabilities = const {},
  });
  bool can(String key) =>
      capabilities.contains('*') || capabilities.contains(key);
  bool get isStaff => can('operations.work_orders.view');
  bool get isManager =>
      can('finance.reports.read') || can('tenant.roles.manage');
}

class HomeSummary {
  final double balance;
  final int units;
  final int openMaintenance;
  final String currency;
  const HomeSummary({
    this.balance = 0,
    this.units = 0,
    this.openMaintenance = 0,
    this.currency = 'EGP',
  });
}

class UnitItem {
  final String id, code;
  final double balance;
  final String? type, leaseStatus, leaseStartsOn, leaseEndsOn;
  const UnitItem({
    required this.id,
    required this.code,
    this.balance = 0,
    this.type,
    this.leaseStatus,
    this.leaseStartsOn,
    this.leaseEndsOn,
  });
}

class DueItem {
  final String id, description;
  final double amount, paid, outstanding;
  final String dueDate;
  final String? unitCode;
  const DueItem({
    required this.id,
    required this.description,
    required this.amount,
    required this.paid,
    required this.outstanding,
    required this.dueDate,
    this.unitCode,
  });
}

class PaymentItem {
  final String id, receipt, date, method;
  final double amount;
  final String? unitCode;
  const PaymentItem({
    required this.id,
    required this.receipt,
    required this.date,
    required this.method,
    required this.amount,
    this.unitCode,
  });
}

class MaintenanceItem {
  final String id, requestNo, title, status, priority, submittedAt, unitCode;
  const MaintenanceItem({
    required this.id,
    required this.requestNo,
    required this.title,
    required this.status,
    required this.priority,
    required this.submittedAt,
    required this.unitCode,
  });
}

class WorkOrderItem {
  final String id, number, title, status, unitCode;
  final String? dueAt;
  const WorkOrderItem({
    required this.id,
    required this.number,
    required this.title,
    required this.status,
    required this.unitCode,
    this.dueAt,
  });
}

class VisitorItem {
  final String id, number, guestName, validFrom, validUntil, status, unitCode;
  final String? phone, note;
  final String usagePolicy;
  const VisitorItem({
    required this.id,
    required this.number,
    required this.guestName,
    required this.validFrom,
    required this.validUntil,
    required this.status,
    required this.unitCode,
    this.phone,
    this.note,
    required this.usagePolicy,
  });
}

class VisitorCreateResult {
  final String id, qrPayload;
  const VisitorCreateResult(this.id, this.qrPayload);
}

class VehicleItem {
  final String id, plateNumber, country, unitCode;
  final bool active;
  final String? make, model, color, notes;
  const VehicleItem({
    required this.id,
    required this.plateNumber,
    required this.country,
    required this.unitCode,
    required this.active,
    this.make,
    this.model,
    this.color,
    this.notes,
  });
}

class NotificationItem {
  final String id, titleAr, titleEn, bodyAr, bodyEn, priority, createdAt;
  final bool isRead;
  const NotificationItem({
    required this.id,
    required this.titleAr,
    required this.titleEn,
    required this.bodyAr,
    required this.bodyEn,
    required this.priority,
    required this.createdAt,
    required this.isRead,
  });
}

class MaintenanceDetail {
  final MaintenanceItem request;
  final String description, categoryId;
  final List<Map<String, dynamic>> updates, attachments, workOrders;
  const MaintenanceDetail({
    required this.request,
    required this.description,
    required this.categoryId,
    required this.updates,
    required this.attachments,
    required this.workOrders,
  });
}

class WorkOrderDetail {
  final String requestId;
  final WorkOrderItem workOrder;
  final List<Map<String, dynamic>> updates, attachments;
  const WorkOrderDetail({
    required this.requestId,
    required this.workOrder,
    required this.updates,
    required this.attachments,
  });
}

class ManagerSummary {
  final int openDues,
      overdueDues,
      openMaintenance,
      openWorkOrders,
      unreadAlerts,
      activeVisitors,
      visitorsInside,
      occupiedUnits,
      totalUnits;
  final double outstanding, collections;
  const ManagerSummary({
    this.openDues = 0,
    this.overdueDues = 0,
    this.openMaintenance = 0,
    this.openWorkOrders = 0,
    this.unreadAlerts = 0,
    this.activeVisitors = 0,
    this.visitorsInside = 0,
    this.occupiedUnits = 0,
    this.totalUnits = 0,
    this.outstanding = 0,
    this.collections = 0,
  });
}

final repositoryProvider = Provider<AqarRepository>(
  (ref) => AqarRepository(ref.watch(supabaseProvider)),
);
final authStateProvider = StreamProvider<AuthState>((ref) async* {
  final client = ref.watch(supabaseProvider);
  if (client == null) return;
  yield AuthState(AuthChangeEvent.initialSession, client.auth.currentSession);
  yield* client.auth.onAuthStateChange;
});
final sessionProvider = FutureProvider.autoDispose<AppSession?>(
  (ref) async => ref.watch(repositoryProvider).loadSession(),
);

class AqarRepository {
  final SupabaseClient? client;
  const AqarRepository(this.client);
  SupabaseClient get db {
    final value = client;
    if (value == null) {
      throw const AppRepositoryException('Supabase is not configured');
    }
    return value;
  }

  Future<void> signIn(String email, String password) async {
    await db.auth.signInWithPassword(email: email.trim(), password: password);
  }

  Future<void> resetPassword(String email) async {
    await db.auth.resetPasswordForEmail(email.trim());
  }

  Future<void> signOut() async {
    await db.auth.signOut();
  }

  Future<AppSession?> loadSession() async {
    final user = db.auth.currentUser;
    if (user == null) return null;
    try {
      final membership = await db
          .from('organization_memberships')
          .select('organization_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at')
          .limit(1)
          .maybeSingle();
      if (membership == null) return AppSession(user: user);
      final orgId = membership['organization_id'] as String;
      final org = await db
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .maybeSingle();
      final assignments = await db
          .from('user_role_assignments')
          .select('role_id')
          .eq('organization_id', orgId)
          .eq('user_id', user.id);
      final roleIds = assignments.map((r) => r['role_id'] as String).toList();
      if (roleIds.isEmpty) {
        return AppSession(
          user: user,
          organizationId: orgId,
          organizationName: org?['name'] as String?,
        );
      }
      final roles = await db
          .from('roles')
          .select('id, key, organization_id')
          .inFilter('id', roleIds);
      final valid = roles
          .where(
            (r) =>
                r['key'] != 'PLATFORM_SUPER_ADMIN' &&
                (r['organization_id'] == null || r['organization_id'] == orgId),
          )
          .map((r) => r['id'] as String)
          .toList();
      if (valid.isEmpty) {
        return AppSession(
          user: user,
          organizationId: orgId,
          organizationName: org?['name'] as String?,
        );
      }
      final grants = await db
          .from('role_permissions')
          .select('permission_id')
          .inFilter('role_id', valid);
      final permissionIds = grants
          .map((r) => r['permission_id'] as String)
          .toList();
      if (permissionIds.isEmpty) {
        return AppSession(
          user: user,
          organizationId: orgId,
          organizationName: org?['name'] as String?,
        );
      }
      final permissions = await db
          .from('permissions')
          .select('key')
          .inFilter('id', permissionIds);
      return AppSession(
        user: user,
        organizationId: orgId,
        organizationName: org?['name'] as String?,
        capabilities: permissions.map((r) => r['key'] as String).toSet(),
      );
    } on PostgrestException {
      return AppSession(user: user);
    }
  }

  Future<HomeSummary> homeSummary() async {
    final summary = await db
        .from('members_with_financials')
        .select('total_balance, units_count')
        .eq('user_id', db.auth.currentUser!.id)
        .maybeSingle();
    final requests = await db
        .from('maintenance_requests')
        .select('id')
        .not('status', 'in', '(COMPLETED,CLOSED,CANCELLED)');
    return HomeSummary(
      balance: double.tryParse('${summary?['total_balance'] ?? 0}') ?? 0,
      units: int.tryParse('${summary?['units_count'] ?? 0}') ?? 0,
      openMaintenance: requests.length,
    );
  }

  Future<List<UnitItem>> units() async {
    final rows = await db
        .from('units_with_financials')
        .select('id, code, balance, unit_type')
        .order('code');
    final ids = rows.map((r) => r['id'] as String).toList();
    final leases = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await db
              .from('unit_leases')
              .select('unit_id,status,starts_on,ends_on')
              .inFilter('unit_id', ids)
              .inFilter('status', ['ACTIVE', 'SCHEDULED', 'ENDED'])
              .order('starts_on', ascending: false);
    final leaseByUnit = <String, Map<String, dynamic>>{};
    for (final lease in leases) {
      leaseByUnit.putIfAbsent(lease['unit_id'] as String, () => lease);
    }
    return rows.map((r) {
      final lease = leaseByUnit[r['id']];
      return UnitItem(
        id: r['id'],
        code: r['code'] ?? '—',
        balance: double.tryParse('${r['balance'] ?? 0}') ?? 0,
        type: r['unit_type'] as String?,
        leaseStatus: lease?['status'] as String?,
        leaseStartsOn: lease?['starts_on'] as String?,
        leaseEndsOn: lease?['ends_on'] as String?,
      );
    }).toList();
  }

  Future<List<DueItem>> dues() async {
    final rows = await db
        .from('dues')
        .select(
          'id, amount, issue_date, due_date, description, status, units(code)',
        )
        .inFilter('status', ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'])
        .order('due_date');
    final ids = rows.map((r) => r['id'] as String).toList();
    final paid = <String, double>{};
    if (ids.isNotEmpty) {
      final allocations = await db
          .from('payment_allocations')
          .select('due_id, amount, reversed_at')
          .inFilter('due_id', ids);
      for (final row in allocations) {
        if (row['reversed_at'] == null) {
          paid[row['due_id']] =
              (paid[row['due_id']] ?? 0) +
              (double.tryParse('${row['amount']}') ?? 0);
        }
      }
    }
    return rows.map((r) {
      final amount = double.tryParse('${r['amount']}') ?? 0;
      final p = paid[r['id']] ?? 0;
      final nested = r['units'];
      return DueItem(
        id: r['id'],
        description: r['description'] ?? 'Periodic due',
        amount: amount,
        paid: p,
        outstanding: outstandingAmount(amount, p),
        dueDate: r['due_date'] ?? '',
        unitCode: nested is Map ? nested['code'] as String? : null,
      );
    }).toList();
  }

  Future<List<PaymentItem>> payments() async {
    final rows = await db
        .from('payments')
        .select(
          'id, amount, payment_date, method, receipt_no, receipt_number, memo, unit_id',
        )
        .eq('member_id', db.auth.currentUser!.id)
        .order('payment_date', ascending: false);
    return rows
        .map(
          (r) => PaymentItem(
            id: r['id'],
            receipt:
                r['receipt_no'] ??
                (r['receipt_number'] == null
                    ? 'PAY-${(r['id'] as String).substring(0, 8)}'
                    : 'REC-${r['receipt_number']}'),
            date: r['payment_date'] ?? '',
            method: r['method'] ?? '—',
            amount: double.tryParse('${r['amount'] ?? 0}') ?? 0,
          ),
        )
        .toList();
  }

  Future<List<Map<String, dynamic>>> maintenanceCategories() async {
    final rows = await db
        .from('maintenance_categories')
        .select('id,name_ar,name_en,default_priority')
        .eq('is_active', true)
        .order('sort_order');
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<MaintenanceItem>> maintenance() async {
    final rows = await db
        .from('maintenance_requests')
        .select(
          'id, request_no, title, status, priority, submitted_at, unit_id',
        )
        .order('created_at', ascending: false);
    final ids = rows.map((r) => r['unit_id'] as String).toSet().toList();
    final unitRows = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await db.from('units').select('id, code').inFilter('id', ids);
    final map = {
      for (final r in unitRows) r['id'] as String: r['code'] as String,
    };
    return rows
        .map(
          (r) => MaintenanceItem(
            id: r['id'],
            requestNo: r['request_no'] ?? '—',
            title: r['title'] ?? '—',
            status: r['status'] ?? '—',
            priority: r['priority'] ?? '—',
            submittedAt: r['submitted_at'] ?? '',
            unitCode: map[r['unit_id']] ?? '—',
          ),
        )
        .toList();
  }

  Future<List<UnitItem>> authorizedUnits() => units();
  Future<List<VisitorItem>> visitors() async {
    final rows = await db
        .from('visitor_invitations')
        .select(
          'id, invitation_no, guest_name, guest_phone, guest_note, valid_from, valid_until, usage_policy, status, unit_id',
        )
        .order('created_at', ascending: false);
    final ids = rows.map((r) => r['unit_id'] as String).toSet().toList();
    final units = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await db.from('units').select('id, code').inFilter('id', ids);
    final names = {
      for (final r in units) r['id'] as String: r['code'] as String,
    };
    return rows
        .map(
          (r) => VisitorItem(
            id: r['id'],
            number: r['invitation_no'] ?? '—',
            guestName: r['guest_name'] ?? '—',
            validFrom: r['valid_from'] ?? '',
            validUntil: r['valid_until'] ?? '',
            status: r['status'] ?? '—',
            unitCode: names[r['unit_id']] ?? '—',
            phone: r['guest_phone'] as String?,
            note: r['guest_note'] as String?,
            usagePolicy: r['usage_policy'] ?? 'SINGLE_USE',
          ),
        )
        .toList();
  }

  Future<VisitorCreateResult> createVisitor({
    required String unitId,
    required String guestName,
    String? phone,
    String? note,
    required String from,
    required String until,
    required String usage,
  }) async {
    final bytes = List<int>.generate(32, (_) => Random.secure().nextInt(256));
    final secret = base64UrlEncode(bytes);
    final data = await db.rpc(
      'create_visitor_invitation',
      params: {
        'p_unit_id': unitId,
        'p_token_hash': sha256.convert(utf8.encode(secret)).toString(),
        'p_token_hint': secret.substring(secret.length - 8),
        'p_guest_name': guestName,
        'p_guest_phone': phone,
        'p_guest_note': note,
        'p_valid_from': from,
        'p_valid_until': until,
        'p_usage_policy': usage,
      },
    );
    final id = data as String;
    return VisitorCreateResult(id, 'AQP1.$id.$secret');
  }

  Future<void> revokeVisitor(String id) async {
    await db.rpc('revoke_visitor_invitation', params: {'p_invitation_id': id});
  }

  Future<List<VehicleItem>> vehicles() async {
    final rows = await db
        .from('vehicles')
        .select(
          'id, plate_number, plate_country, make, model, color, notes, is_active, unit_id',
        )
        .order('created_at', ascending: false);
    final ids = rows.map((r) => r['unit_id'] as String).toSet().toList();
    final us = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await db.from('units').select('id,code').inFilter('id', ids);
    final names = {for (final r in us) r['id'] as String: r['code'] as String};
    return rows
        .map(
          (r) => VehicleItem(
            id: r['id'],
            plateNumber: r['plate_number'] ?? '—',
            country: r['plate_country'] ?? '—',
            unitCode: names[r['unit_id']] ?? '—',
            active: r['is_active'] == true,
            make: r['make'] as String?,
            model: r['model'] as String?,
            color: r['color'] as String?,
            notes: r['notes'] as String?,
          ),
        )
        .toList();
  }

  Future<String> createVehicle({
    required String unitId,
    required String plateNumber,
    required String country,
    String? region,
    String? make,
    String? model,
    String? color,
    int? year,
    String? notes,
  }) async {
    final data = await db.rpc(
      'create_vehicle',
      params: {
        'p_unit_id': unitId,
        'p_plate_number': plateNumber,
        'p_plate_country': country,
        'p_plate_region': region,
        'p_make': make,
        'p_model': model,
        'p_color': color,
        'p_year': year,
        'p_notes': notes,
      },
    );
    return data as String;
  }

  Future<void> deactivateVehicle(String id) async {
    await db.rpc('deactivate_own_vehicle', params: {'p_vehicle_id': id});
  }

  Future<List<NotificationItem>> notifications() async {
    final rows = await db
        .from('notifications')
        .select(
          'id,title_ar,title_en,body_ar,body_en,priority,created_at,is_read',
        )
        .order('created_at', ascending: false);
    return rows
        .map(
          (r) => NotificationItem(
            id: r['id'],
            titleAr: r['title_ar'] ?? '',
            titleEn: r['title_en'] ?? '',
            bodyAr: r['body_ar'] ?? '',
            bodyEn: r['body_en'] ?? '',
            priority: r['priority'] ?? 'NORMAL',
            createdAt: r['created_at'] ?? '',
            isRead: r['is_read'] == true,
          ),
        )
        .toList();
  }

  Future<void> markNotification(String id) async {
    await db.rpc('mark_notification_read', params: {'p_notification_id': id});
  }

  Future<void> markAllNotifications() async {
    await db.rpc('mark_all_notifications_read');
  }

  Future<MaintenanceDetail> maintenanceDetail(String id) async {
    final r = await db
        .from('maintenance_requests')
        .select(
          'id,request_no,title,status,priority,submitted_at,unit_id,category_id,description',
        )
        .eq('id', id)
        .maybeSingle();
    if (r == null) throw const AppRepositoryException('not_found');
    final u = await db
        .from('units')
        .select('code')
        .eq('id', r['unit_id'])
        .maybeSingle();
    final request = MaintenanceItem(
      id: r['id'],
      requestNo: r['request_no'] ?? '—',
      title: r['title'] ?? '—',
      status: r['status'] ?? '—',
      priority: r['priority'] ?? '—',
      submittedAt: r['submitted_at'] ?? '',
      unitCode: u?['code'] ?? '—',
    );
    final updates = await db
        .from('maintenance_request_updates')
        .select(
          'id,note,previous_status,resulting_status,visibility,created_at',
        )
        .eq('maintenance_request_id', id)
        .order('created_at', ascending: false);
    final attachments = await db
        .from('maintenance_request_attachments')
        .select(
          'id,kind,visibility,original_file_name,mime_type,byte_size,created_at,ready_at',
        )
        .eq('maintenance_request_id', id)
        .eq('status', 'READY')
        .order('created_at', ascending: false);
    final orders = await db
        .from('work_orders')
        .select(
          'id,work_order_no,status,scheduled_start_at,scheduled_end_at,sla_due_at,member_visible_summary,created_at',
        )
        .eq('maintenance_request_id', id)
        .order('created_at', ascending: false);
    return MaintenanceDetail(
      request: request,
      description: r['description'] ?? '',
      categoryId: r['category_id'],
      updates: List<Map<String, dynamic>>.from(updates),
      attachments: List<Map<String, dynamic>>.from(attachments),
      workOrders: List<Map<String, dynamic>>.from(orders),
    );
  }

  Future<String> createMaintenance({
    required String unitId,
    required String categoryId,
    required String title,
    required String description,
    required String priority,
  }) async {
    final data = await db.rpc(
      'create_maintenance_request',
      params: {
        'p_unit_id': unitId,
        'p_category_id': categoryId,
        'p_title': title,
        'p_description': description,
        'p_priority': priority,
      },
    );
    return data as String;
  }

  Future<void> cancelMaintenance(String id, String? note) async {
    await db.rpc(
      'cancel_own_maintenance_request',
      params: {'p_request_id': id, 'p_note': note},
    );
  }

  Future<void> uploadMaintenanceAttachment({
    required String requestId,
    required String fileName,
    required String mimeType,
    required Uint8List bytes,
    String kind = 'ISSUE',
    String visibility = 'MEMBER_VISIBLE',
  }) async {
    final data = await db.rpc(
      'begin_maintenance_attachment_upload',
      params: {
        'p_request_id': requestId,
        'p_original_file_name': fileName,
        'p_mime_type': mimeType,
        'p_byte_size': bytes.length,
        'p_kind': kind,
        'p_visibility': visibility,
      },
    );
    final intent = (data as List).first as Map;
    final signed = await db.storage
        .from('maintenance-attachments')
        .createSignedUploadUrl(intent['storage_path'] as String, upsert: false);
    await db.storage
        .from('maintenance-attachments')
        .uploadBinaryToSignedUrl(
          intent['storage_path'] as String,
          signed.token,
          bytes,
        );
    try {
      await db.rpc(
        'finalize_maintenance_attachment_upload',
        params: {'p_attachment_id': intent['attachment_id']},
      );
    } catch (_) {
      await db.rpc(
        'abort_maintenance_attachment_upload',
        params: {'p_attachment_id': intent['attachment_id']},
      );
      rethrow;
    }
  }

  Future<WorkOrderDetail> workOrderDetail(String id) async {
    final r = await db
        .from('work_orders')
        .select(
          'id,work_order_no,maintenance_request_id,status,unit_id,sla_due_at',
        )
        .eq('id', id)
        .maybeSingle();
    if (r == null) throw const AppRepositoryException('not_found');
    final req = await db
        .from('maintenance_requests')
        .select('title')
        .eq('id', r['maintenance_request_id'])
        .maybeSingle();
    final u = await db
        .from('units')
        .select('code')
        .eq('id', r['unit_id'])
        .maybeSingle();
    final item = WorkOrderItem(
      id: r['id'],
      number: r['work_order_no'] ?? '—',
      title: req?['title'] ?? 'Work order',
      status: r['status'] ?? '—',
      unitCode: u?['code'] ?? '—',
      dueAt: r['sla_due_at'],
    );
    final updates = await db
        .from('work_order_updates')
        .select(
          'id,note,previous_status,resulting_status,visibility,created_at',
        )
        .eq('work_order_id', id)
        .order('created_at', ascending: false);
    final attachments = await db
        .from('maintenance_request_attachments')
        .select(
          'id,kind,original_file_name,mime_type,byte_size,created_at,ready_at',
        )
        .eq('maintenance_request_id', r['maintenance_request_id'])
        .eq('status', 'READY')
        .order('created_at', ascending: false);
    return WorkOrderDetail(
      requestId: r['maintenance_request_id'],
      workOrder: item,
      updates: List<Map<String, dynamic>>.from(updates),
      attachments: List<Map<String, dynamic>>.from(attachments),
    );
  }

  Future<void> workOrderTransition(
    String rpc,
    String id,
    String? note, {
    String visibility = 'MEMBER_VISIBLE',
  }) async {
    await db.rpc(
      rpc,
      params: {
        'p_work_order_id': id,
        'p_note': note,
        'p_visibility': visibility,
      },
    );
  }

  Future<void> completeWorkOrder(
    String id,
    String summary,
    String? visible,
    String? note,
  ) async {
    await db.rpc(
      'complete_work_order',
      params: {
        'p_work_order_id': id,
        'p_completion_summary': summary,
        'p_member_visible_summary': visible,
        'p_note': note,
        'p_visibility': 'MEMBER_VISIBLE',
      },
    );
  }

  Future<void> addWorkOrderNote(String id, String note) async {
    await db.rpc(
      'add_work_order_update',
      params: {
        'p_work_order_id': id,
        'p_note': note,
        'p_visibility': 'STAFF_ONLY',
      },
    );
  }

  Future<ManagerSummary> managerSummary() async {
    final duesRows = await db.from('dues').select('amount,status').inFilter(
      'status',
      ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'],
    );
    final maintenanceRows = await db
        .from('maintenance_requests')
        .select('id')
        .not('status', 'in', '(COMPLETED,CLOSED,CANCELLED)');
    final orders = await db
        .from('work_orders')
        .select('id')
        .not('status', 'in', '(COMPLETED,CANCELLED)');
    final alerts = await db
        .from('notifications')
        .select('id')
        .eq('is_read', false);
    final payments = await db.from('payments').select('amount');
    final units = await db.from('units').select('id');
    final ownerships = await db
        .from('unit_ownerships')
        .select('unit_id,start_date,end_date');
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final occupied = ownerships
        .where(
          (r) =>
              (r['start_date'] == null || r['start_date'] <= today) &&
              (r['end_date'] == null || r['end_date'] >= today),
        )
        .map((r) => r['unit_id'])
        .toSet();
    final visitors = await db
        .from('visitor_invitations')
        .select('id')
        .eq('status', 'ACTIVE')
        .gt('valid_until', DateTime.now().toUtc().toIso8601String());
    // Gate hardware activity is not exposed by a member-safe portal query; keep it explicitly unavailable.
    const visitorsInside = 0;
    final outstanding = duesRows.fold<double>(
      0,
      (s, r) => s + (double.tryParse('${r['amount'] ?? 0}') ?? 0),
    );
    final collections = payments.fold<double>(
      0,
      (s, r) => s + (double.tryParse('${r['amount'] ?? 0}') ?? 0),
    );
    return ManagerSummary(
      openDues: duesRows.length,
      overdueDues: duesRows.where((r) => r['status'] == 'OVERDUE').length,
      openMaintenance: maintenanceRows.length,
      openWorkOrders: orders.length,
      unreadAlerts: alerts.length,
      activeVisitors: visitors.length,
      visitorsInside: visitorsInside,
      occupiedUnits: occupied.length,
      totalUnits: units.length,
      outstanding: outstanding,
      collections: collections,
    );
  }

  Future<List<WorkOrderItem>> workOrders() =>
      _assignedWorkOrders(history: false);

  Future<List<WorkOrderItem>> workOrderHistory() =>
      _assignedWorkOrders(history: true);

  Future<List<WorkOrderItem>> _assignedWorkOrders({
    required bool history,
  }) async {
    var query = db
        .from('work_orders')
        .select(
          'id, work_order_no, maintenance_request_id, status, unit_id, sla_due_at',
        )
        .eq('assigned_user_id', db.auth.currentUser!.id);
    query = history
        ? query.inFilter('status', ['COMPLETED', 'CANCELLED'])
        : query.not('status', 'in', '(COMPLETED,CANCELLED)');
    final rows = await query.order('created_at', ascending: false).limit(100);
    final ids = rows
        .map((r) => r['maintenance_request_id'] as String)
        .toSet()
        .toList();
    final reqs = ids.isEmpty
        ? <Map<String, dynamic>>[]
        : await db
              .from('maintenance_requests')
              .select('id, title')
              .inFilter('id', ids);
    final titles = {
      for (final r in reqs) r['id'] as String: r['title'] as String,
    };
    return rows
        .map(
          (r) => WorkOrderItem(
            id: r['id'],
            number: r['work_order_no'] ?? '—',
            title: titles[r['maintenance_request_id']] ?? 'Work order',
            status: r['status'] ?? '—',
            unitCode: r['unit_id'] ?? '—',
            dueAt: r['sla_due_at'] as String?,
          ),
        )
        .toList();
  }
}

class AppRepositoryException implements Exception {
  final String message;
  const AppRepositoryException(this.message);
  @override
  String toString() => message;
}
