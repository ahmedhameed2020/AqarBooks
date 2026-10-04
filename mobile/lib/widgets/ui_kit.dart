import 'package:flutter/material.dart';

import '../core/app_core.dart';
import 'aqar_icons.dart';

/// White card with the locked radius-16 / #E2E8F0 hairline. `gold: true`
/// switches to the gold hairline reserved for premium moments (login form,
/// Fawry code, receipt, visitor pass).
class AqarCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final bool gold;
  final Color? borderColor;
  final double borderWidth;
  final Color color;
  final VoidCallback? onTap;
  const AqarCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.gold = false,
    this.borderColor,
    this.borderWidth = 1,
    this.color = Colors.white,
    this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: borderColor ?? (gold ? appGold : appCardBorder),
          width: borderWidth,
        ),
      ),
      child: child,
    );
    if (onTap == null) return card;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: card,
    );
  }
}

class StatusChip extends StatelessWidget {
  final String label;
  final Color fg;
  final Color bg;
  final double fontSize;
  const StatusChip(
    this.label, {
    super.key,
    required this.fg,
    required this.bg,
    this.fontSize = 11,
  });
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: fg,
            fontSize: fontSize,
            fontWeight: FontWeight.w600,
            height: 1.6,
          ),
        ),
      );
}

/// One filled primary action per screen; secondary is outlined; destructive
/// is red and always behind a confirmation (blueprint CTA hierarchy).
class AqarButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool secondary;
  final bool danger;
  final bool busy;
  final Widget? icon;
  const AqarButton(
    this.label, {
    super.key,
    required this.onPressed,
    this.secondary = false,
    this.danger = false,
    this.busy = false,
    this.icon,
  });
  @override
  Widget build(BuildContext context) {
    final fg = secondary ? appNavy : Colors.white;
    final child = busy
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[icon!, const SizedBox(width: 8)],
              Text(
                label,
                style: TextStyle(
                  color: fg,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          );
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: secondary
          ? OutlinedButton(
              onPressed: busy ? null : onPressed,
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: appNavy, width: 1.2),
                backgroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: child,
            )
          : FilledButton(
              onPressed: busy ? null : onPressed,
              style: FilledButton.styleFrom(
                backgroundColor: danger ? appDanger : appNavy,
                disabledBackgroundColor:
                    (danger ? appDanger : appNavy).withAlpha(140),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: child,
            ),
    );
  }
}

class IconBadge extends StatelessWidget {
  final AqarIconType icon;
  final Color fg;
  final Color bg;
  final double size;
  const IconBadge(
    this.icon, {
    super.key,
    this.fg = appNavy,
    this.bg = appSurface,
    this.size = 18,
  });
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: AqarIcon(icon, size: size, color: fg),
      );
}

/// Compact list row card: tinted icon on the reading side, title + subtitle,
/// optional trailing (chip / amount / chevron). Mirrors automatically in RTL.
class ListRowCard extends StatelessWidget {
  final AqarIconType? icon;
  final Color iconFg;
  final Color iconBg;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Widget? leadingOverride;
  const ListRowCard({
    super.key,
    this.icon,
    this.iconFg = appNavy,
    this.iconBg = appSurface,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.leadingOverride,
  });
  @override
  Widget build(BuildContext context) => AqarCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        onTap: onTap,
        child: Row(
          children: [
            if (leadingOverride != null)
              leadingOverride!
            else if (icon != null)
              IconBadge(icon!, fg: iconFg, bg: iconBg),
            if (leadingOverride != null || icon != null)
              const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: appInk,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, color: appGrey),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!]
            else if (onTap != null)
              const AqarIcon(AqarIconType.chevron, size: 16, color: appGrey),
          ],
        ),
      );
}

class KeyValueRow extends StatelessWidget {
  final String label;
  final String value;
  final Color valueColor;
  final double valueSize;
  const KeyValueRow(
    this.label,
    this.value, {
    super.key,
    this.valueColor = appInk,
    this.valueSize = 13,
  });
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 12, color: appGrey)),
            Text(
              value,
              style: TextStyle(
                fontSize: valueSize,
                fontWeight: FontWeight.w600,
                color: valueColor,
              ),
            ),
          ],
        ),
      );
}

/// Two-option segmented control (e.g. «عليّ / دفعت»).
class SegmentedTabs extends StatelessWidget {
  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;
  const SegmentedTabs({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
  });
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: const Color(0xFFE7EBF1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: GestureDetector(
                  onTap: () => onChanged(i),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: i == index ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(9),
                      border: i == index
                          ? Border.all(color: appCardBorder)
                          : null,
                    ),
                    child: Text(
                      labels[i],
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight:
                            i == index ? FontWeight.w700 : FontWeight.w500,
                        color: i == index ? appNavy : appGrey,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      );
}

class AqarNavItem {
  final String label;
  final AqarIconType icon;
  const AqarNavItem(this.label, this.icon);
}

/// Figma bottom navigation: white bar, hairline top border, active tab in
/// navy with the small purple indicator pill (gold on the dark gate theme).
/// `centerIndex` renders that tab as the prominent filled circle (collector).
class AqarBottomNav extends StatelessWidget {
  final List<AqarNavItem> items;
  final int index;
  final ValueChanged<int> onTap;
  final bool dark;
  final int? centerIndex;
  const AqarBottomNav({
    super.key,
    required this.items,
    required this.index,
    required this.onTap,
    this.dark = false,
    this.centerIndex,
  });
  @override
  Widget build(BuildContext context) {
    final bg = dark ? gatePanel : Colors.white;
    final border = dark ? gatePanelBorder : appCardBorder;
    final activeColor = dark ? Colors.white : appNavy;
    final inactiveColor = dark ? gateMuted : appGrey;
    final pillColor = dark ? appGold : appPurple;
    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(top: BorderSide(color: border)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
          child: Row(
            children: [
              for (var i = 0; i < items.length; i++)
                Expanded(
                  child: InkWell(
                    onTap: () => onTap(i),
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (centerIndex == i)
                            Container(
                              padding: const EdgeInsets.all(11),
                              decoration: const BoxDecoration(
                                color: appNavy,
                                shape: BoxShape.circle,
                              ),
                              child: AqarIcon(items[i].icon,
                                  size: 20, color: Colors.white),
                            )
                          else
                            AqarIcon(
                              items[i].icon,
                              size: 22,
                              color: i == index ? activeColor : inactiveColor,
                            ),
                          const SizedBox(height: 3),
                          Text(
                            items[i].label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: (i == index || centerIndex == i)
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                              color: (i == index || centerIndex == i)
                                  ? activeColor
                                  : inactiveColor,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Container(
                            width: 16,
                            height: 3,
                            decoration: BoxDecoration(
                              color: i == index && centerIndex != i
                                  ? pillColor
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Home header: greeting + context line with the bordered bell button.
class HomeHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? action;
  final VoidCallback? onBell;

  /// Shows a dot on the bell when there are unread notifications.
  final bool unread;
  const HomeHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.action,
    this.onBell,
    this.unread = false,
  });
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: appInk,
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: appGrey),
                    ),
                ],
              ),
            ),
            if (action != null)
              action!
            else if (onBell != null)
              Semantics(
                button: true,
                label: Localizations.localeOf(context).languageCode == 'ar'
                    ? (unread ? 'الإشعارات — لديك جديد' : 'الإشعارات')
                    : (unread ? 'Notifications — new' : 'Notifications'),
                child: InkWell(
                  onTap: onBell,
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(9),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: appCardBorder),
                        ),
                        child: const AqarIcon(AqarIconType.bell, size: 20),
                      ),
                      if (unread)
                        PositionedDirectional(
                          top: 6,
                          end: 6,
                          child: Container(
                            key: const ValueKey('bell-unread-dot'),
                            width: 9,
                            height: 9,
                            decoration: BoxDecoration(
                              color: appDanger,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 1.5),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      );
}

/// Pushed-screen header: title + RTL back arrow (points toward the reading
/// direction exactly as in the Figma screens).
class ScreenHeader extends StatelessWidget {
  final String title;
  final bool canPop;
  const ScreenHeader({super.key, required this.title, this.canPop = true});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 10),
        child: Row(
          children: [
            if (canPop)
              InkWell(
                onTap: () => Navigator.maybePop(context),
                borderRadius: BorderRadius.circular(8),
                child: const Padding(
                  padding: EdgeInsets.all(4),
                  child: AqarIcon(AqarIconType.back, size: 22),
                ),
              ),
            if (canPop) const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: appInk,
                ),
              ),
            ),
          ],
        ),
      );
}

/// Content-shaped loading skeleton with a gentle pulse. The pulse runs for a
/// bounded time and then rests, so a slow screen never animates forever.
class SkeletonList extends StatefulWidget {
  final int rows;
  final double rowHeight;
  const SkeletonList({super.key, this.rows = 4, this.rowHeight = 72});
  @override
  State<SkeletonList> createState() => _SkeletonListState();
}

class _SkeletonListState extends State<SkeletonList>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true, count: 8);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _pulse,
        builder: (context, _) {
          final block = Color.lerp(
            const Color(0xFFEDF1F6),
            const Color(0xFFDDE4EC),
            Curves.easeInOut.transform(_pulse.value),
          )!;
          return ListView.separated(
            padding: const EdgeInsets.all(20),
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: widget.rows,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (_, __) => Container(
              height: widget.rowHeight,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: appCardBorder),
              ),
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: block,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(height: 9, width: 140, color: block),
                        const SizedBox(height: 6),
                        Container(height: 7, width: 90, color: block),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
}

Future<bool> confirmDestructive(
  BuildContext context, {
  required String title,
  required String message,
  String? confirmLabel,
}) async {
  final ar = Localizations.localeOf(context).languageCode == 'ar';
  final result = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: Text(title,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(d, false),
          child: Text(ar ? 'تراجع' : 'Keep'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: appDanger),
          onPressed: () => Navigator.pop(d, true),
          child: Text(confirmLabel ?? (ar ? 'تأكيد' : 'Confirm')),
        ),
      ],
    ),
  );
  return result ?? false;
}

void showFeedback(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(message)));
}
