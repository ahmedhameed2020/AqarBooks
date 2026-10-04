import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../core/app_core.dart';

/// AqarBooks duotone stroke icon set — hand-drawn to match the vector icons
/// in the approved Figma file (navy line work, 24×24 grid, rounded caps).
/// These intentionally replace generic Material icons so the app matches the
/// design assets exactly.
enum AqarIconType {
  home,
  building,
  wallet,
  wrench,
  more,
  bell,
  qr,
  swap,
  back,
  chevron,
  chevronDown,
  sun,
  search,
  cash,
  receipt,
  cashbox,
  tasks,
  historyClock,
  user,
  people,
  inside,
  calendar,
  gear,
  pin,
  clock,
  camera,
  warning,
  check,
  mail,
  eye,
  gate,
  document,
  cheque,
  info,
  logout,
  language,
  phone,
  share,
  copy,
  flash,
  chat,
  chevronUp,
  eyeOff,
}

class AqarIcon extends StatelessWidget {
  final AqarIconType type;
  final double size;
  final Color color;
  final double strokeWidth;
  const AqarIcon(
    this.type, {
    super.key,
    this.size = 22,
    this.color = appNavy,
    this.strokeWidth = 1.7,
  });

  /// Icons that point along the reading direction (drawn for RTL) are
  /// mirrored under LTR so "forward" and "back" are right in English too.
  static const _directional = {AqarIconType.chevron, AqarIconType.back};

  @override
  Widget build(BuildContext context) {
    final icon = CustomPaint(
      size: Size.square(size),
      painter: _AqarIconPainter(type, color, strokeWidth),
    );
    final ltr = Directionality.maybeOf(context) == TextDirection.ltr;
    return ltr && _directional.contains(type)
        ? Transform.scale(scaleX: -1, child: icon)
        : icon;
  }
}

class _AqarIconPainter extends CustomPainter {
  final AqarIconType type;
  final Color color;
  final double strokeWidth;
  _AqarIconPainter(this.type, this.color, this.strokeWidth);

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.scale(s, s);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final fill = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    Path p() => Path();
    void poly(List<Offset> pts, {bool close = false}) {
      final path = p()..moveTo(pts.first.dx, pts.first.dy);
      for (final pt in pts.skip(1)) {
        path.lineTo(pt.dx, pt.dy);
      }
      if (close) path.close();
      canvas.drawPath(path, stroke);
    }

    void line(double x1, double y1, double x2, double y2) =>
        canvas.drawLine(Offset(x1, y1), Offset(x2, y2), stroke);
    void rrect(double x, double y, double w, double h, double r,
            {Paint? paint}) =>
        canvas.drawRRect(
          RRect.fromRectAndRadius(
              Rect.fromLTWH(x, y, w, h), Radius.circular(r)),
          paint ?? stroke,
        );
    void circle(double cx, double cy, double r, {Paint? paint}) =>
        canvas.drawCircle(Offset(cx, cy), r, paint ?? stroke);
    void dot(double cx, double cy, double r) =>
        canvas.drawCircle(Offset(cx, cy), r, fill);
    void arc(double cx, double cy, double r, double start, double sweep) =>
        canvas.drawArc(
            Rect.fromCircle(center: Offset(cx, cy), radius: r),
            start,
            sweep,
            false,
            stroke);

    switch (type) {
      case AqarIconType.home:
        poly(const [
          Offset(4, 10.5),
          Offset(12, 4),
          Offset(20, 10.5),
          Offset(20, 20),
          Offset(14.5, 20),
          Offset(14.5, 15),
          Offset(9.5, 15),
          Offset(9.5, 20),
          Offset(4, 20),
        ], close: true);
      case AqarIconType.building:
        rrect(5, 4, 14, 16, 1.5);
        line(9, 8, 11, 8);
        line(13, 8, 15, 8);
        line(9, 12, 11, 12);
        line(13, 12, 15, 12);
        poly(const [Offset(10, 20), Offset(10, 16.5), Offset(14, 16.5), Offset(14, 20)]);
      case AqarIconType.wallet:
        rrect(3.5, 6, 17, 13, 2.5);
        line(3.5, 9.5, 20.5, 9.5);
        dot(16.5, 14.5, 1.3);
      case AqarIconType.wrench:
        final path = p()
          ..moveTo(14.5, 6.5)
          ..arcToPoint(const Offset(9.1, 11.3),
              radius: const Radius.circular(4), clockwise: false)
          ..lineTo(4, 16.4)
          ..lineTo(4, 20)
          ..lineTo(7.6, 20)
          ..lineTo(12.7, 14.9)
          ..arcToPoint(const Offset(17.5, 9.5),
              radius: const Radius.circular(4), clockwise: false)
          ..lineTo(14.8, 12.2)
          ..lineTo(12.5, 9.9)
          ..lineTo(15.2, 7.2)
          ..close();
        canvas.drawPath(path, stroke);
      case AqarIconType.more:
        dot(5, 12, 1.6);
        dot(12, 12, 1.6);
        dot(19, 12, 1.6);
      case AqarIconType.bell:
        final path = p()
          ..moveTo(6, 10)
          ..arcToPoint(const Offset(18, 10),
              radius: const Radius.circular(6), clockwise: true)
          ..cubicTo(18, 14, 19.5, 15.5, 19.5, 15.5)
          ..lineTo(4.5, 15.5)
          ..cubicTo(4.5, 15.5, 6, 14, 6, 10)
          ..close();
        canvas.drawPath(path, stroke);
        arc(12, 18.4, 1.7, 0.25, math.pi - 0.5);
      case AqarIconType.qr:
        poly(const [Offset(4, 8), Offset(4, 4), Offset(8, 4)]);
        poly(const [Offset(16, 4), Offset(20, 4), Offset(20, 8)]);
        poly(const [Offset(20, 16), Offset(20, 20), Offset(16, 20)]);
        poly(const [Offset(8, 20), Offset(4, 20), Offset(4, 16)]);
        line(7.5, 12, 16.5, 12);
      case AqarIconType.swap:
        poly(const [Offset(7, 4), Offset(3.5, 7.5), Offset(7, 11)]);
        line(3.5, 7.5, 15, 7.5);
        poly(const [Offset(17, 13), Offset(20.5, 16.5), Offset(17, 20)]);
        line(20.5, 16.5, 9, 16.5);
      case AqarIconType.back:
        // RTL back: shaft with head pointing right (mirrors under RTL).
        line(5, 12, 19, 12);
        poly(const [Offset(13, 6), Offset(19, 12), Offset(13, 18)]);
      case AqarIconType.chevron:
        poly(const [Offset(14, 6), Offset(8, 12), Offset(14, 18)]);
      case AqarIconType.chevronDown:
        poly(const [Offset(6, 9), Offset(12, 15), Offset(18, 9)]);
      case AqarIconType.sun:
        circle(12, 12, 4);
        for (var i = 0; i < 8; i++) {
          final a = i * math.pi / 4;
          line(12 + math.cos(a) * 6.2, 12 + math.sin(a) * 6.2,
              12 + math.cos(a) * 8.6, 12 + math.sin(a) * 8.6);
        }
      case AqarIconType.search:
        circle(11, 11, 6.5);
        line(16, 16, 20.5, 20.5);
      case AqarIconType.cash:
        rrect(3, 7, 18, 11, 2);
        circle(12, 12.5, 2.6);
      case AqarIconType.receipt:
        final path = p()
          ..moveTo(6, 3)
          ..lineTo(18, 3)
          ..lineTo(18, 21)
          ..lineTo(16, 19.6)
          ..lineTo(14, 21)
          ..lineTo(12, 19.6)
          ..lineTo(10, 21)
          ..lineTo(8, 19.6)
          ..lineTo(6, 21)
          ..close();
        canvas.drawPath(path, stroke);
        line(9, 8, 15, 8);
        line(9, 12, 15, 12);
      case AqarIconType.cashbox:
        rrect(4, 7, 16, 13, 2);
        line(4, 11, 20, 11);
        poly(const [Offset(9, 4), Offset(15, 4), Offset(16.5, 7), Offset(7.5, 7)],
            close: true);
      case AqarIconType.tasks:
        line(9, 6, 20, 6);
        line(9, 12, 20, 12);
        line(9, 18, 20, 18);
        poly(const [Offset(4, 5.5), Offset(5, 6.5), Offset(6.8, 4.5)]);
        poly(const [Offset(4, 11.5), Offset(5, 12.5), Offset(6.8, 10.5)]);
        poly(const [Offset(4, 17.5), Offset(5, 18.5), Offset(6.8, 16.5)]);
      case AqarIconType.historyClock:
      case AqarIconType.clock:
        circle(12, 12, 8);
        poly(const [Offset(12, 8), Offset(12, 12.5), Offset(15, 14.3)]);
      case AqarIconType.user:
        circle(12, 8.5, 3.5);
        arc(12, 21, 7.2, math.pi + 0.35, math.pi - 0.7);
      case AqarIconType.people:
        circle(9, 9, 3);
        arc(9, 20.2, 5.6, math.pi + 0.3, math.pi - 0.6);
        circle(16.5, 9.5, 2.4);
        arc(16.8, 19.5, 4.4, math.pi + 0.6, math.pi / 2);
      case AqarIconType.inside:
        circle(10, 8.5, 3);
        arc(10, 20, 5.8, math.pi + 0.3, math.pi - 0.6);
        poly(const [Offset(15.5, 8.5), Offset(17.5, 10.5), Offset(21, 7)]);
      case AqarIconType.calendar:
        rrect(4, 5.5, 16, 15, 2);
        line(4, 10, 20, 10);
        line(8, 3.5, 8, 7.5);
        line(16, 3.5, 16, 7.5);
      case AqarIconType.gear:
        circle(12, 12, 3);
        for (var i = 0; i < 8; i++) {
          final a = i * math.pi / 4;
          line(12 + math.cos(a) * 6, 12 + math.sin(a) * 6,
              12 + math.cos(a) * 9, 12 + math.sin(a) * 9);
        }
      case AqarIconType.pin:
        final path = p()
          ..moveTo(12, 21)
          ..cubicTo(12, 21, 5.5, 15.7, 5.5, 11)
          ..arcToPoint(const Offset(18.5, 11),
              radius: const Radius.circular(6.5), clockwise: true)
          ..cubicTo(18.5, 15.7, 12, 21, 12, 21)
          ..close();
        canvas.drawPath(path, stroke);
        circle(12, 10.5, 2.3);
      case AqarIconType.camera:
        final path = p()
          ..moveTo(4, 8)
          ..lineTo(7, 8)
          ..lineTo(8.5, 5.5)
          ..lineTo(15.5, 5.5)
          ..lineTo(17, 8)
          ..lineTo(20, 8)
          ..lineTo(20, 19)
          ..lineTo(4, 19)
          ..close();
        canvas.drawPath(path, stroke);
        circle(12, 13, 3.2);
      case AqarIconType.warning:
        poly(const [Offset(12, 4), Offset(2.5, 20), Offset(21.5, 20)],
            close: true);
        line(12, 10, 12, 14.5);
        dot(12, 17.3, 1);
      case AqarIconType.check:
        poly(const [Offset(5, 12.5), Offset(9.5, 17), Offset(19, 7.5)]);
      case AqarIconType.mail:
        rrect(4, 6, 16, 12, 1);
        poly(const [Offset(4, 7), Offset(12, 13), Offset(20, 7)]);
      case AqarIconType.eye:
        final path = p()
          ..moveTo(2.5, 12)
          ..cubicTo(6, 5.5, 18, 5.5, 21.5, 12)
          ..cubicTo(18, 18.5, 6, 18.5, 2.5, 12)
          ..close();
        canvas.drawPath(path, stroke);
        circle(12, 12, 3);
      case AqarIconType.gate:
        poly(const [
          Offset(4, 20),
          Offset(4, 7),
          Offset(12, 3.5),
          Offset(20, 7),
          Offset(20, 20),
        ]);
        poly(const [Offset(9, 20), Offset(9, 14), Offset(15, 14), Offset(15, 20)]);
      case AqarIconType.document:
        poly(const [
          Offset(7, 3),
          Offset(14, 3),
          Offset(18, 7),
          Offset(18, 21),
          Offset(7, 21),
        ], close: true);
        poly(const [Offset(14, 3), Offset(14, 7), Offset(18, 7)]);
        line(10, 12, 15, 12);
        line(10, 15.5, 15, 15.5);
      case AqarIconType.cheque:
        rrect(3, 6, 18, 12, 2);
        line(6.5, 10, 13.5, 10);
        line(6.5, 13.5, 11, 13.5);
        line(15, 13.5, 17.5, 13.5);
      case AqarIconType.info:
        circle(12, 12, 8.5);
        line(12, 11, 12, 16);
        dot(12, 8.4, 1);
      case AqarIconType.logout:
        poly(const [Offset(14, 4), Offset(5, 4), Offset(5, 20), Offset(14, 20)]);
        line(10, 12, 20, 12);
        poly(const [Offset(16.5, 8.5), Offset(20, 12), Offset(16.5, 15.5)]);
      case AqarIconType.language:
        circle(12, 12, 8.5);
        line(3.5, 12, 20.5, 12);
        canvas.drawOval(Rect.fromCenter(center: const Offset(12, 12), width: 8.5, height: 17), stroke);
      case AqarIconType.phone:
        final path = p()
          ..moveTo(6.5, 3.5)
          ..lineTo(9.5, 3.5)
          ..lineTo(11, 8)
          ..lineTo(8.8, 9.8)
          ..cubicTo(9.9, 12.6, 11.4, 14.1, 14.2, 15.2)
          ..lineTo(16, 13)
          ..lineTo(20.5, 14.5)
          ..lineTo(20.5, 17.5)
          ..cubicTo(20.5, 19, 19.5, 20.2, 18, 20.2)
          ..cubicTo(10.5, 19.8, 4.2, 13.5, 3.8, 6)
          ..cubicTo(3.8, 4.5, 5, 3.5, 6.5, 3.5)
          ..close();
        canvas.drawPath(path, stroke);
      case AqarIconType.share:
        circle(6, 12, 2.4);
        circle(17, 5.5, 2.4);
        circle(17, 18.5, 2.4);
        line(8.2, 11, 14.8, 6.6);
        line(8.2, 13, 14.8, 17.4);
      case AqarIconType.flash:
        poly(const [
          Offset(13, 3),
          Offset(5.5, 13),
          Offset(11, 13),
          Offset(10.5, 21),
          Offset(18.5, 10.5),
          Offset(13, 10.5),
        ], close: true);
      case AqarIconType.chat:
        rrect(4, 4, 16, 12, 3);
        poly(const [Offset(8.5, 16), Offset(8.5, 20.5), Offset(13, 16)]);
        line(8, 8.5, 16, 8.5);
        line(8, 11.5, 13, 11.5);
      case AqarIconType.chevronUp:
        poly(const [Offset(6, 15), Offset(12, 9), Offset(18, 15)]);
      case AqarIconType.eyeOff:
        final hidden = p()
          ..moveTo(2.5, 12)
          ..cubicTo(6, 5.5, 18, 5.5, 21.5, 12)
          ..cubicTo(18, 18.5, 6, 18.5, 2.5, 12)
          ..close();
        canvas.drawPath(hidden, stroke);
        circle(12, 12, 3);
        line(4, 20, 20, 4);
      case AqarIconType.copy:
        rrect(8, 8, 12, 12, 2);
        poly(const [
          Offset(5.5, 15.5),
          Offset(4, 15.5),
          Offset(4, 4),
          Offset(15.5, 4),
          Offset(15.5, 5.5),
        ]);
    }
  }

  @override
  bool shouldRepaint(_AqarIconPainter old) =>
      old.type != type || old.color != color || old.strokeWidth != strokeWidth;
}
