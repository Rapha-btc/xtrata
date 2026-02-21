export const reputationProfileCatalog = Object.freeze([
  {
    id: 'steady',
    label: 'Steady Vector',
    speaker: 'OPS',
    summary: 'Balanced advance profile with controlled risk.',
    transmissions: [
      { id: 'steady-level-5', minLevel: 5, text: 'Flight pattern stable. Keep pressure on priority targets.' },
      { id: 'steady-level-10', minLevel: 10, text: 'Steady vector confirmed. Maintain tempo and avoid over-extension.' }
    ]
  },
  {
    id: 'vanguard',
    label: 'Vanguard',
    speaker: 'OPS',
    summary: 'High-life profile focused on clean survival and control.',
    transmissions: [
      { id: 'vanguard-level-4', minLevel: 4, text: 'Hull integrity excellent. You are leading this push.' },
      { id: 'vanguard-level-9', minLevel: 9, text: 'Vanguard status sustained. Command is routing harder sectors to your lane.' }
    ]
  },
  {
    id: 'ace',
    label: 'Ace Hunter',
    speaker: 'OPS',
    summary: 'High score tempo profile with aggressive elimination pace.',
    transmissions: [
      { id: 'ace-level-4', minLevel: 4, text: 'Ace tempo confirmed. Enemy command is escalating response patterns.' },
      { id: 'ace-level-8', minLevel: 8, text: 'Your strike pace is forcing a strategic retreat across relay lanes.' }
    ]
  },
  {
    id: 'brink',
    label: 'Last Stand',
    speaker: 'OPS',
    summary: 'Low-life survival profile under critical pressure.',
    transmissions: [
      { id: 'brink-level-3', minLevel: 3, text: 'Critical hull state. Prioritize survival windows and safe lanes.' },
      { id: 'brink-level-6', minLevel: 6, text: 'You are still in the fight. Reinforce discipline and conserve every life.' }
    ]
  }
]);
