// Explicit local capture only; not a Play-installed/Android artifact capture.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:aqarbooks_mobile/core/app_core.dart';
import 'package:aqarbooks_mobile/data/repository.dart';
import 'package:aqarbooks_mobile/screens/collector_screens.dart';
import 'package:aqarbooks_mobile/screens/resident_screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _capture = bool.fromEnvironment('CAPTURE_STORE_V1');
const _demoReceipt = PaymentItem(
  id: 'local-demo-receipt',
  receipt: 'QA-0001',
  date: '2026-10-01',
  method: 'CASH',
  amount: 1500,
  unitCode: 'A-12',
  unitId: 'local-demo-unit',
);

Widget _app(Widget child) => ProviderScope(
  overrides: [
    repositoryProvider.overrideWithValue(const AqarRepository(null)),
    duesProvider.overrideWith((ref) async => const [DueItem(
      id: 'local-demo-due', description: 'مستحقات الصيانة', amount: 2500,
      paid: 1000, outstanding: 1500, dueDate: '2026-10-01',
    )]),
    paymentsProvider.overrideWith((ref) async => const [_demoReceipt]),
  ],
  child: MaterialApp(
    debugShowCheckedModeBanner: false,
    theme: buildTheme(),
    locale: const Locale('ar'),
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: const [
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: child,
  ),
);

Future<void> _save(WidgetTester tester, GlobalKey key, String name) async {
  final boundary =
      key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 3);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    final target = File('store-assets/screenshots/v1-candidate/ar/$name');
    await target.parent.create(recursive: true);
    await target.writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  testWidgets(
    'capture actual receipt widget with fictional data for V1 review',
    (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final fonts = FontLoader(appFontFamily);
      for (final weight in ['Regular', 'Medium', 'SemiBold', 'Bold']) {
        fonts.addFont(
          rootBundle.load('assets/fonts/IBMPlexSansArabic-$weight.ttf'),
        );
      }
      await fonts.load();
      final key = GlobalKey();
      await tester.pumpWidget(
        _app(
          RepaintBoundary(
            key: key,
            child: const ReceiptDetailScreen(payment: _demoReceipt),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('تفاصيل الإيصال'), findsOneWidget);
      expect(find.text('A-12'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _save(tester, key, '03-collection-receipt.png');

      final marketingKey = GlobalKey();
      await tester.pumpWidget(
        _app(
          RepaintBoundary(
            key: marketingKey,
            child: Scaffold(
              backgroundColor: appSurface,
              body: Column(
                children: [
                  const SizedBox(height: 30),
                  const SizedBox(height: 8),
                  const Text(
                    'AqarBooks',
                    style: TextStyle(
                      color: appNavy,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'إيصالات التحصيل',
                    style: TextStyle(
                      color: appNavy,
                      fontSize: 30,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'تفاصيل واضحة لكل عملية مسجّلة',
                    style: TextStyle(color: appBlue, fontSize: 13),
                  ),
                  const SizedBox(height: 20),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: appNavyDark,
                          borderRadius: BorderRadius.circular(22),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(17),
                            child: const ReceiptDetailScreen(
                              payment: _demoReceipt,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'واجهة التطبيق • بيانات تجريبية',
                    style: TextStyle(color: appGrey, fontSize: 10),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('تفاصيل الإيصال'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _save(tester, marketingKey, '03-collection-receipt-marketing.png');
      final duesKey = GlobalKey();
      await tester.pumpWidget(_app(RepaintBoundary(
        key: duesKey,
        child: const Scaffold(body: PaymentsTabScreen()),
      )));
      await tester.pumpAndSettle();
      expect(find.text('مستحقات الصيانة'), findsOneWidget);
      expect(find.text('ادفع بفوري'), findsNothing);
      expect(tester.takeException(), isNull);
      await _save(tester, duesKey, '02-dues-v1.png');
    },
    skip: !_capture,
  );
}
