import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { ExpoPushTransport, isExpoPushToken } from '../src/modules/notifications/adapters/expo-push.transport';

/** An in-process HTTP server that records the request and answers like Expo. */
function fakeExpo(handler: (body: any) => { status: number; body: any }) {
  const received: Array<{ url?: string; auth?: string; body: any }> = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      received.push({ url: req.url, auth: req.headers.authorization, body });
      const reply = handler(body);
      res.writeHead(reply.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });

  return {
    received,
    listen: () =>
      new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve((server.address() as any).port));
      }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const message = {
  userId: 'user-1',
  title: 'Return ready for review',
  body: 'A return is waiting for your approval.',
  notificationId: 'notif-9',
};

describe('ExpoPushTransport', () => {
  test('posts one ticket per device token and returns the receipt ids', async () => {
    const server = fakeExpo((body) => ({
      status: 200,
      body: {
        data: (Array.isArray(body) ? body : [body]).map((_, index) => ({
          status: 'ok',
          id: `ticket-${index}`,
        })),
      },
    }));
    const port = await server.listen();
    try {
      const transport = new ExpoPushTransport(async () => ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]'], {
        endpoint: `http://127.0.0.1:${port}/--/api/v2/push/send`,
        accessToken: 'secret',
      });

      const receipt = await transport.send(message);

      assert.strictEqual(receipt, 'expo:ticket-0,ticket-1');
      assert.strictEqual(server.received.length, 1);
      assert.strictEqual(server.received[0].auth, 'Bearer secret');
      const tickets = server.received[0].body;
      assert.strictEqual(tickets.length, 2);
      assert.deepStrictEqual(tickets[0].data, { notificationId: 'notif-9' });
      assert.strictEqual(tickets[0].title, 'Return ready for review');
    } finally {
      await server.close();
    }
  });

  test('fails when the user has no registered device, so the outbox can record it', async () => {
    const transport = new ExpoPushTransport(async () => []);
    await assert.rejects(() => transport.send(message), /No registered push device/);
  });

  test('surfaces a provider HTTP error so the outbox retries', async () => {
    const server = fakeExpo(() => ({ status: 503, body: { error: 'unavailable' } }));
    const port = await server.listen();
    try {
      const transport = new ExpoPushTransport(async () => ['ExponentPushToken[a]'], {
        endpoint: `http://127.0.0.1:${port}/push`,
      });
      await assert.rejects(() => transport.send(message), /Expo push HTTP 503/);
    } finally {
      await server.close();
    }
  });

  test('fails when every ticket is rejected even though HTTP succeeded', async () => {
    const server = fakeExpo(() => ({
      status: 200,
      body: { data: [{ status: 'error', message: 'DeviceNotRegistered' }] },
    }));
    const port = await server.listen();
    try {
      const transport = new ExpoPushTransport(async () => ['ExponentPushToken[dead]'], {
        endpoint: `http://127.0.0.1:${port}/push`,
      });
      await assert.rejects(() => transport.send(message), /rejected every ticket.*DeviceNotRegistered/);
    } finally {
      await server.close();
    }
  });

  test('a partial rejection still counts as delivered', async () => {
    const server = fakeExpo(() => ({
      status: 200,
      body: {
        data: [
          { status: 'ok', id: 'ticket-live' },
          { status: 'error', message: 'DeviceNotRegistered' },
        ],
      },
    }));
    const port = await server.listen();
    try {
      const transport = new ExpoPushTransport(
        async () => ['ExponentPushToken[live]', 'ExponentPushToken[dead]'],
        { endpoint: `http://127.0.0.1:${port}/push` },
      );
      const receipt = await transport.send(message);
      assert.strictEqual(receipt, 'expo:ticket-live');
    } finally {
      await server.close();
    }
  });

  test('propagates a network failure rather than swallowing it', async () => {
    const transport = new ExpoPushTransport(async () => ['ExponentPushToken[a]'], {
      endpoint: 'http://127.0.0.1:1/push',
      timeoutMs: 3_000,
    });
    await assert.rejects(() => transport.send(message));
  });
});

describe('isExpoPushToken', () => {
  test('accepts the bracketed Expo form and a bare opaque token', () => {
    assert.strictEqual(isExpoPushToken('ExponentPushToken[xxxxxxxx]'), true);
    assert.strictEqual(isExpoPushToken('ExpoPushToken[yyyy]'), true);
    assert.strictEqual(isExpoPushToken('abcdefghijklmnopqrstuvwxyz'), true);
  });

  test('rejects empty and obviously malformed values', () => {
    assert.strictEqual(isExpoPushToken(''), false);
    assert.strictEqual(isExpoPushToken('short'), false);
    assert.strictEqual(isExpoPushToken('has spaces in it'), false);
  });
});
