// Original fictional content: names, contacts, menus, items. No real people, brands or places.
import { R } from '../core/util.js';
const M = ['Mateo', 'Jamal', 'Owen', 'Luca', 'Theo', 'Andre', 'Kenji', 'Rafael', 'Omar', 'Elias', 'Malik', 'Nico', 'Dario', 'Felix', 'Hugo', 'Tariq', 'Wes', 'Caleb', 'Ivan', 'Jonah'];
const F = ['Sofia', 'Amara', 'Leila', 'Maya', 'Chloe', 'Nadia', 'Rosa', 'Hana', 'Imani', 'Lucia', 'Zara', 'Elena', 'Priya', 'Talia', 'Noor', 'Iris', 'Camila', 'Yara', 'Bea', 'Ines'];
export const firstName = (sex) => (sex === 'f' ? F : M)[Math.floor(R() * 20)];

export const CONTACTS = {
  dani: { name: 'Dani Navarro', role: 'Old friend · runs Navarro Garage', color: '#f2b134', initials: 'DN' },
  vale: { name: 'Mr. Vale', role: 'Fixer · pays well, asks little', color: '#7b6cf6', initials: 'MV' },
  rosa: { name: 'Rosa Quintero', role: 'Sol & Salt Café owner', color: '#e76f51', initials: 'RQ' },
  kai: { name: 'Kai Okafor', role: 'Personal trainer at Muscle Shore', color: '#2a9d8f', initials: 'KO' },
  mila: { name: 'Mila Sorensen', role: 'Lifeguard captain, Coral Beach', color: '#3a86ff', initials: 'MS' },
  jet: { name: 'Jett Alvarez', role: 'Street racer', color: '#ff4fa3', initials: 'JA' },
  sapd: { name: 'SAPD Traffic', role: 'Automated notices', color: '#1d3557', initials: 'PD', system: true },
  bank: { name: 'Harbor Bank', role: 'Account alerts', color: '#264653', initials: 'HB', system: true },
};

export const CAFE_MENU = [
  { id: 'coldbrew', name: 'Cold brew', price: 5, hp: 4, st: 30, kind: 'drink', desc: 'Strong and smooth. Restores stamina.' },
  { id: 'flatwhite', name: 'Flat white', price: 5, hp: 3, st: 22, kind: 'drink' },
  { id: 'burger', name: 'Shoreline burger', price: 14, hp: 35, st: 10, kind: 'eat', desc: 'Grass-fed patty, grilled onions.' },
  { id: 'fishtaco', name: 'Fish tacos', price: 12, hp: 28, st: 12, kind: 'eat' },
  { id: 'pasta', name: 'Lemon pasta', price: 16, hp: 32, st: 14, kind: 'eat' },
  { id: 'salad', name: 'Citrus salad', price: 11, hp: 20, st: 18, kind: 'eat' },
  { id: 'pizza', name: 'Margherita slice', price: 6, hp: 18, st: 6, kind: 'eat' },
  { id: 'breakfast', name: 'Sunrise breakfast', price: 13, hp: 38, st: 20, kind: 'eat' },
  { id: 'gelato', name: 'Sea-salt gelato', price: 6, hp: 8, st: 8, kind: 'eat' },
  { id: 'water', name: 'Sparkling water', price: 3, hp: 2, st: 12, kind: 'drink' },
];
export const STORE_ITEMS = [
  { id: 'water', name: 'Bottled water', price: 2, hp: 2, st: 14, kind: 'drink' },
  { id: 'energy', name: 'Volt energy drink', price: 4, hp: 0, st: 45, kind: 'drink', desc: 'Big stamina boost.' },
  { id: 'sandwich', name: 'Deli sandwich', price: 7, hp: 24, st: 8, kind: 'eat' },
  { id: 'chips', name: 'Sea-salt chips', price: 3, hp: 8, st: 4, kind: 'eat' },
  { id: 'medkit', name: 'First-aid kit', price: 45, hp: 60, st: 0, kind: 'use', desc: 'Heals 60 health.' },
  { id: 'cigs', name: 'Harbor Lights cigarettes (fictional)', price: 9, kind: 'cigs', smoking: true, desc: '10 cigarettes. Optional; can be disabled in settings.' },
  { id: 'lighter', name: 'Lighter', price: 2, kind: 'lighter', smoking: true },
];
export const CLUB_BAR = [
  { id: 'mocktail', name: 'Neon mocktail', price: 9, hp: 4, st: 15, kind: 'drink' },
  { id: 'soda', name: 'Citrus soda', price: 4, hp: 2, st: 10, kind: 'drink' },
  { id: 'water', name: 'Water', price: 2, hp: 1, st: 10, kind: 'drink' },
];
export const PROPERTIES = {
  safehouse: { name: 'Laurel Apartments #4B', price: 0, owned: true, income: 0 },
  villa: { name: 'Villa Mirador', price: 120000, income: 0, desc: 'Hillside villa with pool and a city view. Becomes a second safehouse.' },
  cafeShare: { name: '25% share of Sol & Salt Café', price: 30000, income: 450, desc: 'Daily income paid to your bank every in-game day.' },
};
export const SKYDIVE_PRICE = 250;
export const BOAT_RENTAL = [{ key: 'wavedart', price: 120 }, { key: 'seastrike', price: 300 }];
export const HELI_PRICE = 900;

export const TIPS = [
  'Press P to open your phone. Missions arrive as calls and texts.',
  'Hold Shift to sprint. Gym training raises stamina, strength and endurance.',
  'Red-light cameras are marked PHOTO ENFORCED. Not every intersection has one.',
  'Your companion follows you everywhere — press Z to make them stay or follow.',
  'Electric cars need charging. Park beside a green-lit charger and press E.',
  'Lose the police by breaking line of sight and staying out of view.',
  'Sleep at home to skip time and save your progress.',
];
