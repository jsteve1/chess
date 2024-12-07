import { writable } from 'svelte/store';

export const isDarkMode = writable(true);
export const connectionStatus = writable<'connecting' | 'waiting' | 'ready' | 'disconnected'>('connecting');
export const opponentStatus = writable<'waiting' | 'connected' | 'disconnected'>('waiting'); 