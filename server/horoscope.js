// Horóscopo diario real, en español. Se lee una vez por día de AstroWay /api
// (sin clave) y se guarda solo en memoria: nunca se mezcla con la base de datos
// de usuarios ni con los backups. Si falla el proveedor, se conserva el último
// conjunto válido y se marca como "stale" para no inventar datos.

const SIGNS = [
  { id: 'aries', name: 'Aries', symbol: '♈', dates: '21 mar – 19 abr', element: 'Fuego', color: '#ff6b5e', accent: '#ffd166' },
  { id: 'taurus', name: 'Tauro', symbol: '♉', dates: '20 abr – 20 may', element: 'Tierra', color: '#57c785', accent: '#e6c77a' },
  { id: 'gemini', name: 'Géminis', symbol: '♊', dates: '21 may – 20 jun', element: 'Aire', color: '#8b8cff', accent: '#67e8f9' },
  { id: 'cancer', name: 'Cáncer', symbol: '♋', dates: '21 jun – 22 jul', element: 'Agua', color: '#7aa7ff', accent: '#d8e6ff' },
  { id: 'leo', name: 'Leo', symbol: '♌', dates: '23 jul – 22 ago', element: 'Fuego', color: '#ffb347', accent: '#ff7a59' },
  { id: 'virgo', name: 'Virgo', symbol: '♍', dates: '23 ago – 22 sep', element: 'Tierra', color: '#79c99e', accent: '#d9e8ad' },
  { id: 'libra', name: 'Libra', symbol: '♎', dates: '23 sep – 22 oct', element: 'Aire', color: '#f39ab8', accent: '#c3a6ff' },
  { id: 'scorpio', name: 'Escorpio', symbol: '♏', dates: '23 oct – 21 nov', element: 'Agua', color: '#c2567a', accent: '#ff8a80' },
  { id: 'sagittarius', name: 'Sagitario', symbol: '♐', dates: '22 nov – 21 dic', element: 'Fuego', color: '#a98bff', accent: '#6ecbff' },
  { id: 'capricorn', name: 'Capricornio', symbol: '♑', dates: '22 dic – 19 ene', element: 'Tierra', color: '#8fa6c9', accent: '#d7e9ff' },
  { id: 'aquarius', name: 'Acuario', symbol: '♒', dates: '20 ene – 18 feb', element: 'Aire', color: '#4fd1e5', accent: '#a5f3fc' },
  { id: 'pisces', name: 'Piscis', symbol: '♓', dates: '19 feb – 20 mar', element: 'Agua', color: '#8fd3c7', accent: '#f4a7d1' }
];

export const HOROSCOPE_SIGNS = SIGNS.map((sign) => sign.id);
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

let cache = null;
let inflight = null;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

function sunSignIndex(date) {
  const day = new Date(date);
  const month = day.getUTCMonth() + 1;
  const dateValue = day.getUTCDate();
  const limits = [19, 18, 20, 20, 20, 22, 22, 22, 22, 23, 21, 21];
  return (month - 1 + (dateValue >= limits[month - 1] ? 1 : 0)) % 12;
}

function stars(score) {
  const value = Math.max(1, Math.min(5, Math.round(Number(score) / 2)));
  return '⭐'.repeat(value) + '☆'.repeat(5 - value);
}

function shortText(value, limit = 620) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

async function fetchSign(sign, date) {
  const url = `https://api.astroway.info/v1/public/horoscope/daily?sign=${sign.id}&lang=es&date=${date}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000)
  });
  if (!response.ok) throw new Error(`Proveedor ${response.status}`);
  const body = await response.json();
  const data = body?.data;
  if (!body?.ok || !data?.date || !data?.sections?.overview) {
    throw new Error('Respuesta incompleta del proveedor');
  }
  return data;
}

function signFromData(meta, data) {
  const sections = data.sections || {};
  const lucky = data.lucky || {};
  const energy = data.energy || {};
  return {
    ...meta,
    message: shortText(sections.overview || data.horoscope),
    sections: {
      general: shortText(sections.overview || data.horoscope),
      amor: shortText(sections.love),
      trabajo: shortText(sections.career),
      salud: shortText(sections.health),
      dinero: shortText(sections.finance),
      consejo: shortText(sections.advice)
    },
    score: Number(energy.score) || 0,
    luck: stars(energy.score),
    number: Number(lucky.number) || 0,
    luckyDay: lucky.dayName || lucky.day || '',
    compatible: (data.compatibleSigns || []).slice(0, 3).map((item) => item.signName || item.sign),
    sourceDate: data.date,
    disclaimer: data.disclaimer || ''
  };
}

async function refresh(date) {
  const results = await Promise.allSettled(SIGNS.map((sign) => fetchSign(sign, date)));
  const signs = [];
  const failed = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') signs.push(signFromData(SIGNS[index], result.value));
    else failed.push(SIGNS[index].name);
  });
  if (signs.length !== SIGNS.length) {
    throw new Error(`Faltan lecturas: ${failed.join(', ')}`);
  }
  return {
    date,
    title: prettyDate(date),
    focusIndex: sunSignIndex(`${date}T12:00:00Z`),
    signs: SIGNS.map((meta) => signs.find((item) => item.id === meta.id)),
    source: {
      name: 'AstroWay',
      url: 'https://api.astroway.info',
      detail: 'Posiciones planetarias reales del día, redactadas en español.'
    },
    stale: false,
    error: null
  };
}

// Devuelve el horóscopo del día. Nunca devuelve frases inventadas: si el
// proveedor falla, usa el último válido y lo marca como stale.
export async function getHoroscope() {
  const date = todayKey();
  if (cache?.date === date) return cache.payload;
  if (inflight?.date === date) return inflight.promise;

  const promise = refresh(date)
    .then((payload) => {
      cache = { date, payload };
      return payload;
    })
    .catch((error) => {
      if (cache?.payload) {
        return { ...cache.payload, stale: true, error: error.message };
      }
      return {
        date,
        title: prettyDate(date),
        focusIndex: sunSignIndex(`${date}T12:00:00Z`),
        signs: [],
        source: { name: 'AstroWay', url: 'https://api.astroway.info', detail: '' },
        stale: true,
        error: `No se pudo cargar el horóscopo de hoy: ${error.message}`
      };
    })
    .finally(() => { inflight = null; });

  inflight = { date, promise };
  return promise;
}
