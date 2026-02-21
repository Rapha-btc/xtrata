export const sectorBriefingsCatalog = Object.freeze([
  {
    id: 'perimeter',
    match: ['perimeter'],
    speaker: 'OPS',
    title: 'Sector 1 // Perimeter Drift',
    intro: 'Outer relay lanes are unstable. Keep formation tight and map enemy approach patterns.',
    transmissions: [
      { id: 'perimeter-wave-2', minWave: 2, speaker: 'OPS', text: 'Scouts are probing your lane. Hold center and stay disciplined.' },
      { id: 'perimeter-wave-4', minWave: 4, speaker: 'PIRATE BAND', text: 'Unknown pilot, stand down and surrender your reactor core.' }
    ]
  },
  {
    id: 'nebula',
    match: ['nebula'],
    speaker: 'OPS',
    title: 'Sector 2 // Ember Nebula',
    intro: 'Sensor bloom is high in this cloud layer. Expect split volleys and false openings.',
    transmissions: [
      { id: 'nebula-wave-2', minWave: 2, speaker: 'OPS', text: 'Heat signatures rising. Burst fire only when paths are clear.' },
      { id: 'nebula-wave-5', minWave: 5, speaker: 'PIRATE BAND', text: 'You made it this far. Lets see how long your hull lasts.' }
    ]
  },
  {
    id: 'eclipse',
    match: ['eclipse'],
    speaker: 'OPS',
    title: 'Sector 3 // Eclipse Forge',
    intro: 'Heavy chassis formations detected. Prioritize high-value targets before they anchor the lane.',
    transmissions: [
      { id: 'eclipse-wave-3', minWave: 3, speaker: 'OPS', text: 'Carrier signatures confirmed. Keep lateral movement active.' },
      { id: 'eclipse-wave-6', minWave: 6, speaker: 'PIRATE BAND', text: 'Our forge runs hot. Your frame will melt in this sector.' }
    ]
  },
  {
    id: 'graveyard',
    match: ['graveyard'],
    speaker: 'OPS',
    title: 'Sector 4 // Relay Graveyard',
    intro: 'Derelict debris field ahead. Threat vectors will spike with minimal warning.',
    transmissions: [
      { id: 'graveyard-wave-3', minWave: 3, speaker: 'OPS', text: 'Scrap field turbulence detected. Prepare for dive patterns.' },
      { id: 'graveyard-wave-5', minWave: 5, speaker: 'PIRATE BAND', text: 'We own these wreck lanes. Turn back while you still can.' }
    ]
  },
  {
    id: 'rift',
    match: ['rift', 'overdrive'],
    speaker: 'OPS',
    title: 'Sector 5 // Quantum Rift',
    intro: 'Distortion corridor is active. Hostiles may phase into your line with little warning.',
    transmissions: [
      { id: 'rift-wave-2', minWave: 2, speaker: 'OPS', text: 'This is the deep run. Fly clean and manage your timing windows.' },
      { id: 'rift-wave-4', minWave: 4, speaker: 'PIRATE BAND', text: 'Core command online. You are entering our final perimeter.' }
    ]
  }
]);
