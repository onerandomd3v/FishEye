export const investigationFixtures = [
  {
    id: 'U003',
    description: 'New device and unusual location example',
    signals: ['Unrecognized device', 'Unusual location', 'Overnight access'],
  },
  {
    id: 'U010',
    description: 'Large record-volume example',
    signals: ['Bulk access pattern', 'Unusual time window'],
  },
  {
    id: 'U002',
    description: 'Legitimate late-night work example',
    signals: ['Known device', 'Authorized system', 'Late working hours'],
  },
];

export const scenarioFixtures = [
  {
    id: 'U003',
    name: 'Stolen credentials',
    description:
      'Device, location and unusual-hours signals in a synthetic scenario.',
  },
  {
    id: 'U010',
    name: 'Bulk access',
    description: 'Large record volume outside a synthetic role baseline.',
  },
  {
    id: 'U002',
    name: 'Late-night work',
    description: 'Known device and permitted system during an unusual time.',
  },
];

export const fixtureEvents = [
  {
    id: 'SYN-EVT-001',
    time: '01:14 UTC',
    event: 'Sign-in from a device not present in this synthetic history',
    source: 'Synthetic sign-in event',
  },
  {
    id: 'SYN-EVT-002',
    time: '01:19 UTC',
    event: 'Access from a location outside the example account pattern',
    source: 'Synthetic access event',
  },
  {
    id: 'SYN-EVT-003',
    time: '01:27 UTC',
    event: 'Access recorded during an overnight window',
    source: 'Synthetic access event',
  },
];
