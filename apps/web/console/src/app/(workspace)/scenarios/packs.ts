export const scenarioPacks = [
  {
    id: 'mixed-context',
    name: 'Overtime and out-of-role activity',
    description:
      'Contrasts known-device overtime with separate new-device, out-of-role events; labels stay evaluation-only.',
    csv: '/demo-samples/approved-overtime-events-v2.csv',
    context: '/demo-samples/approved-overtime-context-v1.json',
  },
  {
    id: 'unfamiliar-access',
    name: 'Bulk export from an unfamiliar device',
    description:
      'High-volume exports from a new device and location, while system access remains role-authorized.',
    csv: '/demo-samples/unfamiliar-access-events-v2.csv',
    context: '/demo-samples/unfamiliar-access-context-v1.json',
  },
];
