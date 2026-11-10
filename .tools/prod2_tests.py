import io, sys

path = r"B:\B\tax-app\apps\api\test\return-version-history.spec.ts"
block = '''
describe('requiredApproverIds (PROD-2)', () => {
  const member = (userId: string, role: string) => ({ userId, role });
  const couple = [member('primary', 'PRIMARY_FILER'), member('co', 'CO_FILER')];
  const withViewer = [...couple, member('viewer', 'VIEWER')];

  test('a VIEWER is never a required approver', () => {
    assert.deepStrictEqual(requiredApproverIds(withViewer), ['primary', 'co']);
  });

  test('a Class 2 couple still needs both filers', () => {
    assert.strictEqual(requiredApproverCount('CLASS_2', couple), 2);
    assert.strictEqual(requiredApproverCount('CLASS_2', withViewer), 2);
  });

  test('an invited viewer cannot raise the bar above the filers', () => {
    assert.notStrictEqual(
      requiredApproverCount('CLASS_2', withViewer),
      withViewer.length,
    );
  });

  test('a single filer needs one approval, whatever the class', () => {
    assert.strictEqual(requiredApproverCount('CLASS_1', couple), 1);
    assert.strictEqual(requiredApproverCount('CLASS_1a', withViewer), 1);
  });

  test('a viewer-only household never reports zero required approvals', () => {
    assert.deepStrictEqual(requiredApproverIds([member('v', 'VIEWER')]), []);
    assert.strictEqual(requiredApproverCount('CLASS_2', [member('v', 'VIEWER')]), 1);
    assert.strictEqual(historyStatus(1, 1, 0, 1), 'DRAFT');
  });

  test('the deadlock is gone: both filers approve and the version completes', () => {
    const required = requiredApproverIds(withViewer);
    const approved = ['primary', 'co'];
    assert.strictEqual(
      required.every((id) => approved.includes(id)),
      true,
      'the gate no longer waits for the viewer',
    );
    assert.strictEqual(
      historyStatus(2, 2, approved.length, requiredApproverCount('CLASS_2', withViewer)),
      'APPROVED',
    );
  });

  test('one filer alone is still incomplete after the fix', () => {
    const required = requiredApproverIds(withViewer);
    const approved = ['primary'];
    assert.strictEqual(required.every((id) => approved.includes(id)), false);
    assert.strictEqual(
      historyStatus(2, 2, approved.length, requiredApproverCount('CLASS_2', withViewer)),
      'DRAFT',
    );
  });
});
'''

with io.open(path, 'r', encoding='utf-8-sig', newline='') as fh:
    body = fh.read()

body = body.replace('\r\n', '\n').rstrip('\n') + '\n' + block

with io.open(path, 'w', encoding='utf-8', newline='\r\n') as fh:
    fh.write(body)

print('bytes', len(body.encode('utf-8')))
