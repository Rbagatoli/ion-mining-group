// National facility discovery: real source coverage and ingestion failure modes.
const assert = require('assert');
const B = require('../tools/build-facility-index');
const A = require('../data/facilities.json');
const F = require('../source-facility');

assert.equal(B.parseOptions([]).maxMw, null);
assert.equal(B.parseOptions(['--max-mw', '50']).maxMw, 50);
assert.equal(B.parseOptions(['--max-mw', '.5']).maxMw, .5);
for (const args of [['--max-mw'], ['--max-mw', '50junk'], ['--max-mw', '-1'], ['--max-mw', '0'],
  ['--max-mw', 'Infinity'], ['--max-mw', 'NaN'], ['--years', '2.5'], ['--years', '0'],
  ['--eia860-year', '2025junk'], ['--max-mw', '10', '--max-mw', '20'], ['--anything', '1']]) {
  assert.throws(() => B.parseOptions(args), /option|value|positive|range|history/i);
}

const hdr = ['Plant Code', 'Generator ID', 'Nameplate Capacity (MW)', 'Technology', 'Prime Mover',
  'Status', 'Operating Year', 'Planned Retirement Year', 'Ownership', 'Energy Source 1', 'Energy Source 2'];
const row = (id, mw, status, tech, fuel) => [10, id, mw, tech, 'ST', status, 1990, null, 'S', fuel];
const sheets = { Operable: [hdr, row('a', 1000, 'OP', 'Nuclear', 'NUC'), row('a', 1000, 'OP', 'Nuclear', 'NUC'),
  row('b', 20, 'SB', 'Natural Gas Steam Turbine', 'NG').concat('DFO')],
  'Retired and Canceled': [hdr, row('c', 400, 'RE', 'Conventional Steam Coal', 'BIT'),
    row('d', 600, 'CN', 'Conventional Steam Coal', 'BIT'), row('a', 1000, 'RE', 'Nuclear', 'NUC')] };
const gen = B.aggregateGenerators({ sheet: name => sheets[name] });
assert.equal(gen[10].mw, 1020);
assert.equal(gen[10].units, 2);
assert.equal(gen[10].retiredMw, 400);
assert.equal(gen[10].retiredUnits, 1);
assert.equal(gen[10].canceledUnits, 1);
assert.equal(gen.duplicateGeneratorRows, 2);
assert.equal(gen[10].status.RE, undefined);
assert.deepEqual(gen[10].statusMw, { OP: 1000, SB: 20 });
assert.deepEqual(Object.keys(gen[10].energy).sort(), ['natural_gas', 'nuclear', 'oil']);
assert.equal(gen[10].energy.oil, 0); // alternate fuel does not create extra plant capacity
assert.deepEqual(Object.keys(gen[10].allFuel).sort(), ['DFO', 'NG', 'NUC']);
assert.equal(B.classifyTechnology('Hydroelectric Pumped Storage', 'WAT', 'PS'), 'storage');
assert.equal(B.classifyTechnology('Conventional Hydroelectric', 'WAT', 'HY'), 'hydro');
assert.equal(B.classifyTechnology('All Other', 'WH', 'ST'), 'recovered_energy');
assert.equal(B.classifyTechnology('Unrecognized', '???', ''), 'unknown');
for (const label of ['Solar Thermal with Energy Storage', 'Solar Thermal without Energy Storage']) {
  assert.equal(B.classifyTechnology(label, 'SUN', 'ST'), 'solar');
  const battery = row('battery', 20, 'OP', 'Batteries', 'MWH'); battery[4] = 'BA';
  const paired = B.aggregateGenerators({ sheet: name => name === 'Operable' ? [hdr, row('solar', 100, 'OP', label, 'SUN'), battery] : [] });
  assert.deepEqual(paired[10].energy, { solar: 100, storage: 20 });
  assert.equal(paired[10].mw, 120);
}

const ownerHeader = ['Plant Code', 'Generator ID', 'Owner Name', 'Owner Street Address', 'Owner City',
  'Owner State', 'Owner Zip', 'Ownership ID', 'Percent Owned'];
const owners = B.aggregateOwners([ownerHeader,
  [10, 'a', 'Owner A', '1 Street', 'City', 'NJ', 7065, 1, .25],
  [10, 'b', 'Owner A', '1 Street', 'City', 'NJ', 7065, 1, .5],
  [10, 'c', 'Owner A', '1 Street', 'City', 'NJ', 7065, 1, .5]]);
assert.equal(owners[10].length, 2);
assert.deepEqual(owners[10].map(o => [o.sharePct, o.generators]), [[25, ['a']], [50, ['b', 'c']]]);
assert.equal(owners[10][0].zip, '07065');

assert.equal(A.eia860Year, 2025);
assert.equal(A.maxMw, null);
assert.equal(A.latestGenerationMonth, '2026-06');
assert.equal(A.facilities.length, 14327);
assert.equal(new Set(A.facilities.map(f => f.plantCode)).size, A.facilities.length);
assert.equal(Object.keys(A.counts.byState).length, 51);
assert.equal(A.counts.above50Mw, 3753);
assert.equal(A.counts.byEnergyTechnology.nuclear, 56);
assert.equal(A.counts.byEnergyTechnology.hydro, 1393);
assert.equal(A.counts.byEnergyTechnology.solar, 7180);
assert.equal(A.counts.byEnergyTechnology.storage, 600);
const thermal = A.facilities.filter(f => /^Solar Thermal (with|without) Energy Storage$/.test(f.technology));
assert.equal(thermal.length, 8);
for (const plant of thermal) {
  assert.equal(plant.energyTechnology, 'solar');
  assert(plant.energyTechnologies.includes('solar'));
  assert(!plant.energyTechnologies.includes('storage'));
  assert.equal(plant.availableMiningMw, null);
  assert.equal(plant.availabilityStatus, 'unverified');
}
assert.equal(A.counts.facilitiesWithoutGeneration, 218);
assert.equal(A.counts.droppedNoGeneration, 0);
assert.equal(A.counts.droppedTooBig, 0);
assert.equal(A.counts.duplicateGeneratorRows, 0);
assert.equal(A.sourceSnapshots.inventory.reportingYear, 2025);
assert.match(A.sourceSnapshots.inventory.archiveSha256, /^[a-f0-9]{64}$/);
assert.match(A.coverageNote, /No upper plant-capacity limit/);
assert.match(A.generationNote, /not verified curtailment/);

let withoutHistory = 0, mixed = 0;
const actual = {};
for (const f of A.facilities) {
  actual[f.energyTechnology] = (actual[f.energyTechnology] || 0) + 1;
  assert(f.energyTechnologies.includes(f.energyTechnology));
  assert(f.nameplateMw > 0);
  assert(Math.abs(Object.values(f.technologyCapacityMw).reduce((s, n) => s + n, 0) - f.nameplateMw) < .01);
  assert(Math.abs(Object.values(f.statusCapacityMw).reduce((s, n) => s + n, 0) - f.nameplateMw) < .01);
  assert(!['RE', 'CN'].includes(f.status));
  assert.equal(f.availableMiningMw, null);
  assert.equal(f.availabilityStatus, 'unverified');
  if (!f.lastDataMonth) { withoutHistory++; assert.equal(f.cfCurrent, null); assert.deepEqual(f.cfSeries, []); }
  if (f.energyTechnologies.length > 1) mixed++;
}
assert.deepEqual(actual, A.counts.byEnergyTechnology);
assert.equal(withoutHistory, A.counts.facilitiesWithoutGeneration);
assert(mixed > 0);
const nuclear = A.facilities.find(f => f.energyTechnology === 'nuclear');
const normalized = F.adapter.normalize(nuclear);
assert.equal(normalized.energyType, 'grid_facility');
assert.equal(normalized.energyTechnology, 'nuclear');
assert.deepEqual(normalized.energyTechnologies, nuclear.energyTechnologies);
assert.deepEqual(normalized.sourceDetail.primaryFuelCodes, nuclear.primaryFuelCodes);
assert.equal(normalized.availableMiningMw, null);
assert.equal(normalized.availabilityStatus, 'unverified');
assert.equal(normalized.powerPotentialKw, Math.round(nuclear.nameplateMw * 1000));
assert(normalized.distressSignals.every(signal => !/curtail|surplus|available_power/.test(signal.type)));
console.log('PASS national facility coverage, strict options, generator identity/status, mixed technologies, ownership shares and unknown availability');
