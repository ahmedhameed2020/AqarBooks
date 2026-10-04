import 'dart:convert';

import 'package:aqarbooks_mobile/core/owner_auth.dart';
import 'package:aqarbooks_mobile/data/portal_access.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _token = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';

void main() {
  group('identifier -> auth email', () {
    test('a real e-mail is passed through trimmed', () {
      expect(authEmailForIdentifier('  Owner@Example.com '), 'Owner@Example.com');
      expect(isClientIdentifier('owner@example.com'), isFalse);
    });

    test('Client ID variants map to the same hidden alias', () {
      const alias = 'mb-10482@client.aqarbooks.local';
      for (final input in [
        'MB-10482',
        'mb-10482',
        'mb10482',
        'MB 10482',
        '  Mb-10482  ',
        'MB-١٠٤٨٢', // Arabic-Indic digits
        'MB۱۰۴۸۲', // Eastern Arabic-Indic digits
      ]) {
        expect(authEmailForIdentifier(input), alias, reason: input);
        expect(isClientIdentifier(input), isTrue, reason: input);
      }
    });

    test('things that only look similar are treated as e-mail', () {
      for (final input in ['MB-123', 'MB-1234567890', 'XMB-10482', 'mb-10a82']) {
        expect(isClientIdentifier(input), isFalse, reason: input);
        expect(authEmailForIdentifier(input), input);
      }
    });

    test('the alias is never displayed: login name falls back to the Client ID',
        () {
      expect(displayLoginName('mb-10482@client.aqarbooks.local'), 'MB-10482');
      expect(
        displayLoginName('mb-10482@client.aqarbooks.local', clientId: 'MB-10482'),
        'MB-10482',
      );
      expect(displayLoginName('a@b.com'), 'a@b.com');
      expect(userGreetingName('mb-10482@client.aqarbooks.local'), 'MB-10482');
      expect(userGreetingName('samy@example.com'), 'samy');
      expect(displayLoginName('mb-10482@client.aqarbooks.local').contains('@'),
          isFalse);
    });

    test('banned detection', () {
      expect(isBannedAuthError(Exception('AuthApiException(message: User is banned, code: user_banned)')),
          isTrue);
      expect(isBannedAuthError(Exception('Invalid login credentials')), isFalse);
    });
  });

  group('password policy', () {
    test('valid password', () {
      expect(validateNewPassword('abcdefgh12', 'abcdefgh12'), isEmpty);
    });
    test('each rule', () {
      expect(validateNewPassword('abc12', 'abc12'), [PasswordIssue.tooShort]);
      expect(validateNewPassword('abcdefghijk', 'abcdefghijk'),
          [PasswordIssue.needsDigit]);
      expect(validateNewPassword('1234567890', '1234567890'),
          [PasswordIssue.needsLetter]);
      expect(validateNewPassword('abcdefgh12', 'abcdefgh13'),
          [PasswordIssue.mismatch]);
      expect(validateNewPassword('abc', 'x'), [
        PasswordIssue.tooShort,
        PasswordIssue.needsDigit,
        PasswordIssue.mismatch,
      ]);
    });
    test('ten characters is the boundary', () {
      expect(validateNewPassword('abcdefgh1', 'abcdefgh1'),
          [PasswordIssue.tooShort]);
    });
  });

  group('Egyptian mobile numbers', () {
    test('normalises every common form', () {
      for (final input in [
        '01012345678',
        '+201012345678',
        '00201012345678',
        '0101 234 5678',
        '010-1234-5678',
        '٠١٠١٢٣٤٥٦٧٨',
        '+20 10 1234 5678',
      ]) {
        expect(normalizeEgyptianPhone(input), '+201012345678', reason: input);
      }
    });
    test('rejects invalid numbers', () {
      for (final input in [
        '',
        '1012345678',
        '0101234567',
        '010123456789',
        '01312345678',
        '0212345678',
        'abc',
      ]) {
        expect(normalizeEgyptianPhone(input), isNull, reason: input);
      }
    });
  });

  group('activation links', () {
    test('https and custom scheme', () {
      expect(parseActivationToken(Uri.parse('https://aqarbooks.com/activate/$_token')),
          _token);
      expect(parseActivationToken(Uri.parse('https://aqarbooks.com/activate/$_token?x=1')),
          _token);
      expect(parseActivationToken(Uri.parse('aqarbooks://activate/$_token')),
          _token);
    });
    test('rejects other hosts, paths, short or odd tokens', () {
      for (final raw in [
        'https://evil.com/activate/$_token',
        'https://aqarbooks.com.evil.com/activate/$_token',
        'http://aqarbooks.com/activate/$_token',
        'https://aqarbooks.com/reset/$_token',
        'https://aqarbooks.com/activate/short',
        'https://aqarbooks.com/activate/${'a' * 129}',
        'https://aqarbooks.com/activate/${'a' * 25}%20x',
        'https://aqarbooks.com/activate/$_token/extra',
        'aqarbooks://other/$_token',
        'aqarbooks://activate',
        'https://aqarbooks.com/activate',
      ]) {
        expect(parseActivationToken(Uri.parse(raw)), isNull, reason: raw);
      }
    });
  });

  group('PortalAccess parsing', () {
    test('full payload', () {
      final a = PortalAccess.fromJson({
        'linked': true,
        'status': 'pending',
        'must_change_password': true,
        'temp_expired': false,
        'login_method': 'client_id',
        'client_id': 'MB-10482',
        'phone_hint': '•••• 4567',
        'has_recovery_email': false,
        'has_staff_access': false,
      });
      expect(a.requiresFirstLogin, isTrue);
      expect(a.blocksAccess, isFalse);
      expect(a.phoneHint, '•••• 4567');
      expect(a.clientId, 'MB-10482');
    });
    test('suspended portal-only blocks; suspended staff does not', () {
      expect(PortalAccess.fromJson({'status': 'suspended'}).blocksAccess, isTrue);
      final staff = PortalAccess.fromJson(
          {'status': 'suspended', 'has_staff_access': true});
      expect(staff.blocksAccess, isFalse);
      expect(staff.portalSuspendedForStaff, isTrue);
    });
    test('must_change never applies to staff identities', () {
      final a = PortalAccess.fromJson(
          {'must_change_password': true, 'has_staff_access': true});
      expect(a.requiresFirstLogin, isFalse);
    });
    test('garbage reads as none', () {
      expect(PortalAccess.fromJson(null).status, 'none');
      expect(PortalAccess.fromJson('x').blocksAccess, isFalse);
    });
  });

  group('HttpActivationApi', () {
    test('inspect posts the token and parses the state', () async {
      late http.Request seen;
      final api = HttpActivationApi(
        'https://example.test/',
        MockClient((req) async {
          seen = req;
          return http.Response(
            jsonEncode({
              'state': 'valid',
              'memberName': 'أحمد',
              'email': 'a@b.com',
              'existingAccount': true,
            }),
            200,
            headers: {'content-type': 'application/json; charset=utf-8'},
          );
        }),
      );
      final r = await api.inspect(_token);
      expect(seen.url.toString(), 'https://example.test/api/portal-activation/inspect');
      expect(jsonDecode(seen.body), {'token': _token});
      expect(r.isValid, isTrue);
      expect(r.memberName, 'أحمد');
      expect(r.existingAccount, isTrue);
    });

    test('complete: password body, no bearer / bearer without password',
        () async {
      final seen = <http.Request>[];
      final api = HttpActivationApi(
        'https://example.test',
        MockClient((req) async {
          seen.add(req);
          return http.Response(jsonEncode({'ok': true, 'email': 'a@b.com'}), 200);
        }),
      );
      final a = await api.complete(_token, password: 'abcdefgh12');
      expect(a.ok, isTrue);
      expect(a.email, 'a@b.com');
      expect(jsonDecode(seen[0].body), {'token': _token, 'password': 'abcdefgh12'});
      expect(seen[0].headers.containsKey('authorization'), isFalse);
      await api.complete(_token, bearerToken: 'jwt');
      expect(jsonDecode(seen[1].body), {'token': _token});
      expect(seen[1].headers['authorization'], 'Bearer jwt');
    });

    test('4xx with a reason and unknown state', () async {
      final api = HttpActivationApi(
        'https://example.test',
        MockClient((req) async => req.url.path.endsWith('inspect')
            ? http.Response(jsonEncode({'state': 'weird'}), 200)
            : http.Response(jsonEncode({'ok': false, 'reason': 'used'}), 410)),
      );
      expect((await api.inspect(_token)).state, 'not_found');
      final o = await api.complete(_token, password: 'x');
      expect(o.ok, isFalse);
      expect(o.reason, 'used');
    });

    test('network and garbage errors never leak the token', () async {
      final down = HttpActivationApi(
        'https://example.test',
        MockClient((req) async => throw http.ClientException('boom ${req.url} ${req.body}')),
      );
      await expectLater(
        down.inspect(_token),
        throwsA(isA<ActivationNetworkException>()),
      );
      try {
        await down.inspect(_token);
      } catch (e) {
        expect(e.toString().contains(_token), isFalse);
      }
      final html = HttpActivationApi(
        'https://example.test',
        MockClient((req) async => http.Response('<html>', 502)),
      );
      await expectLater(
        html.complete(_token, password: 'x'),
        throwsA(isA<ActivationNetworkException>()),
      );
    });
  });
}
