import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickFixtureZone,
  fixtureZoneName,
  windowStartInZoneToday,
  zoneLocalDate,
  zoneLocalHHmm,
  zoneLocalIsoWeekday,
} from './fixtureZone';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 14, h, m)); // Wed 14 Oct 2026

test('zone choice for all 24 UTC hours puts local time at 07:00 with a legal Etc zone', () => {
  const expected: Record<number, string> = {
    0: 'Etc/GMT-7', 1: 'Etc/GMT-6', 2: 'Etc/GMT-5', 3: 'Etc/GMT-4', 4: 'Etc/GMT-3',
    5: 'Etc/GMT-2', 6: 'Etc/GMT-1', 7: 'Etc/GMT', 8: 'Etc/GMT+1', 9: 'Etc/GMT+2',
    10: 'Etc/GMT+3', 11: 'Etc/GMT+4', 12: 'Etc/GMT+5', 13: 'Etc/GMT+6', 14: 'Etc/GMT+7',
    15: 'Etc/GMT+8', 16: 'Etc/GMT+9', 17: 'Etc/GMT+10', 18: 'Etc/GMT+11',
    // wrap-around: +12 is the last legal positive offset, then -11 is the lowest negative
    19: 'Etc/GMT-12', 20: 'Etc/GMT-11', 21: 'Etc/GMT-10', 22: 'Etc/GMT-9', 23: 'Etc/GMT-8',
  };
  for (let h = 0; h < 24; h++) {
    const now = at(h, 30);
    const zone = pickFixtureZone(now);
    assert.equal(zone.name, expected[h], `UTC hour ${h}`);
    assert.ok(zone.offsetHours >= -11 && zone.offsetHours <= 12, `offset range at ${h}`);
    assert.equal(zone.name, fixtureZoneName(zone.offsetHours));
    assert.equal(zoneLocalHHmm(zone, now), '07:30', `local time at UTC ${h}:30`);
  }
});

test('every UTC hour has a same-day whole-hour window 150 minutes ahead', () => {
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30, 59]) {
      const now = at(h, m);
      const zone = pickFixtureZone(now);
      const start = windowStartInZoneToday(zone, 150, now);
      assert.equal(start.getUTCMinutes(), 0);
      assert.ok(start.getTime() >= now.getTime() + 150 * 60_000);
      assert.equal(zoneLocalDate(zone, start), zoneLocalDate(zone, now));
    }
  }
});

test('round-down window sits in (offset-60min, offset] and stays today at every UTC hour', () => {
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 1, 30, 59]) {
      const now = at(h, m);
      const zone = pickFixtureZone(now);
      const start = windowStartInZoneToday(zone, 120, now, 'down');
      const ahead = (start.getTime() - now.getTime()) / 60_000;
      assert.ok(ahead > 60 && ahead <= 120, `UTC ${h}:${m} -> ${ahead}min`);
      assert.equal(zoneLocalDate(zone, start), zoneLocalDate(zone, now));
    }
  }
});

test('window helper throws instead of clamping when the day is exhausted', () => {
  const zone = pickFixtureZone(at(7)); // Etc/GMT
  assert.throws(() => windowStartInZoneToday(zone, 120, at(22, 30)), /no whole-hour window/);
});

test('zone-local date and weekday follow the shifted wall clock', () => {
  const now = at(22, 10); // Wed 22:10 UTC -> Thu 07:10 in Etc/GMT-9
  const zone = pickFixtureZone(now);
  assert.equal(zone.name, 'Etc/GMT-9');
  assert.equal(zoneLocalDate(zone, now), '2026-10-15');
  assert.equal(zoneLocalIsoWeekday(zone, now), 4);
  assert.equal(zoneLocalIsoWeekday(pickFixtureZone(at(7)), at(7)), 3);
});
