// Original fictional vehicles. Names, shapes and badges are invented for San Aurelia.
// L,W,H metres; power = peak accel (m/s^2); top = top speed (m/s); grip/steer handling; price in $.
export const VEHICLES = {
  pico: { name: 'Pico Hatch', cls: 'Compact', type: 'car', body: 'hatch', L: 3.8, W: 1.72, H: 1.48, power: 6.5, top: 42, grip: 1.0, steer: 0.62, mass: 1050, price: 9000, colors: ['#e9c46a', '#e76f51', '#2a9d8f', '#f1faee', '#457b9d'] },
  meridian: { name: 'Meridian Sedan', cls: 'Sedan', type: 'car', body: 'sedan', L: 4.7, W: 1.82, H: 1.45, power: 6.8, top: 48, grip: 1.0, steer: 0.58, mass: 1450, price: 18000, colors: ['#8d99ae', '#1d3557', '#f1faee', '#2b2d42', '#9b2226', '#b7b7a4'] },
  valence: { name: 'Valence LX', cls: 'Luxury sedan', type: 'car', body: 'sedan', L: 5.1, W: 1.9, H: 1.46, power: 8.2, top: 56, grip: 1.05, steer: 0.55, mass: 1900, price: 64000, colors: ['#0b0c10', '#e5e5e5', '#2f3e46', '#5c4033', '#283618'] },
  strada: { name: 'Strada GT', cls: 'Sports', type: 'car', body: 'coupe', L: 4.5, W: 1.88, H: 1.28, power: 10.5, top: 68, grip: 1.2, steer: 0.6, mass: 1450, price: 92000, colors: ['#d62828', '#fcbf49', '#003049', '#f8f9fa', '#2ec4b6'] },
  vortex: { name: 'Vortex R', cls: 'Supercar', type: 'car', body: 'super', L: 4.6, W: 2.0, H: 1.14, power: 13, top: 84, grip: 1.3, steer: 0.58, mass: 1400, price: 310000, colors: ['#ff7a00', '#7bf1a8', '#e63946', '#ffffff', '#6a4c93'] },
  brawler: { name: 'Brawler 77', cls: 'Muscle', type: 'car', body: 'coupe', L: 4.9, W: 1.95, H: 1.33, power: 10, top: 62, grip: 0.9, steer: 0.55, mass: 1700, price: 54000, colors: ['#1b263b', '#ff9f1c', '#2d6a4f', '#9d0208', '#e0e1dd'] },
  ion: { name: 'Ion S', cls: 'Electric', type: 'car', body: 'fastback', L: 4.75, W: 1.9, H: 1.42, power: 11, top: 62, grip: 1.12, steer: 0.6, mass: 1850, price: 58000, electric: true, colors: ['#f8f9fa', '#0b090a', '#adb5bd', '#3a86ff', '#c1121f'] },
  ridgeback: { name: 'Ridgeback EV', cls: 'Electric pickup', type: 'car', body: 'evtruck', L: 5.6, W: 2.05, H: 1.8, power: 10, top: 52, grip: 1.05, steer: 0.5, mass: 2700, price: 72000, electric: true, colors: ['#b8bec4', '#2b2d33', '#f2f2f2', '#6b705c'] },
  atlas: { name: 'Atlas SUV', cls: 'SUV', type: 'car', body: 'suv', L: 4.9, W: 1.98, H: 1.78, power: 7.2, top: 50, grip: 0.95, steer: 0.52, mass: 2200, price: 46000, colors: ['#0b090a', '#f5f3f4', '#6c757d', '#344e41', '#7f5539'] },
  haulmark: { name: 'Haulmark 2500', cls: 'Pickup', type: 'car', body: 'pickup', L: 5.7, W: 2.02, H: 1.85, power: 6.6, top: 46, grip: 0.95, steer: 0.5, mass: 2500, price: 39000, colors: ['#9b2226', '#ffffff', '#1d3557', '#606c38', '#343a40'] },
  dune: { name: 'Dune Raider', cls: 'Off-road', type: 'car', body: 'offroad', L: 4.2, W: 1.95, H: 1.8, power: 7.5, top: 44, grip: 1.0, steer: 0.62, mass: 1800, price: 41000, offroad: true, colors: ['#e9c46a', '#386641', '#bc4749', '#f2e8cf'] },
  courier: { name: 'Courier Van', cls: 'Van', type: 'car', body: 'van', L: 5.2, W: 2.0, H: 2.2, power: 5.2, top: 40, grip: 0.9, steer: 0.5, mass: 2400, price: 28000, colors: ['#ffffff', '#f1faee', '#264653', '#d4a373'] },
  cargomax: { name: 'Cargomax Box', cls: 'Delivery truck', type: 'car', body: 'truck', L: 7.4, W: 2.4, H: 3.2, power: 3.8, top: 32, grip: 0.85, steer: 0.45, mass: 6500, price: 61000, colors: ['#ffffff', '#e9ecef'] },
  citybus: { name: 'Metro Bus', cls: 'Bus', type: 'car', body: 'bus', L: 11.5, W: 2.55, H: 3.1, power: 3.0, top: 25, grip: 0.85, steer: 0.42, mass: 12000, price: 0, colors: ['#e76f51'] },
  cab: { name: 'Aurelia Cab', cls: 'Taxi', type: 'car', body: 'sedan', L: 4.7, W: 1.82, H: 1.45, power: 6.8, top: 46, grip: 1.0, steer: 0.58, mass: 1450, price: 0, colors: ['#ffc300'], taxi: true },
  police: { name: 'SAPD Interceptor', cls: 'Police', type: 'car', body: 'sedan', L: 5.0, W: 1.95, H: 1.5, power: 10, top: 62, grip: 1.15, steer: 0.6, mass: 1800, price: 0, colors: ['#111827'], police: true },
  ambulance: { name: 'Medic Unit', cls: 'Emergency', type: 'car', body: 'van', L: 6.0, W: 2.2, H: 2.6, power: 6, top: 44, grip: 0.95, steer: 0.48, mass: 3500, price: 0, colors: ['#ffffff'], ambulance: true },
  kestrel: { name: 'Kestrel 1000', cls: 'Sport bike', type: 'bike', body: 'sportbike', L: 2.1, W: 0.75, H: 1.15, power: 12, top: 72, grip: 1.1, steer: 0.75, mass: 210, price: 24000, colors: ['#ff4fa3', '#06d6a0', '#118ab2', '#111111', '#f94144'] },
  zipp: { name: 'Zipp Scooter', cls: 'Scooter', type: 'bike', body: 'scooter', L: 1.8, W: 0.7, H: 1.1, power: 4.5, top: 24, grip: 1.0, steer: 0.8, mass: 110, price: 3200, colors: ['#90e0ef', '#ffafcc', '#f1faee', '#ffb703'] },
  bicycle: { name: 'Coastline Bicycle', cls: 'Bicycle', type: 'bike', body: 'bicycle', L: 1.75, W: 0.6, H: 1.05, power: 2.4, top: 11, grip: 1.0, steer: 0.85, mass: 14, price: 450, pedal: true, colors: ['#2a9d8f', '#e63946', '#f4a261', '#ffffff'] },
  seastrike: { name: 'Seastrike 28', cls: 'Speedboat', type: 'boat', body: 'speedboat', L: 8.5, W: 2.6, H: 1.6, power: 6, top: 30, grip: 0.45, steer: 0.5, mass: 2500, price: 85000, colors: ['#ffffff', '#1d3557', '#e63946'] },
  wavedart: { name: 'Wavedart', cls: 'Jet ski', type: 'boat', body: 'jetski', L: 3.2, W: 1.2, H: 1.1, power: 8, top: 26, grip: 0.55, steer: 0.75, mass: 350, price: 14000, colors: ['#ffbe0b', '#3a86ff', '#ff006e'] },
  skylark: { name: 'Skylark H4', cls: 'Helicopter', type: 'heli', body: 'heli', L: 11, W: 2.4, H: 3.2, power: 9, top: 62, price: 520000, colors: ['#1d3557', '#f1faee', '#e63946', '#0b090a'] },
  aerolite: { name: 'Aerolite 172', cls: 'Light aircraft', type: 'plane', body: 'plane', L: 8.3, W: 11, H: 2.7, power: 7, top: 75, price: 340000, colors: ['#ffffff', '#ffd166'] },
};
for (const k in VEHICLES) VEHICLES[k].key = k;
export const DEALER_STOCK = ['pico', 'meridian', 'ion', 'atlas', 'haulmark', 'dune', 'brawler', 'strada', 'valence', 'kestrel', 'zipp', 'bicycle', 'ridgeback', 'vortex'];
export const TRAFFIC_MIX = {
  downtown: ['meridian', 'meridian', 'cab', 'cab', 'valence', 'ion', 'atlas', 'courier', 'pico', 'citybus', 'strada', 'kestrel'],
  commercial: ['meridian', 'pico', 'atlas', 'courier', 'haulmark', 'cab', 'ion', 'zipp', 'cargomax'],
  residential: ['pico', 'meridian', 'atlas', 'haulmark', 'ion', 'zipp', 'bicycle', 'dune'],
  industrial: ['cargomax', 'cargomax', 'haulmark', 'courier', 'atlas', 'meridian'],
  boardwalk: ['strada', 'vortex', 'ion', 'cab', 'zipp', 'kestrel', 'meridian', 'brawler', 'dune'],
  nightlife: ['strada', 'cab', 'cab', 'valence', 'brawler', 'kestrel', 'ion'],
  default: ['meridian', 'pico', 'atlas', 'cab', 'ion', 'haulmark'],
};
