import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The selected bottom-navigation tab of the signed-in shell. Held in a
/// provider (not widget state) so a KPI or attention row on one tab can send
/// the user to the tab that explains it.
final shellTabProvider = StateProvider.autoDispose<int>((ref) => 0);
