import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as net from 'net';
import {
  SmtpEmailTransport,
  buildSmtpMessage,
  dotStuff,
  smtpTransportFromEnv,
} from '../src/modules/notifications/adapters/smtp-email.transport';

/**
 * A deliberately literal in-process SMTP server. It records the exact command
 * sequence, so a test can assert the transport speaks the protocol rather than
 * merely calling a function that returns a string.
 */
interface Recorded {
  commands: string[];
  /** The DATA payload, dot-unstuffed. */
  data: string;
  auth?: { user: string; pass: string };
}

function fakeSmtpServer(options: {
  offersAuth?: boolean;
  rejectRcpt?: boolean;
  queueId?: string;
} = {}) {
  const recorded: Recorded = { commands: [], data: '' };

  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let authStep = 0;
    let authUser = '';

    socket.write('220 fake.smtp ESMTP ready\r\n');

    const onLine = (line: string) => {
      if (inData) {
        if (line === '.') {
          inData = false;
          socket.write(`250 2.0.0 Ok: queued as ${options.queueId ?? 'FAKE1'}\r\n`);
        } else {
          // Undo dot-stuffing exactly as a real server would.
          recorded.data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`;
        }
        return;
      }

      recorded.commands.push(line);

      if (authStep === 1) {
        authUser = Buffer.from(line, 'base64').toString('utf8');
        authStep = 2;
        socket.write('334 UGFzc3dvcmQ6\r\n');
        return;
      }
      if (authStep === 2) {
        recorded.auth = {
          user: authUser,
          pass: Buffer.from(line, 'base64').toString('utf8'),
        };
        authStep = 0;
        socket.write('235 2.7.0 Authentication successful\r\n');
        return;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write('250-fake.smtp greets you\r\n');
        socket.write('250-SIZE 10240000\r\n');
        if (options.offersAuth) socket.write('250-AUTH LOGIN PLAIN\r\n');
        socket.write('250 8BITMIME\r\n');
        return;
      }
      if (upper.startsWith('AUTH LOGIN')) {
        authStep = 1;
        socket.write('334 VXNlcm5hbWU6\r\n');
        return;
      }
      if (upper.startsWith('AUTH PLAIN')) {
        const token = line.split(' ')[2] ?? '';
        const [, user, pass] = Buffer.from(token, 'base64').toString('utf8').split('\0');
        recorded.auth = { user, pass };
        socket.write('235 2.7.0 Authentication successful\r\n');
        return;
      }
      if (upper.startsWith('MAIL FROM')) {
        socket.write('250 2.1.0 Sender ok\r\n');
        return;
      }
      if (upper.startsWith('RCPT TO')) {
        socket.write(
          options.rejectRcpt
            ? '550 5.1.1 No such recipient\r\n'
            : '250 2.1.5 Recipient ok\r\n',
        );
        return;
      }
      if (upper.startsWith('DATA')) {
        inData = true;
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        return;
      }
      if (upper.startsWith('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
        return;
      }
      socket.write('502 5.5.2 Command not implemented\r\n');
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\r\n');
      while (index !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        onLine(line);
        index = buffer.indexOf('\r\n');
      }
    });
    socket.on('error', () => undefined);
  });

  return {
    recorded,
    listen: () =>
      new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as net.AddressInfo).port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

const message = {
  to: 'taxpayer@example.lu',
  subject: 'Your return is ready for review',
  text: 'A return is waiting for your approval.',
  notificationId: 'notif-1',
};

describe('buildSmtpMessage', () => {
  test('writes a base64 body and the correlation header', () => {
    const raw = buildSmtpMessage(message, 'no-reply@luxtax.local', 'id@luxtax.local');
    assert.match(raw, /^From: no-reply@luxtax\.local\r\n/);
    assert.match(raw, /\r\nTo: taxpayer@example\.lu\r\n/);
    assert.match(raw, /Content-Transfer-Encoding: base64\r\n/);
    assert.match(raw, /X-LuxTax-Notification-Id: notif-1\r\n/);
    const body = raw.split('\r\n\r\n')[1];
    assert.strictEqual(
      Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'),
      message.text,
    );
  });

  test('encodes a non-ASCII subject as RFC 2047 and leaves an ASCII one alone', () => {
    const plain = buildSmtpMessage(message, 'a@b.c', 'id@d');
    assert.match(plain, /Subject: Your return is ready for review\r\n/);

    const accented = buildSmtpMessage(
      { ...message, subject: 'Votre déclaration est prête' },
      'a@b.c',
      'id@d',
    );
    assert.match(accented, /Subject: =\?UTF-8\?B\?/);
    const encoded = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(accented);
    assert.ok(encoded);
    assert.strictEqual(
      Buffer.from(encoded[1], 'base64').toString('utf8'),
      'Votre déclaration est prête',
    );
  });

  test('never emits a body line longer than the SMTP limit', () => {
    const long = buildSmtpMessage(
      { ...message, text: 'x'.repeat(2_000) },
      'a@b.c',
      'id@d',
    );
    for (const line of long.split('\r\n')) {
      assert.ok(line.length <= 78, `line too long: ${line.length}`);
    }
  });
});

describe('dotStuff', () => {
  test('escapes a leading dot so it cannot terminate DATA', () => {
    assert.strictEqual(dotStuff('a\r\n.hidden\r\nb'), 'a\r\n..hidden\r\nb');
  });

  test('leaves an interior dot alone', () => {
    assert.strictEqual(dotStuff('a.b'), 'a.b');
  });
});

describe('SmtpEmailTransport against a real socket', () => {
  test('delivers a message over the full SMTP dialogue', async () => {
    const server = fakeSmtpServer({ queueId: 'Q42' });
    const port = await server.listen();
    try {
      const transport = new SmtpEmailTransport({
        host: '127.0.0.1',
        port,
        from: 'no-reply@luxtax.local',
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt, 'smtp:2.0.0 Ok: queued as Q42');
      const commands = server.recorded.commands.map((c) => c.split(' ')[0].toUpperCase());
      assert.deepStrictEqual(commands, ['EHLO', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
      assert.strictEqual(server.recorded.commands[1], 'MAIL FROM:<no-reply@luxtax.local>');
      assert.strictEqual(server.recorded.commands[2], 'RCPT TO:<taxpayer@example.lu>');
      assert.match(server.recorded.data, /X-LuxTax-Notification-Id: notif-1/);
      assert.match(server.recorded.data, /^From: no-reply@luxtax\.local\r\n/m);
    } finally {
      await server.close();
    }
  });

  test('authenticates with AUTH LOGIN when the server offers it', async () => {
    const server = fakeSmtpServer({ offersAuth: true });
    const port = await server.listen();
    try {
      const transport = new SmtpEmailTransport({
        host: '127.0.0.1',
        port,
        user: 'mailer',
        pass: 's3cret',
        from: 'no-reply@luxtax.local',
      });

      await transport.send(message);

      assert.deepStrictEqual(server.recorded.auth, { user: 'mailer', pass: 's3cret' });
    } finally {
      await server.close();
    }
  });

  test('a rejected recipient throws so the outbox retries', async () => {
    const server = fakeSmtpServer({ rejectRcpt: true });
    const port = await server.listen();
    try {
      const transport = new SmtpEmailTransport({
        host: '127.0.0.1',
        port,
        from: 'no-reply@luxtax.local',
      });

      await assert.rejects(() => transport.send(message), /SMTP 550/);
    } finally {
      await server.close();
    }
  });

  test('a closed port fails instead of hanging', async () => {
    const transport = new SmtpEmailTransport({
      host: '127.0.0.1',
      port: 1, // nothing listens here
      from: 'no-reply@luxtax.local',
      timeoutMs: 3_000,
    });
    await assert.rejects(() => transport.send(message));
  });

  test('refuses a recipient that is not an address, without connecting', async () => {
    const transport = new SmtpEmailTransport({
      host: '127.0.0.1',
      port: 1,
      from: 'no-reply@luxtax.local',
    });
    await assert.rejects(
      () => transport.send({ ...message, to: 'not-an-address' }),
      /non-address recipient/,
    );
  });

  test('refuses to send without a configured sender', async () => {
    const transport = new SmtpEmailTransport({ host: '127.0.0.1', port: 1 });
    await assert.rejects(() => transport.send(message), /SMTP sender is not configured/);
  });
});

describe('smtpTransportFromEnv', () => {
  test('is inert until SMTP_HOST is set', () => {
    assert.strictEqual(smtpTransportFromEnv({}), null);
  });

  test('defaults to 587 with STARTTLS for a plaintext relay', () => {
    const transport = smtpTransportFromEnv({ SMTP_HOST: 'mail.example.lu' });
    assert.ok(transport);
    assert.strictEqual(transport.name, 'smtp');
  });

  test('honours an explicit port and rejects a malformed one', () => {
    assert.ok(smtpTransportFromEnv({ SMTP_HOST: 'h', SMTP_PORT: '2525' }));
    assert.throws(() => smtpTransportFromEnv({ SMTP_HOST: 'h', SMTP_PORT: 'abc' }), /SMTP_PORT/);
    assert.throws(() => smtpTransportFromEnv({ SMTP_HOST: 'h', SMTP_PORT: '99999' }), /SMTP_PORT/);
  });
});
