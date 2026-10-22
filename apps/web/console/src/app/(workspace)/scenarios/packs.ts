export const scenarioPacks = [
  {
    id: 'mixed-context',
    name: 'Overtime and out-of-role activity',
    description:
      "Compares approved overtime with unusual access from a new device or outside a person's role.",
    csv: '/demo-samples/approved-overtime-events-v2.csv',
    context: '/demo-samples/approved-overtime-context-v1.json',
  },
  {
    id: 'unfamiliar-access',
    name: 'Bulk export from an unfamiliar device',
    description:
      "A large file export from a new device and location, even though the access is allowed for that person's role.",
    csv: '/demo-samples/unfamiliar-access-events-v2.csv',
    context: '/demo-samples/unfamiliar-access-context-v1.json',
  },
];
