const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('apps-script/FreeCampaign.gs', 'utf8');
const main = fs.readFileSync('apps-script/Ma.gs', 'utf8');
const realDate = Date;
function setup() {
  let clock = Date.parse('2026-11-10T12:00:00+07:00');
  class Clock extends realDate {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const sheets = {};
  function makeSheet(rows = []) {
    return {
      rows,
      appendRow(row) { this.rows.push([...row]); },
      setFrozenRows() {}, setColumnWidth() {},
      getLastRow() { return this.rows.length; },
      getDataRange() { return { getValues: () => this.rows.map(r => [...r]) }; },
      getRange(r, c, h = 1, w = 1) {
        const range = {
          getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
          setValues: values => {
            values.forEach((row, i) => {
              this.rows[r - 1 + i] ??= [];
              row.forEach((value, j) => this.rows[r - 1 + i][c - 1 + j] = value);
            });
            return range;
          },
          setValue: value => range.setValues([[value]])
        };
        for (const name of ['setFontWeight', 'setBackground', 'setFontColor', 'setNote', 'setNumberFormat']) range[name] = () => range;
        return range;
      }
    };
  }
  const spreadsheet = {
    getSheetByName: name => sheets[name],
    insertSheet(name) { assert.equal(sheets[name], undefined); return sheets[name] = makeSheet(); },
    getSheets() { throw new Error('Must never fall back to paid Leads'); }
  };
  let locked = false;
  let failMail = false;
  let quota = 10;
  const mails = [];
  const context = {
    Date: Clock,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet, flush() {} },
    Utilities: { formatDate: (date, zone) => {
      assert.equal(zone, 'Asia/Ho_Chi_Minh');
      return new realDate(date.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    } },
    LockService: { getScriptLock: () => ({ tryLock() { assert.equal(locked, false); locked = true; return true; }, releaseLock() { locked = false; } }) },
    MailApp: {
      getRemainingDailyQuota: () => quota,
      sendEmail(mail) { if (failMail) throw Error('quota'); mails.push(mail); }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }) }
  };
  vm.createContext(context);
  vm.runInContext(main + '\n' + source, context);
  context.setupFreeCampaign();
  const config = sheets['Chương trình miễn phí'].rows;
  function activate() {
    config[1][1] = 'BẬT'; config[2][1] = '2026-11-01'; config[3][1] = '2026-11-30';
    sheets.Heyzine_config_free = makeSheet([
      ['Gói', 'Link Heyzine', 'Mật khẩu hiện tại'],
      ...['Tập 1 Heyzine — 119.000đ', 'Tập 2 Heyzine — 179.000đ', 'Tập 3 Heyzine — 219.000đ'].map((name, i) => [name, `https://heyzine.com/flip-book/test${i}.html`, `test-only-${i}`])
    ]);
  }
  const data = { consent: true, fullname: 'Người đọc', email: 'reader@example.com', phone: '', source: 'Website' };
  const register = input => context.doPost({ postData: { contents: JSON.stringify({ action: 'register_free_campaign', ...data, ...input }) } });
  return { context, sheets, config, activate, data, mails, register,
    setClock: value => clock = Date.parse(value),
    setMailFailure: value => failMail = value,
    setQuota: value => quota = value,
    isLocked: () => locked };
}
test('Setup defaults OFF, preserves existing config and registration rows', () => {
  const b = setup(); assert.equal(b.context.getFreeCampaign().active, false);
  b.activate(); b.config[4][1] = 'Custom'; b.context.setupFreeCampaign();
  assert.equal(b.config[1][1], 'BẬT'); assert.equal(b.config[4][1], 'Custom');
  assert.equal(b.sheets.Heyzine_Config, undefined); assert.equal(b.sheets.Leads, undefined);
});
test('Vietnam date bounds include midnight start and entire final day', () => {
  const b = setup(); b.activate();
  for (const [time, active] of [
    ['2026-10-31T23:59:59.999+07:00', false],
    ['2026-11-01T00:00:00+07:00', true],
    ['2026-11-30T23:59:59.999+07:00', true],
    ['2026-12-01T00:00:00+07:00', false]
  ]) { b.setClock(time); assert.equal(b.context.getFreeCampaign().active, active, time); }
});
test('Invalid, reversed dates and OFF never enable registration', () => {
  const b = setup(); b.activate();
  for (const invalid of ['2026-02-30', '2026-13-01', '01/02/garbage']) {
    b.config[2][1] = invalid; assert.equal(b.register().result, 'closed');
  }
  b.config[2][1] = '2026-12-01'; assert.equal(b.register().result, 'closed');
  b.config[2][1] = '01/11/2026'; b.config[1][1] = 'TẮT'; assert.equal(b.register().result, 'closed');
  assert.equal(b.mails.length, 0);
});
test('GET capability does not expose books or passwords', () => {
  const b = setup(); b.activate();
  const response = b.context.doGet({ parameter: { action: 'free_campaign' } });
  assert.equal(response.version, 1); assert.equal(response.active, true);
  assert.equal(JSON.stringify(response).includes('test-only'), false);
  assert.equal(JSON.stringify(response).includes('heyzine.com'), false);
});
test('Registration sends all three free books and writes only separate registration sheet', () => {
  const b = setup(); b.activate();
  assert.equal(b.register({ email: ' READER@example.com ' }).result, 'success');
  assert.equal(b.mails.length, 1);
  assert.equal((b.mails[0].body.match(/https:\/\/heyzine.com/g) || []).length, 3);
  assert.match(b.mails[0].body, /30\/11\/2026/);
  assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 2);
  assert.equal(b.sheets['Đăng ký miễn phí'].rows[1][6], 'Đã gửi');
  assert.equal(b.mails[0].to, 'reader@example.com');
  assert.equal(b.sheets.Heyzine_Config, undefined); assert.equal(b.sheets.Leads, undefined);
  assert.equal(b.isLocked(), false);
});
test('Duplicate emails cooldown, resend after ten minutes without duplicate row', () => {
  const b = setup(); b.activate(); b.register();
  assert.equal(b.register({ email: 'READER@EXAMPLE.COM' }).result, 'cooldown');
  assert.equal(b.mails.length, 1);
  b.setClock('2026-11-10T12:10:00+07:00');
  assert.equal(b.register().result, 'success');
  assert.equal(b.mails.length, 2); assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 2);
});
test('Expired page cannot register; changed campaign period allows a new registration', () => {
  const b = setup(); b.activate(); b.register(); b.setClock('2026-12-01T00:00:00+07:00');
  assert.equal(b.register().result, 'closed');
  b.config[2][1] = '2026-12-01'; b.config[3][1] = '2026-12-31';
  assert.equal(b.register().result, 'success'); assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 3);
});
test('Missing free books never fall back to paid books or send partial email', () => {
  const b = setup(); b.activate(); b.sheets.Heyzine_config_free.rows.pop();
  assert.equal(b.register().result, 'error'); assert.equal(b.mails.length, 0);
  assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 1); assert.equal(b.isLocked(), false);
});
test('Invalid inputs, absent consent and honeypot are rejected', () => {
  const b = setup(); b.activate();
  for (const input of [{ email: 'bad' }, { fullname: '' }, { fullname: 'a\nb' }, { consent: false }, { website: 'bot' }, { phone: '=1+1' }]) {
    assert.equal(b.register(input).result, 'invalid');
  }
  assert.equal(b.mails.length, 0); assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 1);
});
test('Spreadsheet formula injection is escaped in user fields', () => {
  const b = setup(); b.activate();
  assert.equal(b.register({ fullname: '=IMPORTXML("x")', source: '+formula' }).result, 'success');
  assert.equal(b.sheets['Đăng ký miễn phí'].rows[1][2], '\'=IMPORTXML("x")');
  assert.equal(b.sheets['Đăng ký miễn phí'].rows[1][5], "'+formula");
});
test('Mail failure is recorded, throttled and can be retried without another row', () => {
  const b = setup(); b.activate(); b.setMailFailure(true);
  assert.equal(b.register().result, 'email_error'); assert.equal(b.sheets['Đăng ký miễn phí'].rows[1][6], 'Gửi lỗi');
  assert.equal(b.register().result, 'cooldown'); b.setMailFailure(false); b.setClock('2026-11-10T12:10:00+07:00');
  assert.equal(b.register().result, 'success'); assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 2);
});
test('Exhausted email quota does not add a registration or claim success', () => {
  const b = setup(); b.activate(); b.setQuota(0);
  assert.equal(b.register().result, 'busy'); assert.equal(b.mails.length, 0);
  assert.equal(b.sheets['Đăng ký miễn phí'].rows.length, 1);
});

test('Blank dates run indefinitely when ON; one-sided dates apply only that bound', () => {
  const b = setup(); b.activate(); b.config[2][1] = ''; b.config[3][1] = '';
  const c = b.context.getFreeCampaign(); assert.equal(c.active, true); assert.equal(c.endsAt, 0);
  assert.equal(b.register().result, 'success'); assert.match(b.mails[0].body, /chưa ấn định/);
  b.config[2][1] = '2026-11-11'; assert.equal(b.context.getFreeCampaign().active, false);
  b.config[2][1] = ''; b.config[3][1] = '2026-11-09'; assert.equal(b.context.getFreeCampaign().active, false);
  b.config[3][1] = '2026-11-30'; assert.equal(b.context.getFreeCampaign().active, true);
});
