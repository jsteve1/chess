/**
 * Server-side Socket.IO implementation for the Chess application.
 * Handles real-time game events, player connections, and game state management.
 * Implements authentication, game creation/joining, move validation, and player synchronization.
 */

import type { Server } from 'socket.io';
import { gameManager } from './game.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const DEBUG = true;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

/**
 * Represents the state of a chess game including players, spectators, and game progress
 */
interface GameState {
    game: any;                                      // Chess.js game instance
    white: string | null;                           // Socket ID of white player
    black: string | null;                           // Socket ID of black player
    spectators: Set<string>;                        // Set of spectator socket IDs
    lastMove: { from: string; to: string } | null;  // Last move made in the game
    status: 'waiting' | 'playing' | 'ended';        // Current game status
    timeWhite: number;                              // Remaining time for white player
    timeBlack: number;                              // Remaining time for black player
    startTime: number | null;                       // Game start timestamp
    isPrivate: boolean;                             // Whether game requires password
    passwordHash?: string;                          // Hashed password for private games
}

/**
 * Debug logging utility that only logs when DEBUG is true
 * Includes timestamp and [Socket] prefix for easy filtering
 */
function debugLog(...args: any[]) {
    if (DEBUG) {
        console.log('[Socket]', new Date().toISOString(), ...args);
    }
}

/**
 * Creates and configures the Socket.IO server
 * Sets up event handlers for the entire chess application
 * 
 * @param io - Socket.IO server instance
 * @returns Configured Socket.IO server
 * 
 * Event Handlers:
 * - connection: New client connection
 * - create_game: Create new chess game
 * - join_game: Join existing game
 * - rejoin_game: Reconnect to game with token
 * - make_move: Process chess moves
 * - get_valid_moves: Calculate valid moves
 * - disconnect: Handle client disconnection
 */
export function createSocketServer(io: Server) {
    // Track active games and player sessions
    const games = new Map<string, Set<string>>();           // gameId -> Set of connected socket IDs
    const sessions = new Map<string, { gameId: string; role: string }>();  // socketId -> session info

    io.on('connection', (socket) => {
        debugLog('Client connected:', {
            socketId: socket.id,
            address: socket.handshake.address,
            timestamp: new Date().toISOString()
        });
        
        // Track current game context for this socket
        let currentGameId: string | null = null;
        let currentPlayerId: string | null = null;

        /**
         * Handle game creation
         * Creates new game instance with optional password protection
         * Emits 'game_created' with game ID and authentication token
         */
        socket.on('create_game', async (params = { isPrivate: false, password: null }) => {
            try {
                debugLog('Creating game:', {
                    socketId: socket.id,
                    currentGameId,
                    currentPlayerId,
                    isPrivate: params.isPrivate
                });
                
                // Leave current game if in one
                if (currentGameId) {
                    await leaveGame(currentGameId, socket.id);
                }
                
                // Generate random game ID and initialize state
                const gameId = Math.random().toString(36).substring(2, 8);
                const gameState: Partial<GameState> = {
                    isPrivate: params.isPrivate
                };

                // Hash password for private games
                if (params.isPrivate && params.password) {
                    gameState.passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
                }

                // Create game and join as white player
                await gameManager.createGame(gameId, gameState);
                const role = await gameManager.joinGame(gameId, socket.id, 'white');
                
                if (role) {
                    // Update tracking state
                    currentGameId = gameId;
                    currentPlayerId = socket.id;
                    socket.join(gameId);
                    games.set(gameId, new Set([socket.id]));
                    
                    // Generate authentication token
                    const token = jwt.sign({ 
                        gameId, 
                        playerId: socket.id,
                        role: 'white',
                        isPrivate: params.isPrivate 
                    }, JWT_SECRET);

                    // Notify client
                    socket.emit('game_created', { gameId, token });
                    socket.emit('game_joined', {
                        role,
                        fen: gameManager.getFEN(gameId),
                        lastMove: null,
                        timeLeft: gameManager.getTimeLeft(gameId),
                        isPrivate: params.isPrivate
                    });
                }
            } catch (error) {
                debugLog('Game creation failed:', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : error
                });
                socket.emit('error', 'Failed to create game');
            }
        });

        /**
         * Check if game requires password
         * Emits game privacy status to client
         */
        socket.on('check_game_privacy', ({ gameId }) => {
            const gameState = gameManager.getGameState(gameId);
            if (!gameState) {
                socket.emit('error', 'Game not found');
                return;
            }
            socket.emit('game_privacy_check', { isPrivate: gameState.isPrivate });
        });

        /**
         * Handle game joining
         * Validates password for private games
         * Assigns role (white/black/spectator) based on availability
         * Emits game state and authentication token
         */
        socket.on('join_game', async ({ gameId, password }) => {
            try {
                const gameState = gameManager.getGameState(gameId);
                if (!gameState) {
                    socket.emit('error', 'Game not found');
                    return;
                }

                // Validate password for private games
                if (gameState.isPrivate && gameState.passwordHash) {
                    if (!password) {
                        socket.emit('password_error', 'Password required');
                        return;
                    }
                    
                    const isValid = await bcrypt.compare(password, gameState.passwordHash);
                    if (!isValid) {
                        socket.emit('password_error', 'Invalid password');
                        return;
                    }
                }

                // Assign role based on availability
                const role = !gameState.white ? 'white' : 
                           !gameState.black ? 'black' : 'spectator';

                const success = await gameManager.joinGame(gameId, socket.id, role);
                if (success) {
                    // Update tracking state
                    currentGameId = gameId;
                    currentPlayerId = socket.id;
                    socket.join(gameId);

                    if (!games.has(gameId)) {
                        games.set(gameId, new Set());
                    }
                    games.get(gameId)?.add(socket.id);

                    // Generate authentication token
                    const token = jwt.sign({ 
                        gameId, 
                        playerId: socket.id,
                        role,
                        isPrivate: gameState.isPrivate 
                    }, JWT_SECRET);

                    // Notify client of successful join
                    socket.emit('game_joined', {
                        role,
                        fen: gameManager.getFEN(gameId),
                        lastMove: gameState.lastMove,
                        timeLeft: gameManager.getTimeLeft(gameId),
                        isPrivate: gameState.isPrivate,
                        token
                    });

                    // Notify all players in game of new player
                    io.to(gameId).emit('player_joined', {
                        white: gameState.white,
                        black: gameState.black,
                        spectators: Array.from(gameState.spectators),
                        timeLeft: gameManager.getTimeLeft(gameId),
                        status: gameState.white && gameState.black ? 'playing' : 'waiting'
                    });
                }
            } catch (error) {
                debugLog('Join game failed:', {
                    gameId,
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : error
                });
                socket.emit('error', 'Failed to join game');
            }
        });

        /**
         * Handle game rejoining with authentication token
         * Validates token and restores player's role
         * Used for reconnection after disconnects
         */
        socket.on('rejoin_game', async ({ gameId, token }) => {
            try {
                if (!token) {
                    return;
                }

                // Verify authentication token
                const session = jwt.verify(token, JWT_SECRET) as {
                    gameId: string;
                    playerId: string;
                    role: string;
                    isPrivate: boolean;
                };

                if (session.gameId !== gameId) {
                    socket.emit('error', 'Invalid session');
                    return;
                }

                const gameState = gameManager.getGameState(gameId);
                if (!gameState) {
                    socket.emit('error', 'Game not found');
                    return;
                }

                // Restore player's role
                if (session.role === 'white') {
                    gameState.white = socket.id;
                } else if (session.role === 'black') {
                    gameState.black = socket.id;
                } else {
                    gameState.spectators.add(socket.id);
                }

                // Update tracking state
                currentGameId = gameId;
                currentPlayerId = socket.id;
                socket.join(gameId);

                // Notify client of successful rejoin
                socket.emit('game_joined', {
                    role: session.role,
                    fen: gameManager.getFEN(gameId),
                    lastMove: gameState.lastMove,
                    timeLeft: gameManager.getTimeLeft(gameId),
                    isPrivate: gameState.isPrivate
                });

                // Notify all players of rejoined player
                io.to(gameId).emit('player_joined', {
                    white: gameState.white,
                    black: gameState.black,
                    spectators: Array.from(gameState.spectators),
                    timeLeft: gameManager.getTimeLeft(gameId),
                    status: gameState.white && gameState.black ? 'playing' : 'waiting'
                });
            } catch (error) {
                debugLog('Rejoin game failed:', {
                    gameId,
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : error
                });
                socket.emit('error', 'Failed to rejoin game');
            }
        });

        /**
         * Handle chess moves
         * Validates move and updates game state
         * Broadcasts move to all players in game
         */
        socket.on('make_move', async ({ from, to }) => {
            if (!currentGameId || !currentPlayerId) {
                debugLog('Move attempted without game context:', {
                    socketId: socket.id,
                    currentGameId,
                    currentPlayerId
                });
                return;
            }
            
            try {
                debugLog('Move request:', {
                    from,
                    to,
                    playerId: currentPlayerId,
                    gameId: currentGameId,
                    currentFen: gameManager.getFEN(currentGameId)
                });
                const success = await gameManager.makeMove(currentGameId, currentPlayerId, from, to);
                
                if (success) {
                    const gameState = gameManager.getGameState(currentGameId);
                    const timeLeft = gameManager.getTimeLeft(currentGameId);
                    
                    // Broadcast move to all players
                    io.to(currentGameId).emit('move_made', {
                        from,
                        to,
                        fen: gameManager.getFEN(currentGameId),
                        isGameOver: gameManager.isGameOver(currentGameId),
                        timeLeft
                    });
                }
            } catch (error) {
                debugLog('Move error:', {
                    from,
                    to,
                    gameId: currentGameId,
                    error: error instanceof Error ? error.message : error
                });
            }
        });

        /**
         * Calculate valid moves for selected piece
         * Returns array of valid destination squares
         */
        socket.on('get_valid_moves', ({ square }) => {
            if (!currentGameId) return;
            
            try {
                debugLog('Valid moves request:', { square, gameId: currentGameId });
                const validMoves = gameManager.getValidMoves(currentGameId, square);
                socket.emit('valid_moves', { moves: validMoves });
            } catch (error) {
                debugLog('Error getting valid moves:', {
                    square,
                    gameId: currentGameId,
                    error: error instanceof Error ? error.message : error
                });
            }
        });

        /**
         * Handle client disconnection
         * Cleans up game state and notifies other players
         */
        socket.on('disconnect', async (reason) => {
            debugLog('Client disconnecting:', {
                socketId: socket.id,
                currentGameId,
                currentPlayerId,
                reason: reason
            });
            
            try {
                if (currentGameId) {
                    const beforeState = gameManager.getGameState(currentGameId);
                    await leaveGame(currentGameId, socket.id);
                    const afterState = gameManager.getGameState(currentGameId);
                    
                    debugLog('Game state after disconnect:', {
                        gameId: currentGameId,
                        socketId: socket.id,
                        beforeState,
                        afterState
                    });
                }
            } catch (error) {
                debugLog('Disconnect error:', {
                    socketId: socket.id,
                    error: error instanceof Error ? error.message : error
                });
            }
        });

        /**
         * Helper function to handle player leaving game
         * Updates game state and notifies remaining players
         * Cleans up game if no players remain
         */
        async function leaveGame(gameId: string, playerId: string) {
            debugLog('Player leaving game:', {
                gameId,
                playerId,
                currentState: gameManager.getGameState(gameId)
            });

            const gameState = gameManager.getGameState(gameId);
            if (gameState) {
                let wasPlayer = false;
                
                // Remove player from appropriate role
                if (gameState.white === playerId) {
                    gameState.white = null;
                    wasPlayer = true;
                } else if (gameState.black === playerId) {
                    gameState.black = null;
                    wasPlayer = true;
                } else {
                    gameState.spectators.delete(playerId);
                }
                
                // Remove from tracking
                const gamePlayers = games.get(gameId);
                if (gamePlayers) {
                    gamePlayers.delete(playerId);
                    
                    // Clean up game if no players remain
                    if (gamePlayers.size === 0 || (wasPlayer && !gameState.white && !gameState.black)) {
                        games.delete(gameId);
                        debugLog('Game removed from tracking:', { gameId });
                    } else {
                        // Update remaining players
                        await gameManager.saveGameState(gameId, gameState);
                        io.to(gameId).emit('player_left', {
                            white: gameState.white,
                            black: gameState.black,
                            spectators: Array.from(gameState.spectators)
                        });
                    }
                }
                
                socket.leave(gameId);
            }

            // Reset client state
            currentGameId = null;
            currentPlayerId = null;
        }
    });

    return io;
} 