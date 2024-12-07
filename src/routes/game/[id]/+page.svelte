<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { isDarkMode } from '$lib/stores/gameStore';
    import { io, type Socket } from 'socket.io-client';
    import ChessBoard from '$lib/components/ChessBoard.svelte';
    import GameInfo from '$lib/components/GameInfo.svelte';
    import Navbar from '$lib/components/Navbar.svelte';
    import { goto } from '$app/navigation';
    import { createSocket } from '$lib/socket';

    let socket: Socket;
    let gameId = $page.params.id;
    let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let gameRole: 'white' | 'black' | 'spectator' | null = null;
    let timeWhite = 900000; // 15 minutes in ms
    let timeBlack = 900000;
    let lastMove: { from: string; to: string } | null = null;
    let capturedPieces = { white: [], black: [] };
    let validMoves: string[] = [];
    let playerCount = 0;
    let gameStatus: 'waiting' | 'started' | 'ended' = 'waiting';

    $: document.body.classList.toggle('light-mode', !$isDarkMode);

    onMount(() => {
        try {
            socket = createSocket();
            
            socket.on('connect', () => {
                console.log('Connected to server, joining game:', gameId);
                socket.emit('join_game', { gameId });
            });

            socket.on('game_joined', (data) => {
                console.log('Game joined:', data);
                gameRole = data.role;
                fen = data.fen;
                lastMove = data.lastMove;
                if (data.timeLeft) {
                    timeWhite = data.timeLeft.white;
                    timeBlack = data.timeLeft.black;
                }
            });

            socket.on('player_joined', (data) => {
                console.log('Player joined:', data);
                playerCount = (data.white ? 1 : 0) + (data.black ? 1 : 0);
                if (data.white && data.black) {
                    gameStatus = 'started';
                } else {
                    gameStatus = 'waiting';
                }
            });

            socket.on('player_left', (data) => {
                console.log('Player left:', data);
                playerCount = (data.white ? 1 : 0) + (data.black ? 1 : 0);
                if (!data.white || !data.black) {
                    gameStatus = 'waiting';
                }
            });

            socket.on('move_made', (data) => {
                console.log('Move made:', data);
                fen = data.fen;
                lastMove = { from: data.from, to: data.to };
                if (data.timeLeft) {
                    timeWhite = data.timeLeft.white;
                    timeBlack = data.timeLeft.black;
                }
                validMoves = [];
                
                if (data.isGameOver) {
                    gameStatus = 'ended';
                }

                // Update captured pieces
                const currentPosition = new Set();
                data.fen.split(' ')[0].split('/').join('').split('').forEach((char: string) => {
                    if (char.match(/[a-zA-Z]/)) {
                        currentPosition.add(char);
                    }
                });

                const initialPosition = new Set('RNBQKPRNBQKP'.split(''));
                const whitePieces = Array.from(initialPosition).filter(p => !currentPosition.has(p));
                const blackPieces = Array.from(initialPosition).filter(p => !currentPosition.has(p.toLowerCase()));
                
                capturedPieces = {
                    white: whitePieces,
                    black: blackPieces.map(p => p.toLowerCase())
                };
            });

            socket.on('valid_moves', (data) => {
                console.log('Valid moves:', data);
                validMoves = data.moves;
            });

            socket.on('error', (message) => {
                console.error('Game error:', message);
                goto('/');
            });

            return () => {
                socket.disconnect();
            };
        } catch (error) {
            console.error('Error in game setup:', error);
        }
    });

    function handleMove(event: CustomEvent<{from: string, to: string}>) {
        if (socket) {
            socket.emit('make_move', event.detail);
        }
    }

    function handleSquareSelect(event: CustomEvent<{square: string}>) {
        if (socket) {
            socket.emit('get_valid_moves', { square: event.detail.square });
        }
    }
</script>

<div class="game-container">
    <Navbar 
        {gameRole}
        currentTurn={fen.split(' ')[1] as 'w' | 'b'}
        {playerCount}
        {gameStatus}
    />
    
    <main>
        <GameInfo
            {timeWhite}
            {timeBlack}
            {capturedPieces}
            currentTurn={fen.split(' ')[1] as 'w' | 'b'}
            {gameRole}
        />
        
        <ChessBoard
            {fen}
            {gameRole}
            {lastMove}
            {validMoves}
            on:move={handleMove}
            on:squareSelect={handleSquareSelect}
        />
    </main>
</div>

<style>
    .game-container {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        padding-top: 60px; /* Height of the navbar */
    }

    main {
        flex: 1;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        overflow-y: auto;
        max-width: 1200px;
        margin: 0 auto;
        width: 100%;
    }

    @media (max-width: 600px) {
        main {
            padding: 0.5rem;
        }
    }
</style> 