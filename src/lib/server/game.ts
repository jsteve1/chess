/**
 * Game Manager for Chess Application
 * Handles game state management, move validation, and persistence
 * Uses chess.js for game logic and Redis for state persistence
 */

import { Chess, type Square } from 'chess.js';
import type { Socket } from 'socket.io';
import Redis from 'ioredis';

/**
 * Represents the complete state of a chess game
 * Includes game logic, players, spectators, timing, and status
 */
interface GameState {
    game: Chess;                                    // Chess.js instance for game logic
    white: string | null;                           // Socket ID of white player
    black: string | null;                           // Socket ID of black player
    spectators: Set<string>;                        // Set of spectator socket IDs
    lastMove: { from: string; to: string } | null;  // Last move made in the game
    startTime: number | null;                       // Timestamp of game start/last move
    timeWhite: number;                              // Remaining time for white player
    timeBlack: number;                              // Remaining time for black player
    status: 'waiting' | 'ready' | 'playing' | 'ended';  // Current game status
    isPrivate: boolean;                             // Whether game requires password
    passwordHash?: string;                          // Hashed password for private games
}

/**
 * GameManager class
 * Manages chess games, handles persistence, and enforces game rules
 * Uses Redis for game state persistence and recovery
 */
class GameManager {
    private redis: Redis;
    private games: Map<string, GameState> = new Map();
    private GAME_EXPIRY = 24 * 60 * 60;  // 24 hours in seconds
    private DEFAULT_TIME = 15 * 60 * 1000;  // 15 minutes in ms

    constructor() {
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        this.loadGamesFromRedis();
    }

    /**
     * Loads saved games from Redis on startup
     * Reconstructs game states with chess.js instances
     */
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

    /**
     * Saves game state to Redis
     * Serializes game state and sets expiration
     * 
     * @param gameId - Unique identifier for the game
     * @param gameState - Current state of the game
     */
    async saveGameState(gameId: string, gameState: GameState) {
        const serializedGame = {
            ...gameState,
            fen: gameState.game.fen(),
            spectators: Array.from(gameState.spectators)
        };
        await this.redis.setex(`game:${gameId}`, this.GAME_EXPIRY, JSON.stringify(serializedGame));
    }

    /**
     * Creates a new chess game
     * Initializes game state with default values
     * 
     * @param gameId - Unique identifier for the new game
     * @param initialState - Optional partial state to override defaults
     */
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

    /**
     * Handles player joining a game
     * Assigns roles (white/black/spectator) based on availability
     * Updates game status when both players are present
     * 
     * @param gameId - Game to join
     * @param playerId - Socket ID of joining player
     * @param preferredColor - Preferred role for the player
     * @returns Assigned role or null if join failed
     */
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

        // Assign role based on preference and availability
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

        // Start game if both players are present
        if (gameState.white && gameState.black && gameState.status === 'waiting') {
            gameState.status = 'playing';
            gameState.startTime = Date.now();
        }

        await this.saveGameState(gameId, gameState);
        return role;
    }

    /**
     * Processes a chess move
     * Validates move legality and player turn
     * Updates game state and timing
     * 
     * @param gameId - Game being played
     * @param playerId - Player making the move
     * @param from - Starting square
     * @param to - Target square
     * @returns Whether move was successful
     */
    async makeMove(gameId: string, playerId: string, from: string, to: string): Promise<boolean> {
        const gameState = this.games.get(gameId);
        if (!gameState) return false;

        const isWhite = gameState.white === playerId;
        const isBlack = gameState.black === playerId;
        
        // Validate game and player state
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

            // Attempt move with automatic queen promotion
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

    /**
     * Retrieves current game state
     * @param gameId - Game to retrieve
     * @returns Game state or null if not found
     */
    getGameState(gameId: string): GameState | null {
        return this.games.get(gameId) || null;
    }

    /**
     * Gets current FEN string for game position
     * @param gameId - Game to get position for
     * @returns FEN string or null if game not found
     */
    getFEN(gameId: string): string | null {
        const gameState = this.games.get(gameId);
        return gameState ? gameState.game.fen() : null;
    }

    /**
     * Checks if game is over
     * Considers checkmate and time control
     * 
     * @param gameId - Game to check
     * @returns Whether game is over
     */
    isGameOver(gameId: string): boolean {
        const gameState = this.games.get(gameId);
        if (!gameState) return false;
        
        // Check time control
        if (gameState.timeWhite <= 0) {
            gameState.status = 'ended';
            return true;
        }
        if (gameState.timeBlack <= 0) {
            gameState.status = 'ended';
            return true;
        }
        
        // Check game position
        return gameState.game.isGameOver();
    }

    /**
     * Gets valid moves for a piece
     * 
     * @param gameId - Game being played
     * @param square - Square containing piece to move
     * @returns Array of valid destination squares
     */
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

    /**
     * Gets remaining time for both players
     * Accounts for current turn's elapsed time
     * 
     * @param gameId - Game to check time for
     * @returns Remaining time for both players
     */
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
        
        // Subtract elapsed time from current player's clock
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

// Export singleton instance
export const gameManager = new GameManager(); 