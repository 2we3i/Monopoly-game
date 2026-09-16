// houses.js
// The six great houses: seat and colours. Kept apart from the engine so the
// main menu can draw a sigil without loading the map of Westeros.

export const HOUSE_IDS = ['stark', 'lannister', 'baratheon', 'greyjoy', 'tyrell', 'martell'];

export const HOUSES = {
  stark: { id: 'stark', seat: 'winterfell', color: '#8e9aa3', deep: '#353f46', ink: '#eef2f4' },
  lannister: { id: 'lannister', seat: 'lannisport', color: '#a3282c', deep: '#521114', ink: '#f0cd6c' },
  baratheon: { id: 'baratheon', seat: 'storms_end', color: '#c89a30', deep: '#56400f', ink: '#1b1712' },
  greyjoy: { id: 'greyjoy', seat: 'pyke', color: '#4a6674', deep: '#1a2a32', ink: '#dcb64c' },
  tyrell: { id: 'tyrell', seat: 'highgarden', color: '#5a8540', deep: '#233818', ink: '#ecd67e' },
  martell: { id: 'martell', seat: 'sunspear', color: '#c9692c', deep: '#592a0e', ink: '#f7dcaa' },
};
