import io

# Add the two new question sets to the view test: the answers must reach the PUT body.
p = "apps/web/test/questionnaire-view.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

# 1) The happy-path payload assertion is a deep-equal against ANSWERS; the new fields are optional,
#    so nothing changes there. Add tests for the new controls instead.
marker = "  it('turns a quick salary into one grossSalary fact with a two-decimal amount', async () => {"
assert s.count(marker) == 1

added = """  it('records the spouse residence and the Art. 3 d) collective request', async () => {
    const calls = stubApi();
    const { tree } = await mount();

    // The couple controls only render for a married household.
    const married = tree.find(
      (n) => n.type === 'button' && textOf(n).join('').trim() === 'MARRIED',
    );
    assert.ok(married, 'MARRIED button not found');
    await TestRenderer.act(async () => {
      (married!.props.onClick as () => void)();
    });

    const reopened = nodes(current!.toJSON());
    const select = reopened.find((n) => n.type === 'select');
    assert.ok(select, 'spouse residence select not rendered for a married household');
    await TestRenderer.act(async () => {
      (select!.props.onChange as (e: unknown) => void)({ target: { value: 'NON_RESIDENT' } });
    });

    const withCheckbox = nodes(current!.toJSON());
    const checkbox = withCheckbox.find(
      (n) => n.type === 'input' && n.props.type === 'checkbox' && n.props.checked === false,
    );
    assert.ok(checkbox, 'collective request checkbox not rendered once a residence is chosen');
    await TestRenderer.act(async () => {
      (checkbox!.props.onChange as (e: unknown) => void)({ target: { checked: true } });
    });

    await submitForm(nodes(current!.toJSON()));

    const put = calls.find((c) => c.method === 'PUT' && c.url.endsWith('/questionnaire'));
    assert.ok(put, 'no PUT questionnaire call');
    const body = put!.body as Record<string, unknown>;
    assert.equal(body.spouseResidence, 'NON_RESIDENT');
    assert.equal(body.mixedCoupleCollectiveRequested, true);
  });

""" + marker

s = s.replace(marker, added, 1)
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
