// Offline reverse geocoding: a compact gazetteer of major cities, nearest-city
// lookup with a distance cutoff. No network, no permissions, no third-party
// lookup — good enough to label map clusters, trip stories and photo info.
//
// A null result means "no known city within the cutoff"; callers should fall
// back to coordinates rather than inventing a place.

export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

const C = (name: string, country: string, lat: number, lon: number): City => ({
  name,
  country,
  lat,
  lon,
});

export const CITIES: City[] = [
  // India
  C("Delhi", "India", 28.6139, 77.209),
  C("Mumbai", "India", 19.076, 72.8777),
  C("Bengaluru", "India", 12.9716, 77.5946),
  C("Hyderabad", "India", 17.385, 78.4867),
  C("Chennai", "India", 13.0827, 80.2707),
  C("Kolkata", "India", 22.5726, 88.3639),
  C("Pune", "India", 18.5204, 73.8567),
  C("Ahmedabad", "India", 23.0225, 72.5714),
  C("Jaipur", "India", 26.9124, 75.7873),
  C("Kochi", "India", 9.9312, 76.2673),
  C("Thiruvananthapuram", "India", 8.5241, 76.9366),
  C("Kozhikode", "India", 11.2588, 75.7804),
  C("Thrissur", "India", 10.5276, 76.2144),
  C("Coimbatore", "India", 11.0168, 76.9558),
  C("Madurai", "India", 9.9252, 78.1198),
  C("Mysuru", "India", 12.2958, 76.6394),
  C("Panaji", "India", 15.4909, 73.8278),
  C("Mangaluru", "India", 12.9141, 74.856),
  C("Visakhapatnam", "India", 17.6868, 83.2185),
  C("Bhubaneswar", "India", 20.2961, 85.8245),
  C("Patna", "India", 25.5941, 85.1376),
  C("Lucknow", "India", 26.8467, 80.9462),
  C("Varanasi", "India", 25.3176, 82.9739),
  C("Kanpur", "India", 26.4499, 80.3319),
  C("Nagpur", "India", 21.1458, 79.0882),
  C("Indore", "India", 22.7196, 75.8577),
  C("Bhopal", "India", 23.2599, 77.4126),
  C("Surat", "India", 21.1702, 72.8311),
  C("Vadodara", "India", 22.3072, 73.1812),
  C("Rajkot", "India", 22.3039, 70.8022),
  C("Udaipur", "India", 24.5854, 73.7125),
  C("Jodhpur", "India", 26.2389, 73.0243),
  C("Amritsar", "India", 31.634, 74.8723),
  C("Chandigarh", "India", 30.7333, 76.7794),
  C("Dehradun", "India", 30.3165, 78.0322),
  C("Shimla", "India", 31.1048, 77.1734),
  C("Srinagar", "India", 34.0837, 74.7973),
  C("Leh", "India", 34.1526, 77.5771),
  C("Guwahati", "India", 26.1445, 91.7362),
  C("Shillong", "India", 25.5788, 91.8933),
  C("Imphal", "India", 24.817, 93.9368),
  C("Agartala", "India", 23.8315, 91.2868),
  C("Ranchi", "India", 23.3441, 85.3096),
  C("Raipur", "India", 21.2514, 81.6296),
  C("Nashik", "India", 19.9975, 73.7898),
  C("Aurangabad", "India", 19.8762, 75.3433),
  C("Kolhapur", "India", 16.705, 74.2433),
  C("Vijayawada", "India", 16.5062, 80.648),
  C("Tirupati", "India", 13.6288, 79.4192),
  C("Puducherry", "India", 11.9416, 79.8083),
  C("Kanyakumari", "India", 8.0883, 77.5385),
  C("Rishikesh", "India", 30.0869, 78.2676),
  C("Haridwar", "India", 29.9457, 78.1642),
  C("Ajmer", "India", 26.4499, 74.6399),
  C("Kota", "India", 25.2138, 75.8648),
  C("Gwalior", "India", 26.2183, 78.1828),
  C("Jabalpur", "India", 23.1815, 79.9864),
  C("Prayagraj", "India", 25.4358, 81.8463),
  C("Gorakhpur", "India", 26.7606, 83.3732),
  C("Siliguri", "India", 26.7271, 88.3953),
  C("Darjeeling", "India", 27.036, 88.2627),
  C("Gangtok", "India", 27.3389, 88.6065),
  C("Itanagar", "India", 27.0844, 93.6053),
  C("Kohima", "India", 25.6751, 94.1086),
  C("Aizawl", "India", 23.7307, 92.7173),
  // South Asia / Middle East
  C("Kathmandu", "Nepal", 27.7172, 85.324),
  C("Colombo", "Sri Lanka", 6.9271, 79.8612),
  C("Dhaka", "Bangladesh", 23.8103, 90.4125),
  C("Karachi", "Pakistan", 24.8607, 67.0011),
  C("Lahore", "Pakistan", 31.5204, 74.3587),
  C("Islamabad", "Pakistan", 33.6844, 73.0479),
  C("Dubai", "UAE", 25.2048, 55.2708),
  C("Abu Dhabi", "UAE", 24.4539, 54.3773),
  C("Doha", "Qatar", 25.2854, 51.531),
  C("Riyadh", "Saudi Arabia", 24.7136, 46.6753),
  C("Jeddah", "Saudi Arabia", 21.4858, 39.1925),
  C("Muscat", "Oman", 23.588, 58.3829),
  C("Kuwait City", "Kuwait", 29.3759, 47.9774),
  C("Manama", "Bahrain", 26.2285, 50.586),
  C("Tehran", "Iran", 35.6892, 51.389),
  C("Istanbul", "Turkey", 41.0082, 28.9784),
  C("Ankara", "Turkey", 39.9334, 32.8597),
  // Europe
  C("Athens", "Greece", 37.9838, 23.7275),
  C("Rome", "Italy", 41.9028, 12.4964),
  C("Milan", "Italy", 45.4642, 9.19),
  C("Paris", "France", 48.8566, 2.3522),
  C("London", "UK", 51.5074, -0.1278),
  C("Berlin", "Germany", 52.52, 13.405),
  C("Munich", "Germany", 48.1351, 11.582),
  C("Amsterdam", "Netherlands", 52.3676, 4.9041),
  C("Brussels", "Belgium", 50.8503, 4.3517),
  C("Madrid", "Spain", 40.4168, -3.7038),
  C("Barcelona", "Spain", 41.3874, 2.1686),
  C("Lisbon", "Portugal", 38.7223, -9.1393),
  C("Vienna", "Austria", 48.2082, 16.3738),
  C("Zurich", "Switzerland", 47.3769, 8.5417),
  C("Prague", "Czechia", 50.0755, 14.4378),
  C("Warsaw", "Poland", 52.2297, 21.0122),
  C("Budapest", "Hungary", 47.4979, 19.0402),
  C("Copenhagen", "Denmark", 55.6761, 12.5683),
  C("Stockholm", "Sweden", 59.3293, 18.0686),
  C("Oslo", "Norway", 59.9139, 10.7522),
  C("Helsinki", "Finland", 60.1699, 24.9384),
  C("Dublin", "Ireland", 53.3498, -6.2603),
  C("Edinburgh", "UK", 55.9533, -3.1883),
  C("Moscow", "Russia", 55.7558, 37.6173),
  C("Kyiv", "Ukraine", 50.4501, 30.5234),
  C("Bucharest", "Romania", 44.4268, 26.1025),
  C("Sofia", "Bulgaria", 42.6977, 23.3219),
  C("Belgrade", "Serbia", 44.7866, 20.4489),
  C("Zagreb", "Croatia", 45.815, 15.9819),
  C("Reykjavik", "Iceland", 64.1466, -21.9426),
  // North America
  C("Toronto", "Canada", 43.6532, -79.3832),
  C("Vancouver", "Canada", 49.2827, -123.1207),
  C("Montreal", "Canada", 45.5017, -73.5673),
  C("New York", "USA", 40.7128, -74.006),
  C("Los Angeles", "USA", 34.0522, -118.2437),
  C("San Francisco", "USA", 37.7749, -122.4194),
  C("Chicago", "USA", 41.8781, -87.6298),
  C("Seattle", "USA", 47.6062, -122.3321),
  C("Boston", "USA", 42.3601, -71.0589),
  C("Washington", "USA", 38.9072, -77.0369),
  C("Miami", "USA", 25.7617, -80.1918),
  C("Las Vegas", "USA", 36.1699, -115.1398),
  C("Denver", "USA", 39.7392, -104.9903),
  C("Austin", "USA", 30.2672, -97.7431),
  C("Houston", "USA", 29.7604, -95.3698),
  C("Honolulu", "USA", 21.3069, -157.8583),
  C("Anchorage", "USA", 61.2181, -149.9003),
  C("Mexico City", "Mexico", 19.4326, -99.1332),
  C("Cancun", "Mexico", 21.1619, -86.8515),
  // South America
  C("Bogota", "Colombia", 4.711, -74.0721),
  C("Lima", "Peru", -12.0464, -77.0428),
  C("Santiago", "Chile", -33.4489, -70.6693),
  C("Buenos Aires", "Argentina", -34.6037, -58.3816),
  C("Sao Paulo", "Brazil", -23.5505, -46.6333),
  C("Rio de Janeiro", "Brazil", -22.9068, -43.1729),
  C("Recife", "Brazil", -8.0476, -34.877),
  // Africa
  C("Cairo", "Egypt", 30.0444, 31.2357),
  C("Nairobi", "Kenya", -1.2921, 36.8219),
  C("Cape Town", "South Africa", -33.9249, 18.4241),
  C("Johannesburg", "South Africa", -26.2041, 28.0473),
  C("Lagos", "Nigeria", 6.5244, 3.3792),
  C("Accra", "Ghana", 5.6037, -0.187),
  C("Casablanca", "Morocco", 33.5731, -7.5898),
  C("Marrakesh", "Morocco", 31.6295, -7.9811),
  C("Tunis", "Tunisia", 36.8065, 10.1815),
  C("Addis Ababa", "Ethiopia", 9.032, 38.7469),
  C("Dar es Salaam", "Tanzania", -6.7924, 39.2083),
  C("Port Louis", "Mauritius", -20.3484, 57.5522),
  // Asia-Pacific
  C("Singapore", "Singapore", 1.3521, 103.8198),
  C("Kuala Lumpur", "Malaysia", 3.139, 101.6869),
  C("Bangkok", "Thailand", 13.7563, 100.5018),
  C("Phuket", "Thailand", 7.8804, 98.3923),
  C("Jakarta", "Indonesia", -6.2088, 106.8456),
  C("Denpasar", "Indonesia", -8.65, 115.2167),
  C("Manila", "Philippines", 14.5995, 120.9842),
  C("Hanoi", "Vietnam", 21.0278, 105.8342),
  C("Ho Chi Minh City", "Vietnam", 10.8231, 106.6297),
  C("Hong Kong", "Hong Kong", 22.3193, 114.1694),
  C("Macau", "Macau", 22.1987, 113.5439),
  C("Taipei", "Taiwan", 25.033, 121.5654),
  C("Seoul", "South Korea", 37.5665, 126.978),
  C("Tokyo", "Japan", 35.6762, 139.6503),
  C("Osaka", "Japan", 34.6937, 135.5023),
  C("Kyoto", "Japan", 35.0116, 135.7681),
  C("Beijing", "China", 39.9042, 116.4074),
  C("Shanghai", "China", 31.2304, 121.4737),
  C("Shenzhen", "China", 22.5431, 114.0579),
  C("Sydney", "Australia", -33.8688, 151.2093),
  C("Melbourne", "Australia", -37.8136, 144.9631),
  C("Brisbane", "Australia", -27.4698, 153.0251),
  C("Perth", "Australia", -31.9505, 115.8605),
  C("Auckland", "New Zealand", -36.8485, 174.7633),
  C("Wellington", "New Zealand", -41.2866, 174.7756),
];

const EARTH_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestCity(
  lat: number,
  lon: number,
  maxKm = 75
): { city: City; km: number } | null {
  let best: { city: City; km: number } | null = null;
  for (const city of CITIES) {
    const km = haversineKm(lat, lon, city.lat, city.lon);
    if (!best || km < best.km) best = { city, km };
  }
  return best && best.km <= maxKm ? best : null;
}

/** "Kochi, India" within 75 km, else null (caller falls back to coordinates). */
export function placeLabel(lat: number, lon: number, maxKm = 75): string | null {
  const hit = nearestCity(lat, lon, maxKm);
  return hit ? `${hit.city.name}, ${hit.city.country}` : null;
}
