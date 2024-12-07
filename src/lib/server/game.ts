import { Chess, type Square } from 'chess.js';
import type { Socket } from 'socket.io';
import Redis from 'ioredis';

interface GameState {
    game: Chess;
    white: string | null;
    black: string | null;
    spectators: Set<string>;
    lastMove: { from: string; to: string } | null;
    startTime: number | null;
    timeWhite: number;
    timeBlack: number;
    status: 'waiting' | 'ready' | 'playing' | 'ended';
    isPrivate: boolean;
    passwordHash?: string;
}

class GameManager {
    private redis: Redis;
    private games: Map<string, GameState> = new Map();
    private GAME_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
    private DEFAULT_TIME = 15 * 60 * 1000; // 15 minutes in ms

    constructor() {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        this.loadGamesFromRedis();
    }

    private async loadGamesFromRedis() {
        const keys = await this.redis.keys('game:*');
        for (const key of keys) {
            const gameData = await this.redis.get(key);
            if (gameData) {
                const gameState = JSON.parse(gameData);
                const gameId = key.split(':')[1];
                this.games.set(gameId, {
                    ...gameState,
                    game: new Chess(gameState.fen),
                    spectators: new Set(gameState.spectators)
                });
            }
        }
    }

    async saveGameState(gameId: string, gameState: GameState) {
        const serializedGame = {
            ...gameState,
            fen: gameState.game.fen(),
            spectators: Array.from(gameState.spectators)
        };
        await this.redis.setex(`game:${gameId}`, this.GAME_EXPIRY, JSON.stringify(serializedGame));
    }

    async createGame(gameId: string, initialState?: Partial<GameState>): Promise<void> {
        const gameState: GameState = {
            game: new Chess(),
            white: null,
            black: null,
            spectators: new Set<string>(),
            lastMove: null,
            status: 'waiting',
            timeWhite: this.DEFAULT_TIME,
            timeBlack: this.DEFAULT_TIME,
            startTime: null,
            isPrivate: false,
            ...initialState
        };
        this.games.set(gameId, gameState);
        await this.saveGameState(gameId, gameState);
    }

    async joinGame(
        gameId: string, 
        playerId: string, 
        preferredColor?: 'white' | 'black' | 'spectator'
    ): Promise<string | null> {
        const gameState = this.games.get(gameId);
        if (!gameState) return null;

        let role: string | null = null;

        // If player is already in the game, return their role
        if (gameState.white === playerId) return 'white';
        if (gameState.black === playerId) return 'black';
        if (gameState.spectators.has(playerId)) return 'spectator';

        if (preferredColor === 'white' && !gameState.white) {
            gameState.white = playerId;
            role = 'white';
        } else if (preferredColor === 'black' && !gameState.black) {
            gameState.black = playerId;
            role = 'black';
        } else if (preferredColor !== 'spectator' && !gameState.white) {
            gameState.white = playerId;
            role = 'white';
        } else if (preferredColor !== 'spectator' && !gameState.black) {
            gameState.black = playerId;
            role = 'black';
        } else {
            gameState.spectators.add(playerId);
            role = 'spectator';
        }

        if (gameState.white && gameState.black && gameState.status === 'waiting') {
            gameState.status = 'playing';
            gameState.startTime = Date.now();
        }

        await this.saveGameState(gameId, gameState);
        return role;
    }

    async makeMove(gameId: string, playerId: string, from: string, to: string): Promise<boolean> {
        const gameState = this.games.get(gameId);
        if (!gameState) return false;

        const isWhite = gameState.white === playerId;
        const isBlack = gameState.black === playerId;
        
        if (!gameState.white || !gameState.black) return false;
        if (!isWhite && !isBlack) return false;
        
        const turn = gameState.game.turn();
        if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) return false;

        try {
            const now = Date.now();
            if (!gameState.startTime) {
                gameState.startTime = now;
            }

            // Update time for the player who just moved
            if (turn === 'w') {
                gameState.timeWhite -= now - gameState.startTime;
            } else {
                gameState.timeBlack -= now - gameState.startTime;
            }

            const move = gameState.game.move({ 
                from: from as Square, 
                to: to as Square, 
                promotion: 'q' 
            });

            if (move) {
                gameState.lastMove = { from, to };
                gameState.startTime = now;
                
                if (gameState.game.isGameOver()) {
                    gameState.status = 'ended';
                }

                await this.saveGameState(gameId, gameState);
                return true;
            }
        } catch (e) {
            console.error('Move error:', e);
        }
        return false;
    }

    getGameState(gameId: string): GameState | null {
        return this.games.get(gameId) || null;
    }

    getFEN(gameId: string): string | null {
        const gameState = this.games.get(gameId);
        return gameState ? gameState.game.fen() : null;
    }

    isGameOver(gameId: string): boolean {
        const gameState = this.games.get(gameId);
        if (!gameState) return false;
        
        if (gameState.timeWhite <= 0) {
            gameState.status = 'ended';
            return true;
        }
        if (gameState.timeBlack <= 0) {
            gameState.status = 'ended';
            return true;
        }
        
        return gameState.game.isGameOver();
    }

    getValidMoves(gameId: string, square: string): string[] {
        const gameState = this.games.get(gameId);
        if (!gameState || !gameState.white || !gameState.black) return [];
        
        try {
            const moves = gameState.game.moves({ 
                square: square as Square, 
                verbose: true 
            });
            return moves.map(move => move.to);
        } catch (e) {
            console.error('Get valid moves error:', e);
            return [];
        }
    }

    getTimeLeft(gameId: string): { white: number; black: number } {
        const gameState = this.games.get(gameId);
        if (!gameState) return { white: this.DEFAULT_TIME, black: this.DEFAULT_TIME };
        
        const now = Date.now();
        if (!gameState.startTime || gameState.status !== 'playing') {
            return { 
                white: gameState.timeWhite,
                black: gameState.timeBlack
            };
        }
        
        const currentTurn = gameState.game.turn();
        if (currentTurn === 'w') {
            return {
                white: Math.max(0, gameState.timeWhite - (now - gameState.startTime)),
                black: gameState.timeBlack
            };
        } else {
            return {
                white: gameState.timeWhite,
                black: Math.max(0, gameState.timeBlack - (now - gameState.startTime))
            };
        }
    }
}

export const gameManager = new GameManager(); 