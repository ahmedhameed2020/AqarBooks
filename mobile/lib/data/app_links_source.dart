import 'package:app_links/app_links.dart';

import '../screens/activation_screens.dart';

/// Real cold-start / warm deep-link source backed by the platform.
class PlatformActivationLinkSource implements ActivationLinkSource {
  final AppLinks _links;
  PlatformActivationLinkSource([AppLinks? links]) : _links = links ?? AppLinks();
  @override
  Future<Uri?> initialLink() => _links.getInitialLink();
  @override
  Stream<Uri> get links => _links.uriLinkStream;
}
