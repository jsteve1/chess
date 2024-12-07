import type { Server } from 'socket.io';
import { gameManager } from './game.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const DEBUG = true;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SALT_ROUNDS = 10;

interface GameState {
    game: any;
    white: string | null;
    black: string | null;
    spectators: Set<string>;
    lastMove: { from: string; to: string } | null;
    status: 'waiting' | 'playing' | 'ended';
    timeWhite: number;
    timeBlack: number;
    startTime: number | null;
    isPrivate: boolean;
    passwordHash?: string;
}

function debugLog(...args: any[]) {
    if (DEBUG) {
        console.log('[Socket]', new Date().toISOString(), ...args);
    }
}

export function createSocketServer(io: Server) {
    const games = new Map<string, Set<string>>();
    const sessions = new Map<string, { gameId: string; role: string }>();

    io.on('connection', (socket) => {
        debugLog('Client connected:', {
            socketId: socket.id,
            address: socket.handshake.address,
            timestamp: new Date().toISOString()
        });
        
        let currentGameId: string | null = null;
        let currentPlayerId: string | null = null;

        socket.on('create_game', async (params = { isPrivate: false, password: null }) => {
            try {
                debugLog('Creating game:', {
                    socketId: socket.id,
                    currentGameId,
                    currentPlayerId,
                    isPrivate: params.isPrivate
                });
                
                if (currentGameId) {
                    await leaveGame(currentGameId, socket.id);
                }
                
                const gameId = Math.random().toString(36).substring(2, 8);
                const gameState: Partial<GameState> = {
                    isPrivate: params.isPrivate
                };

                if (params.isPrivate && params.password) {
                    gameState.passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
                }

                await gameManager.createGame(gameId, gameState);
                
                const role = await gameManager.joinGame(gameId, socket.id, 'white');
                if (role) {
                    currentGameId = gameId;
                    currentPlayerId = socket.id;
                    socket.join(gameId);
                    
                    games.set(gameId, new Set([socket.id]));
                    
                    const token = jwt.sign({ 
                        gameId, 
                        playerId: socket.id,
                        role: 'white',
                        isPrivate: params.isPrivate 
                    }, JWT_SECRET);

                    socket.emit('game_created', { 
                        gameId,
                        token
                    });
                    
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

        socket.on('check_game_privacy', ({ gameId }) => {
            const gameState = gameManager.getGameState(gameId);
            if (!gameState) {
                socket.emit('error', 'Game not found');
                return;
            }
            socket.emit('game_privacy_check', { isPrivate: gameState.isPrivate });
        });

        socket.on('join_game', async ({ gameId, password }) => {
            try {
                const gameState = gameManager.getGameState(gameId);
                if (!gameState) {
                    socket.emit('error', 'Game not found');
                    return;
                }

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

                const role = !gameState.white ? 'white' : 
                           !gameState.black ? 'black' : 'spectator';

                const success = await gameManager.joinGame(gameId, socket.id, role);
                if (success) {
                    currentGameId = gameId;
                    currentPlayerId = socket.id;
                    socket.join(gameId);

                    if (!games.has(gameId)) {
                        games.set(gameId, new Set());
                    }
                    games.get(gameId)?.add(socket.id);

                    const token = jwt.sign({ 
                        gameId, 
                        playerId: socket.id,
                        role,
                        isPrivate: gameState.isPrivate 
                    }, JWT_SECRET);

                    socket.emit('game_joined', {
                        role,
                        fen: gameManager.getFEN(gameId),
                        lastMove: gameState.lastMove,
                        timeLeft: gameManager.getTimeLeft(gameId),
                        isPrivate: gameState.isPrivate,
                        token
                    });

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

        socket.on('rejoin_game', async ({ gameId, token }) => {
            try {
                if (!token) {
                    return;
                }

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

                if (session.role === 'white') {
                    gameState.white = socket.id;
                } else if (session.role === 'black') {
                    gameState.black = socket.id;
                } else {
                    gameState.spectators.add(socket.id);
                }

                currentGameId = gameId;
                currentPlayerId = socket.id;
                socket.join(gameId);

                socket.emit('game_joined', {
                    role: session.role,
                    fen: gameManager.getFEN(gameId),
                    lastMove: gameState.lastMove,
                    timeLeft: gameManager.getTimeLeft(gameId),
                    isPrivate: gameState.isPrivate
                });

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

        async function leaveGame(gameId: string, playerId: string) {
            debugLog('Player leaving game:', {
                gameId,
                playerId,
                currentState: gameManager.getGameState(gameId)
            });

            const gameState = gameManager.getGameState(gameId);
            if (gameState) {
                let wasPlayer = false;
                
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
                    
                    // If no players left or all players left, clean up the game
                    if (gamePlayers.size === 0 || (wasPlayer && !gameState.white && !gameState.black)) {
                        games.delete(gameId);
                        debugLog('Game removed from tracking:', { gameId });
                    } else {
                        // Save the updated state and notify remaining players
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