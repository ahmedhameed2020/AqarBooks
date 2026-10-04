/// Which units belong to the signed-in user as a member (owner / client).
///
/// Derived from the existing backend model only:
/// `members.user_id = auth.uid()` → `unit_ownerships` (active) for ownership,
/// `unit_leases.tenant_member_id` for read-only tenancy. A lessee is NOT an
/// owner: only [ownedUnitIds] unlock owner-only actions (maintenance requests,
/// visitor invitations, vehicles) and the owner portal entry.
class MemberPortal {
  /// `members.id` rows linked to the authenticated user.
  final Set<String> memberIds;

  /// Units the member currently owns (ownership has started and not ended).
  final Set<String> ownedUnitIds;

  /// Units the member rents (active or scheduled lease) and does not own.
  final Set<String> leasedUnitIds;

  const MemberPortal({
    this.memberIds = const {},
    this.ownedUnitIds = const {},
    this.leasedUnitIds = const {},
  });

  static const none = MemberPortal();

  /// The owner/client portal is available only to a linked member who owns at
  /// least one unit.
  bool get eligible => memberIds.isNotEmpty && ownedUnitIds.isNotEmpty;

  /// Units whose financial records the member may read in the app.
  Set<String> get readableUnitIds => {...ownedUnitIds, ...leasedUnitIds};

  bool owns(String unitId) => ownedUnitIds.contains(unitId);

  /// Builds the scope from raw rows, applying the same date rules as the
  /// backend policies (`end_date is null or end_date >= today`).
  factory MemberPortal.fromRows({
    required List<Map<String, dynamic>> members,
    required List<Map<String, dynamic>> ownerships,
    required List<Map<String, dynamic>> leases,
    required DateTime today,
  }) {
    final ids = {for (final m in members) m['id'] as String};
    if (ids.isEmpty) return none;
    final day = DateTime(today.year, today.month, today.day);
    DateTime? parse(Object? v) => v == null ? null : DateTime.tryParse('$v');
    bool current(Map<String, dynamic> r) {
      final start = parse(r['start_date'] ?? r['starts_on']);
      final end = parse(r['end_date'] ?? r['ends_on']);
      if (start != null && start.isAfter(day)) return false;
      return end == null || !end.isBefore(day);
    }

    final owned = {
      for (final o in ownerships)
        if (ids.contains(o['member_id']) && current(o)) o['unit_id'] as String,
    };
    final leased = {
      for (final l in leases)
        if (ids.contains(l['tenant_member_id']) &&
            const {'ACTIVE', 'SCHEDULED'}.contains(l['status']))
          l['unit_id'] as String,
    }..removeAll(owned);
    return MemberPortal(
      memberIds: ids,
      ownedUnitIds: owned,
      leasedUnitIds: leased,
    );
  }
}
