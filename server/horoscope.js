// Horóscopo fijo de Nexus. No guarda datos de usuarios: sale del día del
// servidor, así todos ven exactamente el mismo contenido al entrar.

const SIGNS = [
  { name: 'Aries', symbol: '♈', dates: '21 mar – 19 abr', element: 'Fuego' },
  { name: 'Tauro', symbol: '♉', dates: '20 abr – 20 may', element: 'Tierra' },
  { name: 'Géminis', symbol: '♊', dates: '21 may – 20 jun', element: 'Aire' },
  { name: 'Cáncer', symbol: '♋', dates: '21 jun – 22 jul', element: 'Agua' },
  { name: 'Leo', symbol: '♌', dates: '23 jul – 22 ago', element: 'Fuego' },
  { name: 'Virgo', symbol: '♍', dates: '23 ago – 22 sep', element: 'Tierra' },
  { name: 'Libra', symbol: '♎', dates: '23 sep – 22 oct', element: 'Aire' },
  { name: 'Escorpio', symbol: '♏', dates: '23 oct – 21 nov', element: 'Agua' },
  { name: 'Sagitario', symbol: '♐', dates: '22 nov – 21 dic', element: 'Fuego' },
  { name: 'Capricornio', symbol: '♑', dates: '22 dic – 19 ene', element: 'Tierra' },
  { name: 'Acuario', symbol: '♒', dates: '20 ene – 18 feb', element: 'Aire' },
  { name: 'Piscis', symbol: '♓', dates: '19 feb – 20 mar', element: 'Agua' }
];

const MESSAGES = [
  'Hoy ganás más escuchando que respondiendo. Una conversación se acomoda sola.',
  'Día bueno para ordenar lo pendiente: lo que estaba pesado se vuelve manejable.',
  'Aparece una idea que venías esquivando. Anotala antes de que se te escape.',
  'Cuidá tu energía. Un descanso corto te devuelve más de lo que imaginás.',
  'Tu directo abre puertas, pero hoy funciona mejor con un tono más suave.',
  'Los detalles importan: revisar dos veces evita más de un problema.',
  'Alguien cercano necesita tu opinión. No subestimes lo claro que podés ser.',
  'Soltá lo que ya no suma. El espacio libre también es una decisión.',
  'Hay movimiento en lo que esperabas. Mantené la calma y seguí pasito a paso.',
  'El esfuerzo de hoy siembra algo que vas a ver con más claridad mañana.',
  'Una respuesta distinta cambia el ánimo de toda la conversación.',
  'Confiá en tu intuición para elegir, pero verificá los números antes de firmar.'
];

const COLORS = ['Azul', 'Verde', 'Violeta', 'Dorado', 'Coral', 'Plata'];
const LUCK = ['⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function seedFor(key) {
  let seed = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    seed ^= key.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  return seed;
}

function todayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function sunSignIndex(date) {
  const day = new Date(date);
  const month = day.getUTCMonth() + 1;
  const dateValue = day.getUTCDate();
  const limits = [19, 18, 20, 20, 20, 22, 22, 22, 22, 23, 21, 21];
  return month >= 1 && month <= 12 ? (month - 1 + (dateValue >= limits[month - 1] ? 1 : 0)) % 12 : 0;
}

export function horoscopeFor(date = new Date()) {
  const key = todayKey(date);
  const seed = seedFor(key);
  const [year, month, day] = key.split('-').map(Number);
  return {
    date: key,
    title: `${day} de ${MONTHS[month - 1]} de ${year}`,
    focusIndex: sunSignIndex(date),
    signs: SIGNS.map((sign, index) => ({
      ...sign,
      message: MESSAGES[(seed + index * 5) % MESSAGES.length],
      luck: LUCK[(seed + index * 3) % LUCK.length],
      number: ((seed + index * 7) % 9) + 1,
      color: COLORS[(seed + index * 11) % COLORS.length]
    }))
  };
}
